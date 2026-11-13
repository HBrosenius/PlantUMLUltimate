import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { storageGet } from "./safe-storage";
import { jiraConnection, jiraFields, jiraSearch, preferredJiraStartField } from "./jira-client";
import type { JiraLinkedIssueDetail, JiraUnavailableReason } from "./jira-linked-context";
import {
  findJiraLocalChangeFields,
  jiraKeysJql,
  jiraLinkedExtras,
  jiraLiveStatus,
  linkedJiraIssues,
  type JiraDiagramStatus,
  issueIdFromJiraTaskAlias,
  parseJiraDocumentBinding,
  type JiraMappedField,
} from "@plantuml-studio/jira-integration";

// A site's start-date field never changes during a session, so look it up once per site. Failures
// are not cached, so a later refresh can try again.
const startFieldCache = new Map<string, string | undefined>();

async function startFieldFor(endpoint: string, cloudId: string): Promise<string | undefined> {
  const key = `${endpoint}|${cloudId}`;
  if (startFieldCache.has(key)) return startFieldCache.get(key);
  try {
    const field = preferredJiraStartField(await jiraFields(endpoint, cloudId));
    startFieldCache.set(key, field);
    return field;
  } catch {
    return undefined;
  }
}

export function consumeJiraOAuthResult(currentUrl: string) {
  const url = new URL(currentUrl);
  const result = url.searchParams.get("jira");
  if (!result) return { cleanUrl: url.toString() };
  const popup = url.searchParams.get("jira_popup") === "1";
  url.searchParams.delete("jira");
  url.searchParams.delete("jira_popup");
  return { cleanUrl: url.toString(), oauth: { result, popup } };
}

export function useJiraIntegration({
  source,
  document,
  setInteractionMessage,
}: {
  source: string;
  document: ReturnType<typeof parseGantt>["document"];
  setInteractionMessage: Dispatch<SetStateAction<string | undefined>>;
}) {
  const [jiraDialogOpen, setJiraDialogOpen] = useState(false);
  const endpoint =
    storageGet("plantuml-studio.jira-integration-server") ??
    import.meta.env.VITE_JIRA_INTEGRATION_URL ??
    "https://jira.plantuml.brosenius.se";
  const binding = useMemo(() => parseJiraDocumentBinding(source), [source]);
  const taskStatuses = useMemo(() => {
    const statuses = new Map<string, { issueKey: string; fields: JiraMappedField[] }>();
    for (const task of document.tasks) {
      const issueId = issueIdFromJiraTaskAlias(task.alias?.value ?? "");
      const baseline = issueId ? binding?.baselines?.[issueId] : undefined;
      if (!issueId || !baseline) continue;
      statuses.set(task.id, {
        issueKey: baseline.state.key ?? `JIRA-${issueId}`,
        fields: findJiraLocalChangeFields(source, issueId, baseline),
      });
    }
    return statuses;
  }, [binding, document.tasks, source]);
  const syncedDiagramStatuses = useMemo(
    () =>
      new Map<string, JiraDiagramStatus>(
        [...taskStatuses].map(([taskId, status]) => [taskId, status.fields.length ? "local-changes" : "synchronized"]),
      ),
    [taskStatuses],
  );

  // Read-only "linked" tasks: status comes live from Jira, keyed by the issue link on the task.
  const linkedIssues = useMemo(() => linkedJiraIssues(document.tasks), [document.tasks]);
  const linkedSignature = linkedIssues
    .map((issue) => `${issue.taskId}=${issue.siteOrigin}/${issue.issueKey}`)
    .join("|");
  const [refreshCount, setRefreshCount] = useState(0);
  const [linkedStatuses, setLinkedStatuses] = useState<ReadonlyMap<string, JiraDiagramStatus>>(new Map());
  const [linkedDetails, setLinkedDetails] = useState<ReadonlyMap<string, JiraLinkedIssueDetail>>(new Map());
  const [linkedRefreshing, setLinkedRefreshing] = useState(false);
  const [linkedSyncedAt, setLinkedSyncedAt] = useState<number | undefined>();
  const refreshLinkedJira = useCallback(() => setRefreshCount((count) => count + 1), []);

  // Connecting or disconnecting happens in the dialog, so re-read statuses once it closes.
  const [dialogWasOpen, setDialogWasOpen] = useState(false);
  useEffect(() => {
    if (jiraDialogOpen) setDialogWasOpen(true);
    else if (dialogWasOpen) {
      setDialogWasOpen(false);
      refreshLinkedJira();
    }
  }, [jiraDialogOpen, dialogWasOpen, refreshLinkedJira]);

  // Re-read statuses when the tab regains focus (at most once a minute) instead of polling.
  useEffect(() => {
    if (!linkedSignature) return;
    let last = Date.now();
    const onVisible = () => {
      if (window.document.visibilityState !== "visible" || Date.now() - last < 60_000) return;
      last = Date.now();
      refreshLinkedJira();
    };
    window.document.addEventListener("visibilitychange", onVisible);
    return () => window.document.removeEventListener("visibilitychange", onVisible);
  }, [linkedSignature, refreshLinkedJira]);

  useEffect(() => {
    if (!linkedSignature) {
      setLinkedStatuses(new Map());
      setLinkedDetails(new Map());
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLinkedRefreshing(true);
      try {
        const connection = await jiraConnection(endpoint);
        const next = new Map<string, JiraDiagramStatus>();
        const nextDetails = new Map<string, JiraLinkedIssueDetail>();
        const origins = new Set(linkedIssues.map((issue) => issue.siteOrigin));
        for (const origin of origins) {
          const site = connection.sites?.find((candidate) => candidate.url.replace(/\/$/, "") === origin);
          const issues = linkedIssues.filter((issue) => issue.siteOrigin === origin);
          const markUnavailable = (reason: JiraUnavailableReason) => {
            for (const issue of issues) {
              next.set(issue.taskId, "live-unknown");
              nextDetails.set(issue.taskId, {
                issueKey: issue.issueKey,
                url: `${origin}/browse/${issue.issueKey}`,
                unavailable: reason,
              });
            }
          };
          if (!connection.connected) {
            markUnavailable("not-connected");
            continue;
          }
          if (!site) {
            markUnavailable("site-not-connected");
            continue;
          }
          for (const issue of issues)
            nextDetails.set(issue.taskId, { issueKey: issue.issueKey, url: `${origin}/browse/${issue.issueKey}` });
          // The start-date field is a custom field; a failed lookup just means no start date row.
          const startFieldId = await startFieldFor(endpoint, site.id);
          let result: Awaited<ReturnType<typeof jiraSearch>>;
          try {
            result = await jiraSearch(
              endpoint,
              {
                cloudId: site.id,
                jql: jiraKeysJql(issues.map((issue) => issue.issueKey)),
                fields: [
                  "status",
                  "summary",
                  "assignee",
                  "duedate",
                  "updated",
                  "priority",
                  "issuetype",
                  "progress",
                  "issuelinks",
                  ...(startFieldId ? [startFieldId] : []),
                ],
              },
              controller.signal,
            );
          } catch (error) {
            if (controller.signal.aborted) throw error;
            markUnavailable("unreachable");
            continue;
          }
          const found = new Map(result.issues.map((issue) => [issue.key.toUpperCase(), issue.fields ?? {}] as const));
          for (const issue of issues) {
            const fields = found.get(issue.issueKey);
            const status = fields?.status as { name?: unknown; statusCategory?: { key?: unknown } } | undefined;
            next.set(issue.taskId, fields ? jiraLiveStatus(status?.statusCategory?.key) : "live-unknown");
            const detail = nextDetails.get(issue.taskId);
            if (detail && !fields) detail.unavailable = "not-found";
            if (detail && fields) {
              Object.assign(detail, jiraLinkedExtras(fields, startFieldId));
              if (typeof fields.summary === "string") detail.summary = fields.summary;
              if (typeof status?.name === "string") detail.statusName = status.name;
              const assignee = (fields.assignee as { displayName?: unknown } | null | undefined)?.displayName;
              if (typeof assignee === "string") detail.assignee = assignee;
            }
          }
        }
        if (controller.signal.aborted) return;
        setLinkedStatuses(next);
        setLinkedDetails(nextDetails);
        setLinkedSyncedAt(Date.now());
      } catch {
        if (controller.signal.aborted) return;
        // Best-effort: keep earlier results when Jira can't be reached, but on the first attempt
        // still mark the linked tasks so the diagram says why there is no status.
        setLinkedDetails((previous) =>
          previous.size
            ? previous
            : new Map(
                linkedIssues.map((issue) => [
                  issue.taskId,
                  {
                    issueKey: issue.issueKey,
                    url: `${issue.siteOrigin}/browse/${issue.issueKey}`,
                    unavailable: "unreachable" as const,
                  },
                ]),
              ),
        );
        setLinkedStatuses((previous) =>
          previous.size ? previous : new Map(linkedIssues.map((issue) => [issue.taskId, "live-unknown" as const])),
        );
      } finally {
        if (!controller.signal.aborted) setLinkedRefreshing(false);
      }
    }, 600);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // linkedIssues is derived from linkedSignature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, linkedSignature, refreshCount]);

  const diagramStatuses = useMemo(() => {
    const merged = new Map<string, JiraDiagramStatus>(linkedStatuses);
    for (const [taskId, status] of syncedDiagramStatuses) merged.set(taskId, status);
    return merged;
  }, [linkedStatuses, syncedDiagramStatuses]);

  useEffect(() => {
    const { cleanUrl, oauth } = consumeJiraOAuthResult(window.location.href);
    if (!oauth) return;
    window.history.replaceState(window.history.state, "", cleanUrl);
    if (oauth.popup && window.opener) {
      window.opener.postMessage({ type: "plantuml-studio:jira-oauth", result: oauth.result }, window.location.origin);
      window.close();
      return;
    }
    if (oauth.result === "connected") setJiraDialogOpen(true);
    else setInteractionMessage("Jira authorization was not completed");
  }, [setInteractionMessage]);

  return {
    endpoint,
    binding,
    taskStatuses,
    diagramStatuses,
    linkedJiraCount: linkedIssues.length,
    linkedDetails,
    linkedSyncedAt,
    linkedRefreshing,
    refreshLinkedJira,
    jiraDialogOpen,
    setJiraDialogOpen,
  };
}
