import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { prepareEditor, readEditorSource } from "./editor-helpers";

async function openAppSettings(page: Parameters<typeof prepareEditor>[0]) {
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Settings…", exact: true }).click();
  return page.getByRole("dialog", { name: "Settings", exact: true });
}
async function openDocumentSettings(page: Parameters<typeof prepareEditor>[0]) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Document settings…", exact: true }).click();
  return page.getByRole("dialog", { name: "Document settings", exact: true });
}

test("compares actual theme thumbnails, cancels drafts and applies authored appearance", async ({ page }) => {
  await prepareEditor(page);
  const source = await readEditorSource(page);
  let dialog = await openDocumentSettings(page);
  const gallery = dialog.getByRole("group", { name: "Featured themes" });
  await expect(gallery.locator("img")).toHaveCount(6, { timeout: 30000 });
  await gallery.getByRole("button", { name: "cerulean", exact: true }).click();
  await expect(gallery.getByRole("button", { name: "cerulean", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await readEditorSource(page)).toBe(source);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await readEditorSource(page)).toBe(source);
  dialog = await openDocumentSettings(page);
  // Cache is immediately reusable on reopening; no thumbnail requests are pending.
  await expect(dialog.locator(".theme-thumbnail img")).toHaveCount(6);
  await expect(dialog.getByLabel("PlantUML theme", { exact: true })).toHaveValue("");
  await dialog.getByLabel("PlantUML theme", { exact: true }).selectOption("blueprint");
  await expect
    .poll(() =>
      dialog
        .getByLabel("Theme preview")
        .locator("svg")
        .evaluate((element) => element.outerHTML),
    )
    .toContain("#003153");
  await dialog.locator(".theme-picker").screenshot({ path: "test-results/a20-gallery.png" });
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).toContain("!theme blueprint");
  await expect
    .poll(() => page.locator(".diagram-svg-host svg").evaluate((element) => element.outerHTML))
    .toContain("#003153");
  await page.locator('[data-task-id="architecture"] .bar').click();
  await expect(page.locator('[data-task-id="architecture"]')).toHaveAttribute("data-selected", "true");
});

test("keeps preview adaptation separate from authored source and export", async ({ page }) => {
  await prepareEditor(page);
  const source = await readEditorSource(page);
  let dialog = await openAppSettings(page);
  await dialog.getByLabel("Theme", { exact: true }).selectOption("dark");
  await dialog.getByLabel("Adapt preview to app theme", { exact: true }).check();
  await dialog.getByLabel("Default diagram theme", { exact: true }).selectOption("minty");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".preview-viewport .diagram").first()).toHaveCSS("filter", "brightness(0.82)");
  expect(await readEditorSource(page)).toBe(source);
  await expect(page.locator(".preview-viewport .diagram").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.locator('[data-task-id="architecture"] .bar').click();
  await expect(page.locator('[data-task-id="architecture"]')).toHaveAttribute("data-selected", "true");
  await expect(page.locator('[data-task-id="architecture"] [data-dependency-handle]')).toHaveCount(2);
  await page.locator(".preview-viewport .diagram").first().screenshot({ path: "test-results/a20-dark-preview.png" });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export", exact: true }).hover();
  await page
    .getByRole("menu", { name: "Export", exact: true })
    .getByRole("menuitem", { name: "SVG", exact: true })
    .click();
  const path = await (await downloadPromise).path();
  const svg = readFileSync(path!, "utf8");
  expect(svg).not.toContain("brightness(0.82)");
  expect(svg).not.toContain("!theme minty");
  dialog = await openAppSettings(page);
  await expect(dialog.getByLabel("Adapt preview to app theme", { exact: true })).toBeChecked();
  await dialog.getByLabel("Adapt preview to app theme", { exact: true }).uncheck();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".preview-viewport .diagram").first()).toHaveCSS("filter", "brightness(0.82)");
  await page.reload();
  await expect(page.locator(".preview-viewport .diagram").first()).toHaveCSS("filter", "brightness(0.82)");
  expect(await readEditorSource(page)).toBe(source);
  await page.keyboard.press("ControlOrMeta+n");
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram", exact: true })
    .click();
  await expect.poll(() => readEditorSource(page)).toContain("!theme minty");
  dialog = await openAppSettings(page);
  await dialog.getByLabel("Theme", { exact: true }).selectOption("light");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".preview-viewport .diagram").first()).toHaveCSS("filter", "none");
  dialog = await openAppSettings(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const gallery = dialog.getByRole("group", { name: "Featured themes" });
  await gallery.scrollIntoViewIfNeeded();
  await gallery.getByRole("button", { name: "plain", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(gallery.getByRole("button", { name: "plain", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(gallery.locator("img")).toHaveCount(6, { timeout: 30000 });
  await gallery.screenshot({ path: "test-results/a20-gallery-phone.png" });
});

test("renders curated sample galleries for all seven diagram families", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Cross-browser interactions are covered by the two journeys above.");
  test.setTimeout(90000);
  await page.goto("/");
  for (const kind of ["Gantt", "WBS", "Sequence", "Use Case", "Class", "Component", "Activity"]) {
    const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
    await chooser.getByRole("button", { name: `${kind} diagram`, exact: true }).click();
    // Gantt creation opens its project inspector; dismiss before opening a modal.
    if (kind === "Gantt") await page.keyboard.press("Escape");
    const dialog = await openDocumentSettings(page);
    await expect(dialog.locator(".theme-thumbnail img")).toHaveCount(6, { timeout: 30000 });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.keyboard.press("ControlOrMeta+n");
  }
});
