import {
  applySourceEdits,
  createDependency,
  removeDependency,
  parseGantt,
  renameTask,
  setTaskDeclaration,
  setTaskLinks,
  setTaskResources,
  type GanttTask,
  type MoveTaskResult,
} from "@plantuml-studio/diagram-gantt";
import { isJiraBrowseUrl, jiraBrowseUrl, jiraTaskAlias } from "./binding";
import type {
  JiraIssueSnapshot,
  JiraMappedField,
  JiraPullChange,
  JiraPullOptions,
  JiraPullPlan,
  JiraPullSummary,
} from "./types";

export function summarizeJiraPullPlan(plan: Pick<JiraPullPlan, "changes" | "warnings">): JiraPullSummary {
  return {
    issues: new Set(plan.changes.map((change) => change.issueId)).size,
    created: plan.changes.filter((change) => change.kind === "created").length,
    updated: plan.changes.filter((change) => change.kind === "updated").length,
    dependencies: plan.changes.filter(
      (change) => change.kind === "dependency-created" || change.kind === "dependency-removed",
    ).length,
    unchanged: plan.changes.filter((change) => change.kind === "unchanged").length,
    warnings: plan.warnings.length,
  };
}

function safeLabel(value: string): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .replaceAll("[", "(")
    .replaceAll("]", ")")
    .trim();
}

function validDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function validateIssue(issue: JiraIssueSnapshot): string | undefined {
  try {
    jiraTaskAlias(issue.id);
    jiraBrowseUrl("https://jira.invalid", issue.key);
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid Jira issue";
  }
  if (!safeLabel(issue.summary)) return "Jira issue summary is empty";
  if (issue.startDate !== undefined && !validDate(issue.startDate)) return `Invalid start date: ${issue.startDate}`;
  if (issue.dueDate !== undefined && !validDate(issue.dueDate)) return `Invalid due date: ${issue.dueDate}`;
  if (
    issue.completion !== undefined &&
    (!Number.isInteger(issue.completion) || issue.completion < 0 || issue.completion > 100)
  )
    return `Invalid completion: ${issue.completion}`;
  return undefined;
}

function applyOperation(source: string, operation: MoveTaskResult): string {
  if (operation.unavailableReason) throw new Error(operation.unavailableReason);
  return operation.edits.length ? applySourceEdits(source, operation.edits) : source;
}

function findTask(source: string, issueId: string): GanttTask | undefined {
  return parseGantt(source).document.symbols.tasks.get(jiraTaskAlias(issueId).toLowerCase());
}

function insertIssue(source: string, siteUrl: string, issue: JiraIssueSnapshot, options: JiraPullOptions): string {
  const end = /(^|\r?\n)([ \t]*)@endgantt\b/i.exec(source);
  if (!end) throw new Error("No @endgantt marker was found");
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const alias = jiraTaskAlias(issue.id);
  const label = safeLabel(issue.summary);
  const resource =
    options.includeAssignee && issue.assignee?.displayName && !/[{}\r\n]/.test(issue.assignee.displayName)
      ? ` on {${issue.assignee.displayName}:100%}`
      : "";
  const schedule = validDate(issue.startDate)
    ? ` starts ${issue.startDate}`
    : validDate(issue.dueDate)
      ? ` ends ${issue.dueDate}`
      : " lasts 1 day";
  const lines = [`[${label}] as [${alias}]${resource}${schedule}`];
  if (validDate(issue.startDate)) {
    if (validDate(issue.dueDate)) lines.push(`[${alias}] ends ${issue.dueDate}`);
    else lines.push(`[${alias}] lasts 1 day`);
  }
  if (issue.completion !== undefined) lines.push(`[${alias}] is ${issue.completion}% completed`);
  lines.push(`[${alias}] links to [[${jiraBrowseUrl(siteUrl, issue.key)} ${issue.key.toUpperCase()}]]`);
  const insertionPoint = end.index + (end[1]?.length ?? 0);
  return applySourceEdits(source, [
    { range: { from: insertionPoint, to: insertionPoint }, text: `${lines.join(newline)}${newline}${newline}` },
  ]);
}

function updateIssue(
  source: string,
  siteUrl: string,
  issue: JiraIssueSnapshot,
  options: JiraPullOptions,
): { source: string; fields: JiraMappedField[] } {
  const fields: JiraMappedField[] = [];
  const run = (field: JiraMappedField, operation: (task: GanttTask) => MoveTaskResult) => {
    const task = findTask(source, issue.id);
    if (!task) throw new Error(`Could not find Jira task ${issue.id}`);
    const next = applyOperation(source, operation(task));
    if (next !== source) fields.push(field);
    source = next;
  };
  let task = findTask(source, issue.id)!;
  const label = safeLabel(issue.summary);
  if (task.label !== label)
    run("summary", (current) => renameTask(source, parseGantt(source).document, current, label));
  task = findTask(source, issue.id)!;
  if (validDate(issue.startDate) && task.start?.value !== issue.startDate)
    run("startDate", (current) => setTaskDeclaration(source, current, "start", `starts ${issue.startDate}`));
  else if (options.manageStartDate && issue.startDate === undefined && task.start)
    run("startDate", (current) => setTaskDeclaration(source, current, "start"));
  task = findTask(source, issue.id)!;
  if (validDate(issue.dueDate) && task.end?.value !== issue.dueDate)
    run("dueDate", (current) => setTaskDeclaration(source, current, "end", `ends ${issue.dueDate}`));
  else if (options.manageDueDate && issue.dueDate === undefined && task.end)
    run("dueDate", (current) => setTaskDeclaration(source, current, "end", "lasts 1 day"));
  task = findTask(source, issue.id)!;
  if (issue.completion !== undefined && task.completion?.value !== issue.completion)
    run("completion", (current) =>
      setTaskDeclaration(source, current, "completion", `is ${issue.completion}% completed`),
    );
  if (options.includeAssignee && issue.assignee !== undefined) {
    const resources =
      issue.assignee?.displayName && !/[{}\r\n]/.test(issue.assignee.displayName)
        ? [{ name: issue.assignee.displayName, allocation: 100 }]
        : [];
    const currentResources = findTask(source, issue.id)?.resources ?? [];
    if (currentResources.length !== resources.length || currentResources[0]?.value !== resources[0]?.name)
      run("assigneeAccountId", (current) => setTaskResources(source, current, resources));
  }
  task = findTask(source, issue.id)!;
  const currentJiraLink = (task.links ?? []).find((link) => isJiraBrowseUrl(link.url));
  const browseUrl = jiraBrowseUrl(siteUrl, issue.key);
  const links = [
    ...(task.links ?? [])
      .filter((link) => !isJiraBrowseUrl(link.url))
      .map(({ url, label: linkLabel }) => ({
        url,
        ...(linkLabel ? { label: linkLabel } : {}),
      })),
    { url: browseUrl, label: issue.key.toUpperCase() },
  ];
  const next = applyOperation(source, setTaskLinks(source, task, links));
  if (next !== source && currentJiraLink?.url !== browseUrl) fields.push("key");
  source = next;
  return { source, fields };
}

export function buildJiraPullPlan(
  originalSource: string,
  siteUrl: string,
  issues: readonly JiraIssueSnapshot[],
  options: JiraPullOptions = {},
): JiraPullPlan {
  let source = originalSource;
  const changes: JiraPullChange[] = [];
  const warnings: string[] = [];
  const validIssues: JiraIssueSnapshot[] = [];
  const managedDependencyKeys = new Set(options.managedDependencyKeys ?? []);
  const seen = new Set<string>();
  for (const issue of issues) {
    const invalid = validateIssue(issue);
    if (invalid) {
      warnings.push(`${issue.key || issue.id}: ${invalid}`);
      continue;
    }
    if (seen.has(issue.id)) {
      warnings.push(`${issue.key}: duplicate issue ID ${issue.id} was ignored`);
      continue;
    }
    seen.add(issue.id);
    validIssues.push(issue);
    const existing = findTask(source, issue.id);
    if (!existing) {
      source = insertIssue(source, siteUrl, issue, options);
      changes.push({ issueId: issue.id, issueKey: issue.key, kind: "created", fields: ["summary"] });
      continue;
    }
    try {
      const updated = updateIssue(source, siteUrl, issue, options);
      source = updated.source;
      changes.push({
        issueId: issue.id,
        issueKey: issue.key,
        kind: updated.fields.length ? "updated" : "unchanged",
        fields: updated.fields,
      });
    } catch (error) {
      warnings.push(`${issue.key}: ${error instanceof Error ? error.message : "could not update task"}`);
    }
  }

  if (options.includeDependencies) {
    const desiredDependencyKeys = new Set(
      validIssues.flatMap((issue) =>
        (issue.blockedByIssueIds ?? []).flatMap((predecessorId) =>
          /^[1-9]\d*$/.test(predecessorId) ? [`${jiraTaskAlias(predecessorId)}>${jiraTaskAlias(issue.id)}`] : [],
        ),
      ),
    );
    for (const key of [...managedDependencyKeys]) {
      if (desiredDependencyKeys.has(key)) continue;
      const [predecessorId, successorId] = key.split(">");
      const document = parseGantt(source).document;
      const dependency = document.dependencies.find(
        (candidate) =>
          candidate.predecessorTaskId === predecessorId?.toLowerCase() &&
          candidate.successorTaskId === successorId?.toLowerCase(),
      );
      if (dependency) {
        source = applyOperation(source, removeDependency(source, dependency.sourceRange, dependency.notes));
        const issue = validIssues.find((candidate) => jiraTaskAlias(candidate.id) === successorId);
        changes.push({
          issueId: issue?.id ?? successorId?.replace(/^jira_/, "") ?? "0",
          issueKey: issue?.key ?? successorId ?? key,
          kind: "dependency-removed",
          fields: [],
        });
      }
      managedDependencyKeys.delete(key);
    }
    for (const issue of validIssues) {
      for (const predecessorId of issue.blockedByIssueIds ?? []) {
        if (!/^[1-9]\d*$/.test(predecessorId)) {
          warnings.push(`${issue.key}: invalid blocking issue ID ${predecessorId} was ignored`);
          continue;
        }
        const document = parseGantt(source).document;
        const predecessor = document.symbols.tasks.get(jiraTaskAlias(predecessorId).toLowerCase());
        const successor = document.symbols.tasks.get(jiraTaskAlias(issue.id).toLowerCase());
        if (!predecessor || !successor) continue;
        if (
          document.dependencies.some(
            (dependency) =>
              dependency.predecessorTaskId === predecessor.id && dependency.successorTaskId === successor.id,
          )
        )
          continue;
        try {
          source = applyOperation(source, createDependency(source, predecessor, successor));
          managedDependencyKeys.add(`${predecessor.id}>${successor.id}`);
          changes.push({ issueId: issue.id, issueKey: issue.key, kind: "dependency-created", fields: [] });
        } catch (error) {
          warnings.push(`${issue.key}: ${error instanceof Error ? error.message : "could not create dependency"}`);
        }
      }
    }
  }
  return { source, changes, warnings, managedDependencyKeys: [...managedDependencyKeys].sort() };
}
