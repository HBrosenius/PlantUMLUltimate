// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { CollaborationSession } from "./collaboration-session";
import { validateCollaborationState } from "../../../packages/shared/src/collaboration-schema";

class Socket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: Socket[] = [];
  readyState = 1;
  binaryType = "";
  onopen?: () => void;
  onclose?: (event: { code: number }) => void;
  onmessage?: (event: { data: string | ArrayBuffer }) => void;
  onerror?: () => void;
  send = vi.fn();
  constructor(..._args: unknown[]) {
    Socket.instances.push(this);
  }
  close(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Socket.instances = [];
});

it.each([4001, 1009, 1007])("stops automatic retries after permanent close %s", (code) => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", Socket);
  const states: string[] = [];
  const session = new CollaborationSession(
    "https://example.test",
    "r".repeat(43),
    "",
    { id: "audit", name: "Audit", color: "#123456" },
    () => {},
    (state) => states.push(state),
    () => {},
    () => {},
    "editor",
    { accessToken: "a".repeat(43) },
  );
  const socket = Socket.instances[0]!;
  const document = new Y.Doc();
  socket.onmessage?.({ data: Y.encodeStateAsUpdate(document).buffer as ArrayBuffer });
  expect(states.at(-1)).toBe("connected");
  socket.close(code);
  expect(states.at(-1)).toBe({ 4001: "revoked", 1009: "oversized", 1007: "invalid-state" }[code]);
  vi.advanceTimersByTime(1000);
  expect(Socket.instances).toHaveLength(1);
  session.stop();
  document.destroy();
});

it("sends only a delta after receiving a large valid room snapshot", () => {
  vi.stubGlobal("WebSocket", Socket);
  const remote = new Y.Doc();
  const updates: Uint8Array[] = [];
  remote.on("update", (update) => updates.push(update));
  remote.getText("source").insert(0, "界".repeat(200_000));
  remote.getText("source").insert(200_000, "界".repeat(200_000));
  expect(updates.every((update) => update.byteLength < 1_000_000)).toBe(true);
  expect(() => validateCollaborationState(remote)).not.toThrow();
  const snapshot = Y.encodeStateAsUpdate(remote);
  expect(snapshot.byteLength).toBeGreaterThan(1_000_000);
  expect(snapshot.byteLength).toBeLessThan(1_900_000);
  const session = new CollaborationSession(
    "https://example.test",
    "r".repeat(43),
    "",
    { id: "audit", name: "Audit", color: "#123456" },
    () => {},
    () => {},
    () => {},
    () => {},
    "editor",
    { accessToken: "a".repeat(43) },
  );
  const socket = Socket.instances[0]!;
  socket.onmessage?.({ data: snapshot.buffer as ArrayBuffer });
  const binary = socket.send.mock.calls.find(([value]) => value instanceof Uint8Array)?.[0];
  expect(binary.byteLength).toBeLessThan(100);
  session.stop();
  remote.destroy();
});

it("does not seed recovered owner text before the remote snapshot arrives", () => {
  vi.stubGlobal("WebSocket", Socket);
  const onSource = vi.fn();
  const session = new CollaborationSession(
    "https://example.test",
    "r".repeat(43),
    "saved text",
    { id: "owner", name: "Owner", color: "#123456" },
    onSource,
    () => {},
    () => {},
    () => {},
    "editor",
    { ownerToken: "o".repeat(43), accessToken: "e".repeat(43) },
  );
  session.applySource("saved text");
  const remote = new Y.Doc();
  remote.getText("source").insert(0, "saved text");
  Socket.instances[0]!.onmessage?.({ data: Y.encodeStateAsUpdate(remote).buffer as ArrayBuffer });
  expect(onSource).toHaveBeenLastCalledWith("saved text");
  session.stop();
  remote.destroy();
});

function sentSource(socket: Socket): string {
  const document = new Y.Doc();
  for (const [value] of socket.send.mock.calls)
    if (value instanceof Uint8Array || value instanceof ArrayBuffer) Y.applyUpdate(document, new Uint8Array(value));
  return document.getText("source").toString();
}

function joinEmptyRoom(credentials: ConstructorParameters<typeof CollaborationSession>[9]) {
  vi.stubGlobal("WebSocket", Socket);
  const session = new CollaborationSession(
    "https://example.test",
    "r".repeat(43),
    "@startgantt\n[Secret] lasts 1 day\n@endgantt",
    { id: "audit", name: "Audit", color: "#123456" },
    () => {},
    () => {},
    () => {},
    () => {},
    "editor",
    credentials,
  );
  const socket = Socket.instances.at(-1)!;
  socket.onmessage?.({ data: Y.encodeStateAsUpdate(new Y.Doc()).buffer as ArrayBuffer });
  return { session, socket };
}

it("seeds an empty room with the local document when this tab owns it", () => {
  const { session, socket } = joinEmptyRoom({
    ownerToken: "o".repeat(43),
    editorToken: "e".repeat(43),
    viewerToken: "v".repeat(43),
    accessToken: "e".repeat(43),
  });
  expect(sentSource(socket)).toContain("[Secret]");
  session.stop();
});

it.each([[{ accessToken: "a".repeat(43) }], [{}]])(
  "never uploads the local document when joining someone else's room (%j)",
  (credentials) => {
    const { session, socket } = joinEmptyRoom(credentials);
    expect(sentSource(socket)).not.toContain("[Secret]");
    session.stop();
  },
);
