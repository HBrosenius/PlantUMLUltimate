import { expect, test, type Page } from "@playwright/test";
import { fillSource, prepareEditor, readEditorSource, waitForDiagramRender } from "./editor-helpers";
const source = `@startgantt
Project starts 2026-10-01
[Build] lasts 3 days

[Release] happens at [Build]'s end
@endgantt`;
async function open(page: Page) {
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("menuitem", { name: "What-if scenario…", exact: true }).click();
  return page.getByRole("dialog", { name: "What-if scenario", exact: true });
}
async function saveAlternative(page: Page) {
  const dialog = await open(page);
  await dialog.getByRole("textbox", { name: "Scenario name", exact: true }).fill("Integration buffer");
  await dialog
    .getByRole("textbox", { name: "Scenario assumptions", exact: true })
    .fill("Allow two extra days for integration");
  await dialog.getByLabel("Scenario duration", { exact: true }).fill("5");
  await dialog.getByRole("button", { name: "Update scenario", exact: true }).click();
  await dialog.getByRole("button", { name: "Save scenario", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Saved");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
}
async function reopen(page: Page) {
  const dialog = await open(page);
  await dialog.getByLabel("Saved scenario", { exact: true }).selectOption({ label: "Integration buffer" });
  await dialog.getByRole("button", { name: "Open saved scenario", exact: true }).click();
  return dialog;
}
test("saves and reopens after reload, compares the base and applies with one undo", async ({ page }) => {
  await prepareEditor(page);
  await fillSource(page, source);
  await waitForDiagramRender(page);
  await saveAlternative(page);
  expect(await readEditorSource(page)).toBe(source);
  await page.reload();
  await expect(page.locator(".cm-editor")).toBeVisible();
  const dialog = await reopen(page);
  await expect(dialog.getByLabel("Scenario duration", { exact: true })).toHaveValue("5");
  await expect(dialog.getByLabel("Scenario assumptions", { exact: true })).toHaveValue(
    "Allow two extra days for integration",
  );
  await expect(dialog.getByLabel("Scenario impact")).toContainText("+2 days");
  await dialog.getByRole("button", { name: "Review and apply…", exact: true }).click();
  await expect(dialog.getByLabel("Scenario source patch")).toContainText("[Build] lasts 5 days");
  await page.screenshot({ path: "test-results/a28-scenario-desktop.png" });
  await dialog.getByRole("button", { name: "Apply scenario", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await readEditorSource(page)).toBe(source.replace("3 days", "5 days"));
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await readEditorSource(page)).toBe(source);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect(await readEditorSource(page)).toBe(source.replace("3 days", "5 days"));
});
test("reconciles a reopened stale scenario without overwriting unrelated current edits", async ({ page }) => {
  await prepareEditor(page);
  await fillSource(page, source);
  await saveAlternative(page);
  const current = source.replace("@endgantt", "' Retain this newer edit\n@endgantt");
  await fillSource(page, current);
  const dialog = await reopen(page);
  await dialog.getByRole("button", { name: "Review and apply…", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Apply scenario", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Reconcile with current plan", exact: true }).click();
  await dialog.getByRole("button", { name: "Use reconciled scenario", exact: true }).click();
  await expect(dialog.getByLabel("Scenario source patch")).toContainText("Retain this newer edit");
  await dialog.getByRole("button", { name: "Apply scenario", exact: true }).click();
  expect(await readEditorSource(page)).toBe(current.replace("3 days", "5 days"));
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await readEditorSource(page)).toBe(current);
});
test("requires an explicit conflict choice and allows saved alternatives to be deleted", async ({ page }) => {
  await prepareEditor(page);
  await fillSource(page, source);
  await saveAlternative(page);
  const current = source.replace("3 days", "4 days");
  await fillSource(page, current);
  let dialog = await reopen(page);
  await dialog.getByRole("button", { name: "Reconcile with current plan", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Use reconciled scenario", exact: true })).toBeDisabled();
  await dialog.getByLabel("Resolve scenario conflict 1", { exact: true }).selectOption("external");
  await dialog.getByRole("button", { name: "Use reconciled scenario", exact: true }).click();
  await expect(dialog.getByLabel("Scenario source patch")).toContainText("[Build] lasts 4 days");
  await expect(dialog.getByLabel("Scenario source patch")).toContainText("[Build] lasts 5 days");
  await dialog.getByRole("button", { name: "Edit scenario", exact: true }).click();
  await dialog.getByRole("button", { name: "Save scenario changes", exact: true }).click();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  expect(await readEditorSource(page)).toBe(current);
  dialog = await reopen(page);
  await dialog.getByRole("button", { name: "Delete saved scenario", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm delete scenario", exact: true }).click();
  await expect(
    dialog.getByLabel("Saved scenario", { exact: true }).getByRole("option", { name: "Integration buffer" }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await dialog.getByRole("button", { name: "Discard changes", exact: true }).click();
  expect(await readEditorSource(page)).toBe(current);
});
test("keeps phone save errors actionable and does not discard unsaved changes", async ({ page }) => {
  await prepareEditor(page);
  await fillSource(page, source);
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await open(page);
  await dialog.getByLabel("Scenario name", { exact: true }).fill("Phone draft");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "plantuml-studio.delivery-scenarios.v1") throw new DOMException("quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await dialog.getByRole("button", { name: "Save scenario", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("could not save");
  await dialog.getByRole("alert").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/a28-scenario-phone.png" });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog.getByText("Discard this scenario?", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(dialog.getByLabel("Scenario name", { exact: true })).toHaveValue("Phone draft");
  expect(await page.evaluate(() => localStorage.getItem("plantuml-studio.delivery-scenarios.v1"))).toBeNull();
});
