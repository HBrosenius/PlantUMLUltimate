import { expect, it, vi } from "vitest";
import { rendererFrameBootstrap } from "./renderer-frame";

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
  const bootstrap = rendererFrameBootstrap;
  // Execute our frame bootstrap with controlled workers, without loading the Java engine.
  new Function("parent", "Worker", "addEventListener", "document", bootstrap)(
    parent,
    FakeWorker,
    (_type: string, listener: typeof receive) => {
      receive = listener;
    },
    { querySelector: () => ({ content: "test-channel" }) },
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

function bootFrame() {
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
  const bootstrap = rendererFrameBootstrap;
  new Function("parent", "Worker", "addEventListener", "document", bootstrap)(
    parent,
    FakeWorker,
    (_type: string, listener: typeof receive) => {
      receive = listener;
    },
    { querySelector: () => ({ content: "test-channel" }) },
  );
  const send = (data: object) => receive({ source: parent, data: { channel: "test-channel", ...data } });
  send({ type: "initialize", assets: { worker: "worker.js" } });
  return { workers, parent, send };
}

it("keeps the warm worker after a recoverable syntax-error result but replaces it after an engine failure", () => {
  const { workers, parent, send } = bootFrame();
  const worker = workers[0]!;
  worker.onmessage!({ data: { type: "ready" } });
  send({ type: "render", requestId: 1 });
  worker.onmessage!({ data: { type: "result", requestId: 1, error: "Syntax Error?", recoverable: true } });
  expect(worker.terminate).not.toHaveBeenCalled();
  expect(workers).toHaveLength(1);
  expect(parent.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: "result", requestId: 1, error: "Syntax Error?" }),
    "*",
  );
  send({ type: "render", requestId: 2 });
  expect(worker.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: "render", requestId: 2 }), []);
  worker.onmessage!({ data: { type: "result", requestId: 2, error: "Engine exception" } });
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  expect(workers).toHaveLength(2);
});

it("boots a replacement worker immediately after a cancellation", () => {
  const { workers, send } = bootFrame();
  const original = workers[0]!;
  original.onmessage!({ data: { type: "ready" } });
  send({ type: "render", requestId: 1 });
  send({ type: "cancel", requestId: 1 });
  expect(original.terminate).toHaveBeenCalledTimes(1);
  expect(workers).toHaveLength(2);
  const replacement = workers[1]!;
  expect(replacement.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: "initialize" }));
  send({ type: "render", requestId: 2 });
  expect(replacement.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "render" }), []);
  replacement.onmessage!({ data: { type: "ready" } });
  expect(replacement.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: "render", requestId: 2 }),
    [],
  );
});
