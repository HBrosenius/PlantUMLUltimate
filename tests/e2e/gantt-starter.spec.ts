import { expect, test } from "@playwright/test";
import { prepareEditor } from "./editor-helpers";

test.use({ timezoneId: "Europe/Stockholm" });

// The renderer worker reads the real clock, so the fixed browser time must be real "now" for today's highlight to
// land inside the starter's chart range; only the expected dates are derived from it.
// Shift by calendar days from Stockholm's date, as the app does. Shifting by 24-hour steps first would
// cross a DST change and, within an hour of midnight, land on the wrong Stockholm date.
const stockholmDate = (base: Date, offsetDays: number) => {
  const [year, month, day] = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" })
    .format(base)
    .split("-")
    .map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + offsetDays)).toISOString().slice(0, 10);
};

test("new Gantt diagrams use today's calendar and highlight today", async ({ page }) => {
  const now = new Date();
  await page.clock.setFixedTime(now);
  await prepareEditor(page);
  const editor = page.locator(".cm-content");
  await expect(editor).toContainText(`Project starts ${stockholmDate(now, -7)}`);
  await expect(editor).toContainText(`[Backend] starts ${stockholmDate(now, -3)}`);
  await expect(editor).toContainText("today is colored in #AAF");
  await expect(page.locator('.diagram svg rect[fill="#AAAAFF"], .diagram svg rect[fill="#AAF"]')).not.toHaveCount(0);

  await page.clock.setFixedTime(new Date(now.getTime() + 86_400_000));
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Gantt diagram" })
    .click();
  await expect(editor).toContainText(`Project starts ${stockholmDate(now, -6)}`);
  await expect(editor).toContainText(`[Backend] starts ${stockholmDate(now, -2)}`);
  await expect(editor).toContainText("today is colored in #AAF");
});
