import { afterEach, expect, it, vi } from "vitest";
vi.mock("./engine-exceptions", () => ({ classicEngineScript: (source: string) => source }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
it("native diagrams prepare three assets, with Graphviz fetched only when requested", async () => {
  const fetch = vi.fn(async () => new Response("/* local script */"));
  vi.stubGlobal("fetch", fetch);
  const { loadRendererAssets } = await import("./renderer-assets");
  const native = await loadRendererAssets("native");
  expect(native.graphviz).toBe("");
  expect(fetch).toHaveBeenCalledTimes(3);
  await loadRendererAssets("native");
  const graph = await loadRendererAssets("graphviz");
  expect(graph.engine).toBe(native.engine);
  // Script text, which the frame turns into its own blob: URL.
  expect(graph.graphviz).toBe("/* local script */\n//# sourceURL=plantuml-renderer-graphviz.js");
  expect(fetch).toHaveBeenCalledTimes(4);
});
it("retries a failed asset without downloading successful assets again", async () => {
  let failed = false;
  const fetch = vi.fn(async (url: string) => {
    if (url.includes("viz-global") && !failed) {
      failed = true;
      return new Response("", { status: 503 });
    }
    return new Response("/* local script */");
  });
  vi.stubGlobal("fetch", fetch);
  const { loadRendererAssets } = await import("./renderer-assets");
  await expect(loadRendererAssets("graphviz")).rejects.toThrow("Could not load");
  await expect(loadRendererAssets("graphviz")).resolves.toHaveProperty("graphviz");
  expect(fetch).toHaveBeenCalledTimes(5);
});
