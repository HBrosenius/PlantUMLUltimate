import { useEffect, useRef, useState } from "react";
import type { RenderResult, RenderStatus } from "../model";
import { sourceForPlantUmlRenderer } from "./plantuml-source";
import { loadRendererAssets, frameDocument } from "./renderer-assets";
import { renderSafetyError } from "./render-safety";
import { sanitizeSvg } from "./sanitize-svg";
import { buildFontAtlas } from "./font-atlas";

interface PendingRender {
  requestId: number;
  source: string;
  documentId: string;
  renderSource: string;
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
) {
  const pending = useRef<PendingRender | undefined>(undefined);
  const latest = useRef({ source, documentId });
  latest.current = { source, documentId };
  const requestId = useRef(0);
  const flush = useRef<(() => void) | undefined>(undefined);
  const cache = useRef(new Map<string, RenderResult>());
  const [status, setStatus] = useState<RenderStatus>("idle");
  const [result, setResult] = useState<RenderResult | undefined>();
  const [restart, setRestart] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let frame: HTMLIFrameElement | undefined;
    let channel = "";
    let ready = false;
    let nativeTextMetrics = false;
    let booting = false;
    let inFlight: PendingRender | undefined;
    let timeout: number | undefined;
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
      window.clearTimeout(startupTimeout);
    };
    const fail = (error: string, request = inFlight ?? pending.current) => {
      if (disposed || (request && !isCurrent(request))) return;
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
      const preparation =
        nativeTextMetrics && document.fonts.size === 0
          ? Promise.resolve(undefined)
          : buildFontAtlas(request.renderSource, () => disposed || inFlight !== request || !isCurrent(request));
      void preparation.then(
        (fonts) => {
          if (disposed || inFlight !== request) return;
          if (!isCurrent(request)) {
            inFlight = undefined;
            window.clearTimeout(timeout);
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
          sendPending();
        },
      );
      timeout = window.setTimeout(() => {
        if (inFlight !== request) return;
        fail("Rendering timed out. Reduce the diagram size or check its source and try again.", request);
        inFlight = undefined;
        removeFrame();
        if (pending.current) void boot();
      }, RENDER_TIMEOUT_MS);
    };
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
      startupTimeout = window.setTimeout(() => {
        bootVersion += 1;
        startupFailed("Renderer startup timed out");
      }, TIMEOUT_MS);
      try {
        const assets = await loadRendererAssets();
        if (disposed || version !== bootVersion) return;
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
            frame?.contentWindow?.postMessage(
              { channel, type: "initialize", assets: { ...assets, layoutEngine } },
              "*",
            );
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
        else if (typeof message.svg === "string") completed.svg = sanitizeSvg(message.svg);
        else completed.error = "The renderer returned no diagram";
      } catch (error) {
        completed.error = error instanceof Error ? error.message : "Invalid SVG";
      }
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
    };
  }, [enabled, restart, layoutEngine, documentId]);

  useEffect(() => {
    const id = ++requestId.current;
    pending.current = undefined;
    if (!enabled) {
      setStatus("idle");
      return;
    }
    setStatus("rendering");
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
      const cached = cache.current.get(cacheKey(documentId, source));
      if (cached) {
        setResult({ ...cached, requestId: id });
        setStatus("idle");
        return;
      }
      pending.current = { requestId: id, source, documentId, renderSource: sourceForPlantUmlRenderer(source) };
      flush.current?.();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [enabled, source, documentId, restart]);

  const retry = () => {
    cache.current.delete(cacheKey(documentId, source));
    setRestart((value) => value + 1);
  };
  return { status, result: result?.documentId === documentId ? result : undefined, retry };
}
