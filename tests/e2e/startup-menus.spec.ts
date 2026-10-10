import { expect, test } from "@playwright/test";
import { fillSource, prepareEditor, readEditorSource, source } from "./editor-helpers";

test("File submenus receive keyboard focus and return it to their trigger", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "File", exact: true }).click();
  for (const name of ["New", "Open", "Export"]) {
    const trigger = page.getByRole("menuitem", { name, exact: true });
    await trigger.focus();
    await page.keyboard.press("ArrowRight");
    const menu = page.getByRole("menu", { name, exact: true });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem").first()).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(trigger).toBeFocused();
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "File", exact: true })).toBeFocused();
});

test("one click opens menus after a dialog closes and after view changes", async ({ page }) => {
  await prepareEditor(page);
  for (const view of ["Code", "Split", "Diagram"]) {
    await page.getByRole("navigation", { name: "View mode" }).getByRole("button", { name: view, exact: true }).click();
    for (const dismiss of ["button", "escape", "backdrop"]) {
      await page.getByRole("button", { name: "More", exact: true }).click();
      await page.getByRole("menuitem", { name: "Help", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "PlantUML Ultimate Help" });
      if (dismiss === "button") await dialog.getByRole("button", { name: "Close Help" }).click();
      else if (dismiss === "escape") await page.keyboard.press("Escape");
      else await page.locator(".help-backdrop").click({ position: { x: 2, y: 2 } });
      await expect(dialog).toBeHidden();
      await page.getByRole("button", { name: "File", exact: true }).click();
      await expect(page.getByRole("menu", { name: "File", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await expect(page.getByRole("menu", { name: "Add", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
    }
  }
});

test("reload restores edited diagrams without reopening the creation chooser", async ({ page }) => {
  await prepareEditor(page);
  const edited = source("[Recovered work] lasts 3 days");
  await fillSource(page, edited);
  await page.reload();
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Choose a diagram type" })).toBeHidden();
  expect(await readEditorSource(page)).toBe(edited);
});

test("startup preference restores every tab and chooser creation adds without replacing work", async ({ page }) => {
  await prepareEditor(page);
  const edited = source("[Keep this diagram] lasts 4 days");
  await fillSource(page, edited);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Settings…", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings.getByRole("combobox", { name: "On startup", exact: true }).selectOption("chooser");
  await settings.getByRole("button", { name: "Apply", exact: true }).click();
  await page.reload();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await expect(chooser).toBeVisible();
  expect(await readEditorSource(page)).toBe(edited);
  await chooser.getByRole("button", { name: "Sequence diagram" }).click();
  const tabs = page.locator(".document-tabs > button:not(.new-tab)");
  await expect(tabs).toHaveCount(2);
  await tabs.first().click();
  expect(await readEditorSource(page)).toBe(edited);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Settings…", exact: true }).click();
  await expect(settings.getByRole("combobox", { name: "On startup", exact: true })).toHaveValue("chooser");
  await settings.getByRole("combobox", { name: "On startup", exact: true }).selectOption("restore");
  await settings.getByRole("button", { name: "Apply", exact: true }).click();
  await page.reload();
  await expect(tabs).toHaveCount(2);
  await expect(chooser).toBeHidden();
  expect(await readEditorSource(page)).toBe(edited);
});
