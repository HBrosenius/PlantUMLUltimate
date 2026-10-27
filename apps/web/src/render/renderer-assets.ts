import plantUmlEngineUrl from "@plantuml/core/plantuml.js?url";
import graphvizUrl from "@plantuml/core/viz-global.js?url";
import workerUrl from "./canonical.worker.ts?worker&url";
import { classicEngineScript } from "./engine-exceptions";

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
        const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error("Could not load the local renderer assets");
        const source = await response.text();
        if (source.length > 10_000_000) throw new Error("Renderer asset exceeds the expected size");
        return scriptSource(
          index === 0 ? classicEngineScript(source) : source,
          ["engine", "graphviz", "worker", "icons"][index]!,
        );
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
