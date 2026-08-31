import { DurableObject } from "cloudflare:workers";
import * as Y from "yjs";

const ROOM_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_UPDATE_BYTES = 1_000_000;
const MAX_DOCUMENT_BYTES = 5_000_000;
const MAX_NAME_LENGTH = 60;

interface Participant {
  id: string;
  name: string;
  color: string;
  cursor?: { line: number; column: number } | undefined;
  selection?: { anchor: number; head: number } | undefined;
}

function participantFrom(value: unknown, fallbackId: string): Participant | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<Participant>;
  const name = typeof candidate.name === "string" ? candidate.name.trim().slice(0, MAX_NAME_LENGTH) : "";
  const color =
    typeof candidate.color === "string" && /^#[0-9a-f]{6}$/i.test(candidate.color) ? candidate.color : "#64748b";
  const cursor = candidate.cursor;
  const selection = candidate.selection;
  return {
    id: typeof candidate.id === "string" && candidate.id.length <= 100 ? candidate.id : fallbackId,
    name: name || "Anonymous",
    color,
    ...(cursor && Number.isFinite(cursor.line) && Number.isFinite(cursor.column)
      ? {
          cursor: {
            line: Math.max(1, Math.floor(cursor.line)),
            column: Math.max(1, Math.floor(cursor.column)),
          },
        }
      : {}),
    ...(selection && Number.isFinite(selection.anchor) && Number.isFinite(selection.head)
      ? {
          selection: {
            anchor: Math.max(0, Math.floor(selection.anchor)),
            head: Math.max(0, Math.floor(selection.head)),
          },
        }
      : {}),
  };
}

function messageBytes(message: string | ArrayBuffer): Uint8Array {
  return typeof message === "string" ? new TextEncoder().encode(message) : new Uint8Array(message);
}

export class CollaborationRoom extends DurableObject<Env> {
  private document = new Y.Doc();
  private ownerToken: string | undefined;
  private revoked = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS room_state (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          state BLOB NOT NULL,
          revision INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS room_access (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          owner_token TEXT NOT NULL,
          revoked INTEGER NOT NULL DEFAULT 0
        )
      `);
      const access = this.ctx.storage.sql
        .exec<{ owner_token: string; revoked: number }>(
          "SELECT owner_token, revoked FROM room_access WHERE singleton = 1",
        )
        .toArray()[0];
      this.ownerToken = access?.owner_token;
      this.revoked = access?.revoked === 1;
      const stored = this.ctx.storage.sql
        .exec<{ state: ArrayBuffer }>("SELECT state FROM room_state WHERE singleton = 1")
        .toArray()[0];
      if (stored) Y.applyUpdate(this.document, new Uint8Array(stored.state));
      else this.persist();
    });
  }

  private persist(state = Y.encodeStateAsUpdate(this.document)): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO room_state (singleton, state, revision, updated_at)
       VALUES (1, ?, 1, ?)
       ON CONFLICT(singleton) DO UPDATE SET
         state = excluded.state,
         revision = room_state.revision + 1,
         updated_at = excluded.updated_at`,
      state.buffer.slice(state.byteOffset, state.byteOffset + state.byteLength),
      Date.now(),
    );
  }

  private participants(): Participant[] {
    return this.ctx
      .getWebSockets()
      .map((socket) => participantFrom(socket.deserializeAttachment(), crypto.randomUUID()))
      .filter((participant): participant is Participant => Boolean(participant));
  }

  private broadcastPresence(): void {
    if (this.revoked) return;
    const message = JSON.stringify({ type: "presence", participants: this.participants() });
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
      } catch {
        // A hibernating socket may already be closing while presence is recomputed.
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (this.revoked) return Response.json({ error: "Room revoked" }, { status: 410 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return Response.json({ error: "WebSocket upgrade required" }, { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const requestedOwnerToken = new URL(request.url).searchParams.get("owner");
    if (!this.ownerToken && requestedOwnerToken && /^[A-Za-z0-9_-]{43}$/.test(requestedOwnerToken)) {
      this.ownerToken = requestedOwnerToken;
      this.ctx.storage.sql.exec(
        "INSERT INTO room_access (singleton, owner_token, revoked) VALUES (1, ?, 0)",
        requestedOwnerToken,
      );
    }
    const participant = participantFrom(
      {
        id: new URL(request.url).searchParams.get("participant"),
        name: "Anonymous",
        color: "#64748b",
      },
      crypto.randomUUID(),
    )!;
    server.serializeAttachment(participant);
    this.ctx.acceptWebSocket(server);
    server.send(Y.encodeStateAsUpdate(this.document));
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message === "string") {
      if (message.length > 4_096) return socket.close(1009, "Presence message too large");
      try {
        const parsed: unknown = JSON.parse(message);
        if (!parsed || typeof parsed !== "object") return;
        if ((parsed as { type?: unknown }).type === "revoke-room") {
          if (!this.ownerToken || (parsed as { ownerToken?: unknown }).ownerToken !== this.ownerToken) return;
          this.revoked = true;
          this.ctx.storage.sql.exec("UPDATE room_access SET revoked = 1 WHERE singleton = 1");
          this.ctx.storage.sql.exec("DELETE FROM room_state WHERE singleton = 1");
          for (const peer of this.ctx.getWebSockets()) peer.close(4001, "Room link revoked");
          return;
        }
        if ((parsed as { type?: unknown }).type !== "presence") return;
        const current = participantFrom(socket.deserializeAttachment(), crypto.randomUUID())!;
        const participant = participantFrom((parsed as { participant?: unknown }).participant, current.id);
        if (!participant) return;
        socket.serializeAttachment({ ...participant, id: current.id });
        this.broadcastPresence();
      } catch {
        socket.close(1007, "Invalid JSON");
      }
      return;
    }
    const update = messageBytes(message);
    if (update.byteLength > MAX_UPDATE_BYTES) return socket.close(1009, "Document update too large");
    try {
      const previousState = Y.encodeStateAsUpdate(this.document);
      Y.applyUpdate(this.document, update);
      const state = Y.encodeStateAsUpdate(this.document);
      if (state.byteLength > MAX_DOCUMENT_BYTES) {
        this.document.destroy();
        this.document = new Y.Doc();
        Y.applyUpdate(this.document, previousState);
        return socket.close(1009, "Document is too large");
      }
      this.persist(state);
      const author = participantFrom(socket.deserializeAttachment(), crypto.randomUUID())!;
      const authorMessage = JSON.stringify({ type: "update-author", participant: author });
      for (const peer of this.ctx.getWebSockets()) {
        if (peer === socket) continue;
        try {
          peer.send(authorMessage);
          peer.send(update);
        } catch {
          // Ignore peers that closed between enumeration and delivery.
        }
      }
    } catch {
      socket.close(1007, "Invalid document update");
    }
  }

  webSocketClose(): void {
    this.broadcastPresence();
  }

  webSocketError(): void {
    this.broadcastPresence();
  }
}

function allowedOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  return Boolean(
    origin &&
    env.ALLOWED_ORIGINS.split(",")
      .map((value) => value.trim())
      .includes(origin),
  );
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ status: "ok" });
    const match = /^\/rooms\/([^/]+)$/.exec(url.pathname);
    if (!match || !ROOM_PATTERN.test(match[1]!)) return Response.json({ error: "Not found" }, { status: 404 });
    if (!allowedOrigin(request, env)) return Response.json({ error: "Origin not allowed" }, { status: 403 });
    try {
      return await env.COLLABORATION_ROOM.getByName(match[1]!).fetch(request);
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "Collaboration room request failed",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return Response.json({ error: "Collaboration service unavailable" }, { status: 503 });
    }
  },
} satisfies ExportedHandler<Env>;
