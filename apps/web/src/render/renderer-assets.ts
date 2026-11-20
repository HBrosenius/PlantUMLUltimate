import plantUmlEngineUrl from "@plantuml/core/plantuml.js?url";
import graphvizUrl from "@plantuml/core/viz-global.js?url";
import workerUrl from "./canonical.worker.ts?worker&url";
import { classicEngineScript } from "./engine-exceptions";
import { fetchTextWithStallTimeout } from "./stall-fetch";
import { rendererDownloadFinished, rendererDownloadProgress, rendererDownloadStarted } from "./renderer-download";

const assets = new Map<string, Promise<string>>();

function scriptSource(source: string, name: string): string {
  // Parser exceptions capture stacks; naming the script keeps that cheap and readable. The frame
  // turns this text into a blob: URL of its own.
  return `${source}\n//# sourceURL=plantuml-renderer-${name}.js`;
}

export function loadRendererAssets(layoutEngine: "native" | "graphviz" = "graphviz") {
  const urls = import.meta.env.DEV
    ? [
        "/__renderer_assets__/plantuml.js",
        "/__renderer_assets__/viz-global.js",
        "/__renderer_assets__/canonical.worker.js",
        "/openiconic.js",
      ]
    : [plantUmlEngineUrl, graphvizUrl, workerUrl, "/openiconic.js"];
  return Promise.all(
    urls.map((url, index) => {
      if (index === 1 && layoutEngine === "native") return Promise.resolve("");
      const existing = assets.get(url);
      if (existing) return existing;
      const pending = (async () => {
        rendererDownloadStarted(url);
        let ok = false;
        try {
          // A slow link is fine as long as bytes keep arriving; only a stalled download fails.
          const source = await fetchTextWithStallTimeout(url, {
            maxChars: 10_000_000,
            onProgress: (loaded) => rendererDownloadProgress(url, loaded),
          });
          ok = true;
          return scriptSource(
            index === 0 ? classicEngineScript(source) : source,
            ["engine", "graphviz", "worker", "icons"][index]!,
          );
        } finally {
          rendererDownloadFinished(url, ok);
        }
      })().catch((error) => {
        assets.delete(url);
        throw error;
      });
      assets.set(url, pending);
      return pending;
    }),
  ).then(([engine, graphviz, worker, icons]) => ({
    engine: engine!,
    graphviz: graphviz!,
    worker: worker!,
    icons: icons!,
  }));
}

export { rendererFrameDocument as frameDocument } from "./renderer-frame";
