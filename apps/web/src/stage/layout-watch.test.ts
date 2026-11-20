// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LAYOUT_SETTLE_MS, watchLayout } from "./layout-watch";

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed = new Set<Element>();
  constructor(public callback: () => void) {
    FakeResizeObserver.instances.push(this);
  }
  observe(element: Element) {
    this.observed.add(element);
  }
  unobserve(element: Element) {
    this.observed.delete(element);
  }
  disconnect() {
    this.observed.clear();
  }
}

let root: HTMLElement;
beforeEach(() => {
  vi.useFakeTimers();
  FakeResizeObserver.instances = [];
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  root = document.createElement("main");
  root.innerHTML =
    '<div class="preview-viewport"><div class="diagram"><svg></svg></div></div><div data-view-control></div>';
  document.body.append(root);
});
afterEach(() => {
  root.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const frames = (count = 1) => vi.advanceTimersByTimeAsync(16 * count);

it("measures once on start and then stays completely idle", async () => {
  const onChange = vi.fn();
  const stop = watchLayout(root, onChange);
  await frames();
  expect(onChange).toHaveBeenCalledTimes(1);
  // The single trailing settle call, then nothing for as long as nothing changes.
  await vi.advanceTimersByTimeAsync(LAYOUT_SETTLE_MS + 16);
  expect(onChange).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(onChange).toHaveBeenCalledTimes(2);
  stop();
});

it("coalesces a burst of DOM, scroll and resize events into one call per frame", async () => {
  const onChange = vi.fn();
  const stop = watchLayout(root, onChange);
  await vi.advanceTimersByTimeAsync(LAYOUT_SETTLE_MS + 16);
  onChange.mockClear();
  root.querySelector("svg")!.setAttribute("viewBox", "0 0 10 10");
  root.querySelector(".diagram")!.setAttribute("style", "transform: scale(2)");
  root.querySelector(".preview-viewport")!.dispatchEvent(new Event("scroll"));
  window.dispatchEvent(new Event("resize"));
  await frames();
  expect(onChange).toHaveBeenCalledTimes(1);
  stop();
});

it("reacts to size changes, wheel input and the fit event", async () => {
  const onChange = vi.fn();
  const stop = watchLayout(root, onChange);
  await vi.advanceTimersByTimeAsync(LAYOUT_SETTLE_MS + 16);
  onChange.mockClear();
  FakeResizeObserver.instances[0]!.callback();
  await frames();
  expect(onChange).toHaveBeenCalledTimes(1);
  root.dispatchEvent(new Event("wheel"));
  await frames();
  expect(onChange).toHaveBeenCalledTimes(2);
  window.dispatchEvent(new CustomEvent("fit-active-diagram"));
  await frames();
  expect(onChange).toHaveBeenCalledTimes(3);
  stop();
});

it("ignores changes inside the floating view controls and follows a replaced SVG", async () => {
  const onChange = vi.fn();
  const stop = watchLayout(root, onChange);
  await vi.advanceTimersByTimeAsync(LAYOUT_SETTLE_MS + 16);
  onChange.mockClear();
  root.querySelector("[data-view-control]")!.setAttribute("style", "left: 4px");
  await frames();
  expect(onChange).not.toHaveBeenCalled();

  const observer = FakeResizeObserver.instances[0]!;
  const oldSvg = root.querySelector("svg")!;
  expect(observer.observed.has(oldSvg)).toBe(true);
  const fresh = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  oldSvg.replaceWith(fresh);
  await frames();
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(observer.observed.has(fresh)).toBe(true);
  expect(observer.observed.has(oldSvg)).toBe(false);
  stop();
});

it("stops calling back after it is disposed", async () => {
  const onChange = vi.fn();
  const stop = watchLayout(root, onChange);
  stop();
  root.querySelector("svg")!.setAttribute("width", "5");
  window.dispatchEvent(new Event("resize"));
  await vi.advanceTimersByTimeAsync(1000);
  expect(onChange).not.toHaveBeenCalled();
});
