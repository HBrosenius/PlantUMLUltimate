import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fillSource, prepareEditor, readEditorSource, waitForDiagramRender } from "./editor-helpers";

const source = `@startgantt
!theme cerulean
Project starts 2026-09-01
[Build] as [build] on {Morgan} starts 2026-09-02
[Build] lasts 3 days
[Build] links to [[https://example.com Details]]
@endgantt`;
const key = "plantuml-studio.personal-starters.v1";
async function saveDialog(page: Parameters<typeof prepareEditor>[0]) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save as starter…", exact: true }).click();
  return page.getByRole("dialog", { name: "Save as personal starter", exact: true });
}
async function chooser(page: Parameters<typeof prepareEditor>[0]) {
  await page.getByRole("button", { name: "New diagram tab", exact: true }).click();
  return page.getByRole("dialog", { name: "Choose a diagram type", exact: true });
}
async function saveStarter(page: Parameters<typeof prepareEditor>[0]) {
  const dialog = await saveDialog(page);
  await dialog.getByLabel("Starter name", { exact: true }).fill("Release starter");
  await dialog.getByLabel("Description", { exact: true }).fill("Reusable delivery plan");
  await dialog.getByRole("button", { name: "Save starter", exact: true }).click();
  await expect(dialog).toBeHidden();
}

test("reviews reuse choices and creates an independent styled diagram without changing its starter or original", async ({
  page,
}) => {
  await prepareEditor(page);
  await fillSource(page, source);
  await waitForDiagramRender(page);
  await saveStarter(page);
  expect(await readEditorSource(page)).toBe(source);
  const create = await chooser(page);
  await create.getByRole("button", { name: "Review Release starter", exact: true }).click();
  const review = create.getByRole("region", { name: "Review starter content", exact: true });
  await expect(review).toContainText("Morgan");
  await expect(review).toContainText("https://example.com");
  await page.screenshot({ path: "test-results/a24-starter-review.png" });
  await review.getByLabel("Keep task resource assignments", { exact: true }).uncheck();
  await review.getByLabel("Keep task links", { exact: true }).uncheck();
  await review.getByLabel("New project start (optional)", { exact: true }).fill("2026-09-08");
  await review.getByRole("button", { name: "Create from starter", exact: true }).click();
  await expect(create).toBeHidden();
  await waitForDiagramRender(page);
  const created = await readEditorSource(page);
  expect(created).toContain("!theme cerulean");
  expect(created).toContain("Project starts 2026-09-08");
  expect(created).toContain("starts 2026-09-02");
  expect(created).not.toContain("Morgan");
  expect(created).not.toContain("https://example.com");
  const tabs = page.locator(".document-tabs > button:not(.new-tab)");
  await expect(tabs).toHaveCount(2);
  await page.getByRole("button", { name: "Close project inspector", exact: true }).click();
  await fillSource(page, created.replaceAll("Build", "Copy"));
  await tabs.nth(0).click();
  expect(await readEditorSource(page)).toBe(source);
  const saved = await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)!), key);
  expect(saved.starters[0].source).toBe(source);
});

test("exports source-only starters, rejects invalid imports atomically, imports and persists across reload", async ({
  page,
}) => {
  await prepareEditor(page);
  await fillSource(page, source);
  await saveStarter(page);
  let create = await chooser(page);
  const library = create.getByRole("region", { name: "Personal starters", exact: true });
  const downloadPromise = page.waitForEvent("download");
  await library.getByRole("button", { name: "Export starters", exact: true }).click();
  const download = await downloadPromise;
  const contents = readFileSync((await download.path())!, "utf8");
  expect(JSON.parse(contents).starters[0]).toEqual({
    title: "Release starter",
    description: "Reusable delivery plan",
    kind: "gantt",
    source,
  });
  await library
    .getByLabel("Import starter library", { exact: true })
    .setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from('{"version":99}') });
  await expect(library.getByRole("alert")).toBeVisible();
  await expect(library.getByRole("button", { name: "Review Release starter", exact: true })).toHaveCount(1);
  await library.getByRole("button", { name: "Remove starter Release starter", exact: true }).click();
  await expect(library).toContainText("No personal starters saved yet");
  await library
    .getByLabel("Import starter library", { exact: true })
    .setInputFiles({ name: "personal-starters.json", mimeType: "application/json", buffer: Buffer.from(contents) });
  await expect(library.getByRole("button", { name: "Review Release starter", exact: true })).toBeVisible();
  await create.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await readEditorSource(page)).toBe(source);
  await page.reload();
  await expect(page.locator(".cm-editor")).toBeVisible();
  create = await chooser(page);
  await expect(create.getByRole("button", { name: "Review Release starter", exact: true })).toBeVisible();
});

test("preserves source and library on cancellation, invalid edits and storage failure on a phone", async ({ page }) => {
  await prepareEditor(page);
  const original = await readEditorSource(page);
  await page.setViewportSize({ width: 390, height: 844 });
  let dialog = await saveDialog(page);
  await dialog.getByLabel("Starter name", { exact: true }).fill("Cancelled starter");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBeNull();
  dialog = await saveDialog(page);
  await dialog.getByLabel("Editable starter source", { exact: true }).fill("@startgantt");
  await expect(dialog.getByRole("button", { name: "Save starter", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByLabel("Editable starter source", { exact: true }).fill(original);
  await page.evaluate((storageKey) => {
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === storageKey) throw new DOMException("Storage full", "QuotaExceededError");
      originalSet.call(this, name, value);
    };
  }, key);
  await dialog.getByRole("button", { name: "Save starter", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("browser could not save");
  await expect(dialog.getByRole("alert")).toBeInViewport();
  await page.screenshot({ path: "test-results/a24-starter-phone.png" });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator(".cm-editor")).toBeVisible();
  expect(await readEditorSource(page)).toBe(original);
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBeNull();
});

test("adds a personal starter to a document and preserves its authored theme over defaults", async ({ page }) => {
  await prepareEditor(page);
  const original = await readEditorSource(page);
  await saveStarter(page);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Settings…", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings.getByLabel("Default diagram theme", { exact: true }).selectOption("minty");
  await settings.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "New", exact: true }).click();
  await page
    .getByRole("menu", { name: "New", exact: true })
    .getByRole("menuitem", { name: "Document…", exact: true })
    .click();
  const document = page.getByRole("dialog", { name: "New document", exact: true });
  await document.getByRole("textbox", { name: "Name", exact: true }).fill("Starter document");
  await document.getByRole("button", { name: "Create document", exact: true }).click();
  await page.getByRole("button", { name: "Close document navigator", exact: true }).click();
  const create = await chooser(page);
  await expect(create.getByRole("combobox", { name: "Create in", exact: true })).toHaveValue("document");
  await create.getByLabel("Diagram name", { exact: true }).fill("Reusable member");
  await create.getByRole("button", { name: "Review Release starter", exact: true }).click();
  const review = create.getByRole("region", { name: "Review starter content", exact: true });
  await review
    .getByLabel("Editable starter source", { exact: true })
    .fill(original.replace("@startgantt", "@startgantt\n!theme cerulean"));
  await review.getByRole("button", { name: "Create from starter", exact: true }).click();
  await expect(create).toBeHidden();
  await waitForDiagramRender(page);
  expect(await readEditorSource(page)).toContain("!theme cerulean");
  expect(await readEditorSource(page)).not.toContain("!theme minty");
  await expect(page.locator(".document-name")).toContainText("Starter document");
});
