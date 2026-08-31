import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildJiraPullPlan,
  setJiraDocumentBinding,
  type JiraDocumentBinding,
  type JiraIssueSnapshot,
} from "@plantuml-studio/jira-integration";
import {
  disconnectJira,
  jiraAuthorizationUrl,
  jiraConnection,
  jiraFields,
  jiraPopupReturnUrl,
  jiraSearch,
  normalizeJiraIssue,
  type JiraField,
  type JiraSite,
} from "./jira-client";
import { useDialogFocus } from "./use-dialog-focus";

export function JiraDialog({
  endpoint,
  source,
  binding,
  readOnly,
  onApply,
  onClose,
}: {
  endpoint: string;
  source: string;
  binding: JiraDocumentBinding | undefined;
  readOnly: boolean;
  onApply(source: string, message: string): void;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, onClose);
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<JiraSite[]>([]);
  const [cloudId, setCloudId] = useState(binding?.cloudId ?? "");
  const [fields, setFields] = useState<JiraField[]>([]);
  const [startFieldId, setStartFieldId] = useState(binding?.startFieldId ?? "");
  const [jql, setJql] = useState(binding?.jql ?? "");
  const [includeAssignee, setIncludeAssignee] = useState(binding?.includeAssignee ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const selectedSite = sites.find((site) => site.id === cloudId);
  const dateFields = useMemo(() => fields.filter((field) => field.type === "date"), [fields]);

  const loadConnection = useCallback(
    async (isActive: () => boolean = () => true) => {
      setLoading(true);
      setError(undefined);
      try {
        const connection = await jiraConnection(endpoint);
        if (!isActive()) return;
        const nextSites = connection.sites ?? [];
        setSites(nextSites);
        setCloudId((current) => (nextSites.some((site) => site.id === current) ? current : (nextSites[0]?.id ?? "")));
      } catch (reason) {
        if (isActive()) setError(reason instanceof Error ? reason.message : "Could not reach Jira");
      } finally {
        if (isActive()) setLoading(false);
      }
    },
    [endpoint],
  );

  useEffect(() => {
    let active = true;
    void loadConnection(() => active);
    return () => {
      active = false;
    };
  }, [loadConnection]);

  useEffect(() => {
    const receiveAuthorization = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || !event.data || typeof event.data !== "object") return;
      const message = event.data as { type?: unknown; result?: unknown };
      if (message.type !== "plantuml-studio:jira-oauth") return;
      if (message.result === "connected") void loadConnection();
      else setError("Jira authorization was not completed");
    };
    window.addEventListener("message", receiveAuthorization);
    return () => window.removeEventListener("message", receiveAuthorization);
  }, [loadConnection]);

  useEffect(() => {
    if (!cloudId) {
      setFields([]);
      return;
    }
    let active = true;
    void jiraFields(endpoint, cloudId)
      .then((next) => active && setFields(next))
      .catch(
        (reason: unknown) => active && setError(reason instanceof Error ? reason.message : "Could not load fields"),
      );
    return () => {
      active = false;
    };
  }, [cloudId, endpoint]);

  const connect = () => {
    const returnUrl = jiraPopupReturnUrl(window.location.href);
    const popup = window.open(
      jiraAuthorizationUrl(endpoint, returnUrl),
      "plantuml-studio-jira-oauth",
      "popup,width=720,height=760",
    );
    if (!popup) setError("Allow popups for this site to connect Jira");
  };

  const disconnect = async () => {
    setError(undefined);
    try {
      await disconnectJira(endpoint);
      setSites([]);
      setCloudId("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not disconnect Jira");
    }
  };

  const importIssues = async () => {
    if (!selectedSite || !jql.trim() || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const issues: JiraIssueSnapshot[] = [];
      const seenTokens = new Set<string>();
      let nextPageToken: string | undefined;
      for (let page = 0; page < 50; page += 1) {
        const result = await jiraSearch(endpoint, {
          cloudId,
          jql: jql.trim(),
          fields: startFieldId ? [startFieldId] : [],
          ...(nextPageToken ? { nextPageToken } : {}),
        });
        issues.push(
          ...result.issues.flatMap((issue) => {
            const normalized = normalizeJiraIssue(issue, startFieldId || undefined);
            return normalized ? [normalized] : [];
          }),
        );
        if (!result.nextPageToken) break;
        if (seenTokens.has(result.nextPageToken)) throw new Error("Jira returned a repeated page token");
        seenTokens.add(result.nextPageToken);
        nextPageToken = result.nextPageToken;
        if (page === 49) throw new Error("The Jira query returned more than 5,000 issues; narrow the JQL query");
      }
      const plan = buildJiraPullPlan(source, selectedSite.url, issues, { includeAssignee });
      const nextBinding: JiraDocumentBinding = {
        version: 1,
        bindingId: binding?.bindingId ?? crypto.randomUUID(),
        cloudId,
        siteUrl: selectedSite.url,
        jql: jql.trim(),
        mode: "pull",
        ...(startFieldId ? { startFieldId } : {}),
        ...(includeAssignee ? { includeAssignee: true } : {}),
      };
      const nextSource = setJiraDocumentBinding(plan.source, nextBinding);
      const changed = plan.changes.filter((change) => change.kind !== "unchanged").length;
      onApply(nextSource, `Jira synchronized ${issues.length} issues · ${changed} changes`);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not import Jira issues");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={dialog}
        className="task-dialog jira-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Jira integration"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2>Jira</h2>
            <p>Import a Jira Cloud query into this Gantt chart.</p>
          </div>
          <button type="button" aria-label="Close Jira integration" onClick={onClose}>
            ×
          </button>
        </header>
        {loading ? (
          <p>Checking Jira connection…</p>
        ) : sites.length === 0 ? (
          <>
            <p>Connect Jira to choose a site and import issues. Credentials stay in the integration service.</p>
            <div className="dialog-actions">
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={connect}>
                Connect Jira
              </button>
            </div>
          </>
        ) : (
          <>
            <label>
              Jira site
              <select value={cloudId} onChange={(event) => setCloudId(event.target.value)}>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              JQL
              <textarea
                required
                rows={3}
                placeholder="project = APP ORDER BY Rank"
                value={jql}
                onChange={(event) => setJql(event.target.value)}
              />
            </label>
            <label>
              Start date
              <select value={startFieldId} onChange={(event) => setStartFieldId(event.target.value)}>
                <option value="">Do not import</option>
                {dateFields.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="jira-check">
              <input
                type="checkbox"
                checked={includeAssignee}
                onChange={(event) => setIncludeAssignee(event.target.checked)}
              />
              Import assignee as a 100% resource
            </label>
            <p className="jira-disclosure">
              Imported summaries, dates, statuses, and assignees become part of the PlantUML file and may be visible to
              anyone it is shared with.
            </p>
            <div className="dialog-actions">
              <button type="button" onClick={() => void disconnect()}>
                Disconnect
              </button>
              <span />
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={readOnly || busy || !jql.trim()}
                onClick={() => void importIssues()}
              >
                {busy ? "Synchronizing…" : binding ? "Refresh from Jira" : "Import from Jira"}
              </button>
            </div>
          </>
        )}
        {error && (
          <p className="field-error jira-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
