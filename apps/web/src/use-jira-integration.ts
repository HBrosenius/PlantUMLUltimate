import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import {
  findJiraLocalChangeFields,
  issueIdFromJiraTaskAlias,
  parseJiraDocumentBinding,
  type JiraMappedField,
} from "@plantuml-studio/jira-integration";

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
    localStorage.getItem("plantuml-studio.jira-integration-server") ??
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
  const diagramStatuses = useMemo(
    () =>
      new Map<string, "synchronized" | "local-changes">(
        [...taskStatuses].map(([taskId, status]) => [taskId, status.fields.length ? "local-changes" : "synchronized"]),
      ),
    [taskStatuses],
  );

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

  return { endpoint, binding, taskStatuses, diagramStatuses, jiraDialogOpen, setJiraDialogOpen };
}
