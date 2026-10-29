import { openRibbonGroup, prepareEditor, fillSource } from "./editor-helpers";
import { expect, test } from "@playwright/test";

test("closes Gantt inspectors with one Escape from the canvas and a field", async ({ page }) => {
  await prepareEditor(page);
  await fillSource(page, "@startgantt\nProject starts 2026-09-04\n[Design] as [a] lasts 3 days\n@endgantt");
  const bar = page.locator('[data-task-id="a"] .bar');
  await expect(bar).toBeVisible();
  const inspector = page.getByRole("complementary", { name: "Task inspector", exact: true });
  await bar.click();
  await expect(inspector).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(inspector).toBeHidden();
  await bar.click();
  await inspector.getByLabel("Progress (%)", { exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(inspector).toBeHidden();
  await openRibbonGroup(page, "Plan", "Planning tools");
  await page.getByRole("button", { name: "Calendar & schedule", exact: true }).click();
  const calendar = page.getByRole("complementary", { name: "Project and calendar inspector" });
  await expect(calendar).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(calendar).toBeHidden();
});
