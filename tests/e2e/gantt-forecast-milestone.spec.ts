import { expect, test } from "@playwright/test";
import { prepareEditor, setSource } from "./editor-helpers";

test("shows an overdue milestone at the forecast date and moves its linked successor", async ({ page }) => {
  await prepareEditor(page);
  await setSource(
    page,
    `@startgantt
Project starts 2026-09-21
printscale daily
saturday are closed
sunday are closed
[Gate] happens 2026-09-24
[Work] starts at [Gate]'s end
[Work] lasts 2 days
@endgantt`,
  );
  await page.getByRole("button", { name: "Progress forecast: Off" }).click();
  await page.getByLabel("Forecast as of date").fill("2026-09-29");
  await expect(page.locator("[data-forecast-task-id='gate'] .gantt-forecast-missed-marker")).toHaveCount(1);
  const causes = page.getByRole("region", { name: "Project finish causes" });
  await expect(causes).toContainText("Gate");
  await expect(page.getByRole("navigation", { name: "Forecast tasks" })).toContainText("Work");
  await causes.getByRole("button", { name: /Gate/ }).click();
  const inspector = page.locator(".gantt-forecast-inspector");
  await expect(inspector).toContainText("Milestone date Sep 24 missed; forecast is Sep 29.");
  await expect(inspector).toContainText("Milestone not reported complete.");
  await expect(page.locator(".cm-content")).toContainText("[Gate] happens 2026-09-24");
});
