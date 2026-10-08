/// <reference lib="webworker" />
import { parseHTML, DOMParser, SVGElement, Event as DOMEvent } from "linkedom";
import { atlasContext, type FontAtlas } from "./font-atlas";
function nativeTextContext(): ReturnType<typeof atlasContext> | undefined {
  try {
    const context = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(300, 150).getContext("2d") : null;
    if (!context) return undefined;
    const measurements = new Map<string, TextMetrics>();
    let measurementBytes = 0;
    let font = context.font;
    return {
      get font() {
        return font;
      },
      set font(value: string) {
        const size = Number(value.match(/([\d.]+)px\s+/)?.[1]);
        if (!Number.isFinite(size) || size <= 0 || size > 512 || value.length > 1000)
          throw new Error("Unsupported rendering font size");
        if (value !== font) {
          context.font = value;
          font = value;
        }
      },
      measureText(text: string) {
        if (text.length > 10_000) throw new Error("Text exceeds the supported rendering limits");
        const key = JSON.stringify([font, text]);
        let metrics = measurements.get(key);
        if (!metrics) {
          metrics = context.measureText(text);
          const bytes = key.length * 2 + 128;
          if (measurements.size < 50_000 && measurementBytes + bytes <= 4_000_000) {
            measurements.set(key, metrics);
            measurementBytes += bytes;
          }
        }
        return metrics;
      },
    };
  } catch {
    return undefined;
  }
}
const nativeMetrics = Boolean(nativeTextContext());

const { document } = parseHTML("<!doctype html><html><head></head><body></body></html>");
const createElement = document.createElement.bind(document);
const appendHead = document.head.appendChild.bind(document.head);
document.head.appendChild = ((node: HTMLElement) => {
  if (node.tagName.toLowerCase() !== "script") return appendHead(node);
  // The engine's dynamic loader expects a DOM load event even for preloaded sprites.
  // Only bundled OpenIconic is available; arbitrary scripts never execute here.
  const src = node.getAttribute("src") ?? (node as HTMLScriptElement).src;
  const bundled = src === "openiconic.js" || src === "/openiconic.js";
  setTimeout(() => node.dispatchEvent(new DOMEvent(bundled ? "load" : "error") as unknown as Event), 0);
  return node;
}) as typeof document.head.appendChild;
let fonts: FontAtlas;
let measurementContext: ReturnType<typeof atlasContext>;
let boundsContext: ReturnType<typeof atlasContext>;
document.createElement = ((name: string) => {
  if (name.toLowerCase() === "canvas") {
    return {
      width: 300,
      height: 150,
      getContext: () => measurementContext,
      toDataURL: () => {
        throw new Error("Raster content is disabled in the local renderer");
      },
    };
  }
  return createElement(name);
}) as typeof document.createElement;
Object.defineProperty(SVGElement.prototype, "getBBox", {
  value(this: Element) {
    const size = Number(this.getAttribute("font-size") ?? 12);
    const context = boundsContext;
    context.font = `${size}px ${this.getAttribute("font-family") ?? "sans-serif"}`;
    const metrics = context.measureText(this.textContent ?? "");
    const ascent = metrics.fontBoundingBoxAscent || metrics.actualBoundingBoxAscent || size * 0.8;
    const descent = metrics.fontBoundingBoxDescent || metrics.actualBoundingBoxDescent || size * 0.2;
    return {
      x: -metrics.actualBoundingBoxLeft,
      y: -ascent,
      width: Math.max(metrics.width, metrics.actualBoundingBoxRight) + Math.max(0, metrics.actualBoundingBoxLeft),
      height: ascent + descent,
    };
  },
});
Object.assign(globalThis, {
  window: globalThis,
  document,
  DOMParser,
  XMLSerializer: class {
    serializeToString(node: { toString(): string }) {
      return node.toString();
    }
  },
});

let renderToString:
  ((lines: string[], done: (svg: string) => void, fail: (error: unknown) => void) => void) | undefined;
self.onmessage = async (event: MessageEvent) => {
  const request = event.data;
  if (request.type === "initialize") {
    try {
      Object.defineProperty(document, "currentScript", { value: { tagName: "SCRIPT", src: request.graphviz } });
      if (request.layoutEngine === "graphviz") importScripts(request.graphviz);
      importScripts(request.engine, request.icons);
      renderToString = (globalThis as typeof globalThis & { __plantumlRenderToString: typeof renderToString })
        .__plantumlRenderToString;
      self.postMessage({ type: "ready", nativeTextMetrics: nativeMetrics });
    } catch (error) {
      self.postMessage({ type: "bootstrap-error", error: String(error) });
    }
    return;
  }
  if (request.type !== "render" || !renderToString) return;
  fonts = request.fonts;
  measurementContext = fonts ? atlasContext(fonts) : nativeTextContext()!;
  boundsContext = fonts ? atlasContext(fonts) : nativeTextContext()!;
  delete (globalThis as typeof globalThis & { _measureCtx?: unknown })._measureCtx;
  const started = performance.now();
  const send = (value: { svg?: string; error?: string }) =>
    self.postMessage({
      type: "result",
      requestId: request.requestId,
      durationMs: performance.now() - started,
      ...value,
    });
  try {
    renderToString(
      request.renderSource.split(/\r\n|\r|\n/),
      (svg) => {
        const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
        const syntaxError = (parsed.documentElement.textContent ?? "").match(/Syntax Error[?][^\n]*/i)?.[0];
        send(syntaxError ? { error: syntaxError.trim() } : { svg });
      },
      (error) => send({ error: String(error) }),
    );
  } catch (error) {
    send({ error: String(error) });
  }
};
