import { expect, test } from "@playwright/test";
import { prepareEditor } from "./editor-helpers";

async function openSettings(page: Parameters<typeof prepareEditor>[0]) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  return page.getByRole("dialog", { name: "Settings", exact: true });
}

test("one default-view setting applies to new tabs and leaves the current view unchanged", async ({ page }) => {
  await prepareEditor(page);
  const settings = await openSettings(page);
  await expect(settings.getByRole("radio", { name: "Diagram only", exact: true })).toHaveCount(0);
  await settings.getByRole("button", { name: "New diagrams", exact: true }).click();
  await settings.getByLabel("Default view", { exact: true }).selectOption("diagram");
  await settings.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
  await page.getByRole("button", { name: "New diagram tab" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await chooser.getByRole("button", { name: "Create diagram", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "View mode" }).getByRole("button", { name: "Diagram", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const reopened = page.getByRole("dialog", { name: "Settings", exact: true });
  await reopened.getByRole("button", { name: "New diagrams", exact: true }).click();
  await expect(reopened.getByLabel("Default view", { exact: true })).toHaveValue("diagram");
});

test("changing appearance preserves the chosen code view", async ({ page }, testInfo) => {
  await prepareEditor(page);
  const codeView = page
    .getByRole("navigation", { name: "View mode" })
    .getByRole("button", { name: "Code", exact: true });
  await codeView.click();
  let settings = await openSettings(page);
  await settings.getByRole("button", { name: "Appearance", exact: true }).click();
  await settings.getByRole("combobox", { name: "Theme", exact: true }).selectOption("dark");
  await settings.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(codeView).toHaveClass(/active/);
  await expect(page.locator(".app")).toHaveAttribute("data-theme", "dark");
  settings = await openSettings(page);
  await expect(settings.getByRole("radio", { name: "Diagram + code", exact: true })).toHaveCount(0);
  if (testInfo.project.name === "chromium") await settings.screenshot({ path: "/tmp/settings-editing-mode-dark.png" });
});
