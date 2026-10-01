import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { prepareEditor, setSource, source } from "./editor-helpers";

const diagram = source("[Design] requires 5 days");

async function openExportMenu(page: Page) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export" }).click();
  return page.getByRole("menu", { name: "Export" });
}

test("copies the source as a fenced Markdown block", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Clipboard permissions can only be granted in Chromium");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await prepareEditor(page);
  await setSource(page, diagram);

  const menu = await openExportMenu(page);
  await menu.getByRole("menuitem", { name: "Copy as Markdown" }).click();

  await expect(page.getByText("Copied source as Markdown")).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe("```plantuml\n" + diagram + "\n```");
});

test("downloads the diagram as a PDF", async ({ page }) => {
  await prepareEditor(page);
  await setSource(page, diagram);

  const menu = await openExportMenu(page);
  const download = page.waitForEvent("download");
  await menu.getByRole("menuitem", { name: "PDF" }).click();
  const pdf = await download;

  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  const bytes = readFileSync((await pdf.path())!);
  expect(bytes.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
  expect(bytes.subarray(-6).toString("latin1")).toBe("%%EOF\n");
});

test("copies the rendered diagram as a PNG image", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Clipboard permissions can only be granted in Chromium");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await prepareEditor(page);
  await setSource(page, diagram);

  const menu = await openExportMenu(page);
  await menu.getByRole("menuitem", { name: "Copy image" }).click();

  await expect(page.getByText("Copied diagram image")).toBeVisible();
  const types = await page.evaluate(async () => (await navigator.clipboard.read()).flatMap((item) => item.types));
  expect(types).toContain("image/png");
});
