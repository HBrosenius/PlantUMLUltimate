import { expect, test } from "@playwright/test";
import { prepareEditor, setSource, source } from "./editor-helpers";

// Zoom is in natural-size units, so fitting or zooming is how an open inspector's target is brought into view.
const viewControls = ["Fit diagram", "Zoom in", "Zoom out"] as const;

test("fit and zoom keep a selected Gantt task and its inspector", async ({ page }) => {
  await prepareEditor(page);
  await setSource(page, source("[Design] lasts 3 days\n[Build] starts at [Design]'s end and lasts 4 days"));
  await page.locator('[data-task-id="design"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector).toBeVisible();
  for (const name of viewControls) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(inspector).toBeVisible();
    await expect(page.locator('[data-task-id="design"][data-selected="true"]')).toHaveCount(1);
  }
  await page.getByRole("button", { name: /^Reset zoom,/ }).click();
  await expect(inspector).toBeVisible();
});

test("fit and zoom keep a keyboard-selected class relationship and its inspector", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: /Class diagram/ })
    .click();
  await setSource(page, "@startuml\nclass Order\nclass OrderLine\nOrder *-- OrderLine\n@enduml");
  const relationship = page.locator(".class-relationship-hit").first();
  await relationship.focus();
  await relationship.press("Enter");
  const inspector = page.getByRole("complementary", { name: "Class relationship inspector" });
  await expect(inspector).toBeVisible();
  for (const name of viewControls) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(inspector).toBeVisible();
    await expect(page.locator(".class-relationship-endpoint")).toHaveCount(2);
  }
});
