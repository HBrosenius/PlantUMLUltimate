import { expect, it, vi } from "vitest";
import { frameDocument } from "./renderer-assets";

it("terminates only the cancelled worker and ignores its queued messages after replacement", () => {
  const workers: FakeWorker[] = [];
  class FakeWorker {
    onmessage?: (event: { data: object }) => void;
    onerror?: (event: { message: string }) => void;
    postMessage = vi.fn();
    terminate = vi.fn();
    constructor() {
      workers.push(this);
    }
  }
  const parent = { postMessage: vi.fn() };
  let receive!: (event: { source: typeof parent; data: object }) => void;
  const html = frameDocument("test-channel");
  const encoded = html.match(/src="data:text\/javascript;base64,([^"]+)"/)![1]!;
  const bootstrap = Buffer.from(encoded, "base64").toString("utf8");
  // Execute our frame bootstrap with controlled workers, without loading the Java engine.
  new Function("parent", "Worker", "addEventListener", bootstrap)(
    parent,
    FakeWorker,
    (_type: string, listener: typeof receive) => {
      receive = listener;
    },
  );
  const send = (data: object) => receive({ source: parent, data: { channel: "test-channel", ...data } });
  send({ type: "initialize", assets: { worker: "worker.js" } });
  const original = workers[0]!;
  original.onmessage!({ data: { type: "ready" } });
  send({ type: "render", requestId: 1 });
  send({ type: "cancel", requestId: 999 });
  expect(original.terminate).not.toHaveBeenCalled();
  send({ type: "cancel", requestId: 1 });
  expect(original.terminate).toHaveBeenCalledTimes(1);
  send({ type: "render", requestId: 2 });
  const replacement = workers[1]!;
  original.onmessage!({ data: { type: "result", requestId: 1, svg: "obsolete" } });
  original.onerror!({ message: "obsolete failure" });
  replacement.onmessage!({ data: { type: "ready" } });
  expect(replacement.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: "render", requestId: 2 }),
    [],
  );
  expect(parent.postMessage.mock.calls.some(([message]) => message.requestId === 1)).toBe(false);
  expect(replacement.terminate).not.toHaveBeenCalled();
  send({ type: "dispose" });
  expect(replacement.terminate).toHaveBeenCalledTimes(1);
  expect(parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: "disposed" }), "*");
});
