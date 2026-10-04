import * as Y from "yjs";
import { SharedDocumentModel, type SharedDocument, type SharedDiagram } from "./collaboration-document";

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

const REMOTE_ORIGIN = Symbol("remote-collaboration-update");
const SAFE_PARTICIPANT_COLOR = /^#[0-9a-f]{6}$/i;

function safeParticipant(value: unknown): CollaborationParticipant | undefined {
  if (!value || typeof value !== "object") return undefined;
  const participant = value as Partial<CollaborationParticipant>;
  if (typeof participant.id !== "string" || participant.id.length > 100) return undefined;
  return {
    id: participant.id,
    name: typeof participant.name === "string" ? participant.name.slice(0, 60) : "Anonymous",
    color:
      typeof participant.color === "string" && SAFE_PARTICIPANT_COLOR.test(participant.color)
        ? participant.color
        : "#64748b",
    ...(typeof participant.diagramId === "string" && participant.diagramId.length <= 100
      ? {
          diagramId: participant.diagramId,
          diagramName: typeof participant.diagramName === "string" ? participant.diagramName.slice(0, 120) : "Diagram",
        }
      : {}),
    ...(participant.role === "viewer" ? { role: "viewer" as const } : { role: "editor" as const }),
    ...(participant.cursor && Number.isFinite(participant.cursor.line) && Number.isFinite(participant.cursor.column)
      ? { cursor: participant.cursor }
      : {}),
    ...(participant.selection &&
    Number.isFinite(participant.selection.anchor) &&
    Number.isFinite(participant.selection.head)
      ? { selection: participant.selection }
      : {}),
  };
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

function websocketUrl(endpoint: string, roomId: string): string {
  const url = new URL(endpoint);
  url.protocol = url.protocol === "https:" ? "wss:" : url.protocol === "http:" ? "ws:" : url.protocol;
  url.pathname = `${url.pathname.replace(/\/$/, "")}/rooms/${roomId}`;
  url.search = "";
  return url.toString();
}

const COLLABORATION_PROTOCOL = "plantuml-collaboration";

function websocketProtocols(credentials: CollaborationCredentials): string[] {
  return [
    COLLABORATION_PROTOCOL,
    ...(credentials.accessToken ? [`access.${credentials.accessToken}`] : []),
    ...(credentials.ownerToken ? [`owner.${credentials.ownerToken}`] : []),
    ...(credentials.editorToken ? [`editor.${credentials.editorToken}`] : []),
    ...(credentials.viewerToken ? [`viewer.${credentials.viewerToken}`] : []),
  ];
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

export class CollaborationSession {
  private readonly document = new Y.Doc();
  private readonly sharedDocument = new SharedDocumentModel(this.document);
  private sharedSnapshot: SharedDocument | undefined;
  private readonly sourceText = this.document.getText("source");
  private socket?: WebSocket;
  private reconnectTimer?: number;
  private reconnectAttempt = 0;
  private stopped = false;
  private synchronized = false;
  private hasSynchronized = false;
  private pendingRemoteAuthor: CollaborationParticipant | undefined;
  private participant: CollaborationParticipant;
  private presenceTimer: number | undefined;
  private readonly handleOffline = () => {
    this.onConnection("offline");
    this.socket?.close();
  };
  private readonly handleOnline = () => {
    if (this.stopped || this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING)
      return;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.connect(this.sourceText.toString());
  };

  constructor(
    readonly endpoint: string,
    readonly roomId: string,
    initialSource: string,
    participant: CollaborationParticipant,
    private readonly onSource: (source: string) => void,
    private readonly onConnection: (state: CollaborationConnection) => void,
    private readonly onParticipants: (participants: CollaborationParticipant[]) => void,
    private readonly onEdit: (participant: CollaborationParticipant, source: string, range: SourceChangeRange) => void,
    readonly role: CollaborationRole = "editor",
    private readonly credentials: CollaborationCredentials = {},
    private readonly sharedOptions?: {
      initial?: SharedDocument | undefined;
      onDocument(document: SharedDocument): void;
      onDiagramEdit?(participant: CollaborationParticipant, diagram: SharedDiagram, range: SourceChangeRange): void;
    },
  ) {
    this.participant = participant;
    window.addEventListener("offline", this.handleOffline);
    window.addEventListener("online", this.handleOnline);
    this.sourceText.observe(() => {
      if (!this.sharedDocument.snapshot) this.onSource(this.sourceText.toString());
    });
    this.document.on("update", (update: Uint8Array, origin: unknown) => {
      if (this.role === "viewer" || origin === REMOTE_ORIGIN || this.socket?.readyState !== WebSocket.OPEN) return;
      this.socket.send(update);
    });
    this.document.on("afterTransaction", (transaction: Y.Transaction) => {
      if (transaction.origin !== REMOTE_ORIGIN) return;
      const snapshot = this.sharedDocument.snapshot;
      if (!snapshot || JSON.stringify(snapshot) === JSON.stringify(this.sharedSnapshot)) return;
      const previous = this.sharedSnapshot;
      this.sharedSnapshot = snapshot;
      this.sharedOptions?.onDocument(snapshot);
      if (this.synchronized && this.pendingRemoteAuthor)
        this.reportDiagramEdits(previous, snapshot, this.pendingRemoteAuthor);
    });
    this.connect(initialSource);
  }

  private connect(initialSource: string): void {
    if (this.stopped) return;
    if (!navigator.onLine) {
      this.scheduleReconnect(initialSource);
      return;
    }
    this.synchronized = false;
    this.onConnection(this.reconnectAttempt ? "offline" : "connecting");
    const socket = new WebSocket(websocketUrl(this.endpoint, this.roomId), websocketProtocols(this.credentials));
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    socket.onopen = () => this.sendPresence();
    socket.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          const message: unknown = JSON.parse(event.data);
          if (
            message &&
            typeof message === "object" &&
            (message as { type?: unknown }).type === "presence" &&
            Array.isArray((message as { participants?: unknown }).participants)
          )
            this.onParticipants(
              (message as { participants: unknown[] }).participants.flatMap((participant) => {
                const safe = safeParticipant(participant);
                return safe ? [safe] : [];
              }),
            );
          else if (message && typeof message === "object" && (message as { type?: unknown }).type === "room-revoked")
            socket.close(4001, "Room link revoked");
          else if (message && typeof message === "object" && (message as { type?: unknown }).type === "update-author")
            this.pendingRemoteAuthor = safeParticipant((message as { participant?: unknown }).participant);
        } catch {
          // Ignore malformed presence without interrupting document synchronization.
        }
        return;
      }
      const sourceBeforeUpdate = this.sourceText.toString();
      Y.applyUpdate(this.document, new Uint8Array(event.data as ArrayBuffer), REMOTE_ORIGIN);
      const sourceAfterUpdate = this.sourceText.toString();
      if (
        !this.sharedDocument.snapshot &&
        this.synchronized &&
        this.pendingRemoteAuthor &&
        sourceAfterUpdate !== sourceBeforeUpdate
      )
        this.onEdit(this.pendingRemoteAuthor, sourceAfterUpdate, changedRange(sourceBeforeUpdate, sourceAfterUpdate));
      this.pendingRemoteAuthor = undefined;
      if (!this.synchronized) {
        this.synchronized = true;
        this.hasSynchronized = true;
        if (this.role === "editor") {
          const maySeedRoom = Boolean(this.credentials.ownerToken || !this.credentials.accessToken);
          if (maySeedRoom && !this.sharedDocument.snapshot && this.sharedOptions?.initial) {
            this.sharedDocument.apply(this.sharedOptions.initial);
            this.sharedSnapshot = this.sharedDocument.snapshot;
          } else if (maySeedRoom && !this.sharedDocument.snapshot && !this.sourceText.length && initialSource)
            this.sourceText.insert(0, initialSource);
          socket.send(Y.encodeStateAsUpdate(this.document));
        }
        this.reconnectAttempt = 0;
        this.onConnection("connected");
        this.sendPresence();
      }
    };
    socket.onclose = () => this.scheduleReconnect(initialSource);
    socket.onerror = () => socket.close();
  }

  private scheduleReconnect(initialSource: string): void {
    if (this.stopped) return;
    this.onConnection("offline");
    this.reconnectAttempt += 1;
    const delay = Math.min(30_000, 500 * 2 ** Math.min(6, this.reconnectAttempt));
    this.reconnectTimer = window.setTimeout(() => this.connect(initialSource), delay);
  }

  private sendPresence(): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: "presence", participant: this.participant }));
  }

  applySource(source: string): void {
    if (this.role === "viewer" || this.sharedDocument.snapshot) return;
    if (!this.hasSynchronized && this.credentials.accessToken && !this.credentials.ownerToken) return;
    const current = this.sourceText.toString();
    if (current === source) return;
    const range = changedRange(current, source);
    const suffixLength = source.length - range.to;
    this.document.transact(() => {
      const removed = current.length - range.from - suffixLength;
      if (removed) this.sourceText.delete(range.from, removed);
      const inserted = source.slice(range.from, range.to);
      if (inserted) this.sourceText.insert(range.from, inserted);
    });
    if (this.hasSynchronized) this.onEdit(this.participant, source, range);
  }

  applyDocument(document: SharedDocument): void {
    if (this.role === "viewer" || !this.hasSynchronized || !this.sharedDocument.snapshot) return;
    const previous = this.sharedSnapshot;
    this.sharedDocument.apply(document, previous);
    this.sharedSnapshot = this.sharedDocument.snapshot;
    if (this.sharedSnapshot) this.reportDiagramEdits(previous, this.sharedSnapshot, this.participant);
  }

  private reportDiagramEdits(
    previous: SharedDocument | undefined,
    next: SharedDocument,
    participant: CollaborationParticipant,
  ): void {
    for (const diagram of next.diagrams) {
      const before = previous?.diagrams.find((item) => item.id === diagram.id);
      if (before && before.source !== diagram.source)
        this.sharedOptions?.onDiagramEdit?.(participant, diagram, changedRange(before.source, diagram.source));
    }
  }

  updateDiagram(diagramId?: string, diagramName?: string): void {
    if (this.participant.diagramId === diagramId && this.participant.diagramName === diagramName) return;
    this.participant = { ...this.participant, diagramId, diagramName, selection: { anchor: 0, head: 0 } };
    this.sendPresence();
  }

  updateSelection(line: number, column: number, anchor: number, head: number): void {
    this.participant = { ...this.participant, cursor: { line, column }, selection: { anchor, head } };
    if (this.presenceTimer) return;
    this.presenceTimer = window.setTimeout(() => {
      this.presenceTimer = undefined;
      this.sendPresence();
    }, 50);
  }

  async revokeRoom(): Promise<void> {
    if (!this.credentials.ownerToken) throw new Error("Only the room owner can revoke a collaboration link");
    const response = await fetch(websocketUrl(this.endpoint, this.roomId).replace(/^ws/, "http"), {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: this.credentials.ownerToken,
    });
    if (!response.ok) throw new Error(`Could not revoke collaboration link (${response.status})`);
  }

  stop(): void {
    this.stopped = true;
    window.removeEventListener("offline", this.handleOffline);
    window.removeEventListener("online", this.handleOnline);
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    if (this.presenceTimer) window.clearTimeout(this.presenceTimer);
    this.socket?.close(1000, "Left collaboration room");
    this.document.destroy();
  }
}
