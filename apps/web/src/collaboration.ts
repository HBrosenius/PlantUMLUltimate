/** Collaboration links, credentials and shared types. The yjs-backed session lives in collaboration-session.ts. */
export interface CollaborationParticipant {
  id: string;
  name: string;
  color: string;
  cursor?: { line: number; column: number } | undefined;
  selection?: { anchor: number; head: number } | undefined;
  role?: CollaborationRole | undefined;
  diagramId?: string | undefined;
  diagramName?: string | undefined;
}

export type CollaborationConnection = "connecting" | "connected" | "offline";
export type CollaborationRole = "editor" | "viewer";

export interface CollaborationCredentials {
  accessToken?: string | undefined;
  ownerToken?: string | undefined;
  editorToken?: string | undefined;
  viewerToken?: string | undefined;
}

export interface SourceChangeRange {
  from: number;
  to: number;
}

export function changedRange(before: string, after: string): SourceChangeRange {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  )
    suffix += 1;
  return { from: prefix, to: Math.max(prefix, after.length - suffix) };
}

export function createCollaborationRoomId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function createCollaborationOwnerToken(): string {
  return createCollaborationRoomId();
}

export function collaborationShareUrl(
  pageUrl: string,
  endpoint: string,
  roomId: string,
  accessToken?: string,
  role: CollaborationRole = "editor",
): string {
  const url = new URL(pageUrl);
  const fragment = new URLSearchParams(url.hash.slice(1));
  fragment.set("collaboration", roomId);
  fragment.set("server", endpoint);
  if (accessToken) {
    fragment.set("access", accessToken);
    fragment.set("mode", role);
  }
  url.hash = fragment.toString();
  return url.toString();
}

export function collaborationLinkDetails(pageUrl: string): {
  roomId: string | undefined;
  endpoint: string | undefined;
  accessToken: string | undefined;
  role: CollaborationRole;
} {
  const url = new URL(pageUrl);
  const fragment = new URLSearchParams(url.hash.slice(1));
  return {
    roomId: fragment.get("collaboration") ?? undefined,
    endpoint: fragment.get("server") ?? undefined,
    accessToken: fragment.get("access") ?? undefined,
    role: fragment.get("mode") === "viewer" ? "viewer" : "editor",
  };
}

export function withoutCollaborationLink(pageUrl: string): string {
  const url = new URL(pageUrl);
  const fragment = new URLSearchParams(url.hash.slice(1));
  fragment.delete("collaboration");
  fragment.delete("server");
  fragment.delete("access");
  fragment.delete("mode");
  url.hash = fragment.toString();
  return url.toString();
}
