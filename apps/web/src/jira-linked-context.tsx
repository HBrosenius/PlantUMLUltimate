import { createContext, useContext } from "react";
import type { JiraLinkedExtras } from "@plantuml-studio/jira-integration";

export const JIRA_SHOW_KEYS_KEY = "plantuml-studio.jira-show-keys";

export type JiraUnavailableReason = "not-connected" | "site-not-connected" | "not-found" | "unreachable";

export const JIRA_UNAVAILABLE_MESSAGE: Record<JiraUnavailableReason, string> = {
  "not-connected": "Not connected to Jira",
  "site-not-connected": "This Jira site isn't connected",
  "not-found": "Issue not found, or you have no access",
  unreachable: "Couldn't reach Jira",
};

export interface JiraLinkedIssueDetail extends JiraLinkedExtras {
  unavailable?: JiraUnavailableReason;
  issueKey: string;
  url: string;
  summary?: string;
  statusName?: string;
  assignee?: string;
}

export interface JiraLinkedValue {
  details: ReadonlyMap<string, JiraLinkedIssueDetail>;
  syncedAt: number | undefined;
  refreshing: boolean;
  refresh: () => void;
  openConnect: () => void;
}

const empty: JiraLinkedValue = {
  details: new Map(),
  syncedAt: undefined,
  refreshing: false,
  refresh: () => {},
  openConnect: () => {},
};

export const JiraLinkedContext = createContext<JiraLinkedValue>(empty);

export function useJiraLinked(): JiraLinkedValue {
  return useContext(JiraLinkedContext);
}

export function formatSyncedAgo(syncedAt: number | undefined, now = Date.now()): string {
  if (syncedAt === undefined) return "not synced yet";
  const seconds = Math.max(0, Math.round((now - syncedAt) / 1000));
  if (seconds < 60) return "synced just now";
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `synced ${minutes} min ago` : `synced ${Math.round(minutes / 60)} h ago`;
}

export function formatAgo(timestamp: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(timestamp)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
