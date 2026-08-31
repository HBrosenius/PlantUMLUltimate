export interface JiraDocumentBinding {
  version: 1;
  bindingId: string;
  cloudId: string;
  siteUrl: string;
  jql: string;
  mode: "pull" | "review-publish";
  startFieldId?: string;
  includeAssignee?: boolean;
  includeDependencies?: boolean;
  baselines?: Record<string, JiraIssueBaseline>;
}

export interface JiraUserSnapshot {
  accountId: string;
  displayName: string;
}

/** Normalized subset of a Jira issue. The API adapter owns custom-field discovery. */
export interface JiraIssueSnapshot {
  id: string;
  key: string;
  summary: string;
  updated: string;
  startDate?: string;
  dueDate?: string;
  completion?: number;
  assignee?: JiraUserSnapshot | null;
  blockedByIssueIds?: string[];
}

export interface JiraPullOptions {
  includeAssignee?: boolean;
  includeDependencies?: boolean;
}

export type JiraMappedField = "key" | "summary" | "startDate" | "dueDate" | "completion" | "assigneeAccountId";

export interface JiraMappedTaskState {
  key?: string;
  summary?: string;
  startDate?: string;
  dueDate?: string;
  completion?: number;
  assigneeAccountId?: string | null;
}

export interface JiraIssueBaseline {
  updated: string;
  state: JiraMappedTaskState;
}

export interface JiraTaskDivergence {
  issueId: string;
  issueKey: string;
  localChanges: JiraFieldDifference[];
  conflicts: JiraFieldDifference[];
}

export interface JiraFieldResolution {
  issueId: string;
  field: JiraMappedField;
  choice: "local" | "jira";
}

export interface JiraMissingTask {
  issueId: string;
  issueKey: string;
  summary: string;
  locallyChanged: boolean;
}

export interface JiraFieldDifference {
  field: JiraMappedField;
  baseline: JiraMappedTaskState[JiraMappedField];
  local: JiraMappedTaskState[JiraMappedField];
  remote: JiraMappedTaskState[JiraMappedField];
}

export interface JiraReconciliation {
  remoteChanges: JiraFieldDifference[];
  localChanges: JiraFieldDifference[];
  conflicts: JiraFieldDifference[];
}

export interface JiraPullChange {
  issueId: string;
  issueKey: string;
  kind: "created" | "updated" | "dependency-created" | "unchanged";
  fields: JiraMappedField[];
}

export interface JiraPullPlan {
  source: string;
  changes: JiraPullChange[];
  warnings: string[];
}

export interface JiraPullSummary {
  issues: number;
  created: number;
  updated: number;
  dependencies: number;
  unchanged: number;
  warnings: number;
}
