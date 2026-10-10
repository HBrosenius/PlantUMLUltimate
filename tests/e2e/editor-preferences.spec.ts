import { expect, test } from "@playwright/test";
import { readEditorSource } from "./editor-helpers";

test("editor preferences apply, cancel and persist without changing source or existing view", async ({ page }) => {
  test.setTimeout(30000);
  await page.goto("/");
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "WBS diagram", exact: true })
    .click();
  const source = await readEditorSource(page);
  const settings = async () => {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "Settings…", exact: true }).click();
    return page.getByRole("dialog", { name: "Settings", exact: true });
  };
  let dialog = await settings();
  await dialog.getByLabel("Font size (px)").fill("19");
  await dialog.getByLabel("Word wrap", { exact: true }).uncheck();
  await dialog.getByLabel("Line numbers", { exact: true }).uncheck();
  await dialog.getByLabel("Tab size", { exact: true }).selectOption("8");
  await dialog.getByLabel("Default view", { exact: true }).selectOption("diagram");
  await dialog.getByLabel("Default zoom", { exact: true }).selectOption("1.5");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".cm-editor").first()).toHaveCSS("font-size", "19px");
  await expect(page.locator(".cm-lineNumbers")).toHaveCount(0);
  await expect(page.locator(".cm-lineWrapping")).toHaveCount(0);
  expect(await readEditorSource(page)).toBe(source);
  dialog = await settings();
  await dialog.getByLabel("Font size (px)").fill("22");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".cm-editor").first()).toHaveCSS("font-size", "19px");
  await page.reload();
  await expect(page.locator(".cm-editor").first()).toHaveCSS("font-size", "19px");
  expect(await readEditorSource(page)).toBe(source);
  dialog = await settings();
  await expect(dialog.getByLabel("Default view", { exact: true })).toHaveValue("diagram");
  await expect(dialog.getByLabel("Default zoom", { exact: true })).toHaveValue("1.5");
  await dialog
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Code editor · this browser" }) })
    .screenshot({ path: "test-results/a19-preferences.png" });
});
