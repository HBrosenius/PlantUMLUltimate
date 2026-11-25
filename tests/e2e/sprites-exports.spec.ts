import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "./coverage";
import { fillSource, prepareEditor, waitForDiagramRender } from "./editor-helpers";

/**
 * Every way a diagram leaves the app (SVG, PNG, PDF, copied image, snapshot) must carry the engine's raster
 * sprites as `data:image/png` images, and nothing else: no remote image, no other data type, no request.
 */
async function createC4(page: Page) {
  await page.getByRole("button", { name: "New diagram tab", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Choose a diagram type" });
  await dialog.getByRole("button", { name: "C4 diagram", exact: true }).click();
  await dialog.getByRole("button", { name: "Create diagram", exact: true }).click();
  await expect(dialog).toBeHidden();
}

const gray = Array.from({ length: 8 }, (_, y) =>
  Array.from({ length: 8 }, (_, x) => "048CF"[(x + y) % 5]).join(""),
).join("\n");

const sprites = [
  "@startuml",
  "!include <C4/C4_Container>",
  `sprite $gray [8x8/16] {\n${gray}\n}`,
  'Person(user, "Customer", "Buys things")',
  'Container(web, "Web app", "TypeScript", $sprite="gray")',
  'Rel(user, web, "Uses")',
  "@enduml",
].join("\n");

const pngImageCount = (page: Page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll(".diagram svg image")].filter((image) =>
        image.getAttribute("href")?.startsWith("data:image/png;base64,"),
      ).length,
  );

async function renderSprites(page: Page) {
  await prepareEditor(page);
  await createC4(page);
  await fillSource(page, sprites);
  // The person icon and the 8x8 grayscale sprite.
  await expect.poll(() => pngImageCount(page), { timeout: 45_000 }).toBe(2);
  await waitForDiagramRender(page);
}

async function exportMenu(page: Page) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export", exact: true }).click();
  return page.getByRole("menu", { name: "Export" });
}

/** Every `<image>` in an SVG string, with its href and PNG width (read from the IHDR chunk). */
function imagesIn(svg: string) {
  return [...svg.matchAll(/<image\b[^>]*>/g)].map((match) => {
    const tag = match[0];
    const href = /\s(?:xlink:)?href="([^"]*)"/.exec(tag)?.[1] ?? "";
    const png = href.startsWith("data:image/png;base64,") ? Buffer.from(href.split(",")[1]!, "base64") : undefined;
    return {
      href,
      pngWidth: png && png.subarray(1, 4).toString() === "PNG" ? png.readUInt32BE(16) : undefined,
    };
  });
}

function expectOnlyPngImages(svg: string) {
  const images = imagesIn(svg);
  expect(images).toHaveLength(2);
  for (const image of images) expect(image.href).toMatch(/^data:image\/png;base64,/);
  // The 8x8 sprite (the engine pads it by a pixel) and the larger C4 person icon.
  const widths = images.map((image) => image.pngWidth!).sort((a, b) => a - b);
  expect(widths[0]).toBeGreaterThanOrEqual(8);
  expect(widths[0]).toBeLessThanOrEqual(10);
  expect(widths[1]).toBeGreaterThan(widths[0]!);
  expect(svg).not.toMatch(/(?:href|src)="(?:https?:|\/\/|file:|blob:)/i);
}

/**
 * Draws `bytes` (an SVG, PNG or JPEG) on a canvas in the app page and counts the distinct colours inside each
 * sprite's rectangle. A drawn sprite has several grey levels; a missing or blank one has one or two.
 * `reference` is the exported SVG; it supplies the sprite positions at scale 1.
 */
async function spriteColours(page: Page, bytes: Buffer, type: string, reference: string, scale: number) {
  return page.evaluate(
    async ({ base64, type, reference, scale }) => {
      const host = document.createElement("div");
      host.style.cssText = "position:fixed;left:0;top:0;opacity:0;pointer-events:none";
      host.innerHTML = reference;
      document.body.append(host);
      const svgRect = host.querySelector("svg")!.getBoundingClientRect();
      const rects = [...host.querySelectorAll("image")].map((image) => {
        const box = image.getBoundingClientRect();
        return { box, x: box.left - svgRect.left, y: box.top - svgRect.top };
      });
      host.remove();
      const raw = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      // createImageBitmap cannot decode SVG, so every type goes through an <img>.
      const url = URL.createObjectURL(new Blob([raw], { type }));
      const source = new Image();
      source.src = url;
      await source.decode();
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = source.naturalWidth;
      canvas.height = source.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(source, 0, 0);
      return {
        width: source.naturalWidth,
        height: source.naturalHeight,
        sprites: rects.map((rect) => {
          const w = Math.max(1, Math.round(rect.box.width * scale));
          const h = Math.max(1, Math.round(rect.box.height * scale));
          const data = context.getImageData(Math.round(rect.x * scale), Math.round(rect.y * scale), w, h).data;
          const colours = new Set<string>();
          // Skip the outer ring; antialiasing at the edge is not the sprite.
          for (let y = Math.floor(h / 4); y < h - Math.floor(h / 4); y++)
            for (let x = Math.floor(w / 4); x < w - Math.floor(w / 4); x++) {
              const i = (y * w + x) * 4;
              colours.add(`${data[i]! >> 4},${data[i + 1]! >> 4},${data[i + 2]! >> 4}`);
            }
          return colours.size;
        }),
      };
    },
    { base64: bytes.toString("base64"), type, reference, scale },
  );
}

test("SVG, PNG and PDF exports carry both sprites", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) requests.push(new URL(request.url()).hostname);
  });
  await renderSprites(page);

  let menu = await exportMenu(page);
  let download = page.waitForEvent("download");
  await menu.getByRole("menuitem", { name: "Quick download SVG" }).click();
  const svgFile = testInfo.outputPath("sprites.svg");
  await (await download).saveAs(svgFile);
  const svg = readFileSync(svgFile, "utf8");
  expectOnlyPngImages(svg);
  const fromSvg = await spriteColours(page, Buffer.from(svg), "image/svg+xml", svg, 1);
  expect(fromSvg.sprites).toHaveLength(2);
  for (const colours of fromSvg.sprites) expect(colours).toBeGreaterThan(2);

  menu = await exportMenu(page);
  download = page.waitForEvent("download");
  await menu.getByRole("menuitem", { name: "Quick download PNG" }).click();
  const pngFile = testInfo.outputPath("sprites.png");
  await (await download).saveAs(pngFile);
  const png = readFileSync(pngFile);
  const fromPng = await spriteColours(page, png, "image/png", svg, 2);
  expect(fromPng.width).toBe(fromSvg.width * 2);
  for (const colours of fromPng.sprites) expect(colours).toBeGreaterThan(2);

  menu = await exportMenu(page);
  download = page.waitForEvent("download");
  await menu.getByRole("menuitem", { name: "Quick download PDF" }).click();
  const pdfFile = testInfo.outputPath("sprites.pdf");
  await (await download).saveAs(pdfFile);
  const pdf = readFileSync(pdfFile);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  // The PDF holds the diagram as one JPEG; check the sprites survived inside it.
  const start = pdf.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
  const end = pdf.lastIndexOf(Buffer.from([0xff, 0xd9]));
  expect(start).toBeGreaterThan(0);
  const fromPdf = await spriteColours(page, pdf.subarray(start, end + 2), "image/jpeg", svg, 2);
  for (const colours of fromPdf.sprites) expect(colours).toBeGreaterThan(2);

  expect(requests.filter((host) => host !== "127.0.0.1")).toEqual([]);
});

test("the export dialog's SVG keeps both sprites after its own sanitising step", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await renderSprites(page);
  const menu = await exportMenu(page);
  await menu.getByRole("menuitem", { name: "Export…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export preview", exact: true });
  await dialog.getByRole("combobox", { name: "Format", exact: true }).selectOption("svg");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download SVG" }).click();
  const file = testInfo.outputPath("dialog.svg");
  await (await download).saveAs(file);
  const svg = readFileSync(file, "utf8");
  // The dialog re-sanitizes the diagram (prepareExportSvg); the images must have passed through it.
  expectOnlyPngImages(svg);
  const reference = await spriteColours(page, Buffer.from(svg), "image/svg+xml", svg, 1);
  for (const colours of reference.sprites) expect(colours).toBeGreaterThan(2);
});

test("a snapshot embeds both sprites and opens offline without a request or a blocked image", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  await renderSprites(page);
  const menu = await exportMenu(page);
  await menu.getByRole("menuitem", { name: "Snapshot (HTML)" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("dialog", { name: "Snapshot (HTML)" }).getByRole("button", { name: "Create snapshot" }).click();
  const file = testInfo.outputPath("sprites.snapshot.html");
  await (await download).saveAs(file);
  const html = readFileSync(file, "utf8");
  expect(html).toContain("img-src data:");
  expectOnlyPngImages(html.slice(html.indexOf("<svg"), html.lastIndexOf("</svg>") + 6));

  const viewer = await context.newPage();
  const fileUrl = pathToFileURL(file).href;
  const requests: string[] = [];
  const problems: string[] = [];
  viewer.on("request", (request) => requests.push(request.url()));
  viewer.on("console", (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) problems.push(message.text());
  });
  await viewer.goto(fileUrl);
  await expect(viewer.locator("#snapshot-stage-1 svg image")).toHaveCount(2);
  // Both images decode inside the snapshot's own CSP.
  const decoded = await viewer.evaluate(async () =>
    Promise.all(
      [...document.querySelectorAll("#snapshot-stage-1 svg image")].map(async (image) => {
        const element = new Image();
        element.src = image.getAttribute("href") ?? image.getAttribute("xlink:href") ?? "";
        await element.decode();
        return element.naturalWidth;
      }),
    ),
  );
  expect(decoded.sort((a, b) => a - b)[0]).toBeGreaterThanOrEqual(8);
  expect(problems).toEqual([]);
  expect(requests.filter((url) => url !== fileUrl)).toEqual([]);
});

test("copy image puts both sprites on the clipboard", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Clipboard permissions can only be granted in Chromium");
  test.setTimeout(120_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await renderSprites(page);
  const menu = await exportMenu(page);
  await menu.getByRole("menuitem", { name: "Copy image" }).click();
  await expect(page.getByText("Copied diagram image")).toBeVisible();
  const copied = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const blob = await item!.getType("image/png");
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  // The copy is the decorated preview SVG at 2x; sprite positions come from the same SVG at scale 1.
  const reference = await page.evaluate(() =>
    new XMLSerializer().serializeToString(document.querySelector(".diagram svg")!),
  );
  const fromClipboard = await spriteColours(page, Buffer.from(copied), "image/png", reference, 2);
  expect(fromClipboard.sprites).toHaveLength(2);
  for (const colours of fromClipboard.sprites) expect(colours).toBeGreaterThan(2);
});

test("remote and non-PNG images never reach an export", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) requests.push(new URL(request.url()).hostname);
  });
  await prepareEditor(page);
  await createC4(page);
  const svgData = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>').toString("base64");
  await fillSource(
    page,
    [
      "@startuml",
      `sprite $gray [8x8/16] {\n${gray}\n}`,
      'rectangle "<$gray> ok" as A',
      'rectangle "<img:https://example.invalid/tracker.png> remote" as B',
      `rectangle "<img:data:image/svg+xml;base64,${svgData}> svg" as C`,
      "A --> B",
      "B --> C",
      "@enduml",
    ].join("\n"),
  );
  await expect.poll(() => pngImageCount(page), { timeout: 45_000 }).toBe(1);
  await waitForDiagramRender(page);
  const menu = await exportMenu(page);
  const download = page.waitForEvent("download");
  await menu.getByRole("menuitem", { name: "Quick download SVG" }).click();
  const file = testInfo.outputPath("hostile.svg");
  await (await download).saveAs(file);
  const svg = readFileSync(file, "utf8");
  const images = imagesIn(svg);
  expect(images.length).toBeGreaterThan(0);
  for (const image of images) expect(image.href).toMatch(/^data:image\/png;base64,/);
  expect(svg).not.toContain("example.invalid");
  expect(svg).not.toContain("svg+xml");
  expect(requests.filter((host) => host !== "127.0.0.1")).toEqual([]);
});
