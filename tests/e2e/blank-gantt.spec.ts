import { expect, test } from "@playwright/test";
import { readEditorSource, waitForDiagramRender } from "./editor-helpers";

test("a blank Gantt renders without sample tasks and supports adding the first task", async ({ page }) => {
  await page.goto("/");
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await chooser.getByLabel("Start with").selectOption("blank");
  const localDate = await page.evaluate(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  });
  await chooser.getByRole("button", { name: "Gantt diagram", exact: true }).click();
  await page.getByRole("button", { name: "Close project inspector" }).click();
  await expect.poll(() => readEditorSource(page)).toBe(`@startgantt\nProject starts ${localDate}\n@endgantt`);
  await waitForDiagramRender(page);
  await expect(page.locator(".diagram svg")).toBeVisible();
  await expect(page.locator(".diagram svg")).not.toContainText(/Syntax Error|Error line/);
  await expect(page.locator(".preview")).not.toContainText("Preview could not be updated");
  await expect(page.locator(".diagram [data-task-id]")).toHaveCount(0);
  await page.screenshot({ path: "test-results/blank-gantt.png" });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Task…" }).click();
  const task = page.getByRole("dialog", { name: "Add task", exact: true });
  await task.getByRole("textbox", { name: "Name", exact: true }).fill("First task");
  await task.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(task).toBeHidden();
  await waitForDiagramRender(page);
  await expect(page.locator(".diagram svg")).toContainText("First task");
});
