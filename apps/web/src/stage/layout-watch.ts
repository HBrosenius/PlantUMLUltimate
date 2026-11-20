/**
 * Calls `onChange` once per animation frame in which something that can move or resize the content of
 * `root` actually changed, and never while it is idle.
 *
 * Stage positions floating UI against rendered SVG elements. Polling those positions every frame
 * costs main-thread time that grows with the diagram and keeps the device from idling, so this
 * listens for the things that can move them instead: size changes, DOM and attribute changes (a new
 * render, zoom, an edit or a drag), scrolling, wheel input and window resizes. One trailing call
 * after the last event catches late settling such as font loading.
 */
export const LAYOUT_SETTLE_MS = 250;

const WINDOW_EVENTS = ["resize", "fit-active-diagram", "gantt-navigate"];
const WATCHED_SELECTORS = [".preview-viewport", ".diagram svg"];

function insideViewControl(node: Node | null): boolean {
  const element = node instanceof Element ? node : (node?.parentElement ?? null);
  return Boolean(element?.closest("[data-view-control]"));
}

export function watchLayout(root: HTMLElement, onChange: () => void): () => void {
  let frame = 0;
  let settle: number | undefined;
  let disposed = false;
  const run = () => {
    frame = 0;
    if (!disposed) onChange();
  };
  const schedule = () => {
    if (disposed) return;
    if (!frame) frame = requestAnimationFrame(run);
    // One trailing call after the last event; it is re-armed only by another real event.
    window.clearTimeout(settle);
    settle = window.setTimeout(() => {
      settle = undefined;
      if (!frame && !disposed) frame = requestAnimationFrame(run);
    }, LAYOUT_SETTLE_MS);
  };

  const observed = new Set<Element>();
  const resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
  const observeSizes = () => {
    if (!resizeObserver) return;
    for (const element of observed) {
      if (!element.isConnected) {
        resizeObserver.unobserve(element);
        observed.delete(element);
      }
    }
    for (const element of [root, ...WATCHED_SELECTORS.map((selector) => root.querySelector(selector))]) {
      if (element && !observed.has(element)) {
        observed.add(element);
        resizeObserver.observe(element);
      }
    }
  };
  const mutationObserver = new MutationObserver((records) => {
    if (records.every((record) => insideViewControl(record.target))) return;
    if (records.some((record) => record.type === "childList")) observeSizes();
    schedule();
  });
  observeSizes();
  mutationObserver.observe(root, { childList: true, subtree: true, attributes: true, characterData: false });

  root.addEventListener("scroll", schedule, { capture: true, passive: true });
  root.addEventListener("wheel", schedule, { passive: true });
  for (const name of WINDOW_EVENTS) window.addEventListener(name, schedule);
  schedule();

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    window.clearTimeout(settle);
    resizeObserver?.disconnect();
    mutationObserver.disconnect();
    root.removeEventListener("scroll", schedule, { capture: true });
    root.removeEventListener("wheel", schedule);
    for (const name of WINDOW_EVENTS) window.removeEventListener(name, schedule);
  };
}
