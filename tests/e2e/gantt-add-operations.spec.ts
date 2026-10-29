import {
  openRibbonGroup,
  fillSource,
  prepareEditor,
  readEditorSource,
  source,
  waitForDiagramRender,
} from "./editor-helpers";
import { expect, test } from "@playwright/test";

test("keeps Add independent of task selection and reuses calendar editing with undo", async ({ page }) => {
  await prepareEditor(page);
  await fillSource(page, source("[Alpha] as [alpha] lasts 3 days\n[Beta] as [beta] lasts 2 days"));
  await waitForDiagramRender(page);
  const original = await readEditorSource(page);
  const openAdd = async () => {
    await openRibbonGroup(page, "Insert", "Insert elements");
    const menu = page.getByRole("group", { name: "New diagram elements", exact: true });
    await expect(menu.getByRole("button")).toHaveCount(4);
    await expect(menu.getByRole("button", { name: /Task…/ })).toBeEnabled();
    await expect(menu.getByRole("button", { name: /Milestone…/ })).toBeEnabled();
    await expect(menu.getByRole("button", { name: /Divider…/ })).toBeEnabled();
    await expect(menu.getByRole("button", { name: "Closed day…", exact: true })).toBeEnabled();
    return menu;
  };
  await openAdd();
  await openRibbonGroup(page, "Insert", "Insert elements");
  await page.locator('[data-task-id="beta"] .bar').click();
  await openAdd();
  await openRibbonGroup(page, "Insert", "Insert elements");
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector.getByLabel("Linked task", { exact: true })).toBeVisible();
  await inspector.locator("summary").filter({ hasText: "Resources" }).click();
  await expect(inspector.getByRole("button", { name: "+ Add person", exact: true })).toBeVisible();
  await inspector.locator("summary").filter({ hasText: "Appearance" }).click();
  await expect(inspector.getByPlaceholder("Add context for this task")).toBeVisible();
  await page.getByRole("button", { name: "Close task inspector", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = await openAdd();
  await page.screenshot({ path: "test-results/a22-add-phone.png" });
  await menu.getByRole("button", { name: "Closed day…", exact: true }).click();
  const calendar = page.getByRole("complementary", { name: "Project and calendar inspector" });
  await expect(calendar.getByRole("button", { name: "+ Add exception", exact: true })).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator(".cm-editor")).toBeVisible();
  expect(await readEditorSource(page)).toBe(original);
  await calendar.getByRole("button", { name: "+ Add exception", exact: true }).click();
  await calendar.getByLabel("From date", { exact: true }).fill("2026-09-04");
  await calendar.getByLabel("To date", { exact: true }).fill("2026-09-04");
  await calendar.getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).toContain("2026-09-04 is closed");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).toBe(original);
});
