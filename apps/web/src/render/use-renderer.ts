import { useEffect, useRef, useState } from "react";
import type { RenderResult, RenderStatus } from "../model";
import { sourceForPlantUmlRenderer } from "./plantuml-source";
import { bundledThemeToLoad, loadBundledTheme } from "./bundled-themes";
import { loadRendererAssets, frameDocument } from "./renderer-assets";
import { renderSafetyError } from "./render-safety";
import { sanitizeSvg } from "./sanitize-svg";
import { measurePreviewPhase } from "./preview-performance";
import { buildFontAtlas } from "./font-atlas";
import { renderDebounceMs } from "./render-debounce";

interface PendingRender {
  requestId: number;
  source: string;
  documentId: string;
  renderSource: string;
  layoutEngine: RendererLayoutEngine;
}
interface FrameMessage {
  channel: string;
  type: string;
  requestId?: number;
  svg?: string;
  error?: string;
  durationMs?: number;
  nativeTextMetrics?: boolean;
}
const TIMEOUT_MS = 15_000;
const RENDER_TIMEOUT_MS = 30_000;
const SUPERSEDED_GRACE_MS = 500;
const CACHE_BYTES = 20_000_000;
const cacheKey = (documentId: string, source: string) => JSON.stringify([documentId, source]);

export type RendererLayoutEngine = "native" | "graphviz";
export function rendererLayoutEngineForDiagramKind(kind: string): RendererLayoutEngine {
  return ["gantt", "sequence", "wbs"].includes(kind) ? "native" : "graphviz";
}
export function useRenderer(
  source: string,
  enabled = true,
  layoutEngine: RendererLayoutEngine = "graphviz",
  documentId = "default",
  options: { prewarm?: boolean } = {},
) {
  const pending = useRef<PendingRender | undefined>(undefined);
  const latest = useRef({ source, documentId });
  latest.current = { source, documentId };
  // The renderer outlives tabs, view modes and layout engines: it starts the first time a preview is
  // wanted and then stays warm until the hook unmounts. Hiding the preview only stops requests.
  const [started, setStarted] = useState(enabled);
  if (enabled && !started) setStarted(true);
  // With `prewarm`, fetch and boot the engine as soon as the page is idle, before any preview is
  // wanted (the new-document chooser and Code view do not need one yet), so the first diagram only
  // pays for rendering.
  const prewarm = options.prewarm === true;
  useEffect(() => {
    if (!prewarm || started) return;
    const start = () => setStarted(true);
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(start, { timeout: 150 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(start, 50);
    return () => window.clearTimeout(timer);
  }, [prewarm, started]);
  const wanted = useRef(enabled);
  wanted.current = enabled;
  const requestId = useRef(0);
  const flush = useRef<(() => void) | undefined>(undefined);
  const supersede = useRef<(() => void) | undefined>(undefined);
  const busy = useRef<(() => boolean) | undefined>(undefined);
  const lastRenderMs = useRef<number | undefined>(undefined);
  const lastEditAt = useRef<number | undefined>(undefined);
  const cache = useRef(new Map<string, RenderResult>());
  const [status, setStatus] = useState<RenderStatus>("idle");
  const [result, setResult] = useState<RenderResult | undefined>();
  const [restart, setRestart] = useState(0);

  useEffect(() => {
    if (!started) return;
    let disposed = false;
    let frame: HTMLIFrameElement | undefined;
    let channel = "";
    let ready = false;
    let nativeTextMetrics = false;
    let booting = false;
    let graphvizSent = false;
    let inFlight: PendingRender | undefined;
    let timeout: number | undefined;
    let obsoleteTimer: number | undefined;
    let startupTimeout: number | undefined;
    let recoveryTimer: number | undefined;
    let recoveryAttempted = false;
    let bootVersion = 0;
    const isCurrent = (request: PendingRender) =>
      request.requestId === requestId.current &&
      request.source === latest.current.source &&
      request.documentId === latest.current.documentId;
    const removeFrame = () => {
      ready = false;
      booting = false;
      graphvizSent = false;
      const retired = frame;
      if (retired) {
        const owner = retired.contentWindow;
        const retiredChannel = channel;
        const finish = () => {
          window.clearTimeout(deadline);
          window.removeEventListener("message", disposed);
          retired.remove();
        };
        const disposed = (event: MessageEvent) => {
          if (event.source === owner && event.data?.channel === retiredChannel && event.data.type === "disposed")
            finish();
        };
        const deadline = window.setTimeout(finish, 100);
        window.addEventListener("message", disposed);
        owner?.postMessage({ channel: retiredChannel, type: "dispose" }, "*");
      }
      frame = undefined;
      window.clearTimeout(timeout);
      window.clearTimeout(obsoleteTimer);
      obsoleteTimer = undefined;
      window.clearTimeout(startupTimeout);
    };
    const fail = (error: string, request = inFlight ?? pending.current) => {
      if (disposed || (request && !isCurrent(request))) return;
      // A warm-up that fails while no preview is wanted stays silent; the next request boots again.
      if (!request && !wanted.current) return;
      setStatus("error");
      setResult((previous) => ({
        requestId: requestId.current,
        source: latest.current.source,
        documentId: latest.current.documentId,
        durationMs: 0,
        error,
        ...(previous?.documentId === latest.current.documentId && previous.svg
          ? { svg: previous.svg, source: previous.source }
          : {}),
      }));
    };
    const sendPending = () => {
      if (!ready || inFlight || !pending.current || !frame?.contentWindow) return;
      const request = pending.current;
      pending.current = undefined;
      if (!isCurrent(request)) return;
      inFlight = request;
      const abandoned = () => disposed || inFlight !== request || !isCurrent(request);
      const armRenderTimeout = () => {
        window.clearTimeout(timeout);
        timeout = window.setTimeout(() => {
          if (inFlight !== request) return;
          fail("Rendering timed out. Reduce the diagram size or check its source and try again.", request);
          inFlight = undefined;
          removeFrame();
          if (pending.current) void boot();
        }, RENDER_TIMEOUT_MS);
      };
      // Graphviz joins the running worker the first time a diagram needs it; downloading it has its own
      // stall timeout, so the render timeout only starts once it is in place.
      const preparation = ensureGraphviz(request).then(() => {
        if (abandoned()) return undefined;
        armRenderTimeout();
        return nativeTextMetrics && document.fonts.size === 0
          ? undefined
          : buildFontAtlas(request.renderSource, abandoned);
      });
      void preparation.then(
        (fonts) => {
          if (disposed || inFlight !== request) return;
          if (!isCurrent(request)) {
            inFlight = undefined;
            window.clearTimeout(timeout);
            window.clearTimeout(obsoleteTimer);
            obsoleteTimer = undefined;
            sendPending();
            return;
          }
          frame?.contentWindow?.postMessage(
            { channel, type: "render", ...request, fonts },
            "*",
            fonts ? [fonts.metrics.buffer] : [],
          );
        },
        (error) => {
          if (disposed || inFlight !== request) return;
          fail(error instanceof Error ? error.message : "Could not prepare diagram text", request);
          inFlight = undefined;
          window.clearTimeout(timeout);
          window.clearTimeout(obsoleteTimer);
          obsoleteTimer = undefined;
          sendPending();
        },
      );
    };
    const ensureGraphviz = async (request: PendingRender) => {
      if (request.layoutEngine !== "graphviz" || graphvizSent) return;
      const { graphviz } = await loadRendererAssets("graphviz");
      if (disposed || graphvizSent || !frame?.contentWindow) return;
      graphvizSent = true;
      frame.contentWindow.postMessage({ channel, type: "add-graphviz", graphviz }, "*");
    };
    supersede.current = () => {
      const obsolete = inFlight;
      if (!obsolete || isCurrent(obsolete) || obsoleteTimer !== undefined) return;
      // Let short renders finish normally, but don't block a newer edit behind expensive work.
      obsoleteTimer = window.setTimeout(() => {
        obsoleteTimer = undefined;
        if (disposed || inFlight !== obsolete || isCurrent(obsolete)) return;
        frame?.contentWindow?.postMessage({ channel, type: "cancel", requestId: obsolete.requestId }, "*");
        inFlight = undefined;
        window.clearTimeout(timeout);
        sendPending();
      }, SUPERSEDED_GRACE_MS);
    };
    busy.current = () => inFlight !== undefined;
    flush.current = () => {
      if (!frame && !booting) void boot();
      else sendPending();
    };
    const startupFailed = (error: string) => {
      if (inFlight && isCurrent(inFlight) && !pending.current) pending.current = inFlight;
      removeFrame();
      inFlight = undefined;
      if (!recoveryAttempted) {
        recoveryAttempted = true;
        recoveryTimer = window.setTimeout(() => void boot(), 100);
      } else
        fail(
          `The local PlantUML renderer could not start after an automatic retry. Browser security settings or blocked asset loading may be preventing it. ${error}`,
        );
    };
    const boot = async () => {
      removeFrame();
      window.clearTimeout(recoveryTimer);
      booting = true;
      const version = ++bootVersion;
      try {
        // Downloading has its own stall timeout; the startup timer covers only the frame and worker.
        const assets = await loadRendererAssets("native");
        if (disposed || version !== bootVersion) return;
        startupTimeout = window.setTimeout(() => {
          bootVersion += 1;
          startupFailed("Renderer startup timed out");
        }, TIMEOUT_MS);
        channel = `plantuml-${crypto.randomUUID()}`;
        frame = document.createElement("iframe");
        // Keep a layout box so browser callbacks are not deferred solely because the frame is display:none.
        Object.assign(frame.style, {
          position: "fixed",
          width: "1px",
          height: "1px",
          right: "0",
          bottom: "0",
          pointerEvents: "none",
          border: "0",
        });
        frame.tabIndex = -1;
        frame.title = "Local PlantUML renderer";
        frame.setAttribute("aria-hidden", "true");
        frame.setAttribute("sandbox", "allow-scripts");
        frame.setAttribute("data-renderer-channel", channel);
        frame.srcdoc = frameDocument(channel);
        frame.onload = () => {
          if (!disposed && version === bootVersion)
            frame?.contentWindow?.postMessage({ channel, type: "initialize", assets }, "*");
        };
        document.body.append(frame);
      } catch (error) {
        if (!disposed && version === bootVersion) startupFailed(error instanceof Error ? error.message : String(error));
      }
    };
    const receive = (event: MessageEvent<FrameMessage>) => {
      const message = event.data;
      if (!message || message.channel !== channel || event.source !== frame?.contentWindow) return;
      if (message.type === "ready") {
        nativeTextMetrics = message.nativeTextMetrics === true;
        window.clearTimeout(startupTimeout);
        booting = false;
        ready = true;
        sendPending();
        return;
      }
      if (message.type === "bootstrap-error") {
        startupFailed(typeof message.error === "string" ? message.error.slice(0, 10_000) : "Unknown startup error");
        return;
      }
      if (message.type !== "result" || !inFlight || message.requestId !== inFlight.requestId) return;
      const request = inFlight;
      inFlight = undefined;
      window.clearTimeout(timeout);
      window.clearTimeout(obsoleteTimer);
      obsoleteTimer = undefined;
      // Stale SVGs can be very large. Drop them before parsing, sanitizing, or caching them.
      if (!isCurrent(request)) {
        sendPending();
        return;
      }
      const completed: RenderResult = {
        requestId: request.requestId,
        source: request.source,
        documentId: request.documentId,
        durationMs:
          typeof message.durationMs === "number" && Number.isFinite(message.durationMs) && message.durationMs >= 0
            ? message.durationMs
            : 0,
      };
      try {
        if (message.error)
          completed.error =
            typeof message.error === "string"
              ? message.error.slice(0, 10_000)
              : "The renderer returned an invalid error";
        else if (typeof message.svg === "string") {
          const svg = message.svg;
          completed.svg = measurePreviewPhase("sanitize-incoming", () => sanitizeSvg(svg));
        } else completed.error = "The renderer returned no diagram";
      } catch (error) {
        completed.error = error instanceof Error ? error.message : "Invalid SVG";
      }
      if (!completed.error) lastRenderMs.current = completed.durationMs;
      if (completed.svg) {
        const key = cacheKey(request.documentId, request.source);
        cache.current.delete(key);
        cache.current.set(key, completed);
        let bytes = [...cache.current].reduce(
          (total, [key, value]) => total + 2 * (key.length + (value.svg?.length ?? 0)),
          0,
        );
        while (cache.current.size > 50 || bytes > CACHE_BYTES) {
          const oldest = cache.current.entries().next().value;
          if (!oldest) break;
          bytes -= 2 * (oldest[0].length + (oldest[1].svg?.length ?? 0));
          cache.current.delete(oldest[0]);
        }
      }
      if (isCurrent(request)) {
        if (completed.error) fail(completed.error, request);
        else {
          setResult(completed);
          setStatus("idle");
        }
      }
      sendPending();
    };
    window.addEventListener("message", receive);
    void boot();
    return () => {
      disposed = true;
      bootVersion += 1;
      window.removeEventListener("message", receive);
      window.clearTimeout(recoveryTimer);
      removeFrame();
      flush.current = undefined;
      supersede.current = undefined;
      busy.current = undefined;
    };
  }, [started, restart]);

  useEffect(() => {
    const id = ++requestId.current;
    pending.current = undefined;
    supersede.current?.();
    const now = performance.now();
    const sinceLastEditMs = lastEditAt.current === undefined ? undefined : now - lastEditAt.current;
    lastEditAt.current = now;
    if (!enabled) {
      setStatus("idle");
      return;
    }
    // A preview already rendered for this exact source needs no debounce and no renderer.
    const cached = cache.current.get(cacheKey(documentId, source));
    if (cached) {
      setResult({ ...cached, requestId: id });
      setStatus("idle");
      return;
    }
    // After a tab switch, keep showing the newest preview this document already has (dimmed by the
    // stale-preview styling, as for an edit in the same document) instead of an empty pane.
    setResult((previous) => {
      if (previous?.documentId === documentId) return previous;
      let newest: RenderResult | undefined;
      for (const value of cache.current.values()) if (value.documentId === documentId) newest = value;
      return newest ? { ...newest, requestId: id } : previous;
    });
    setStatus("rendering");
    const delay = renderDebounceMs({
      busy: busy.current?.() ?? false,
      lastRenderMs: lastRenderMs.current,
      sinceLastEditMs,
    });
    const timer = window.setTimeout(() => {
      const error = renderSafetyError(source);
      if (error) {
        setStatus("error");
        setResult((previous) => ({
          requestId: id,
          source,
          documentId,
          durationMs: 0,
          error,
          ...(previous?.documentId === documentId && previous.svg
            ? { svg: previous.svg, source: previous.source }
            : {}),
        }));
        return;
      }
      const queue = () => {
        if (cancelled || requestId.current !== id) return;
        pending.current = {
          requestId: id,
          source,
          documentId,
          renderSource: sourceForPlantUmlRenderer(source),
          layoutEngine,
        };
        flush.current?.();
      };
      // Bundled themes load on demand; sources without one keep the synchronous path.
      const theme = bundledThemeToLoad(source);
      if (theme) void loadBundledTheme(theme).then(queue, queue);
      else queue();
    }, delay);
    let cancelled = false;
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, source, documentId, layoutEngine, restart]);

  const retry = () => {
    cache.current.delete(cacheKey(documentId, source));
    setRestart((value) => value + 1);
  };
  return { status, result: result?.documentId === documentId ? result : undefined, retry };
}
