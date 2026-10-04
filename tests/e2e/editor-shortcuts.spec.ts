import { expect, test } from "@playwright/test";
import { openAddDialog, prepareEditor, setSource, source } from "./editor-helpers";

test("undoes continuous typing as one step", async ({ page }) => {
  await prepareEditor(page);
  const original = source("[Build] lasts 3 days");
  await setSource(page, original);
  const editor = page.locator(".cm-content");
  await editor.locator(".cm-line").nth(2).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" and more", { delay: 30 });
  await expect(editor).toContainText("[Build] lasts 3 days and more");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor).toContainText("[Build] lasts 3 days");
  await expect(editor).not.toContainText("and more");
  await expect(editor).not.toContainText("and mor");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(editor).toContainText("[Build] lasts 3 days and more");
});

test("keeps document shortcuts from acting behind an open dialog", async ({ page }) => {
  await prepareEditor(page);
  await setSource(page, source("[Build] lasts 3 days"));
  const editor = page.locator(".cm-content");
  await page.keyboard.press("ControlOrMeta+2");
  await openAddDialog(page, "Task…");
  const dialog = page.getByRole("dialog", { name: /task/i });
  await expect(dialog).toBeVisible();
  const name = dialog.getByRole("textbox").first();
  await name.fill("Draft");
  const tabs = await page.getByRole("tab").count();

  await name.press("ControlOrMeta+z");
  await name.press("ControlOrMeta+w");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(tabs);
  await expect(editor).toContainText("[Build] lasts 3 days");
});

test("jumps back several steps from the undo history", async ({ page }) => {
  await prepareEditor(page);
  await setSource(page, source("[Build] lasts 3 days"));
  const editor = page.locator(".cm-content");
  for (const name of ["Design", "Review"]) {
    await openAddDialog(page, "Task…");
    const dialog = page.getByRole("dialog", { name: "Add task" });
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Add task" }).click();
    await expect(editor).toContainText(`[${name}]`);
  }

  await page.getByRole("button", { name: "Recent changes" }).click();
  const menu = page.getByRole("menu", { name: "Recent changes" });
  const steps = menu.getByRole("menuitem");
  // Source setup can create multiple text-edit transactions, depending on the browser.
  await expect(steps.nth(0)).toHaveText("Add Review");
  await expect(steps.nth(1)).toHaveText("Add Design");
  await steps.nth(1).click();
  await expect(editor).toContainText("[Build] lasts 3 days");
  await expect(editor).not.toContainText("[Design]");
  await expect(editor).not.toContainText("[Review]");

  await page.getByRole("button", { name: "Recent changes" }).click();
  await expect(menu.getByText("Redo")).toBeVisible();
  await menu.getByRole("menuitem").first().click();
  await expect(editor).toContainText("[Review]");
});
