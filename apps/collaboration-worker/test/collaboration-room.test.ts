import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

const room = "a".repeat(43);

async function connect(
  roomId: string,
  credentials?: { owner?: string; editor?: string; viewer?: string; access?: string },
): Promise<WebSocket> {
  const url = new URL(`https://collaboration.example/rooms/${roomId}`);
  for (const [name, value] of Object.entries(credentials ?? {})) if (value) url.searchParams.set(name, value);
  const response = await exports.default.fetch(
    new Request(url, {
      headers: { Origin: "http://localhost:5173", Upgrade: "websocket" },
    }),
  );
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  expect(socket).toBeDefined();
  socket!.accept();
  return socket!;
}

async function roomResponse(roomId: string, access?: string): Promise<Response> {
  const url = new URL(`https://collaboration.example/rooms/${roomId}`);
  if (access) url.searchParams.set("access", access);
  return exports.default.fetch(
    new Request(url, {
      headers: { Origin: "http://localhost:5173", Upgrade: "websocket" },
    }),
  );
}

function nextBinary(socket: WebSocket): Promise<Uint8Array> {
  return new Promise((resolve) => {
    const listener = (event: MessageEvent) => {
      if (typeof event.data === "string") return;
      socket.removeEventListener("message", listener);
      if (event.data instanceof ArrayBuffer) resolve(new Uint8Array(event.data));
      else if (ArrayBuffer.isView(event.data))
        resolve(new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength));
      else void (event.data as Blob).arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)));
    };
    socket.addEventListener("message", listener);
  });
}

function nextJsonMessage<T>(socket: WebSocket, type: string): Promise<T> {
  return new Promise((resolve) => {
    const listener = (event: MessageEvent) => {
      if (typeof event.data !== "string") return;
      const message = JSON.parse(event.data) as { type?: string };
      if (message.type !== type) return;
      socket.removeEventListener("message", listener);
      resolve(message as T);
    };
    socket.addEventListener("message", listener);
  });
}

describe("collaboration Worker", () => {
  it("reports health without creating a room", async () => {
    const response = await exports.default.fetch(new Request("https://collaboration.example/health"));
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("rejects invalid rooms and untrusted origins", async () => {
    expect((await exports.default.fetch(new Request("https://collaboration.example/rooms/short"))).status).toBe(404);
    expect((await exports.default.fetch(new Request(`https://collaboration.example/rooms/${room}`))).status).toBe(403);
  });

  it("creates isolated room objects", async () => {
    const first = env.COLLABORATION_ROOM.getByName(room);
    const second = env.COLLABORATION_ROOM.getByName("b".repeat(43));
    expect(first.id.equals(second.id)).toBe(false);
  });

  it("synchronizes and persists Yjs document updates", async () => {
    const roomId = "c".repeat(43);
    const sender = await connect(roomId);
    await nextBinary(sender);

    const receiver = await connect(roomId);
    await nextBinary(receiver);
    const updateReceived = nextBinary(receiver);
    const authorReceived = nextJsonMessage<{ participant: { name: string } }>(receiver, "update-author");
    sender.send(
      JSON.stringify({
        type: "presence",
        participant: { id: "sender", name: "Alice", color: "#2563eb", selection: { anchor: 2, head: 8 } },
      }),
    );
    const document = new Y.Doc();
    document.getText("source").insert(0, "@startuml\nAlice -> Bob\n@enduml");
    sender.send(Y.encodeStateAsUpdate(document));
    await expect(authorReceived).resolves.toMatchObject({ participant: { name: "Alice" } });
    const update = await updateReceived;
    const synchronized = new Y.Doc();
    Y.applyUpdate(synchronized, update);
    expect(synchronized.getText("source").toString()).toContain("Alice -> Bob");

    sender.close(1000, "test complete");
    receiver.close(1000, "test complete");
    const reconnected = await connect(roomId);
    const persisted = new Y.Doc();
    Y.applyUpdate(persisted, await nextBinary(reconnected));
    expect(persisted.getText("source").toString()).toContain("Alice -> Bob");
    reconnected.close(1000, "test complete");
  });

  it("only lets the room owner revoke a collaboration link", async () => {
    const roomId = "d".repeat(43);
    const ownerToken = "o".repeat(43);
    const editorToken = "e".repeat(43);
    const viewerToken = "v".repeat(43);
    const owner = await connect(roomId, { owner: ownerToken, editor: editorToken, viewer: viewerToken });
    await nextBinary(owner);
    const participant = await connect(roomId, { access: editorToken });
    await nextBinary(participant);

    participant.send(JSON.stringify({ type: "revoke-room", ownerToken: "x".repeat(43) }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await roomResponse(roomId, editorToken)).status).toBe(101);

    const closed = new Promise<CloseEvent>((resolve) => participant.addEventListener("close", resolve, { once: true }));
    owner.send(JSON.stringify({ type: "revoke-room", ownerToken }));
    await expect(closed).resolves.toMatchObject({ code: 4001 });
    expect((await roomResponse(roomId)).status).toBe(410);
  });

  it("rejects document updates from viewer credentials", async () => {
    const roomId = "e".repeat(43);
    const ownerToken = "o".repeat(43);
    const editorToken = "a".repeat(43);
    const viewerToken = "v".repeat(43);
    const owner = await connect(roomId, { owner: ownerToken, editor: editorToken, viewer: viewerToken });
    await nextBinary(owner);
    const viewer = await connect(roomId, { access: viewerToken });
    await nextBinary(viewer);
    expect((await roomResponse(roomId, "x".repeat(43))).status).toBe(403);

    const closed = new Promise<CloseEvent>((resolve) => viewer.addEventListener("close", resolve, { once: true }));
    const malicious = new Y.Doc();
    malicious.getText("source").insert(0, "viewer must not write");
    viewer.send(Y.encodeStateAsUpdate(malicious));
    await expect(closed).resolves.toMatchObject({ code: 1008, reason: "Read-only collaboration" });

    const editor = await connect(roomId, { access: editorToken });
    const persisted = new Y.Doc();
    Y.applyUpdate(persisted, await nextBinary(editor));
    expect(persisted.getText("source").toString()).not.toContain("viewer must not write");
    owner.close(1000, "test complete");
    editor.close(1000, "test complete");
  });
});
