import type { CollaborationCredentials } from "./collaboration";

const key = (endpoint: string, roomId: string) => `plantuml-studio.owner:${endpoint}:${roomId}`;

// Tab-scoped recovery survives reloads, never travels in a share URL, and ends with the tab.
export function recoverOwner(endpoint: string, roomId: string): CollaborationCredentials | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(key(endpoint, roomId)) ?? "null");
    if (
      !value ||
      ![value.ownerToken, value.editorToken, value.viewerToken].every(
        (token) => typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token),
      )
    )
      return undefined;
    return value as CollaborationCredentials;
  } catch {
    return undefined;
  }
}

export function rememberOwner(endpoint: string, roomId: string, credentials: CollaborationCredentials): void {
  // Refuse creation if recovery cannot be saved; otherwise refresh would silently lose ownership.
  sessionStorage.setItem(key(endpoint, roomId), JSON.stringify(credentials));
}

export function forgetOwner(endpoint: string, roomId: string): void {
  try {
    sessionStorage.removeItem(key(endpoint, roomId));
  } catch {
    /* Storage may be disabled. */
  }
}
