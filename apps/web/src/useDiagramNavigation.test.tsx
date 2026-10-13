// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDiagramNavigation, type InitialDiagramFit } from "./useDiagramNavigation";

function Canvas({ initialFit }: { initialFit?: InitialDiagramFit } = {}) {
  const [zoom, setZoom] = useState(1);
  const navigation = useDiagramNavigation(zoom, setZoom, { svg: "<svg />", initialFit });
  return (
    <div ref={navigation.viewportRef} data-testid="viewport">
      <output>{zoom}</output>
      <div className="diagram">
        <svg />
      </div>
    </div>
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function wheel(viewport: HTMLElement, init: WheelEventInit) {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 50, clientY: 50, ...init });
  act(() => {
    viewport.dispatchEvent(event);
  });
  expect(event.defaultPrevented).toBe(true);
}

it("pans horizontally and vertically with fine touchpad deltas and keeps momentum in pan mode", () => {
  const viewport = render(<Canvas />).getByTestId("viewport");
  wheel(viewport, { deltaX: 12, deltaY: 24 });
  expect(viewport.scrollLeft).toBe(12);
  expect(viewport.scrollTop).toBe(24);
  wheel(viewport, { deltaY: 140 });
  expect(viewport.scrollTop).toBe(164);
  expect(viewport.querySelector("output")?.textContent).toBe("1");
  expect(viewport.classList.contains("diagram-wheel-zooming")).toBe(false);
});

it("handles purely horizontal gestures and Shift scrolling without zooming", () => {
  const viewport = render(<Canvas />).getByTestId("viewport");
  wheel(viewport, { deltaX: 30 });
  wheel(viewport, { deltaY: 120, shiftKey: true });
  expect(viewport.scrollLeft).toBe(150);
  expect(viewport.scrollTop).toBe(0);
  expect(viewport.querySelector("output")?.textContent).toBe("1");
});

it("pinches to zoom even after panning and keeps mouse-wheel zoom available", async () => {
  const viewport = render(<Canvas />).getByTestId("viewport");
  wheel(viewport, { deltaY: 10 });
  wheel(viewport, { deltaY: -20, ctrlKey: true });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  const pinched = Number(viewport.querySelector("output")?.textContent);
  expect(pinched).toBeCloseTo(Math.exp(0.16));
  wheel(viewport, { deltaY: -120, deltaMode: 1 });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(Number(viewport.querySelector("output")?.textContent)).toBeGreaterThan(pinched);
});

it("stops a zoom animation when a horizontal touchpad pan starts", async () => {
  const viewport = render(<Canvas />).getByTestId("viewport");
  wheel(viewport, { deltaY: -120 });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(32);
  });
  wheel(viewport, { deltaX: 15, deltaY: 10 });
  const left = viewport.scrollLeft;
  const top = viewport.scrollTop;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(viewport.scrollLeft).toBe(left);
  expect(viewport.scrollTop).toBe(top);
  expect(viewport.classList.contains("diagram-wheel-zooming")).toBe(false);
});

it("pans horizontal line and page gestures instead of discarding them", () => {
  const viewport = render(<Canvas />).getByTestId("viewport");
  Object.defineProperty(viewport, "clientHeight", { value: 200 });
  Object.defineProperty(viewport, "clientWidth", { value: 300 });
  wheel(viewport, { deltaX: 3, deltaMode: 1 });
  expect(viewport.scrollLeft).toBe(48);
  wheel(viewport, { deltaX: 1, deltaMode: 2 });
  expect(viewport.scrollLeft).toBe(348);
  expect(viewport.querySelector("output")?.textContent).toBe("1");
});

it("restores scroll per document and flushes pending scrolling to its original owner", async () => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
  const saveA = vi.fn();
  const saveB = vi.fn();
  const view = render(
    <Canvas initialFit={{ documentId: "a", fit: false, scroll: { left: 50, top: 80 }, onScrollChange: saveA }} />,
  );
  const viewport = view.getByTestId("viewport");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(64);
  });
  expect(viewport.scrollLeft).toBe(50);
  expect(viewport.scrollTop).toBe(80);
  act(() => {
    viewport.scrollLeft = 90;
    viewport.scrollTop = 120;
    viewport.dispatchEvent(new Event("scroll"));
  });
  view.rerender(
    <Canvas initialFit={{ documentId: "b", fit: false, scroll: { left: 20, top: 30 }, onScrollChange: saveB }} />,
  );
  expect(saveA).toHaveBeenLastCalledWith({ left: 90, top: 120 });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(64);
  });
  expect(viewport.scrollLeft).toBe(20);
  expect(viewport.scrollTop).toBe(30);
  act(() => viewport.dispatchEvent(new Event("scroll")));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(150);
  });
  expect(saveB).toHaveBeenLastCalledWith({ left: 20, top: 30 });
  view.rerender(
    <Canvas initialFit={{ documentId: "a", fit: false, scroll: { left: 90, top: 120 }, onScrollChange: saveA }} />,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(64);
  });
  expect(viewport.scrollLeft).toBe(90);
  expect(viewport.scrollTop).toBe(120);
  act(() => {
    viewport.scrollLeft = 140;
    viewport.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("pagehide"));
  });
  expect(saveA).toHaveBeenLastCalledWith({ left: 140, top: 120 }, true);
  vi.restoreAllMocks();
});

it("waits for delayed SVG overflow and preserves scroll through later SVG replacements", async () => {
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  const tick = () =>
    act(() => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(0));
    });
  const save = vi.fn();
  const initialFit = { documentId: "large-diagram", fit: false, scroll: { left: 80, top: 180 }, onScrollChange: save };
  const { result, rerender } = renderHook(
    ({ svg }: { svg?: string }) => useDiagramNavigation(1, vi.fn(), { svg, initialFit }),
    { initialProps: {} },
  );
  const viewport = document.createElement("div");
  viewport.innerHTML = '<div class="diagram"><svg></svg></div>';
  document.body.append(viewport);
  let width = 100;
  let height = 100;
  let left = 0;
  let top = 0;
  Object.defineProperties(viewport, {
    clientWidth: { get: () => 100 },
    clientHeight: { get: () => 100 },
    scrollWidth: { get: () => width },
    scrollHeight: { get: () => height },
    scrollLeft: {
      get: () => left,
      set: (value: number) => {
        left = Math.min(value, width - 100);
      },
    },
    scrollTop: {
      get: () => top,
      set: (value: number) => {
        top = Math.min(value, height - 100);
      },
    },
  });
  result.current.viewportRef.current = viewport;
  rerender({ svg: "<svg></svg>" });
  tick();
  act(() => {
    viewport.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("pagehide"));
  });
  expect(save).not.toHaveBeenCalled();
  // The SVG's overflow appears after the first frame, as observed on WebKit.
  width = 500;
  height = 800;
  tick();
  tick();
  tick();
  expect({ left, top }).toEqual({ left: 80, top: 180 });
  act(() => {
    viewport.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("pagehide"));
  });
  expect(save).toHaveBeenLastCalledWith({ left: 80, top: 180 }, true);
  // A recovery metadata render must leave replacement detection active.
  initialFit.scroll = { left: 80, top: 180 };
  rerender({ svg: "<svg></svg>" });
  act(() => {
    left = 95;
    top = 210;
    viewport.dispatchEvent(new Event("scroll"));
  });
  // Sequence annotation replaces the SVG without changing its source or final overflow.
  // WebKit can clamp the position even though the final bounds are unchanged.
  await act(async () => {
    viewport.querySelector(".diagram")!.innerHTML = "<svg></svg>";
    left = 0;
    top = 0;
    await Promise.resolve();
  });
  act(() => viewport.dispatchEvent(new Event("scroll")));
  tick();
  tick();
  tick();
  expect({ left, top }).toEqual({ left: 95, top: 210 });
  act(() => window.dispatchEvent(new Event("pagehide")));
  expect(save).toHaveBeenLastCalledWith({ left: 95, top: 210 }, true);
});
