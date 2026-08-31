import { useEffect, useRef, useState } from "react";
import type { RenderResult, RenderStatus } from "../model";
import { sourceForPlantUmlRenderer } from "./plantuml-source";

export type RendererLayoutEngine = "native" | "graphviz";

interface FrameMessage {
  channel: string;
  type: "ready" | "result" | "bootstrap-error";
  requestId?: number;
  source?: string;
  svg?: string;
  error?: string;
  durationMs?: number;
}

interface PendingRender {
  requestId: number;
  source: string;
  renderSource: string;
}
const CACHE_LIMIT = 50;

function frameDocument(
  channel: string,
  assets: { plantUmlEngineUrl: string; graphvizUrl: string },
  layoutEngine: RendererLayoutEngine,
): string {
  const { plantUmlEngineUrl, graphvizUrl } = assets;
  const engine = JSON.stringify(new URL(plantUmlEngineUrl, window.location.href).href);
  const graphviz = new URL(graphvizUrl, window.location.href).href.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  const frameChannel = JSON.stringify(channel);
  const graphvizScript = layoutEngine === "graphviz" ? `<script src="${graphviz}"></script>` : "";
  return `<!doctype html><html><head><meta charset="utf-8">${graphvizScript}</head><body><script type="module">
    const channel = ${frameChannel};
    const send = (message) => parent.postMessage({ channel, ...message }, "*");
    try {
      const { renderToString } = await import(${engine});
      addEventListener("message", (event) => {
        const request = event.data;
        if (!request || request.channel !== channel || request.type !== "render") return;
        const started = performance.now();
        renderToString(
          request.renderSource.split(/\\r\\n|\\r|\\n/),
          (svg) => {
            const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
            const text = parsed.documentElement.textContent || "";
            const syntaxError = text.match(/Syntax Error[?][^\\n]*/i)?.[0];
            if (syntaxError) send({ type: "result", requestId: request.requestId, source: request.source, error: syntaxError.trim(), durationMs: performance.now() - started });
            else send({ type: "result", requestId: request.requestId, source: request.source, svg, durationMs: performance.now() - started });
          },
          (error) => send({ type: "result", requestId: request.requestId, source: request.source, error: String(error), durationMs: performance.now() - started }),
        );
      });
      send({ type: "ready" });
    } catch (error) {
      send({ type: "bootstrap-error", error: error instanceof Error ? error.message : String(error) });
    }
  </script></body></html>`;
}

export function useRenderer(source: string, enabled = true, layoutEngine: RendererLayoutEngine = "graphviz") {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const channel = useRef(`plantuml-${crypto.randomUUID()}`);
  const ready = useRef(false);
  const busy = useRef(false);
  const latestRequest = useRef(0);
  const pending = useRef<PendingRender | undefined>(undefined);
  const cache = useRef(new Map<string, Omit<RenderResult, "requestId">>());
  const renderTimeout = useRef<number | undefined>(undefined);
  const flushPending = useRef<(() => void) | undefined>(undefined);
  const [status, setStatus] = useState<RenderStatus>("idle");
  const [result, setResult] = useState<RenderResult | undefined>();
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      return;
    }
    let instance: HTMLIFrameElement | undefined;
    let recoveryTimer: number | undefined;
    let recoveryAttempted = false;
    let cancelled = false;

    const sendPending = () => {
      if (!ready.current || busy.current || !pending.current || !instance?.contentWindow) return;
      const request = pending.current;
      pending.current = undefined;
      busy.current = true;
      instance.contentWindow.postMessage({ channel: channel.current, type: "render", ...request }, "*");
      window.clearTimeout(renderTimeout.current);
      renderTimeout.current = window.setTimeout(() => {
        if (!busy.current) return;
        busy.current = false;
        if (latestRequest.current === request.requestId) {
          setStatus("error");
          setResult((previous) => ({
            requestId: request.requestId,
            durationMs: 15_000,
            error: "Rendering timed out. Check the highlighted syntax errors and try again.",
            ...(previous?.svg ? { svg: previous.svg } : {}),
          }));
        }
        sendPending();
      }, 15_000);
    };
    flushPending.current = sendPending;

    const receive = (event: MessageEvent<FrameMessage>) => {
      const message = event.data;
      if (!message || message.channel !== channel.current || event.source !== instance?.contentWindow) return;
      if (message.type === "ready") {
        ready.current = true;
        sendPending();
        return;
      }
      if (message.type === "bootstrap-error") {
        busy.current = false;
        window.clearTimeout(renderTimeout.current);
        if (!recoveryAttempted) {
          recoveryAttempted = true;
          ready.current = false;
          instance?.remove();
          frame.current = null;
          setStatus("rendering");
          recoveryTimer = window.setTimeout(boot, 100);
          return;
        }
        setStatus("error");
        setResult((previous) => ({
          requestId: latestRequest.current,
          durationMs: 0,
          error: `The local PlantUML renderer could not start after an automatic retry. Browser security settings or blocked module loading may be preventing it. ${message.error ?? "Unknown error"}`,
          svg: previous?.svg,
        }));
        return;
      }
      if (message.type !== "result" || message.requestId === undefined) return;
      busy.current = false;
      pending.current = undefined;
      window.clearTimeout(renderTimeout.current);
      const completed: RenderResult = {
        requestId: message.requestId,
        durationMs: message.durationMs ?? 0,
        ...(message.svg ? { svg: message.svg } : {}),
        ...(message.error ? { error: message.error } : {}),
      };
      if (!completed.error && completed.svg && message.source) {
        cache.current.delete(message.source);
        cache.current.set(message.source, { svg: completed.svg, durationMs: completed.durationMs });
      }
      if (completed.requestId === latestRequest.current) {
        setResult((previous) => (completed.error ? { ...completed, svg: previous?.svg } : completed));
        setStatus(completed.error ? "error" : "idle");
      }
      sendPending();
    };

    window.addEventListener("message", receive);
    const boot = async () => {
      window.clearTimeout(recoveryTimer);
      instance?.remove();
      ready.current = false;
      busy.current = false;
      const { rendererAssets } = await import("./renderer-assets");
      if (cancelled) return;
      instance = document.createElement("iframe");
      instance.hidden = true;
      instance.title = "Local PlantUML renderer";
      instance.setAttribute("aria-hidden", "true");
      instance.srcdoc = frameDocument(channel.current, rendererAssets, layoutEngine);
      document.body.append(instance);
      frame.current = instance;
    };
    const requestIdle = (window as unknown as { requestIdleCallback?: typeof window.requestIdleCallback })
      .requestIdleCallback;
    const idleId = requestIdle ? requestIdle(boot, { timeout: 400 }) : window.setTimeout(boot, 50);
    return () => {
      cancelled = true;
      window.removeEventListener("message", receive);
      const cancelIdle = (window as unknown as { cancelIdleCallback?: typeof window.cancelIdleCallback })
        .cancelIdleCallback;
      if (cancelIdle && requestIdle) cancelIdle(idleId);
      else window.clearTimeout(idleId);
      instance?.remove();
      frame.current = null;
      ready.current = false;
      busy.current = false;
      window.clearTimeout(renderTimeout.current);
      window.clearTimeout(recoveryTimer);
      flushPending.current = undefined;
    };
  }, [enabled, layoutEngine]);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      return;
    }
    setStatus("rendering");
    const timer = window.setTimeout(() => {
      const requestId = ++latestRequest.current;
      const cached = cache.current.get(source);
      if (cached) {
        cache.current.delete(source);
        cache.current.set(source, cached);
        setResult({ requestId, ...cached });
        setStatus("idle");
        return;
      }
      pending.current = { requestId, source, renderSource: sourceForPlantUmlRenderer(source) };
      const contentWindow = frame.current?.contentWindow;
      if (ready.current && !busy.current && contentWindow) {
        const request = pending.current;
        pending.current = undefined;
        busy.current = true;
        contentWindow.postMessage({ channel: channel.current, type: "render", ...request }, "*");
        window.clearTimeout(renderTimeout.current);
        renderTimeout.current = window.setTimeout(() => {
          if (!busy.current) return;
          busy.current = false;
          if (latestRequest.current === request.requestId) {
            setStatus("error");
            setResult((previous) => ({
              requestId: request.requestId,
              durationMs: 15_000,
              error: "Rendering timed out. Check the highlighted syntax errors and try again.",
              ...(previous?.svg ? { svg: previous.svg } : {}),
            }));
          }
          flushPending.current?.();
        }, 15_000);
      }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [enabled, source, retryToken]);

  useEffect(() => {
    while (cache.current.size > CACHE_LIMIT) {
      const oldest = cache.current.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      cache.current.delete(oldest);
    }
  }, [result]);

  const retry = () => {
    cache.current.delete(source);
    setRetryToken((value) => value + 1);
  };

  return { status, result, retry };
}
