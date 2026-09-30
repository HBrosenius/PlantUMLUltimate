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
