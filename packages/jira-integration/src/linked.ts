// "Linked" tasks: a Gantt task whose `links to [[https://site/browse/KEY-1 KEY-1]]` points at a
// Jira issue. Jira owns the status; the diagram only stores the key. This is read-only and does
// not need the document binding or a `jira_<id>` alias used by the full pull/publish sync.

export type JiraLiveStatus = "live-todo" | "live-progress" | "live-done" | "live-unknown";
export type JiraDiagramStatus = "synchronized" | "local-changes" | JiraLiveStatus;

export interface LinkedJiraIssue {
  taskId: string;
  issueKey: string;
  siteOrigin: string;
}

interface LinkableTask {
  id: string;
  alias?: { value: string } | undefined;
  links?: ReadonlyArray<{ url: string }> | undefined;
}

const BROWSE_PATH = /^\/browse\/([A-Z][A-Z0-9_]*-\d+)\/?$/i;

export function parseJiraBrowseLink(url: string): { issueKey: string; siteOrigin: string } | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return undefined;
    const key = BROWSE_PATH.exec(parsed.pathname)?.[1];
    return key ? { issueKey: key.toUpperCase(), siteOrigin: parsed.origin } : undefined;
  } catch {
    return undefined;
  }
}

/** Tasks linked to a Jira issue. Tasks managed by the full sync (`jira_<id>` alias) are skipped. */
export function linkedJiraIssues(tasks: readonly LinkableTask[]): LinkedJiraIssue[] {
  const result: LinkedJiraIssue[] = [];
  for (const task of tasks) {
    if (/^jira_[1-9]\d*$/i.test(task.alias?.value ?? "")) continue;
    for (const link of task.links ?? []) {
      const parsed = parseJiraBrowseLink(link.url);
      if (parsed) {
        result.push({ taskId: task.id, ...parsed });
        break;
      }
    }
  }
  return result;
}

/** Maps Jira's status category key (`new`, `indeterminate`, `done`) to a diagram status. */
export function jiraLiveStatus(categoryKey: unknown): JiraLiveStatus {
  if (categoryKey === "new") return "live-todo";
  if (categoryKey === "indeterminate") return "live-progress";
  if (categoryKey === "done") return "live-done";
  return "live-unknown";
}

/** JQL for a batch of issue keys; keys are validated so the query cannot be injected into. */
export function jiraKeysJql(keys: readonly string[]): string {
  const safe = [...new Set(keys)].filter((key) => /^[A-Z][A-Z0-9_]*-\d+$/.test(key));
  return `key in (${safe.join(", ")})`;
}

export interface JiraLinkedExtras {
  issueType?: string;
  priority?: string;
  dueDate?: string;
  startDate?: string;
  updated?: string;
  progressPercent?: number;
  blocked?: boolean;
}

// Jira's `fields` object is untrusted JSON: read each value defensively.
function text(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function named(value: unknown): string | undefined {
  return value && typeof value === "object" ? text((value as { name?: unknown }).name) : undefined;
}

function dateOnly(value: unknown): string | undefined {
  const raw = text(value);
  return raw && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : undefined;
}

/** The optional hover-card rows, taken from a Jira issue's `fields`. Missing values are omitted. */
export function jiraLinkedExtras(fields: Record<string, unknown>, startFieldId?: string): JiraLinkedExtras {
  const extras: JiraLinkedExtras = {};
  const issueType = named(fields.issuetype);
  if (issueType) extras.issueType = issueType;
  const priority = named(fields.priority);
  if (priority) extras.priority = priority;
  const dueDate = dateOnly(fields.duedate);
  if (dueDate) extras.dueDate = dueDate;
  const startDate = startFieldId ? dateOnly(fields[startFieldId]) : undefined;
  if (startDate) extras.startDate = startDate;
  const updated = text(fields.updated);
  if (updated && !Number.isNaN(Date.parse(updated))) extras.updated = updated;
  const progress = fields.progress as { total?: unknown; percent?: unknown } | undefined;
  if (progress && typeof progress.total === "number" && progress.total > 0 && typeof progress.percent === "number")
    extras.progressPercent = Math.max(0, Math.min(100, Math.round(progress.percent)));
  const links = Array.isArray(fields.issuelinks) ? fields.issuelinks : [];
  extras.blocked = links.some((link) => {
    const entry = link as {
      type?: { inward?: unknown };
      inwardIssue?: { fields?: { status?: { statusCategory?: { key?: unknown } } } };
    };
    return (
      typeof entry.type?.inward === "string" &&
      /blocked by/i.test(entry.type.inward) &&
      entry.inwardIssue !== undefined &&
      entry.inwardIssue.fields?.status?.statusCategory?.key !== "done"
    );
  });
  return extras;
}

/** Whole days from the diagram's date to Jira's date (positive = Jira is later); undefined if either is missing. */
export function jiraDateDrift(jiraDate: string | undefined, diagramDate: string | undefined): number | undefined {
  if (!jiraDate || !diagramDate) return undefined;
  const a = Date.parse(`${jiraDate}T00:00:00Z`);
  const b = Date.parse(`${diagramDate.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(a) || Number.isNaN(b) ? undefined : Math.round((a - b) / 86_400_000);
}
