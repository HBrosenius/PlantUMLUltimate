import * as Y from "yjs";

export interface CollaborationParticipant {
  id: string;
  name: string;
  color: string;
  cursor?: { line: number; column: number } | undefined;
  selection?: { anchor: number; head: number } | undefined;
}

export type CollaborationConnection = "connecting" | "connected" | "offline";

const REMOTE_ORIGIN = Symbol("remote-collaboration-update");

function websocketUrl(endpoint: string, roomId: string, participantId: string): string {
  const url = new URL(endpoint);
  url.protocol = url.protocol === "https:" ? "wss:" : url.protocol === "http:" ? "ws:" : url.protocol;
  url.pathname = `${url.pathname.replace(/\/$/, "")}/rooms/${roomId}`;
  url.search = new URLSearchParams({ participant: participantId }).toString();
  return url.toString();
}

export function createCollaborationRoomId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function collaborationShareUrl(pageUrl: string, endpoint: string, roomId: string): string {
  const url = new URL(pageUrl);
  const fragment = new URLSearchParams(url.hash.slice(1));
  fragment.set("collaboration", roomId);
  fragment.set("server", endpoint);
  url.hash = fragment.toString();
  return url.toString();
}

export function collaborationLinkDetails(pageUrl: string): {
  roomId: string | undefined;
  endpoint: string | undefined;
} {
  const url = new URL(pageUrl);
  const fragment = new URLSearchParams(url.hash.slice(1));
  return {
    roomId: fragment.get("collaboration") ?? undefined,
    endpoint: fragment.get("server") ?? undefined,
  };
}

export function withoutCollaborationLink(pageUrl: string): string {
  const url = new URL(pageUrl);
  const fragment = new URLSearchParams(url.hash.slice(1));
  fragment.delete("collaboration");
  fragment.delete("server");
  url.hash = fragment.toString();
  return url.toString();
}

export class CollaborationSession {
  private readonly document = new Y.Doc();
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

  constructor(
    readonly endpoint: string,
    readonly roomId: string,
    initialSource: string,
    participant: CollaborationParticipant,
    private readonly onSource: (source: string) => void,
    private readonly onConnection: (state: CollaborationConnection) => void,
    private readonly onParticipants: (participants: CollaborationParticipant[]) => void,
    private readonly onEdit: (participant: CollaborationParticipant, source: string) => void,
  ) {
    this.participant = participant;
    this.sourceText.observe(() => this.onSource(this.sourceText.toString()));
    this.document.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE_ORIGIN || this.socket?.readyState !== WebSocket.OPEN) return;
      this.socket.send(update);
    });
    this.connect(initialSource);
  }

  private connect(initialSource: string): void {
    if (this.stopped) return;
    this.synchronized = false;
    this.onConnection(this.reconnectAttempt ? "offline" : "connecting");
    const socket = new WebSocket(websocketUrl(this.endpoint, this.roomId, this.participant.id));
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
            this.onParticipants((message as { participants: CollaborationParticipant[] }).participants);
          else if (message && typeof message === "object" && (message as { type?: unknown }).type === "update-author")
            this.pendingRemoteAuthor = (message as { participant: CollaborationParticipant }).participant;
        } catch {
          // Ignore malformed presence without interrupting document synchronization.
        }
        return;
      }
      const sourceBeforeUpdate = this.sourceText.toString();
      Y.applyUpdate(this.document, new Uint8Array(event.data as ArrayBuffer), REMOTE_ORIGIN);
      const sourceAfterUpdate = this.sourceText.toString();
      if (this.synchronized && this.pendingRemoteAuthor && sourceAfterUpdate !== sourceBeforeUpdate)
        this.onEdit(this.pendingRemoteAuthor, sourceAfterUpdate);
      this.pendingRemoteAuthor = undefined;
      if (!this.synchronized) {
        this.synchronized = true;
        this.hasSynchronized = true;
        if (!this.sourceText.length && initialSource) this.sourceText.insert(0, initialSource);
        socket.send(Y.encodeStateAsUpdate(this.document));
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
    const current = this.sourceText.toString();
    if (current === source) return;
    let prefix = 0;
    while (prefix < current.length && prefix < source.length && current[prefix] === source[prefix]) prefix += 1;
    let suffix = 0;
    while (
      suffix < current.length - prefix &&
      suffix < source.length - prefix &&
      current[current.length - 1 - suffix] === source[source.length - 1 - suffix]
    )
      suffix += 1;
    this.document.transact(() => {
      const removed = current.length - prefix - suffix;
      if (removed) this.sourceText.delete(prefix, removed);
      const inserted = source.slice(prefix, source.length - suffix);
      if (inserted) this.sourceText.insert(prefix, inserted);
    });
    if (this.hasSynchronized) this.onEdit(this.participant, source);
  }

  updateSelection(line: number, column: number, anchor: number, head: number): void {
    this.participant = { ...this.participant, cursor: { line, column }, selection: { anchor, head } };
    if (this.presenceTimer) return;
    this.presenceTimer = window.setTimeout(() => {
      this.presenceTimer = undefined;
      this.sendPresence();
    }, 50);
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    if (this.presenceTimer) window.clearTimeout(this.presenceTimer);
    this.socket?.close(1000, "Left collaboration room");
    this.document.destroy();
  }
}
