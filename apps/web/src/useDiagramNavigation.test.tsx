// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDiagramNavigation } from "./useDiagramNavigation";

function Canvas() {
  const [zoom, setZoom] = useState(1);
  const navigation = useDiagramNavigation(zoom, setZoom);
  return (
    <div ref={navigation.viewportRef} data-testid="viewport">
      <output>{zoom}</output>
      <div className="diagram" />
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
