/**
 * The isolated renderer frame's bootstrap. It is inline in a sandboxed `srcdoc` frame and allowed by
 * its hash in the editor page's CSP (added at build time by `vite.config.ts`), so its text must not
 * vary: the per-frame channel travels in a `<meta>` tag instead. This module has no bundler-specific
 * imports so the Vite config can hash it.
 */
export const rendererFrameBootstrap = `
    const channel = document.querySelector('meta[name="renderer-channel"]').content;
    // The editor sends script text; this opaque-origin frame turns it into its own blob: URLs so
    // neither the page nor the frame has to allow data: scripts.
    const scriptUrl = (text) => (text ? URL.createObjectURL(new Blob([text], { type: "text/javascript" })) : "");
    const send = (message) => parent.postMessage({ channel, ...message }, "*");
    let worker;
    let nextRequest;
    let ready = false;
    let initialized = false;
    let completedRenders = 0;
    let configuration;
    const stop = () => { worker?.terminate(); worker = undefined; ready = false; nextRequest = undefined; };
    const start = () => {
      worker = new Worker(configuration.worker);
      const activeWorker = worker;
      worker.onerror = (event) => { if (worker !== activeWorker) return; send({ type: initialized ? "result" : "bootstrap-error", requestId: nextRequest?.requestId, error: event.message || "Renderer worker failed" }); stop(); };
      worker.onmessage = (event) => {
        if (worker !== activeWorker) return;
        const message = event.data;
        if (message.type === "ready") {
          ready = true;
          if (!initialized) { initialized = true; send({ type: "ready", nativeTextMetrics: message.nativeTextMetrics }); }
          if (nextRequest) worker.postMessage(nextRequest, nextRequest.fonts ? [nextRequest.fonts.metrics.buffer] : []);
        } else {
          send(message);
          nextRequest = undefined;
          // Keep the engine warm within one document; cap its lifetime and discard engine
          // failures. A diagram the engine rendered as a syntax error is an ordinary result
          // for the worker, so the common mid-edit invalid line keeps the warm engine.
          if (message.type !== "result" || (message.error && !message.recoverable) || ++completedRenders >= 20) {
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
            const assets = request.assets;
            configuration = { ...assets, worker: scriptUrl(assets.worker), engine: scriptUrl(assets.engine), graphviz: scriptUrl(assets.graphviz), icons: scriptUrl(assets.icons) };
            start();
          } catch (error) { send({ type: "bootstrap-error", error: String(error) }); }
          return;
        }
        if (request.type === "dispose") { stop(); send({ type: "disposed" }); return; }
        if (request.type === "cancel") {
          if (nextRequest?.requestId === request.requestId) {
            stop();
            completedRenders = 0;
            // Boot the replacement now so it loads the engine while the user keeps typing.
            try { start(); } catch { /* The next render can retry worker creation. */ }
          }
          return;
        }
        if (request.type !== "render" || !configuration) return;
        nextRequest = request;
        if (!worker) start();
        else if (ready) worker.postMessage(request, request.fonts ? [request.fonts.metrics.buffer] : []);
    });
`;

/** The frame's own policy narrows the inherited page policy: no network, scripts only as blob: URLs. */
export function rendererFrameDocument(channel: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="renderer-channel" content="${channel.replace(/[^\w-]/g, "")}"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob:; worker-src blob:; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"></head><body><script type="module">${rendererFrameBootstrap}</script></body></html>`;
}
