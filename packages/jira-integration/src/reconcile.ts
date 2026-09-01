import {
  applySourceEdits,
  deleteTask,
  parseGantt,
  renameTaskAlias,
  setTaskLinks,
} from "@plantuml-studio/diagram-gantt";
import { isJiraBrowseUrl, jiraTaskAlias } from "./binding";
import type {
  JiraFieldDifference,
  JiraFieldResolution,
  JiraIssueBaseline,
  JiraIssueSnapshot,
  JiraMappedField,
  JiraMappedTaskState,
  JiraMissingTask,
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

export function findJiraLocalChangeFields(
  source: string,
  issueId: string,
  baseline: JiraIssueBaseline | undefined,
): JiraMappedField[] {
  if (!baseline) return [];
  const local = mappedStateFromGantt(source, issueId);
  if (!local) return [];
  return FIELDS.filter((field) => local[field] !== baseline.state[field]);
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

export function applyJiraFieldResolutions(
  issues: readonly JiraIssueSnapshot[],
  divergences: readonly JiraTaskDivergence[],
  resolutions: readonly JiraFieldResolution[],
): JiraIssueSnapshot[] {
  const localValues = new Map<string, JiraFieldDifference>();
  for (const divergence of divergences) {
    for (const difference of [...divergence.conflicts, ...divergence.localChanges])
      localValues.set(`${divergence.issueId}:${difference.field}`, difference);
  }
  const selected = new Map(resolutions.map((resolution) => [`${resolution.issueId}:${resolution.field}`, resolution]));
  return issues.map((issue) => {
    const next = { ...issue };
    for (const field of FIELDS) {
      if (selected.get(`${issue.id}:${field}`)?.choice !== "local") continue;
      const value = localValues.get(`${issue.id}:${field}`)?.local;
      if (field === "key" && typeof value === "string") next.key = value;
      else if (field === "summary" && typeof value === "string") next.summary = value;
      else if (field === "startDate") {
        if (typeof value === "string") next.startDate = value;
        else delete next.startDate;
      } else if (field === "dueDate") {
        if (typeof value === "string") next.dueDate = value;
        else delete next.dueDate;
      } else if (field === "completion") {
        if (typeof value === "number") next.completion = value;
        else delete next.completion;
      }
    }
    return next;
  });
}

export function findMissingJiraTasks(
  source: string,
  issues: readonly JiraIssueSnapshot[],
  baselines: Record<string, JiraIssueBaseline> | undefined,
): JiraMissingTask[] {
  if (!baselines) return [];
  const currentIds = new Set(issues.map((issue) => issue.id));
  return Object.entries(baselines).flatMap(([issueId, baseline]) => {
    if (currentIds.has(issueId)) return [];
    const local = mappedStateFromGantt(source, issueId);
    if (!local) return [];
    const issueKey = local.key ?? baseline.state.key ?? `JIRA-${issueId}`;
    const document = parseGantt(source).document;
    const task = document.symbols.tasks.get(jiraTaskAlias(issueId).toLowerCase());
    const dependencyLabels = task
      ? [
          ...new Set(
            document.dependencies.flatMap((dependency) => {
              if (dependency.predecessorTaskId === task.id)
                return [document.symbols.tasks.get(dependency.successorTaskId)?.label ?? dependency.successor.value];
              if (dependency.successorTaskId === task.id)
                return [
                  document.symbols.tasks.get(dependency.predecessorTaskId)?.label ?? dependency.predecessor.value,
                ];
              return [];
            }),
          ),
        ].sort((a, b) => a.localeCompare(b))
      : [];
    return [
      {
        issueId,
        issueKey,
        summary: local.summary ?? baseline.state.summary ?? issueKey,
        locallyChanged: FIELDS.some((field) => local[field] !== baseline.state[field]),
        dependencyLabels,
      },
    ];
  });
}

export function detachJiraTasks(source: string, issueIds: readonly string[]): string {
  let next = source;
  for (const issueId of issueIds) {
    let document = parseGantt(next).document;
    let task = document.symbols.tasks.get(jiraTaskAlias(issueId).toLowerCase());
    if (!task?.alias) continue;
    const remainingLinks = (task.links ?? [])
      .filter((link) => !isJiraBrowseUrl(link.url))
      .map(({ url, label }) => ({ url, ...(label ? { label } : {}) }));
    next = applySourceEdits(next, setTaskLinks(next, task, remainingLinks).edits);

    document = parseGantt(next).document;
    task = document.symbols.tasks.get(jiraTaskAlias(issueId).toLowerCase());
    if (!task?.alias) continue;
    const baseAlias = `local_jira_${issueId}`;
    let alias = baseAlias;
    for (let suffix = 2; document.symbols.tasks.has(alias.toLowerCase()) && suffix < 10_000; suffix += 1)
      alias = `${baseAlias}_${suffix}`;
    const renamed = renameTaskAlias(next, document, task, alias);
    if (!renamed.unavailableReason) next = applySourceEdits(next, renamed.edits);
  }
  return next;
}

export function removeJiraTasks(source: string, issueIds: readonly string[]): string {
  let next = source;
  for (const issueId of issueIds) {
    const document = parseGantt(next).document;
    const task = document.symbols.tasks.get(jiraTaskAlias(issueId).toLowerCase());
    if (task) next = applySourceEdits(next, deleteTask(next, document, task).edits);
  }
  return next;
}
