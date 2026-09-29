import { expect, test } from "@playwright/test";
import { prepareEditor, setSource } from "./editor-helpers";

test("shows finish causes and affected milestones, then opens the selected cause", async ({ page }) => {
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
[Release] happens at [Build]'s end
@endgantt`,
  );
  await page.getByRole("button", { name: "Progress forecast: Off" }).click();
  await page.getByLabel("Forecast as of date").fill("2026-09-28");

  const projectCauses = page.getByRole("region", { name: "Project finish causes" });
  await expect(projectCauses).toContainText("Design");
  await expect(projectCauses).toContainText("Milestones: Release");
  await expect(projectCauses).toContainText("The project shift is counted once.");
  await projectCauses.getByRole("button", { name: /Design/ }).click();
  await expect(page.locator(".gantt-forecast-inspector")).toContainText("WHY DID THIS MOVE?");
  await expect(page.locator(".gantt-forecast-inspector")).toContainText("Design");
  await page.getByRole("button", { name: "View project finish causes" }).click();
  await expect(projectCauses).toBeVisible();
});
