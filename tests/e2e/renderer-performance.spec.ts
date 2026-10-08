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
  page.on("console", (message) => {
    if (message.text().startsWith("Renderer parity:")) console.log(message.text());
  });
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
      let deadline: ReturnType<typeof setTimeout>;
      try {
        await Promise.race([
          ready,
          new Promise<never>((_, reject) => {
            deadline = setTimeout(() => reject(new Error(`${engine}: renderer initialization timed out`)), 30_000);
          }),
        ]);
      } catch (error) {
        window.removeEventListener("message", listener);
        frame.remove();
        throw error;
      } finally {
        clearTimeout(deadline!);
      }
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
          let renderDeadline: ReturnType<typeof setTimeout>;
          try {
            return await Promise.race([
              result,
              new Promise<never>((_, reject) => {
                renderDeadline = setTimeout(
                  () => reject(new Error(`${engine}: render timed out for ${source}`)),
                  30_000,
                );
              }),
            ]);
          } finally {
            clearTimeout(renderDeadline!);
          }
        },
        async dispose() {
          let onDisposed: (event: MessageEvent) => void;
          const disposed = new Promise<void>((resolve) => {
            onDisposed = (event: MessageEvent) => {
              if (
                event.source !== frame.contentWindow ||
                event.data?.channel !== channel ||
                event.data.type !== "disposed"
              )
                return;
              window.removeEventListener("message", onDisposed);
              resolve();
            };
            window.addEventListener("message", onDisposed);
          });
          frame.contentWindow!.postMessage({ channel, type: "dispose" }, "*");
          let disposeDeadline: ReturnType<typeof setTimeout>;
          try {
            await Promise.race([
              disposed,
              new Promise<never>((_, reject) => {
                disposeDeadline = setTimeout(() => reject(new Error(`${engine}: renderer disposal timed out`)), 5_000);
              }),
            ]);
          } finally {
            clearTimeout(disposeDeadline!);
            window.removeEventListener("message", onDisposed!);
            window.removeEventListener("message", listener);
            frame.remove();
          }
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
      console.info(`Renderer parity: ${engine} warm initialization`);
      const warm = await harness(engine);
      const reusedResults: { svg?: string; error?: string }[] = [];
      for (const source of sources) {
        console.info(`Renderer parity: ${engine} warm render ${sources.indexOf(source)}`);
        reusedResults.push(await warm.render(source));
      }
      await warm.dispose();
      // Compare the captured warm results with fresh workers sequentially. Two
      // complete TeaVM heaps need not coexist to verify identical output.
      for (const [index, source] of sources.entries()) {
        const reused = reusedResults[index]!;
        console.info(`Renderer parity: ${engine} fresh initialization`);
        const fresh = await harness(engine);
        console.info(`Renderer parity: ${engine} fresh render`);
        const reference = await fresh.render(source);
        output.push({
          engine,
          source,
          equal: reused.svg === reference.svg && !!reused.svg,
          error: reused.error ?? reference.error,
        });
        await fresh.dispose();
      }
    }
    return output;
  });
  for (const comparison of comparisons) {
    expect(comparison.error, comparison.source).toBeUndefined();
    expect(comparison.equal, `${comparison.engine}: ${comparison.source}`).toBe(true);
  }
});
