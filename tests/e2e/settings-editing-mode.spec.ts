import { expect, test } from "@playwright/test";
import { prepareEditor } from "./editor-helpers";

async function openSettings(page: Parameters<typeof prepareEditor>[0]) {
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page
    .getByRole("menu", { name: "More", exact: true })
    .getByRole("menuitem", { name: "Settings…", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Settings", exact: true });
}

test("editing mode switches between visual editing and split view and survives reload", async ({ page }) => {
  await prepareEditor(page);
  const viewModes = page.getByRole("navigation", { name: "View mode" });
  const source = await page.locator(".cm-content .cm-line").allTextContents();
  let settings = await openSettings(page);
  await settings.getByRole("radio", { name: "Diagram only", exact: true }).check();
  await settings.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(viewModes.getByRole("button")).toHaveCount(4);
  await expect(viewModes.getByRole("button", { name: "Diagram", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".cm-content")).toHaveCount(0);
  settings = await openSettings(page);
  await expect(settings.getByRole("radio", { name: "Diagram only", exact: true })).toBeChecked();
  await settings.getByRole("radio", { name: "Diagram + code", exact: true }).check();
  await settings.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(viewModes.getByRole("button", { name: "Split", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(page.locator(".cm-content .cm-line")).toHaveText(source);
  await page.reload();
  await expect(page.locator(".cm-content")).toBeVisible();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  if (await chooser.isVisible()) await chooser.getByRole("button", { name: "Gantt diagram" }).click();
  await expect(viewModes.getByRole("button", { name: "Split", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".cm-content")).toBeVisible();
  settings = await openSettings(page);
  await expect(settings.getByRole("radio", { name: "Diagram + code", exact: true })).toBeChecked();
});

test("cancel leaves the current editing mode unchanged", async ({ page }) => {
  await prepareEditor(page);
  const settings = await openSettings(page);
  await settings.getByRole("radio", { name: "Diagram only", exact: true }).check();
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
  const reopened = await openSettings(page);
  await expect(reopened.getByRole("radio", { name: "Diagram + code", exact: true })).toBeChecked();
});

for (const width of [390, 1280]) {
  test(`editing mode previews fit and support keyboard selection at ${width}px`, async ({ page }, testInfo) => {
    await prepareEditor(page);
    await page.setViewportSize({ width, height: 900 });
    const settings = await openSettings(page);
    const group = settings.getByRole("radiogroup", { name: "Editing mode" });
    const visual = group.getByRole("radio", { name: "Diagram only", exact: true });
    const code = group.getByRole("radio", { name: "Diagram + code", exact: true });
    await group
      .locator(".editing-mode-option")
      .filter({ has: page.getByRole("radio", { name: "Diagram only", exact: true }) })
      .locator("svg")
      .click();
    await expect(visual).toBeChecked();
    await group
      .locator(".editing-mode-option")
      .filter({ has: page.getByRole("radio", { name: "Diagram + code", exact: true }) })
      .locator("svg")
      .click();
    await expect(code).toBeChecked();
    await code.scrollIntoViewIfNeeded();
    await code.focus();
    await expect(code).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(visual).toBeChecked();
    await page.keyboard.press("ArrowRight");
    await expect(code).toBeChecked();
    await expect(group.locator("svg")).toHaveCount(2);
    expect(await settings.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await group.scrollIntoViewIfNeeded();
    if (testInfo.project.name === "chromium")
      await settings.screenshot({ path: `/tmp/settings-editing-mode-${width}.png` });
  });
}

test("changing appearance preserves the chosen code view", async ({ page }, testInfo) => {
  await prepareEditor(page);
  const codeView = page
    .getByRole("navigation", { name: "View mode" })
    .getByRole("button", { name: "Code", exact: true });
  await codeView.click();
  let settings = await openSettings(page);
  await settings.getByRole("combobox", { name: "Theme", exact: true }).selectOption("dark");
  await settings.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(codeView).toHaveClass(/active/);
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "dark");
  settings = await openSettings(page);
  await expect(settings.getByRole("radio", { name: "Diagram + code", exact: true })).toBeChecked();
  if (testInfo.project.name === "chromium") await settings.screenshot({ path: "/tmp/settings-editing-mode-dark.png" });
});
