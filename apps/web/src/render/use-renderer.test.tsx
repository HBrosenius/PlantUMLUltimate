// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRenderer } from "./use-renderer";
import * as svgSanitizer from "./sanitize-svg";
import { buildFontAtlas } from "./font-atlas";

vi.mock("./renderer-assets", () => ({
  loadRendererAssets: vi.fn(async () => ({ engine: "", graphviz: "", worker: "", icons: "" })),
  frameDocument: vi.fn(() => "<html><body></body></html>"),
}));
vi.mock("./font-atlas", () => ({ buildFontAtlas: vi.fn(async () => undefined) }));

const source = (label: string) => `@startgantt\n[${label}] lasts 2 days\n@endgantt`;
const svg = (label: string) => `<svg xmlns="http://www.w3.org/2000/svg"><text>${label}</text></svg>`;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function advance() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(150);
  });
}

function rendererFrame() {
  const frame = [...document.querySelectorAll<HTMLIFrameElement>('iframe[title="Local PlantUML renderer"]')].at(-1)!;
  const owner = frame.contentWindow!;
  const channel = frame.getAttribute("data-renderer-channel")!;
  const outgoing = vi.spyOn(owner, "postMessage");
  const receive = async (message: object) => {
    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", { source: owner, data: { channel, ...message } }));
    });
  };
  const requests = () => outgoing.mock.calls.map(([message]) => message).filter((message) => message.type === "render");
  return { receive, requests, outgoing, element: frame };
}

async function setup() {
  const hook = renderHook(({ text, documentId }) => useRenderer(text, true, "native", documentId), {
    initialProps: { text: source("Original"), documentId: "A" },
  });
  await act(async () => {});
  const frame = rendererFrame();
  await frame.receive({ type: "ready" });
  await advance();
  return { ...hook, frame };
}

it("ignores delayed success and error replies before showing the latest source", async () => {
  for (const stale of [{ svg: svg("Obsolete") }, { error: "Obsolete failure" }]) {
    const { result, rerender, unmount, frame } = await setup();
    const original = frame.requests().at(-1)!;
    rerender({ text: source("Latest"), documentId: "A" });
    await advance();
    await frame.receive({ type: "result", requestId: original.requestId, ...stale });
    expect(result.current.status).toBe("rendering");
    expect(result.current.result).toBeUndefined();
    const latest = frame.requests().at(-1)!;
    expect(latest.source).toBe(source("Latest"));
    await frame.receive({ type: "result", requestId: latest.requestId, svg: svg("Latest") });
    expect(result.current.status).toBe("idle");
    expect(result.current.result).toMatchObject({ source: source("Latest"), documentId: "A", svg: svg("Latest") });
    await frame.receive({ type: "result", requestId: original.requestId, svg: svg("Obsolete") });
    expect(result.current.result?.source).toBe(source("Latest"));
    unmount();
    await advance();
  }
});

it("cancels an obsolete render and sends only the latest queued edit without waiting for a reply", async () => {
  const { result, rerender, frame } = await setup();
  const original = frame.requests().at(-1)!;
  rerender({ text: source("Intermediate"), documentId: "A" });
  await advance();
  rerender({ text: source("Latest"), documentId: "A" });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
  expect(
    frame.outgoing.mock.calls.some(
      ([message]) => message.type === "cancel" && message.requestId === original.requestId,
    ),
  ).toBe(true);
  expect(frame.requests().map((request) => request.source)).toEqual([source("Original"), source("Latest")]);
  await frame.receive({ type: "result", requestId: original.requestId, error: "Obsolete failure" });
  expect(result.current.status).toBe("rendering");
  await frame.receive({ type: "result", requestId: frame.requests().at(-1)!.requestId, svg: svg("Latest") });
  expect(result.current.result?.source).toBe(source("Latest"));
});

it("discards stale SVGs before sanitizing them and keeps short renders warm", async () => {
  const sanitize = vi.spyOn(svgSanitizer, "sanitizeSvg");
  const { rerender, frame } = await setup();
  const original = frame.requests().at(-1)!;
  rerender({ text: source("Latest"), documentId: "A" });
  await advance();
  await frame.receive({ type: "result", requestId: original.requestId, svg: svg("Obsolete") });
  expect(sanitize).not.toHaveBeenCalled();
  const latest = frame.requests().at(-1)!;
  await frame.receive({ type: "result", requestId: latest.requestId, svg: svg("Latest") });
  expect(sanitize).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(frame.outgoing.mock.calls.some(([message]) => message.type === "cancel")).toBe(false);
});

it("cancels obsolete work when Undo restores a cached preview", async () => {
  const { result, rerender, frame } = await setup();
  await frame.receive({ type: "result", requestId: frame.requests().at(-1)!.requestId, svg: svg("Original") });
  rerender({ text: source("Expensive edit"), documentId: "A" });
  await advance();
  const expensive = frame.requests().at(-1)!;
  rerender({ text: source("Original"), documentId: "A" });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
  expect(result.current.status).toBe("idle");
  expect(result.current.result?.source).toBe(source("Original"));
  expect(frame.requests()).toHaveLength(2);
  expect(
    frame.outgoing.mock.calls.some(
      ([message]) => message.type === "cancel" && message.requestId === expensive.requestId,
    ),
  ).toBe(true);
});

it("disposes the active worker and clears cancellation timers when the preview closes", async () => {
  const { rerender, unmount, frame } = await setup();
  rerender({ text: source("Queued edit"), documentId: "A" });
  unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(frame.outgoing.mock.calls.some(([message]) => message.type === "dispose")).toBe(true);
  expect(frame.outgoing.mock.calls.some(([message]) => message.type === "cancel")).toBe(false);
  expect(frame.element.isConnected).toBe(false);
});

it("starts a fresh cancellation window after obsolete font preparation is abandoned", async () => {
  const { rerender, frame } = await setup();
  const original = frame.requests().at(-1)!;
  let finishFonts!: () => void;
  vi.mocked(buildFontAtlas).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishFonts = () => resolve({ texts: [], fonts: [], metrics: new Float32Array(0) });
      }),
  );
  rerender({ text: source("Preparing fonts"), documentId: "A" });
  await advance();
  await frame.receive({ type: "result", requestId: original.requestId, svg: svg("Obsolete") });
  rerender({ text: source("Latest"), documentId: "A" });
  await advance();
  await act(async () => {
    finishFonts();
  });
  const latest = frame.requests().at(-1)!;
  expect(latest.source).toBe(source("Latest"));
  rerender({ text: source("Newest"), documentId: "A" });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
  expect(
    frame.outgoing.mock.calls.some(([message]) => message.type === "cancel" && message.requestId === latest.requestId),
  ).toBe(true);
  expect(frame.requests().at(-1)!.source).toBe(source("Newest"));
});

it("rejects replies from a retired document frame after switching tabs", async () => {
  const { result, rerender, frame: oldFrame } = await setup();
  const oldRequest = oldFrame.requests().at(-1)!;
  rerender({ text: source("Other document"), documentId: "B" });
  await act(async () => {});
  const nextFrame = rendererFrame();
  await nextFrame.receive({ type: "ready" });
  await advance();
  const nextRequest = nextFrame.requests().at(-1)!;
  await oldFrame.receive({ type: "result", requestId: oldRequest.requestId, svg: svg("Wrong document") });
  expect(result.current.result).toBeUndefined();
  await nextFrame.receive({ type: "result", requestId: nextRequest.requestId, svg: svg("Other document") });
  expect(result.current.result).toMatchObject({ documentId: "B", source: source("Other document") });
  await oldFrame.receive({ type: "result", requestId: oldRequest.requestId, error: "Late old-document failure" });
  expect(result.current.status).toBe("idle");
  expect(result.current.result?.documentId).toBe("B");
});

it("retains the rendered source on failure and recovers on correction", async () => {
  const { result, rerender, frame } = await setup();
  await frame.receive({ type: "result", requestId: frame.requests().at(-1)!.requestId, svg: svg("Original") });
  rerender({ text: source("Invalid update"), documentId: "A" });
  await advance();
  await frame.receive({ type: "result", requestId: frame.requests().at(-1)!.requestId, error: "Invalid syntax" });
  expect(result.current.status).toBe("error");
  expect(result.current.result).toMatchObject({
    source: source("Original"),
    svg: svg("Original"),
    error: "Invalid syntax",
  });
  rerender({ text: source("Corrected"), documentId: "A" });
  await advance();
  await frame.receive({ type: "result", requestId: frame.requests().at(-1)!.requestId, svg: svg("Corrected") });
  expect(result.current.status).toBe("idle");
  expect(result.current.result).toMatchObject({ source: source("Corrected"), svg: svg("Corrected") });
  expect(result.current.result?.error).toBeUndefined();
});

it("keeps Undo and Redo current while an earlier edit is still rendering", async () => {
  const { result, rerender, frame } = await setup();
  await frame.receive({ type: "result", requestId: frame.requests().at(-1)!.requestId, svg: svg("Original") });
  rerender({ text: source("Edited"), documentId: "A" });
  await advance();
  const earlierEdit = frame.requests().at(-1)!;
  rerender({ text: source("Original"), documentId: "A" });
  await advance();
  expect(result.current.status).toBe("idle");
  expect(result.current.result?.source).toBe(source("Original"));
  rerender({ text: source("Edited"), documentId: "A" });
  await advance();
  await frame.receive({ type: "result", requestId: earlierEdit.requestId, svg: svg("Old edit result") });
  expect(result.current.status).toBe("rendering");
  expect(result.current.result?.source).toBe(source("Original"));
  const redo = frame.requests().at(-1)!;
  expect(redo.requestId).not.toBe(earlierEdit.requestId);
  await frame.receive({ type: "result", requestId: redo.requestId, svg: svg("Edited") });
  expect(result.current.status).toBe("idle");
  expect(result.current.result).toMatchObject({ source: source("Edited"), svg: svg("Edited") });
});
