import { useMemo, useState } from "react";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import {
  issueIdFromJiraTaskAlias,
  jiraKeysJql,
  linkTaskToJiraIssue,
  parseJiraIssueInput,
} from "@plantuml-studio/jira-integration";
import { jiraSearch, type JiraSite } from "./jira-client";

interface IssuePreview {
  issueKey: string;
  summary?: string;
  statusName?: string;
  assignee?: string;
}

/**
 * "Link issue" tab: point one task at an existing Jira issue. Nothing is imported and no review
 * is needed; the diagram stores only the issue link and shows its live status.
 */
export function JiraLinkIssue({
  endpoint,
  site,
  source,
  initialTaskId,
  readOnly,
  onLink,
}: {
  endpoint: string;
  site: JiraSite;
  source: string;
  initialTaskId: string | undefined;
  readOnly: boolean;
  onLink(source: string, message: string): void;
}) {
  // Tasks created by the Jira import are managed by Review refresh, so they are not offered here.
  const tasks = useMemo(
    () => parseGantt(source).document.tasks.filter((task) => !issueIdFromJiraTaskAlias(task.alias?.value ?? "")),
    [source],
  );
  const [taskId, setTaskId] = useState(initialTaskId);
  const chosenTaskId = tasks.some((task) => task.id === taskId) ? taskId : tasks[0]?.id;
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<IssuePreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const lookUp = async () => {
    setError(undefined);
    setPreview(undefined);
    const parsed = parseJiraIssueInput(input, new URL(site.url).origin);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    try {
      const result = await jiraSearch(endpoint, {
        cloudId: site.id,
        jql: jiraKeysJql([parsed.issueKey]),
        fields: ["status", "summary", "assignee"],
      });
      const issue = result.issues.find((item) => item.key.toUpperCase() === parsed.issueKey);
      if (!issue) {
        setError("Issue not found, or you have no access to it.");
        return;
      }
      const status = issue.fields?.status as { name?: unknown } | undefined;
      const assignee = (issue.fields?.assignee as { displayName?: unknown } | null | undefined)?.displayName;
      setPreview({
        issueKey: parsed.issueKey,
        ...(typeof issue.fields?.summary === "string" ? { summary: issue.fields.summary } : {}),
        ...(typeof status?.name === "string" ? { statusName: status.name } : {}),
        ...(typeof assignee === "string" ? { assignee } : {}),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not reach Jira");
    } finally {
      setBusy(false);
    }
  };

  const link = () => {
    if (!preview || !chosenTaskId) return;
    const result = linkTaskToJiraIssue(source, chosenTaskId, site.url, preview.issueKey);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    const label = tasks.find((task) => task.id === chosenTaskId)?.label ?? chosenTaskId;
    onLink(result.source, `Linked ${label} to ${preview.issueKey}`);
  };

  if (!tasks.length)
    return <p className="jira-link-empty">Add a task to the chart first, then link it to a Jira issue.</p>;

  return (
    <form
      className="jira-link-issue"
      onSubmit={(event) => {
        event.preventDefault();
        void lookUp();
      }}
    >
      <p className="jira-link-hint">
        Link a task to an existing issue to show its status on the bar. Nothing is imported, so there is nothing to
        review.
      </p>
      <label>
        Task
        <select value={chosenTaskId} onChange={(event) => setTaskId(event.target.value)}>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Issue key or link
        <input
          value={input}
          placeholder="APP-123"
          onChange={(event) => {
            setInput(event.target.value);
            setPreview(undefined);
            setError(undefined);
          }}
        />
      </label>
      <div className="jira-link-lookup">
        <button type="submit" disabled={busy || !input.trim()}>
          {busy ? "Looking up…" : "Look up issue"}
        </button>
      </div>
      {preview && (
        <p className="jira-link-preview" role="status">
          <strong>{preview.issueKey}</strong> {preview.summary}
          <span>
            {preview.statusName ?? "Status unavailable"}
            {preview.assignee ? ` · ${preview.assignee}` : ""}
          </span>
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="jira-link-actions">
        <button type="button" className="primary" disabled={readOnly || !preview} onClick={link}>
          Link task
        </button>
      </div>
    </form>
  );
}
