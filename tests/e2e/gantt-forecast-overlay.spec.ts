import { expect, test } from "@playwright/test";
import { prepareEditor, setSource } from "./editor-helpers";

test("shows forecast dates and the cause chain on the editable Gantt chart", async ({ page }) => {
  await prepareEditor(page);
  await setSource(
    page,
    `@startgantt
Project starts 2026-09-21
printscale daily
saturday are closed
sunday are closed
[Design] starts 2026-09-21
[Design] lasts 4 days
[Design] is 50% completed
[Build] starts at [Design]'s end
[Build] lasts 3 days
@endgantt`,
  );
  const forecastToggle = page.getByRole("button", { name: /Progress forecast: (Off|On)/ });
  const positionBefore = await forecastToggle.boundingBox();
  await forecastToggle.click();
  const positionAfter = await forecastToggle.boundingBox();
  expect(positionBefore).not.toBeNull();
  expect(positionAfter).not.toBeNull();
  expect(Math.abs(positionBefore!.x - positionAfter!.x)).toBeLessThan(1);
  expect(Math.abs(positionBefore!.y - positionAfter!.y)).toBeLessThan(1);
  await page.getByLabel("Forecast as of date").fill("2026-09-28");
  const chart = page.locator(".diagram svg[data-progress-forecast='true']");
  await expect(chart).toBeVisible();
  await expect(chart.locator(".gantt-forecast-task-mark")).toHaveCount(2);
  await expect(chart.locator(".gantt-forecast-overdue-stripe")).toHaveCount(2);
  await expect(chart.locator('.gantt-forecast-extended-axis [data-timeline-date="2026-10-02"]')).toHaveCount(2);
  await expect(page.locator(".gantt-forecast-view[data-display='details']")).toBeVisible();
  const warnings = page.getByRole("region", { name: "Planned finish warnings" });
  await expect(warnings).toContainText("2 planned finish dates forecast to be missed");
  await expect(warnings).toContainText("planned finish 2026-09-24, forecast finish 2026-09-29");
  await warnings.getByRole("button", { name: "Design", exact: true }).click();
  await expect(page.locator(".gantt-forecast-inspector")).toContainText("Design");
  await page.getByRole("navigation", { name: "Forecast tasks" }).getByRole("button", { name: /Build/ }).click();
  await expect(chart.locator("[data-forecast-task-id='design']")).toHaveAttribute("data-cause-chain", "true");
  await expect(chart.locator(".gantt-forecast-cause-link")).toHaveCount(1);
  await expect(page.locator(".gantt-forecast-inspector")).toContainText("Build");
  await forecastToggle.click();
  await expect(page.locator(".diagram svg[data-progress-forecast='true']")).toHaveCount(0);
  await expect(page.locator(".diagram svg .interaction-task")).toHaveCount(2);
  await expect(warnings).toBeHidden();
});
