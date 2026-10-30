import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

let testIp = 0;
const room = "a".repeat(43);

async function connect(
  roomId: string,
  credentials?: { owner?: string; editor?: string; viewer?: string; access?: string },
): Promise<WebSocket> {
  const url = new URL(`https://collaboration.example/rooms/${roomId}`);
  const protocols = [
    "plantuml-collaboration",
    ...Object.entries(credentials ?? {}).flatMap(([name, value]) => (value ? [`${name}.${value}`] : [])),
  ];
  const response = await exports.default.fetch(
    new Request(url, {
      headers: {
        "CF-Connecting-IP": `192.0.2.${++testIp}`,
        Origin: "http://localhost:5173",
        Upgrade: "websocket",
        "Sec-WebSocket-Protocol": protocols.join(", "),
      },
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
  return exports.default.fetch(
    new Request(url, {
      headers: {
        "CF-Connecting-IP": `192.0.2.${++testIp}`,
        Origin: "http://localhost:5173",
        Upgrade: "websocket",
        "Sec-WebSocket-Protocol": ["plantuml-collaboration", ...(access ? [`access.${access}`] : [])].join(", "),
      },
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
  it("rejects valid binary updates with invalid document values without persisting them", async () => {
    const roomId = "z".repeat(43);
    const editorToken = "e".repeat(43);
    const owner = await connect(roomId, { owner: "o".repeat(43), editor: editorToken, viewer: "v".repeat(43) });
    await nextBinary(owner);
    const closed = new Promise<CloseEvent>((resolve) => owner.addEventListener("close", resolve));
    const malformed = new Y.Doc();
    malformed.getMap("document-diagrams").set("bad", "not-a-map");
    owner.send(Y.encodeStateAsUpdate(malformed));
    expect((await closed).code).toBe(1007);
    const later = await connect(roomId, { access: editorToken });
    const persisted = new Y.Doc();
    Y.applyUpdate(persisted, await nextBinary(later));
    expect(persisted.getMap("document-diagrams").size).toBe(0);
    later.close(1000);
  });
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
    const ownerToken = "o".repeat(43);
    const editorToken = "e".repeat(43);
    const viewerToken = "v".repeat(43);
    const sender = await connect(roomId, { owner: ownerToken, editor: editorToken, viewer: viewerToken });
    await nextBinary(sender);

    const receiver = await connect(roomId, { access: editorToken });
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
    const reconnected = await connect(roomId, { access: editorToken });
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

    const invalidRevocation = await exports.default.fetch(
      new Request(`https://collaboration.example/rooms/${roomId}`, {
        method: "POST",
        headers: { Origin: "http://localhost:5173", "Content-Type": "text/plain" },
        body: "x".repeat(43),
      }),
    );
    expect(invalidRevocation.status).toBe(403);
    expect((await roomResponse(roomId, editorToken)).status).toBe(101);

    const oversizedRevocation = await exports.default.fetch(
      new Request(`https://collaboration.example/rooms/${roomId}`, {
        method: "POST",
        headers: { Origin: "http://localhost:5173", "Content-Type": "text/plain" },
        body: ownerToken + " ".repeat(8_192),
      }),
    );
    expect(oversizedRevocation.status).toBe(413);
    const encoder = new TextEncoder();
    const streamedRevocation = await exports.default.fetch(
      new Request(`https://collaboration.example/rooms/${roomId}`, {
        method: "POST",
        headers: { Origin: "http://localhost:5173", "Content-Type": "text/plain" },
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(ownerToken));
            for (let index = 0; index < 4; index += 1) controller.enqueue(encoder.encode(" ".repeat(2_048)));
            controller.close();
          },
        }),
      }),
    );
    expect(streamedRevocation.status).toBe(413);
    expect((await roomResponse(roomId, editorToken)).status).toBe(101);

    const closed = new Promise<CloseEvent>((resolve) => participant.addEventListener("close", resolve, { once: true }));
    const revocation = await exports.default.fetch(
      new Request(`https://collaboration.example/rooms/${roomId}`, {
        method: "POST",
        headers: { Origin: "http://localhost:5173", "Content-Type": "text/plain" },
        body: ownerToken,
      }),
    );
    expect(revocation.status).toBe(204);
    await expect(closed).resolves.toMatchObject({ code: 4001 });
    expect((await roomResponse(roomId)).status).toBe(410);
  });

  it("requires credentials for first connection and never accepts credentials in the URL", async () => {
    const roomId = "f".repeat(43);
    expect((await roomResponse(roomId)).status).toBe(403);
    const url = new URL(`https://collaboration.example/rooms/${roomId}`);
    url.searchParams.set("owner", "o".repeat(43));
    url.searchParams.set("editor", "e".repeat(43));
    url.searchParams.set("viewer", "v".repeat(43));
    const response = await exports.default.fetch(
      new Request(url, {
        headers: {
          "CF-Connecting-IP": `192.0.2.${++testIp}`,
          Origin: "http://localhost:5173",
          Upgrade: "websocket",
          "Sec-WebSocket-Protocol": "plantuml-collaboration",
        },
      }),
    );
    expect(response.status).toBe(403);
  });

  it("leaves the room unchanged when an update is malformed", async () => {
    const roomId = "f".repeat(43);
    const ownerToken = "o".repeat(43);
    const editorToken = "d".repeat(43);
    const viewerToken = "v".repeat(43);
    const owner = await connect(roomId, { owner: ownerToken, editor: editorToken, viewer: viewerToken });
    await nextBinary(owner);

    const closed = new Promise<CloseEvent>((resolve) => owner.addEventListener("close", resolve, { once: true }));
    const document = new Y.Doc();
    document.getText("source").insert(0, "partially applied text");
    const update = Y.encodeStateAsUpdate(document);
    owner.send(update.slice(0, -1));
    await expect(closed).resolves.toMatchObject({ code: 1007, reason: "Invalid document update" });

    const editor = await connect(roomId, { access: editorToken });
    const persisted = new Y.Doc();
    Y.applyUpdate(persisted, await nextBinary(editor));
    expect(persisted.getText("source").toString()).toBe("");
    editor.close(1000, "test complete");
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

it("accepts a large valid snapshot and merges an offline delta on reconnect", async () => {
  const roomId = "L".repeat(43);
  const credentials = { owner: "o".repeat(43), editor: "e".repeat(43), viewer: "v".repeat(43) };
  const owner = await connect(roomId, credentials);
  await nextBinary(owner);
  const observer = await connect(roomId, { access: credentials.viewer });
  await nextBinary(observer);
  const doc = new Y.Doc();
  doc.getText("source").insert(0, "界".repeat(400_000));
  const snapshot = Y.encodeStateAsUpdate(doc);
  expect(snapshot.byteLength).toBeGreaterThan(1_000_000);
  const delivered = nextBinary(observer);
  owner.send(snapshot);
  Y.applyUpdate(new Y.Doc(), await delivered);
  owner.close(1000);
  doc.getText("source").insert(0, "offline ");
  const reconnected = await connect(roomId, { access: credentials.editor });
  const remote = await nextBinary(reconnected);
  const delta = Y.encodeStateAsUpdate(doc, Y.encodeStateVectorFromUpdate(remote));
  expect(delta.byteLength).toBeLessThan(100);
  const merged = nextBinary(observer);
  reconnected.send(delta);
  await merged;
  const later = await connect(roomId, { access: credentials.viewer });
  const persisted = new Y.Doc();
  Y.applyUpdate(persisted, await nextBinary(later));
  expect(persisted.getText("source").toString()).toBe("offline " + "界".repeat(400_000));
  reconnected.close(1000);
  observer.close(1000);
  later.close(1000);
  doc.destroy();
  persisted.destroy();
});

it("closes a socket that exceeds its message budget", async () => {
  const roomId = "B".repeat(43);
  const socket = await connect(roomId, {
    owner: "o".repeat(43),
    editor: "e".repeat(43),
    viewer: "v".repeat(43),
  });
  await nextBinary(socket);
  const closed = new Promise<CloseEvent>((resolve) => socket.addEventListener("close", resolve));
  await runInDurableObject(env.COLLABORATION_ROOM.getByName(roomId), async (instance, state) => {
    const server = state.getWebSockets()[0]!;
    // Deliver the burst inside one fixed budget window. Queued client messages
    // can otherwise straddle a real 10-second boundary and never exceed it.
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.now());
    try {
      for (let i = 0; i < 600; i++) instance.webSocketMessage(server, "{}");
      expect(server.readyState).toBe(WebSocket.OPEN);
      expect(server.deserializeAttachment().budget.messages).toBe(600);
      instance.webSocketMessage(server, "{}");
    } finally {
      now.mockRestore();
    }
  });
  expect((await closed).code).toBe(1008);
});

it("resets a socket's message budget in the next window", async () => {
  const roomId = "C".repeat(43);
  const socket = await connect(roomId, {
    owner: "o".repeat(43),
    editor: "e".repeat(43),
    viewer: "v".repeat(43),
  });
  await nextBinary(socket);
  try {
    await runInDurableObject(env.COLLABORATION_ROOM.getByName(roomId), async (instance, state) => {
      const server = state.getWebSockets()[0]!;
      const boundary = Math.floor(Date.now() / 10_000) * 10_000;
      const now = vi.spyOn(Date, "now").mockReturnValue(boundary + 9_999);
      try {
        for (let i = 0; i < 600; i++) instance.webSocketMessage(server, "{}");
        expect(server.readyState).toBe(WebSocket.OPEN);
        now.mockReturnValue(boundary + 10_000);
        instance.webSocketMessage(server, "{}");
        expect(server.readyState).toBe(WebSocket.OPEN);
        expect(server.deserializeAttachment().budget).toEqual({
          window: (boundary + 10_000) / 10_000,
          messages: 1,
          bytes: 4,
        });
      } finally {
        now.mockRestore();
      }
    });
  } finally {
    socket.close(1000);
  }
});

it("throttles creation attempts before allocating more rooms", async () => {
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    const response = await exports.default.fetch(
      new Request(`https://collaboration.example/rooms/${String(i).padStart(43, "R")}`, {
        headers: {
          Origin: "http://localhost:5173",
          Upgrade: "websocket",
          "CF-Connecting-IP": "198.51.100.250",
          "Sec-WebSocket-Protocol": "plantuml-collaboration, owner." + "o".repeat(43),
        },
      }),
    );
    statuses.push(response.status);
  }
  expect(statuses.at(-1)).toBe(429);
});

it("expires room contents and rejects old credentials", async () => {
  const roomId = "X".repeat(43);
  const socket = await connect(roomId, { owner: "o".repeat(43), editor: "e".repeat(43), viewer: "v".repeat(43) });
  await nextBinary(socket);
  const closed = new Promise<CloseEvent>((resolve) => socket.addEventListener("close", resolve));
  const stub = env.COLLABORATION_ROOM.getByName(roomId);
  await runInDurableObject(stub, async (instance, state) => {
    const expiry = await state.storage.getAlarm();
    expect(expiry).toBeGreaterThan(Date.now());
    const now = vi.spyOn(Date, "now").mockReturnValue(expiry! + 1);
    try {
      await instance.alarm();
    } finally {
      now.mockRestore();
    }
    expect(state.storage.sql.exec("SELECT * FROM room_state").toArray()).toHaveLength(0);
  });
  expect((await closed).code).toBe(4001);
  expect((await roomResponse(roomId, "e".repeat(43))).status).toBe(410);
});
