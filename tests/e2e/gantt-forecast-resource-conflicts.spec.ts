import { expect, test } from "@playwright/test";
import { prepareEditor, setSource } from "./editor-helpers";

test("shows resource conflicts introduced by remaining work without moving forecast dates", async ({ page }) => {
  await prepareEditor(page);
  await setSource(
    page,
    `@startgantt
Project starts 2026-09-21
saturday are closed
sunday are closed
[Backend] on {Alice} starts 2026-09-21
[Backend] lasts 3 days
[Backend] is 50% completed
[Review] on {Alice} starts 2026-09-30
[Review] lasts 2 days
@endgantt`,
  );
  await page.getByRole("button", { name: "Progress forecast: Off" }).click();
  await page.getByLabel("Forecast as of date").fill("2026-09-30");
  const comparison = page.locator(".gantt-forecast-resource-comparison");
  await expect(comparison.locator("summary")).toContainText("2 new, 0 already in plan");
  await comparison.locator("summary").click();
  await expect(comparison).toContainText("Alice · 2026-09-30");
  await expect(comparison).toContainText("Plan 100% → forecast 200% / 100% capacity");
  await comparison.getByRole("button", { name: "Backend" }).first().click();
  await expect(page.locator(".gantt-forecast-inspector")).toContainText("Backend");
  await expect(page.locator(".cm-content")).toContainText("[Backend] lasts 3 days");
});
