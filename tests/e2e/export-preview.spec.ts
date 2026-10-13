import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fillSource, prepareEditor, readEditorSource, waitForDiagramRender } from "./editor-helpers";
async function open(page: Parameters<typeof prepareEditor>[0], name: string) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
test("guides an oversized raster export to a lower scale or SVG without changing source", async ({ page }) => {
  test.setTimeout(90_000);
  await page.route("**/__renderer_assets__/canonical.worker.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `
      addEventListener("message", event => {
        if (event.data?.type === "render" && event.data.renderSource?.includes("LARGE_EXPORT_TEST")) {
          event.stopImmediatePropagation();
          postMessage({ type: "result", requestId: event.data.requestId, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="8200" height="1000" viewBox="0 0 8200 1000"><text x="10" y="30">Large export fixture</text></svg>' });
        }
      }, true);
      ${await response.text()}`,
    });
  });
  await prepareEditor(page);
  const source = "@startgantt\n[LARGE_EXPORT_TEST] lasts 2 days\n@endgantt";
  await fillSource(page, source);
  await waitForDiagramRender(page);
  await open(page, "Preview export…");
  const dialog = page.getByRole("dialog", { name: "Export preview", exact: true });
  await dialog.getByRole("combobox", { name: "Format", exact: true }).selectOption("png");
  await dialog.getByRole("combobox", { name: "Raster scale" }).selectOption("2");
  await expect(dialog.getByRole("alert", { name: "Image export size limit" })).toContainText("Choose 1×");
  await expect(dialog.getByRole("button", { name: "Download PNG" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Use 1× scale" }).click();
  await expect(dialog.getByRole("button", { name: "Download PNG" })).toBeEnabled();
  for (const format of ["png", "pdf"]) {
    await dialog.getByRole("combobox", { name: "Format", exact: true }).selectOption(format);
    const largeDownload = page.waitForEvent("download");
    await dialog.getByRole("button", { name: `Download ${format.toUpperCase()}` }).click();
    const bytes = readFileSync((await (await largeDownload).path())!);
    if (format === "png") {
      expect(bytes.readUInt32BE(16)).toBe(8232);
      expect(bytes.readUInt32BE(20)).toBe(1032);
    } else {
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect(bytes.toString("latin1")).toContain("/Width 8232 /Height 1032");
    }
  }
  await dialog.getByRole("combobox", { name: "Raster scale" }).selectOption("3");
  await dialog.getByRole("combobox", { name: "Format", exact: true }).selectOption("pdf");
  await expect(dialog.getByRole("button", { name: "Download PDF" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Switch to SVG" }).click();
  const downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download SVG" }).click();
  expect(readFileSync((await (await downloaded).path())!, "utf8")).toContain("Large export fixture");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  expect(await readEditorSource(page)).toBe(source);
});

test("recovers from an image encoding failure and retries without losing the document", async ({ page }) => {
  await prepareEditor(page);
  await waitForDiagramRender(page);
  const source = await readEditorSource(page);
  await open(page, "Preview export…");
  const dialog = page.getByRole("dialog", { name: "Export preview", exact: true });
  await dialog.getByRole("combobox", { name: "Format", exact: true }).selectOption("png");
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      HTMLCanvasElement.prototype.toBlob = original;
      callback(null);
    };
  });
  await dialog.getByRole("button", { name: "Download PNG" }).click();
  await expect(dialog).toContainText("Could not create image");
  await expect(dialog.getByRole("button", { name: "Download PNG" })).toBeEnabled();
  const downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download PNG" }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.png$/);
  await expect(dialog).toContainText("Exported local file");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  expect(await readEditorSource(page)).toBe(source);
});
test("renders edited Code-view source before allowing an image download", async ({ page }) => {
  test.setTimeout(90_000);
  await prepareEditor(page);
  await waitForDiagramRender(page);
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await fillSource(page, "@startgantt\n[Latest export revision] lasts 3 days\n@endgantt");
  await open(page, "Preview export…");
  const dialog = page.getByRole("dialog", { name: "Export preview", exact: true });
  for (const format of ["svg", "png", "pdf"]) {
    await dialog.getByRole("combobox", { name: "Format", exact: true }).selectOption(format);
    await expect(dialog.getByRole("button", { name: `Download ${format.toUpperCase()}` })).toBeDisabled();
  }
  await dialog.getByRole("button", { name: "Render current source" }).click();
  await expect(dialog.getByText("Preview matches the current successfully rendered source.")).toBeVisible({
    timeout: 45_000,
  });
  await dialog.getByRole("combobox", { name: "Format", exact: true }).selectOption("svg");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download SVG" }).click();
  expect(readFileSync((await (await download).path())!, "utf8")).toContain("Latest export revision");
});

test("explains failed renders and disables every image format while retaining the previous preview", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await prepareEditor(page);
  await waitForDiagramRender(page);
  await fillSource(page, "@startgantt\n[Broken] starts nope\n@endgantt");
  await expect(page.locator(".preview")).toHaveAttribute("data-render-status", "error", { timeout: 45_000 });
  await open(page, "Preview export…");
  const dialog = page.getByRole("dialog", { name: "Export preview", exact: true });
  await expect(dialog).toContainText("The image below is the last successful diagram");
  await expect(dialog.getByRole("alert")).toBeVisible();
  for (const format of ["svg", "png", "pdf"]) {
    await dialog.getByRole("combobox", { name: "Format", exact: true }).selectOption(format);
    await expect(dialog.getByRole("button", { name: `Download ${format.toUpperCase()}` })).toBeDisabled();
  }
  await dialog.getByRole("button", { name: "Retry rendering" }).click();
  await expect(dialog.getByRole("button", { name: "Retry rendering" })).toBeVisible({ timeout: 45_000 });
  await expect(dialog.getByRole("button", { name: "Download PDF" })).toBeDisabled();
});
test("previews and downloads all formats, remembers preferences and preserves source", async ({ page }) => {
  await prepareEditor(page);
  await waitForDiagramRender(page);
  const source = await readEditorSource(page);
  await open(page, "Preview export…");
  const dialog = page.getByRole("dialog", { name: "Export preview", exact: true });
  await expect(dialog.getByRole("img")).toBeVisible();
  await dialog.getByRole("combobox", { name: "Margin", exact: true }).selectOption("32");
  await dialog.getByRole("combobox", { name: "Background", exact: true }).selectOption("white");
  for (const format of ["svg", "png", "pdf"]) {
    await dialog.getByRole("combobox", { name: "Format", exact: true }).selectOption(format);
    const downloaded = page.waitForEvent("download");
    await dialog.getByRole("button", { name: `Download ${format.toUpperCase()}`, exact: true }).click();
    const file = await downloaded;
    expect(file.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));
    const bytes = readFileSync((await file.path())!);
    if (format === "svg") expect(bytes.toString()).toContain('fill="#ffffff"');
    if (format === "png") expect(bytes.subarray(1, 4).toString()).toBe("PNG");
    if (format === "pdf") expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  }
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  expect(await readEditorSource(page)).toBe(source);
  await open(page, "Preview export…");
  await expect(dialog.getByRole("combobox", { name: "Margin", exact: true })).toHaveValue("32");
  await expect(dialog.getByRole("combobox", { name: "Format", exact: true })).toHaveValue("pdf");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeInViewport();
  await page.screenshot({ path: "test-results/a25-export-phone.png" });
});
test("generates disclosed source links locally without contacting renderer", async ({ page }) => {
  await prepareEditor(page);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("example.com")) requests.push(request.url());
  });
  await open(page, "Link and embed…");
  const dialog = page.getByRole("dialog", { name: "Link and embed sharing", exact: true });
  await dialog.getByLabel("Renderer base URL", { exact: true }).fill("https://example.com/plantuml");
  await expect(dialog.getByRole("button", { name: "Generate link locally" })).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Generate link locally" }).click();
  await expect(dialog.getByLabel("Encoded image URL", { exact: true })).toHaveValue(
    /^https:\/\/example.com\/plantuml\/svg\/~h/,
  );
  await expect(dialog.getByLabel("Markdown image", { exact: true })).toHaveValue(/^!\[Diagram\]\(https:/);
  expect(requests).toEqual([]);
  await page.screenshot({ path: "test-results/a25-share.png" });
  await dialog.getByLabel("Renderer base URL", { exact: true }).fill("http://example.com");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Generate link locally" }).click();
  await expect(dialog.getByRole("status")).toContainText("HTTPS");
  await expect(dialog.getByLabel("Encoded image URL", { exact: true })).toHaveCount(0);
});
