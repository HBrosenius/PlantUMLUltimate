import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { isJiraBrowseUrl, jiraTaskAlias } from "./binding";
import type {
  JiraFieldDifference,
  JiraIssueBaseline,
  JiraIssueSnapshot,
  JiraMappedField,
  JiraMappedTaskState,
  JiraReconciliation,
  JiraTaskDivergence,
} from "./types";

const FIELDS: readonly JiraMappedField[] = [
  "key",
  "summary",
  "startDate",
  "dueDate",
  "completion",
  "assigneeAccountId",
];

export function reconcileJiraTask(
  baseline: JiraMappedTaskState,
  local: JiraMappedTaskState,
  remote: JiraMappedTaskState,
): JiraReconciliation {
  const result: JiraReconciliation = { remoteChanges: [], localChanges: [], conflicts: [] };
  for (const field of FIELDS) {
    const difference: JiraFieldDifference = {
      field,
      baseline: baseline[field],
      local: local[field],
      remote: remote[field],
    };
    const localChanged = local[field] !== baseline[field];
    const remoteChanged = remote[field] !== baseline[field];
    if (localChanged && remoteChanged && local[field] !== remote[field]) result.conflicts.push(difference);
    else if (remoteChanged && local[field] !== remote[field]) result.remoteChanges.push(difference);
    else if (localChanged && local[field] !== remote[field]) result.localChanges.push(difference);
  }
  return result;
}

export function mappedStateFromJiraIssue(issue: JiraIssueSnapshot): JiraMappedTaskState {
  return {
    key: issue.key.toUpperCase(),
    summary: issue.summary
      .replace(/[\r\n]+/g, " ")
      .replaceAll("[", "(")
      .replaceAll("]", ")")
      .trim(),
    ...(issue.startDate ? { startDate: issue.startDate } : {}),
    ...(issue.dueDate ? { dueDate: issue.dueDate } : {}),
    ...(issue.completion !== undefined ? { completion: issue.completion } : {}),
  };
}

export function createJiraBaselines(issues: readonly JiraIssueSnapshot[]): Record<string, JiraIssueBaseline> {
  return Object.fromEntries(
    issues.map((issue) => [issue.id, { updated: issue.updated, state: mappedStateFromJiraIssue(issue) }]),
  );
}

export function mappedStateFromGantt(source: string, issueId: string): JiraMappedTaskState | undefined {
  const task = parseGantt(source).document.symbols.tasks.get(jiraTaskAlias(issueId).toLowerCase());
  if (!task) return undefined;
  const jiraLink = (task.links ?? []).find((link) => isJiraBrowseUrl(link.url));
  const key = jiraLink ? /\/browse\/([A-Z][A-Z0-9_]*-\d+)\/?$/i.exec(jiraLink.url)?.[1]?.toUpperCase() : undefined;
  return {
    ...(key ? { key } : {}),
    summary: task.label,
    ...(task.start?.value ? { startDate: task.start.value } : {}),
    ...(task.end?.value ? { dueDate: task.end.value } : {}),
    ...(task.completion ? { completion: task.completion.value } : {}),
  };
}

export function findJiraTaskDivergences(
  source: string,
  issues: readonly JiraIssueSnapshot[],
  baselines: Record<string, JiraIssueBaseline> | undefined,
): JiraTaskDivergence[] {
  if (!baselines) return [];
  return issues.flatMap((issue) => {
    const baseline = baselines[issue.id];
    const local = mappedStateFromGantt(source, issue.id);
    if (!baseline || !local) return [];
    const reconciliation = reconcileJiraTask(baseline.state, local, mappedStateFromJiraIssue(issue));
    return reconciliation.localChanges.length || reconciliation.conflicts.length
      ? [
          {
            issueId: issue.id,
            issueKey: issue.key,
            localChanges: reconciliation.localChanges,
            conflicts: reconciliation.conflicts,
          },
        ]
      : [];
  });
}
