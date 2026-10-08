/* global document */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const output = process.argv[2] ?? "test-results/ui-cleanup";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto("http://127.0.0.1:5173");
  const welcome = page.getByRole("dialog", { name: "Welcome to PlantUML Ultimate" });
  await welcome.waitFor();
  await welcome.getByRole("radio", { name: "Diagram + code" }).check();
  await welcome.getByRole("button", { name: "Get started" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Gantt diagram" })
    .click();
  await page.locator(".diagram svg").waitFor({ timeout: 45000 });
  const close = page.getByRole("button", { name: "Close project inspector" });
  if (await close.isVisible()) await close.click();
  const measurements = [];
  for (const theme of ["light", "dark"]) {
    await page.locator(".app").evaluate((app, value) => (app.dataset.theme = value), theme);
    for (const width of [1280, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.screenshot({ path: `${output}/gantt-${theme}-${width}.png` });
      measurements.push({
        theme,
        width,
        toolbars: await page.locator(".toolbar").evaluateAll((toolbars) =>
          toolbars.map((toolbar) => ({
            toolbarWidth: toolbar.clientWidth,
            contentWidth: toolbar.scrollWidth,
            documentWidth: document.documentElement.scrollWidth,
          })),
        ),
      });
    }
  }
  for (const kind of ["Sequence", "WBS"]) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole("button", { name: "New diagram tab" }).click();
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: `${kind} diagram` })
      .click();
    const preview =
      kind === "Sequence"
        ? page.getByRole("region", { name: "Sequence diagram preview" })
        : page.locator(".wbs-preview");
    await preview.locator("svg").first().waitFor({ timeout: 45000 });
    if (kind === "Sequence") await page.locator("[data-sequence-drag-hit]").first().click();
    else {
      await page
        .getByRole("button", { name: /^Select WBS node / })
        .first()
        .focus();
      await page.keyboard.press("Enter");
    }
    const panel = page.locator(".task-inspector:visible");
    await panel.waitFor();
    for (const theme of ["light", "dark"]) {
      await page.locator(".app").evaluate((app, value) => (app.dataset.theme = value), theme);
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 800 });
        await page.screenshot({ path: `${output}/${kind.toLowerCase()}-properties-${theme}-${width}.png` });
      }
    }
    await panel.locator('header button[aria-label^="Close"]').click();
  }
  await writeFile(`${output}/measurements.json`, JSON.stringify(measurements, null, 2));
  console.log(JSON.stringify(measurements));
} finally {
  await browser.close();
}
