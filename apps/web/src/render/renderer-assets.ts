import plantUmlEngineUrl from "@plantuml/core/plantuml.js?url";
import graphvizUrl from "@plantuml/core/viz-global.js?url";
import workerUrl from "./canonical.worker.ts?worker&url";

let assets: Promise<{ engine: string; graphviz: string; worker: string; icons: string }> | undefined;

function scriptUrl(source: string, name: string): string {
  // Parser exceptions capture stacks. A multi-megabyte data URL as the script
  // name makes that routine work expensive, even when the exception is caught.
  const bytes = new TextEncoder().encode(`${source}\n//# sourceURL=plantuml-renderer-${name}.js`);
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += 32_768)
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + 32_768)));
  return `data:text/javascript;base64,${btoa(chunks.join(""))}`;
}

export function loadRendererAssets() {
  const urls = import.meta.env.DEV
    ? [
        "/__renderer_assets__/plantuml.js",
        "/__renderer_assets__/viz-global.js",
        "/__renderer_assets__/canonical.worker.js",
        "/openiconic.js",
      ]
    : [plantUmlEngineUrl, graphvizUrl, workerUrl, "/openiconic.js"];
  assets ??= Promise.all(
    urls.map(async (url, index) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("Could not load the local renderer assets");
      const source = await response.text();
      if (source.length > 10_000_000) throw new Error("Renderer asset exceeds the expected size");
      return scriptUrl(source, ["engine", "graphviz", "worker", "icons"][index]!);
    }),
  )
    .then(([engine, graphviz, worker, icons]) => ({
      engine: engine!,
      graphviz: graphviz!,
      worker: worker!,
      icons: icons!,
    }))
    .catch((error) => {
      assets = undefined;
      throw error;
    });
  return assets;
}

export function frameDocument(channel: string): string {
  const bootstrap = `
    const channel = ${JSON.stringify(channel)};
    const send = (message) => parent.postMessage({ channel, ...message }, "*");
    let worker;
    let nextRequest;
    let ready = false;
    let initialized = false;
    let completedRenders = 0;
    let configuration;
    const stop = () => { worker?.terminate(); worker = undefined; ready = false; nextRequest = undefined; };
    const start = () => {
      worker = new Worker(configuration.worker, { type: "module" });
      worker.onerror = (event) => { send({ type: initialized ? "result" : "bootstrap-error", requestId: nextRequest?.requestId, error: event.message || "Renderer worker failed" }); stop(); };
      worker.onmessage = (event) => {
        const message = event.data;
        if (message.type === "ready") {
          ready = true;
          if (!initialized) { initialized = true; send({ type: "ready", nativeTextMetrics: message.nativeTextMetrics }); }
          if (nextRequest) worker.postMessage(nextRequest, nextRequest.fonts ? [nextRequest.fonts.metrics.buffer] : []);
        } else {
          send(message);
          nextRequest = undefined;
          // Keep the engine warm within one document; cap its lifetime and discard failures.
          if (message.type !== "result" || message.error || ++completedRenders >= 20) {
            stop();
            completedRenders = 0;
          }
          if (!worker && message.type === "result") {
            try { start(); } catch { /* The next render can retry worker creation. */ }
          }
        }
      };
      worker.postMessage({ type: "initialize", ...configuration });
    };
    addEventListener("message", (event) => {
        const request = event.data;
        if (event.source !== parent || !request || request.channel !== channel) return;
        if (request.type === "initialize" && !configuration) {
          try {
            configuration = request.assets;
            start();
          } catch (error) { send({ type: "bootstrap-error", error: String(error) }); }
          return;
        }
        if (request.type === "dispose") { stop(); send({ type: "disposed" }); return; }
        if (request.type !== "render" || !configuration) return;
        nextRequest = request;
        if (!worker) start();
        else if (ready) worker.postMessage(request, request.fonts ? [request.fonts.metrics.buffer] : []);
    });
  `;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'wasm-unsafe-eval' data:; worker-src data:; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"></head><body><script type="module" src="${scriptUrl(bootstrap, "bootstrap")}"></script></body></html>`;
}
