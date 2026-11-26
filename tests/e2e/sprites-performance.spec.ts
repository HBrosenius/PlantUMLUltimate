import { expect, test, type Page } from "./coverage";
import { fillSource, prepareEditor } from "./editor-helpers";
import { c4Fixture, componentFixture } from "./sprite-fixtures";

/**
 * Many icons in one diagram. Two jobs:
 *
 * - a regression bound: 20 distinct 48x48 sprites must render well inside the render timeout in every browser
 *   (the bound is generous so it catches a return of the multi-second-per-icon cost without flaking);
 * - a repeatable benchmark: `SPRITE_BENCH=1 npx playwright test sprites-performance --workers=1` renders 1, 20 and
 *   40 icons warm (component and C4 fixtures) and prints one JSON line per run with the time of each phase
 *   (`SPRITE_BENCH {...}`). Phases come from the preview's own `plantuml:preview:*` performance measures.
 */
async function createC4(page: Page) {
  await page.getByRole("button", { name: "New diagram tab", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Choose a diagram type" });
  await dialog.getByRole("button", { name: "C4 diagram", exact: true }).click();
  await dialog.getByRole("button", { name: "Create diagram", exact: true }).click();
  await expect(dialog).toBeHidden();
}

interface Run {
  endToEndMs: number;
  phases: Record<string, number>;
  images: number;
  svgChars: number;
}

/** Fills the source, waits until `expected` PNG images are in the preview and painted, and reads the phase marks. */
async function renderAndMeasure(page: Page, source: string, expected: number, marker: string): Promise<Run> {
  await page.evaluate(() => {
    performance.clearMeasures();
  });
  await page.evaluate(() => {
    (window as unknown as { __t0: number }).__t0 = performance.now();
  });
  await fillSource(page, source);
  return page.evaluate(
    ([count, marker]) =>
      new Promise<Run>((resolve, reject) => {
        const deadline = performance.now() + 40_000;
        const images = () =>
          [...document.querySelectorAll(".diagram svg image")].filter((image) =>
            image.getAttribute("href")?.startsWith("data:image/png;base64,"),
          ).length;
        const check = () => {
          if (images() >= count && document.querySelector(".diagram svg")?.textContent?.includes(marker)) {
            // Two frames: the change has been laid out and painted.
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                const phases: Record<string, number> = {};
                const inserted = (window as unknown as { __t0: number }).__t0;
                const marks = performance
                  .getEntriesByType("measure")
                  .filter((entry) => entry.name.startsWith("plantuml:preview:"));
                // The clock starts when the app sees the edit, not when the test starts typing: putting a large
                // source into the editor is its own cost, kept apart as `typingMs`.
                const edit = marks.find((entry) => entry.name.endsWith(":edit-to-post"))?.startTime ?? inserted;
                for (const entry of marks) {
                  const key = entry.name.slice("plantuml:preview:".length);
                  phases[key] = Math.round(entry.duration * 10) / 10;
                  phases[`@${key}`] = Math.round(entry.startTime + entry.duration - edit);
                }
                phases.typingMs = Math.round(edit - inserted);
                resolve({
                  endToEndMs: Math.round(performance.now() - edit),
                  phases,
                  images: images(),
                  svgChars: document.querySelector(".diagram svg")?.outerHTML.length ?? 0,
                });
              }),
            );
            return;
          }
          if (performance.now() > deadline)
            reject(
              new Error(
                `Timed out with ${images()} of ${count} images; text: ${document.querySelector(".diagram svg")?.textContent?.slice(0, 200)}; status: ${document.querySelector(".statusbar")?.textContent}; notice: ${document.querySelector(".render-notice")?.textContent}; editor: ${document.querySelector(".cm-content")?.textContent?.slice(0, 60)}`,
              ),
            );
          else setTimeout(check, 50);
        };
        check();
      }),
    [expected, marker] as const,
  );
}

async function warmUp(page: Page) {
  await renderAndMeasure(page, componentFixture(1).replace("@startuml", "@startuml\ntitle Warmup"), 1, "Warmup");
}

const withTitle = (source: string, run: number) => source.replace("@startuml", `@startuml\ntitle Run${run}`);

test("20 distinct icons render in a bounded time", async ({ page, browserName }) => {
  test.setTimeout(240_000);
  await prepareEditor(page);
  await createC4(page);
  await warmUp(page);
  const run = await renderAndMeasure(page, withTitle(componentFixture(20), 1), 20, "Run1");
  console.log(`SPRITE_BENCH ${JSON.stringify({ browserName, fixture: "component", icons: 20, ...run })}`);
  await expect(page.locator(".render-notice.error")).toHaveCount(0);
  // From the app seeing the edit (not from the test typing 12 KB of rows into the editor, which takes WebKit 10 s
  // or more on its own) to the painted preview, warm: about 0.5 s in Chromium and 1.3 s in WebKit. The bound is far
  // above that and well under the 30 s render timeout, so it catches a return of a per-icon cost without flaking.
  expect(run.endToEndMs).toBeLessThan(10_000);
  // Real deflate keeps 20 icons at about 280 KB of SVG; stored (uncompressed) blocks made it about 600 KB.
  expect(run.svgChars).toBeLessThan(450_000);
});

test.describe("benchmark", () => {
  test.skip(!process.env.SPRITE_BENCH, "Set SPRITE_BENCH=1 to run the icon benchmark");
  const fixtures = [
    ["component", componentFixture],
    ["c4", c4Fixture],
  ] as const;
  for (const [name, build] of fixtures)
    for (const icons of [1, 20, 40])
      test(`${name} ${icons} icons`, async ({ page, browserName }) => {
        test.setTimeout(600_000);
        await prepareEditor(page);
        await createC4(page);
        await warmUp(page);
        const runs = Number(process.env.SPRITE_BENCH_RUNS) || 3;
        for (let run = 1; run <= runs; run++) {
          const result = await renderAndMeasure(page, withTitle(build(icons), run), icons, `Run${run}`);
          console.log(`SPRITE_BENCH ${JSON.stringify({ browserName, fixture: name, icons, run, ...result })}`);
        }
        await expect(page.locator(".render-notice.error")).toHaveCount(0);
      });

  test("encoder micro-benchmark", async ({ page, browserName }) => {
    test.setTimeout(120_000);
    await prepareEditor(page);
    const result = await page.evaluate(async () => {
      const path = "/src/render/sprite-canvas.ts";
      const { encodePng, pngDataUrl } = (await import(
        path
      )) as typeof import("../../apps/web/src/render/sprite-canvas");
      const images = Array.from({ length: 20 }, (_, n) => {
        const rgba = new Uint8ClampedArray(48 * 48 * 4);
        for (let i = 0; i < 48 * 48; i++) {
          const gray = (((i % 48) * (n + 3) + Math.floor(i / 48) * 5) % 16) * 17;
          rgba.set([gray, gray, gray, 255], i * 4);
        }
        return rgba;
      });
      const time = (run: () => unknown) => {
        const start = performance.now();
        for (let i = 0; i < 5; i++) run();
        return Math.round(((performance.now() - start) / 5) * 100) / 100;
      };
      let pngBytes = 0;
      const encode = () => images.forEach((rgba) => (pngBytes = encodePng(48, 48, rgba).length));
      let urlChars = 0;
      const full = () => images.forEach((rgba) => (urlChars = pngDataUrl(48, 48, rgba).length));
      encode();
      full();
      return { encode20Ms: time(encode), encodeAndBase64For20Ms: time(full), pngBytes, urlChars };
    });
    console.log(`SPRITE_BENCH ${JSON.stringify({ browserName, fixture: "encoder", ...result })}`);
  });

  // The font atlas of a sprite-heavy source, measured twice: the second time every text is cached, so what is left
  // is the cost of scanning the source itself (sprite rows included) rather than of measuring text.
  test("font atlas scan cost", async ({ page, browserName }) => {
    test.setTimeout(120_000);
    await prepareEditor(page);
    const text = componentFixture(20);
    const result = await page.evaluate(async (source) => {
      const path = "/src/render/font-atlas.ts";
      const { buildFontAtlas } = (await import(path)) as typeof import("../../apps/web/src/render/font-atlas");
      const time = async (value: string) => {
        const start = performance.now();
        await buildFontAtlas(value);
        return Math.round(performance.now() - start);
      };
      const cold = await time(source);
      const cached = await time(source);
      const withoutRows = await time(source.replace(/^[0-9A-F]{40,}$/gm, ""));
      return { coldMs: cold, cachedMs: cached, cachedWithoutSpriteRowsMs: withoutRows };
    }, text);
    console.log(`SPRITE_BENCH ${JSON.stringify({ browserName, fixture: "atlas-scan", ...result })}`);
  });

  // Putting a source with 20 inline sprites (about 1,000 lines of hex rows) into the editor is a cost of its own,
  // before any rendering: the time CodeMirror's transaction takes on the main thread.
  test("editor input cost", async ({ page, browserName }) => {
    test.setTimeout(300_000);
    await prepareEditor(page);
    await createC4(page);
    await warmUp(page);
    const text = withTitle(componentFixture(20), 9);
    const result = await page.evaluate(async (insert) => {
      const modulePath = "/node_modules/.vite/deps/@codemirror_view.js";
      const { EditorView } = await import(modulePath);
      const view = EditorView.findFromDOM(document.querySelector(".cm-editor"))!;
      const start = performance.now();
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert } });
      const dispatchMs = performance.now() - start;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { dispatchMs: Math.round(dispatchMs), untilPaintMs: Math.round(performance.now() - start) };
    }, text);
    console.log(`SPRITE_BENCH ${JSON.stringify({ browserName, fixture: "editor-dispatch", ...result })}`);
  });
});
