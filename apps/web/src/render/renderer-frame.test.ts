import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { rendererFrameBootstrap } from "./renderer-frame";

/** Runs the real frame bootstrap against a fake worker and a fake parent window. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  terminated = false;
  posted: Array<{ type: string; requestId?: number }> = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: (event: { message?: string }) => void;
  constructor(public url: string) {
    FakeWorker.instances.push(this);
  }
  postMessage(message: { type: string; requestId?: number }) {
    this.posted.push(message);
    // The real worker answers `initialize` with `ready`, and each `render` with a `result`.
    if (message.type === "initialize") queueMicrotask(() => this.emit({ type: "ready", nativeTextMetrics: true }));
    if (message.type === "render")
      queueMicrotask(() => this.emit({ type: "result", requestId: message.requestId, svg: "<svg/>", durationMs: 1 }));
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: unknown) {
    if (!this.terminated) this.onmessage?.({ data });
  }
}

function startFrame() {
  FakeWorker.instances = [];
  const sent: Array<{ type: string; requestId?: number }> = [];
  let handler: ((event: { source: unknown; data: unknown }) => void) | undefined;
  const parent = { postMessage: (message: { type: string }) => sent.push(message) };
  const run = new Function(
    "document",
    "parent",
    "addEventListener",
    "Worker",
    "URL",
    "Blob",
    rendererFrameBootstrap,
  ) as (...args: unknown[]) => void;
  run(
    { querySelector: () => ({ content: "channel-1" }) },
    parent,
    (_type: string, listener: typeof handler) => (handler = listener),
    FakeWorker,
    { createObjectURL: () => "blob:script" },
    class {},
  );
  const post = (message: object) => handler!({ source: parent, data: { channel: "channel-1", ...message } });
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { sent, post, flush };
}

beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
afterEach(() => vi.useRealTimers());

async function boot() {
  const frame = startFrame();
  frame.post({ type: "initialize", assets: { worker: "w", engine: "e", graphviz: "", icons: "i" } });
  await vi.advanceTimersByTimeAsync(0);
  return frame;
}

const render = async (frame: Awaited<ReturnType<typeof boot>>, requestId: number) => {
  frame.post({ type: "render", requestId, source: "s", renderSource: "s" });
  await vi.advanceTimersByTimeAsync(0);
};

it("keeps one worker across many renders instead of recycling every 20", async () => {
  const frame = await boot();
  expect(frame.sent.map((message) => message.type)).toEqual(["ready"]);
  for (let id = 1; id <= 60; id += 1) await render(frame, id);
  expect(frame.sent.filter((message) => message.type === "result")).toHaveLength(60);
  expect(FakeWorker.instances).toHaveLength(1);
  expect(FakeWorker.instances[0]!.terminated).toBe(false);
});

it("recycles the worker only after many renders and a long idle period", async () => {
  const frame = await boot();
  for (let id = 1; id <= 500; id += 1) await render(frame, id);
  // Still the same worker while idle time has not elapsed, and a new request cancels the recycle.
  await vi.advanceTimersByTimeAsync(19_000);
  expect(FakeWorker.instances).toHaveLength(1);
  await render(frame, 501);
  await vi.advanceTimersByTimeAsync(19_000);
  expect(FakeWorker.instances).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(2_000);
  expect(FakeWorker.instances).toHaveLength(2);
  expect(FakeWorker.instances[0]!.terminated).toBe(true);
  // The replacement is booted eagerly and serves the next request.
  await render(frame, 502);
  expect(FakeWorker.instances).toHaveLength(2);
  expect(frame.sent.at(-1)).toMatchObject({ type: "result", requestId: 502 });
});

it("replaces the worker after an engine failure but not after a recoverable syntax error", async () => {
  const frame = await boot();
  FakeWorker.instances[0]!.postMessage = function (this: FakeWorker, message) {
    this.posted.push(message);
    if (message.type === "render")
      queueMicrotask(() =>
        this.emit({ type: "result", requestId: message.requestId, error: "Syntax Error", recoverable: true }),
      );
  };
  await render(frame, 1);
  expect(FakeWorker.instances).toHaveLength(1);
  FakeWorker.instances[0]!.postMessage = function (this: FakeWorker, message) {
    this.posted.push(message);
    if (message.type === "render")
      queueMicrotask(() => this.emit({ type: "result", requestId: message.requestId, error: "Engine crashed" }));
  };
  await render(frame, 2);
  expect(FakeWorker.instances).toHaveLength(2);
  expect(FakeWorker.instances[0]!.terminated).toBe(true);
});

it("restarts the worker on cancel so the replacement loads the engine while the user keeps typing", async () => {
  const frame = await boot();
  const worker = FakeWorker.instances[0]!;
  worker.postMessage = function (this: FakeWorker, message) {
    this.posted.push(message);
  };
  frame.post({ type: "render", requestId: 7, source: "s", renderSource: "s" });
  await vi.advanceTimersByTimeAsync(0);
  frame.post({ type: "cancel", requestId: 7 });
  expect(worker.terminated).toBe(true);
  expect(FakeWorker.instances).toHaveLength(2);
});
