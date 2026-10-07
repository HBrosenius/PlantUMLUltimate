import { expect, test } from "@playwright/test";
import { prepareEditor } from "./editor-helpers";

test("renders with the font atlas when worker canvas is unavailable", async ({ page }) => {
  test.setTimeout(75_000);
  await page.route("**/__renderer_assets__/canonical.worker.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `Object.defineProperty(globalThis, "OffscreenCanvas", { value: undefined });\n${await response.text()}`,
    });
  });
  await prepareEditor(page);
  await page
    .locator(".cm-content")
    .fill(
      "@startgantt\nProject starts 2026-09-01\nskinparam defaultFontSize 18\n[Canvas fallback] lasts 3 days\n@endgantt",
    );
  await expect(page.locator(".diagram svg")).toContainText("Canvas fallback", { timeout: 60_000 });
  await expect(page.locator(".statusbar")).toContainText(/Render \d+ ms/);
});

test("warm rendering matches a fresh engine after font and style changes", async ({ page, browserName }) => {
  test.setTimeout(browserName === "webkit" ? 240_000 : 180_000);
  await prepareEditor(page);
  await page.getByRole("button", { name: "1 · code" }).click();
  const comparisons = await page.evaluate(async () => {
    const assetsPath = "/src/render/renderer-assets.ts";
    const fontsPath = "/src/render/font-atlas.ts";
    const sourcePath = "/src/render/plantuml-source.ts";
    const { loadRendererAssets, frameDocument } = await import(assetsPath);
    const { buildFontAtlas } = await import(fontsPath);
    const { sourceForPlantUmlRenderer } = await import(sourcePath);
    const assets = await loadRendererAssets();
    async function harness(engine: string) {
      const channel = crypto.randomUUID();
      const frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "allow-scripts");
      frame.style.cssText = "position:fixed;width:1px;height:1px;bottom:0;right:0;pointer-events:none";
      let resolveReady: () => void;
      let nativeTextMetrics = false;
      let rejectReady: (error: Error) => void;
      let resolveResult: (value: { svg?: string; error?: string }) => void;
      const ready = new Promise<void>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
      });
      const listener = (event: MessageEvent) => {
        if (event.source !== frame.contentWindow || event.data?.channel !== channel) return;
        if (event.data.type === "ready") {
          nativeTextMetrics = event.data.nativeTextMetrics === true;
          resolveReady();
        }
        if (event.data.type === "bootstrap-error") rejectReady(new Error(event.data.error));
        if (event.data.type === "result") resolveResult(event.data);
      };
      window.addEventListener("message", listener);
      frame.srcdoc = frameDocument(channel);
      frame.onload = () =>
        frame.contentWindow!.postMessage(
          { channel, type: "initialize", assets: { ...assets, layoutEngine: engine } },
          "*",
        );
      document.body.append(frame);
      await ready;
      return {
        async render(source: string) {
          const renderSource = sourceForPlantUmlRenderer(source);
          const fonts = nativeTextMetrics ? undefined : await buildFontAtlas(renderSource);
          const result = new Promise<{ svg?: string; error?: string }>((resolve) => {
            resolveResult = resolve;
          });
          frame.contentWindow!.postMessage(
            { channel, type: "render", requestId: Math.random(), renderSource, fonts },
            "*",
            fonts ? [fonts.metrics.buffer] : [],
          );
          return result;
        },
        dispose() {
          frame.contentWindow!.postMessage({ channel, type: "dispose" }, "*");
          window.removeEventListener("message", listener);
          setTimeout(() => frame.remove(), 100);
        },
      };
    }
    const output: { engine: string; source: string; equal: boolean; error?: string }[] = [];
    const fixtures = {
      native: [
        "@startgantt\nProject starts 2026-09-01\n[Alpha] lasts 2 days\n@endgantt",
        "@startgantt\nProject starts 2026-09-01\nskinparam defaultFontName Monospaced\nskinparam defaultFontSize 18\n[Alpha] lasts 4 days\n[Alpha] is colored in Red\n@endgantt",
        "@startgantt\nProject starts 2026-09-01\n[Alpha] lasts 2 days\n@endgantt",
      ],
      graphviz: [
        "@startuml\nclass Alpha\nAlpha --> Beta\n@enduml",
        "@startuml\nskinparam defaultFontName Monospaced\nskinparam defaultFontSize 18\nclass Alpha #red\nAlpha --> Beta\n@enduml",
        "@startuml\nclass Alpha\nAlpha --> Beta\n@enduml",
      ],
    };
    for (const [engine, sources] of Object.entries(fixtures)) {
      const warm = await harness(engine);
      for (const source of sources) {
        const reused = await warm.render(source);
        const fresh = await harness(engine);
        const reference = await fresh.render(source);
        output.push({
          engine,
          source,
          equal: reused.svg === reference.svg && !!reused.svg,
          error: reused.error ?? reference.error,
        });
        fresh.dispose();
      }
      warm.dispose();
    }
    return output;
  });
  for (const comparison of comparisons) {
    expect(comparison.error, comparison.source).toBeUndefined();
    expect(comparison.equal, `${comparison.engine}: ${comparison.source}`).toBe(true);
  }
});
