import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { expect, test } from "./coverage";
import { prepareEditor, setSource, source } from "./editor-helpers";

const percent = async (zoom: import("@playwright/test").Locator) => Number.parseInt((await zoom.textContent())!, 10);

test("exports a self-contained snapshot that opens offline with pan and zoom", async ({
  page,
  context,
  browser,
}, testInfo) => {
  await prepareEditor(page);
  await setSource(page, source("[Design] requires 5 days\n[Build] requires 8 days\n[Build] starts at [Design]'s end"));

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menu", { name: "Export" }).getByRole("menuitem", { name: "Snapshot (HTML)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.snapshot\.html$/);
  // Playwright stores downloads under a GUID without an extension, which browsers would show as plain text.
  const path = testInfo.outputPath(file.suggestedFilename());
  await file.saveAs(path);
  const html = readFileSync(path, "utf8");
  expect(html).toContain("Content-Security-Policy");
  expect(html).not.toContain("@startgantt");

  const viewer = await context.newPage();
  const fileUrl = pathToFileURL(path).href;
  const requests: string[] = [];
  viewer.on("request", (request) => requests.push(request.url()));
  const pageErrors: string[] = [];
  viewer.on("pageerror", (error) => pageErrors.push(error.message));
  await viewer.goto(fileUrl);

  await expect(viewer.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(viewer.getByText("Source SHA-256")).toBeVisible();
  await expect(viewer.getByText("Made with PlantUML Ultimate")).toBeVisible();
  const svg = viewer.locator("#snapshot-stage svg");
  await expect(svg).toBeVisible();
  await expect(svg.locator("text").first()).toBeAttached();

  const zoom = viewer.locator("#snapshot-zoom");
  await expect(viewer.getByRole("button", { name: "Zoom in" })).toBeVisible();
  const fitted = (await zoom.textContent())!;
  await viewer.getByRole("button", { name: "Zoom in" }).click();
  await expect(zoom).not.toHaveText(fitted);
  const zoomedIn = await percent(zoom);
  expect(zoomedIn).toBeGreaterThan(Number.parseInt(fitted, 10));
  await viewer.getByRole("button", { name: "Zoom out" }).click();
  await viewer.getByRole("button", { name: "Zoom out" }).click();
  expect(await percent(zoom)).toBeLessThan(zoomedIn);
  await viewer.keyboard.press("0");
  await expect(zoom).toHaveText(fitted);
  await viewer.keyboard.press("-");
  expect(await percent(zoom)).toBeLessThan(Number.parseInt(fitted, 10));
  await viewer.getByRole("button", { name: "Fit to view" }).click();
  await expect(zoom).toHaveText(fitted);

  const box = (await viewer.locator("#snapshot-stage").boundingBox())!;
  const before = (await svg.boundingBox())!;
  await viewer.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await viewer.mouse.down();
  await viewer.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 4 });
  await viewer.mouse.up();
  const after = (await svg.boundingBox())!;
  expect(Math.round(after.x - before.x)).toBe(40);

  expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(requests.filter((url) => url !== fileUrl)).toEqual([]);

  const phone = await context.newPage();
  await phone.setViewportSize({ width: 375, height: 700 });
  await phone.goto(fileUrl);
  await expect(phone.locator("#snapshot-stage svg")).toBeVisible();
  expect(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await phone.close();

  const plain = await browser.newContext({ javaScriptEnabled: false });
  const noScript = await plain.newPage();
  await noScript.goto(fileUrl);
  await expect(noScript.locator("#snapshot-stage svg")).toBeVisible();
  await expect(noScript.getByRole("heading", { level: 1 })).toBeVisible();
  await plain.close();
});
