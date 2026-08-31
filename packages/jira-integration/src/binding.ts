import type { JiraDocumentBinding } from "./types";

const DIRECTIVE = /^[ \t]*'[ \t]*@studio-jira[ \t]+(.+?)[ \t]*\r?$/m;

function isHttpsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value.replace(/\/$/, "") && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validBinding(value: unknown): value is JiraDocumentBinding {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<JiraDocumentBinding>;
  return (
    candidate.version === 1 &&
    typeof candidate.bindingId === "string" &&
    Boolean(candidate.bindingId) &&
    typeof candidate.cloudId === "string" &&
    Boolean(candidate.cloudId) &&
    typeof candidate.siteUrl === "string" &&
    isHttpsOrigin(candidate.siteUrl) &&
    typeof candidate.jql === "string" &&
    Boolean(candidate.jql.trim()) &&
    (candidate.mode === "pull" || candidate.mode === "review-publish") &&
    (candidate.startFieldId === undefined || /^[a-zA-Z0-9_:-]+$/.test(candidate.startFieldId)) &&
    (candidate.includeAssignee === undefined || typeof candidate.includeAssignee === "boolean") &&
    (candidate.includeDependencies === undefined || typeof candidate.includeDependencies === "boolean") &&
    (candidate.managedDependencyKeys === undefined ||
      (Array.isArray(candidate.managedDependencyKeys) &&
        candidate.managedDependencyKeys.every((key) => /^jira_[1-9]\d*>jira_[1-9]\d*$/.test(key)))) &&
    validBaselines(candidate.baselines)
  );
}

function validBaselines(value: JiraDocumentBinding["baselines"]): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(
    ([issueId, baseline]) =>
      /^[1-9]\d*$/.test(issueId) &&
      baseline &&
      typeof baseline === "object" &&
      typeof baseline.updated === "string" &&
      baseline.state &&
      typeof baseline.state === "object",
  );
}

export function parseJiraDocumentBinding(source: string): JiraDocumentBinding | undefined {
  const encoded = DIRECTIVE.exec(source)?.[1];
  if (!encoded) return undefined;
  try {
    const value: unknown = JSON.parse(encoded);
    return validBinding(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function setJiraDocumentBinding(source: string, binding: JiraDocumentBinding): string {
  if (!validBinding(binding)) throw new Error("Invalid Jira document binding");
  const directive = `' @studio-jira ${JSON.stringify({ ...binding, siteUrl: binding.siteUrl.replace(/\/$/, "") })}`;
  const existing = DIRECTIVE.exec(source);
  if (existing) return source.slice(0, existing.index) + directive + source.slice(existing.index + existing[0].length);

  const start = /^\s*@startgantt\b[^\r\n]*(\r?\n)?/im.exec(source);
  if (!start) throw new Error("No @startgantt marker was found");
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const insertionPoint = start.index + start[0].length;
  const needsNewline = !start[1];
  return `${source.slice(0, insertionPoint)}${needsNewline ? newline : ""}${directive}${newline}${source.slice(insertionPoint)}`;
}

export function jiraTaskAlias(issueId: string): string {
  if (!/^[1-9]\d*$/.test(issueId)) throw new Error(`Invalid Jira issue ID: ${issueId}`);
  return `jira_${issueId}`;
}

export function issueIdFromJiraTaskAlias(alias: string): string | undefined {
  return /^jira_([1-9]\d*)$/i.exec(alias)?.[1];
}

export function jiraBrowseUrl(siteUrl: string, issueKey: string): string {
  if (!isHttpsOrigin(siteUrl)) throw new Error("Jira site URL must be an HTTPS origin");
  if (!/^[A-Z][A-Z0-9_]*-\d+$/i.test(issueKey)) throw new Error(`Invalid Jira issue key: ${issueKey}`);
  return `${siteUrl.replace(/\/$/, "")}/browse/${issueKey.toUpperCase()}`;
}

export function isJiraBrowseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && /^\/browse\/[A-Z][A-Z0-9_]*-\d+\/?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}
