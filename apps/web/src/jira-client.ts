import type { JiraIssueSnapshot } from "@plantuml-studio/jira-integration";

export interface JiraSite {
  id: string;
  url: string;
  name: string;
  avatarUrl?: string;
}

export interface JiraField {
  id: string;
  name: string;
  custom: boolean;
  type?: string;
}

interface JiraConnectionResponse {
  connected: boolean;
  sites?: JiraSite[];
}

interface RawJiraIssue {
  id: string;
  key: string;
  fields?: Record<string, unknown>;
}

interface JiraSearchResponse {
  issues: RawJiraIssue[];
  nextPageToken?: string;
}

async function apiJson<T>(endpoint: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${endpoint.replace(/\/$/, "")}${path}`, { ...init, credentials: "include" });
  if (!response.ok) {
    let message = `Jira request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string") message = body.error;
    } catch {
      // Keep the status-based fallback when the service did not return JSON.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function jiraConnection(endpoint: string): Promise<JiraConnectionResponse> {
  try {
    return await apiJson<JiraConnectionResponse>(endpoint, "/api/connection");
  } catch (error) {
    if (error instanceof Error && error.message.includes("(401)")) return { connected: false };
    throw error;
  }
}

export function jiraAuthorizationUrl(endpoint: string, returnUrl: string): string {
  return `${endpoint.replace(/\/$/, "")}/oauth/start?return_url=${encodeURIComponent(returnUrl)}`;
}

export function jiraPopupReturnUrl(currentUrl: string): string {
  const url = new URL(currentUrl);
  url.hash = "";
  url.searchParams.delete("jira");
  url.searchParams.set("jira_popup", "1");
  return url.toString();
}

export async function jiraFields(endpoint: string, cloudId: string): Promise<JiraField[]> {
  const result = await apiJson<{ fields: JiraField[] }>(endpoint, `/api/fields?cloudId=${encodeURIComponent(cloudId)}`);
  return result.fields;
}

export async function jiraSearch(
  endpoint: string,
  request: { cloudId: string; jql: string; fields: string[]; nextPageToken?: string },
): Promise<JiraSearchResponse> {
  return apiJson<JiraSearchResponse>(endpoint, "/api/issues/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

export async function disconnectJira(endpoint: string): Promise<void> {
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/api/disconnect`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok && response.status !== 204) throw new Error(`Could not disconnect Jira (${response.status})`);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

export function normalizeJiraIssue(issue: RawJiraIssue, startFieldId?: string): JiraIssueSnapshot | undefined {
  if (!/^\d+$/.test(issue.id) || !/^[A-Z][A-Z0-9_]*-\d+$/i.test(issue.key)) return undefined;
  const fields = issue.fields ?? {};
  const summary = typeof fields.summary === "string" ? fields.summary : "";
  const updated = typeof fields.updated === "string" ? fields.updated : "";
  if (!summary || !updated) return undefined;
  const dueDate = typeof fields.duedate === "string" ? fields.duedate : undefined;
  const startDate = startFieldId && typeof fields[startFieldId] === "string" ? fields[startFieldId] : undefined;
  const assignee = record(fields.assignee);
  const status = record(fields.status);
  const statusCategory = record(status?.statusCategory)?.key;
  const completion = statusCategory === "done" ? 100 : statusCategory === "indeterminate" ? 50 : 0;
  return {
    id: issue.id,
    key: issue.key,
    summary,
    updated,
    ...(startDate ? { startDate } : {}),
    ...(dueDate ? { dueDate } : {}),
    completion,
    ...(assignee && typeof assignee.accountId === "string" && typeof assignee.displayName === "string"
      ? { assignee: { accountId: assignee.accountId, displayName: assignee.displayName } }
      : { assignee: null }),
  };
}
