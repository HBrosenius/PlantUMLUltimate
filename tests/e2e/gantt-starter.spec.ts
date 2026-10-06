import { expect, test } from "@playwright/test";
import { prepareEditor } from "./editor-helpers";

test.use({ timezoneId: "Europe/Stockholm" });

test("new Gantt diagrams use today's calendar and highlight today", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-06T12:00:00+02:00"));
  await prepareEditor(page);
  const editor = page.locator(".cm-content");
  await expect(editor).toContainText("Project starts 2026-09-29");
  await expect(editor).toContainText("[Backend] starts 2026-10-03");
  await expect(editor).toContainText("today is colored in #AAF");
  await expect(page.locator('.diagram svg rect[fill="#AAAAFF"], .diagram svg rect[fill="#AAF"]')).not.toHaveCount(0);

  await page.clock.setFixedTime(new Date("2026-10-07T12:00:00+02:00"));
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Gantt diagram" })
    .click();
  await expect(editor).toContainText("Project starts 2026-09-30");
  await expect(editor).toContainText("[Backend] starts 2026-10-04");
  await expect(editor).toContainText("today is colored in #AAF");
});
