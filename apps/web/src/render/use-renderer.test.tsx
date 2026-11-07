// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRenderer } from "./use-renderer";
import * as svgSanitizer from "./sanitize-svg";
import { buildFontAtlas } from "./font-atlas";
import { DEBOUNCE_MIN_MS } from "./render-debounce";

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
  document.querySelectorAll("iframe").forEach((frame) => frame.remove());
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

it("keeps one renderer across tabs and rejects a late reply for the previous document", async () => {
  const { result, rerender, frame } = await setup();
  const oldRequest = frame.requests().at(-1)!;
  rerender({ text: source("Other document"), documentId: "B" });
  // The old render is still running; it is cancelled after the grace period and the new one follows.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });
  // The same frame serves the other document: no second renderer is created.
  expect(document.querySelectorAll('iframe[title="Local PlantUML renderer"]')).toHaveLength(1);
  const nextRequest = frame.requests().at(-1)!;
  expect(nextRequest.documentId).toBe("B");
  await frame.receive({ type: "result", requestId: oldRequest.requestId, svg: svg("Wrong document") });
  expect(result.current.result).toBeUndefined();
  await frame.receive({ type: "result", requestId: nextRequest.requestId, svg: svg("Other document") });
  expect(result.current.result).toMatchObject({ documentId: "B", source: source("Other document") });
  await frame.receive({ type: "result", requestId: oldRequest.requestId, error: "Late old-document failure" });
  expect(result.current.status).toBe("idle");
  expect(result.current.result?.documentId).toBe("B");
});

it("keeps the renderer when the preview is hidden and answers from it when shown again", async () => {
  const hook = renderHook(({ text, enabled }) => useRenderer(text, enabled, "native", "A"), {
    initialProps: { text: source("Original"), enabled: true },
  });
  await act(async () => {});
  const frame = rendererFrame();
  await frame.receive({ type: "ready" });
  await advance();
  await frame.receive({ type: "result", requestId: frame.requests().at(-1)!.requestId, svg: svg("Original") });
  hook.rerender({ text: source("Original"), enabled: false });
  await advance();
  expect(frame.element.isConnected).toBe(true);
  expect(frame.outgoing.mock.calls.some(([message]) => message.type === "dispose")).toBe(false);
  hook.rerender({ text: source("Edited while hidden"), enabled: true });
  await advance();
  expect(document.querySelectorAll('iframe[title="Local PlantUML renderer"]')).toHaveLength(1);
  expect(frame.requests().at(-1)!.source).toBe(source("Edited while hidden"));
});

it("does not start a renderer while the preview has never been shown", async () => {
  renderHook(() => useRenderer(source("Hidden"), false, "native", "A"));
  await act(async () => {});
  expect(document.querySelectorAll('iframe[title="Local PlantUML renderer"]')).toHaveLength(0);
});

it("adds Graphviz to the running renderer once instead of rebooting it for a different layout engine", async () => {
  const hook = renderHook(
    ({ text, engine }: { text: string; engine: "native" | "graphviz" }) => useRenderer(text, true, engine, "A"),
    { initialProps: { text: source("Native"), engine: "native" as "native" | "graphviz" } },
  );
  await act(async () => {});
  const frame = rendererFrame();
  await frame.receive({ type: "ready" });
  await advance();
  expect(frame.requests().at(-1)!.layoutEngine).toBe("native");
  await frame.receive({ type: "result", requestId: frame.requests().at(-1)!.requestId, svg: svg("Native") });
  const graphvizMessages = () => frame.outgoing.mock.calls.filter(([message]) => message.type === "add-graphviz");
  expect(graphvizMessages()).toHaveLength(0);

  hook.rerender({ text: "@startuml\nclass A\n@enduml", engine: "graphviz" });
  await advance();
  await act(async () => {});
  expect(document.querySelectorAll('iframe[title="Local PlantUML renderer"]')).toHaveLength(1);
  expect(graphvizMessages()).toHaveLength(1);
  const classRequest = frame.requests().at(-1)!;
  expect(classRequest.layoutEngine).toBe("graphviz");
  // Graphviz is delivered before the render that needs it.
  const order = frame.outgoing.mock.calls.map(([message]) => message.type);
  expect(order.lastIndexOf("add-graphviz")).toBeLessThan(order.lastIndexOf("render"));
  await frame.receive({ type: "result", requestId: classRequest.requestId, svg: svg("Class") });

  hook.rerender({ text: "@startuml\nclass B\n@enduml", engine: "graphviz" });
  await advance();
  expect(graphvizMessages()).toHaveLength(1);
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

it("loads a bundled theme on demand before sending the expanded source to the renderer", async () => {
  const { rerender, frame } = await setup();
  const original = frame.requests().at(-1)!;
  await frame.receive({ type: "result", requestId: original.requestId, svg: svg("Original") });
  const themed = "@startgantt\n!theme blueprint\n[Themed] lasts 2 days\n@endgantt";
  rerender({ text: themed, documentId: "A" });
  await advance();
  // The theme module resolves asynchronously; the request follows once it is loaded.
  await vi.waitFor(() => expect(frame.requests().at(-1)?.source).toBe(themed));
  const latest = frame.requests().at(-1)!;
  expect(latest.renderSource).toContain("' !theme blueprint expanded locally by PlantUML Ultimate");
  expect(latest.renderSource).toContain('!$BGCOLOR = "#003153"');
});

it("sends the first edit after a pause quickly and waits longer while typing continues", async () => {
  const { rerender, frame } = await setup();
  await frame.receive({
    type: "result",
    requestId: frame.requests().at(-1)!.requestId,
    svg: svg("Original"),
    durationMs: 200,
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  rerender({ text: source("After a pause"), documentId: "A" });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MIN_MS - 1);
  });
  expect(frame.requests()).toHaveLength(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  // Well below the former fixed 150 ms wait, even though the last render took 200 ms.
  expect(frame.requests().map((request) => request.source)).toEqual([source("Original"), source("After a pause")]);
  await frame.receive({
    type: "result",
    requestId: frame.requests().at(-1)!.requestId,
    svg: svg("After"),
    durationMs: 200,
  });
  rerender({ text: source("Typing 1"), documentId: "A" });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(99);
  });
  // Within the typing window the wait follows half of the 200 ms render.
  expect(frame.requests()).toHaveLength(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(frame.requests().at(-1)!.source).toBe(source("Typing 1"));
});

it("serves a render-cache hit synchronously without contacting the renderer", async () => {
  const { result, rerender, frame } = await setup();
  await frame.receive({ type: "result", requestId: frame.requests().at(-1)!.requestId, svg: svg("Original") });
  rerender({ text: source("Edited"), documentId: "A" });
  await advance();
  await frame.receive({ type: "result", requestId: frame.requests().at(-1)!.requestId, svg: svg("Edited") });
  const sent = frame.requests().length;
  rerender({ text: source("Original"), documentId: "A" });
  // No timer has been advanced: the cached preview is already current.
  expect(result.current.status).toBe("idle");
  expect(result.current.result?.source).toBe(source("Original"));
  expect(frame.requests()).toHaveLength(sent);
});

it("pre-warms the renderer while no preview is wanted and renders the first request without a boot", async () => {
  const hook = renderHook(({ enabled }) => useRenderer(source("First"), enabled, "native", "A", { prewarm: true }), {
    initialProps: { enabled: false },
  });
  await act(async () => {});
  // Nothing starts before the page is idle...
  expect(document.querySelectorAll('iframe[title="Local PlantUML renderer"]')).toHaveLength(0);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(document.querySelectorAll('iframe[title="Local PlantUML renderer"]')).toHaveLength(1);
  const frame = rendererFrame();
  await frame.receive({ type: "ready" });
  // ...but no render request is made for a preview nobody asked for.
  await advance();
  expect(frame.requests()).toHaveLength(0);
  expect(hook.result.current.status).toBe("idle");
  hook.rerender({ enabled: true });
  await advance();
  expect(frame.requests().map((request) => request.source)).toEqual([source("First")]);
  expect(document.querySelectorAll('iframe[title="Local PlantUML renderer"]')).toHaveLength(1);
});

it("keeps a failed warm-up silent until a preview is wanted", async () => {
  const hook = renderHook(({ enabled }) => useRenderer(source("First"), enabled, "native", "A", { prewarm: true }), {
    initialProps: { enabled: false },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  const frame = rendererFrame();
  // Two failed starts: the automatic retry is used up.
  await frame.receive({ type: "bootstrap-error", error: "blocked" });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(150);
  });
  const retry = rendererFrame();
  await retry.receive({ type: "bootstrap-error", error: "blocked" });
  expect(hook.result.current.status).toBe("idle");
  expect(hook.result.current.result).toBeUndefined();
});
