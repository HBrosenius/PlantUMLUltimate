import { expect, test } from "@playwright/test";
import { prepareEditor } from "./editor-helpers";

async function openHelp(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Help", exact: true }).click();
  return page.getByRole("dialog", { name: "PlantUML Ultimate Help" });
}

test("searches Help by action and shortcut and exposes all diagram guidance", async ({ page }) => {
  await prepareEditor(page);
  const help = await openHelp(page);
  await expect(help.getByRole("searchbox", { name: "Search Help" })).toBeFocused();
  await expect(help.locator(".help-content > section").first()).toHaveAttribute("aria-label", "Gantt help");
  await help.getByRole("searchbox").fill("cmd+shift+p");
  await expect(help.getByText("Commands / Command palette", { exact: true })).toBeVisible();
  await help.getByRole("searchbox").fill("Add message");
  await expect(help.getByText(/No matching help/)).toBeVisible();
  await help.getByLabel("Show help for").selectOption("all");
  await expect(help.getByText("Add message…", { exact: true })).toBeVisible();
  await help.getByRole("button", { name: "All shortcuts & gestures" }).click();
  await expect(help.getByRole("searchbox")).toHaveValue("");
  await expect(help.locator('[aria-label="Activity help"]')).toBeVisible();
  await help.screenshot({ path: "test-results/a18-help-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await help.getByRole("searchbox").fill("Calendar & schedule");
  await expect(help.getByText(/Calendar & schedule controls working days/)).toBeVisible();
  expect(await help.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await help.screenshot({ path: "test-results/a18-help-phone.png" });
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
});

test("prioritizes each diagram and documents the working Sequence creation shortcut", async ({ page }) => {
  await prepareEditor(page);
  for (const [title, label] of [
    ["WBS", "WBS"],
    ["Sequence", "Sequence"],
    ["Use Case", "Use Case"],
    ["Class", "Class"],
    ["Component", "Component"],
    ["Activity", "Activity"],
  ]) {
    await page.keyboard.press("ControlOrMeta+n");
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: `${title} diagram`, exact: true })
      .click();
    const help = await openHelp(page);
    await expect(help.locator(".help-content > section").first()).toHaveAttribute("aria-label", `${label} help`);
    if (title === "Sequence") {
      await help.getByRole("searchbox").fill("Alt+M");
      await expect(help.getByText("Add message…", { exact: true })).toBeVisible();
    }
    await page.keyboard.press("Escape");
    if (title === "Sequence") {
      await page.keyboard.press("Alt+m");
      const message = page.getByRole("dialog", { name: /Add.*message/i });
      await expect(message).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(message).toBeHidden();
    }
  }
});
