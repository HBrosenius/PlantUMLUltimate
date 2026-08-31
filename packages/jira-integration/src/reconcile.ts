import type { JiraFieldDifference, JiraMappedField, JiraMappedTaskState, JiraReconciliation } from "./types";

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
