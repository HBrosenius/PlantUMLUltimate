import { expect, test } from "@playwright/test";
import { prepareEditor, setSource } from "./editor-helpers";

test("applies a task delay without changing the project finish", async ({ page }) => {
  await prepareEditor(page);
  await setSource(
    page,
    `@startgantt
Project starts 2026-09-21
saturday are closed
sunday are closed
[Long track] starts 2026-09-21
[Long track] lasts 20 days
[Long track] is 100% completed
[Short track] starts 2026-09-21
[Short track] lasts 3 days
[Short track] is 50% completed
@endgantt`,
  );
  await page.getByRole("button", { name: "Progress forecast: Off" }).click();
  await page.getByLabel("Forecast as of date").fill("2026-09-30");
  await page.getByRole("button", { name: "Apply to plan…" }).click();
  const dialog = page.getByRole("dialog", { name: "Apply forecast to plan" });
  await expect(dialog).toContainText("project finish unchanged");
  await expect(dialog).toContainText("Short track");
  await dialog.getByRole("button", { name: "Apply to plan" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".cm-content")).not.toContainText("[Short track] lasts 3 days");
  await expect(page.locator(".cm-content")).toContainText("[Long track] lasts 20 days");
});

test("reviews and applies a delayed cause, then undoes its plan and estimate", async ({ page }) => {
  await prepareEditor(page);
  await setSource(
    page,
    `@startgantt
Project starts 2026-09-20
printscale daily
sunday are closed
saturday are closed
[Architecture] starts 2026-09-21
[Architecture] lasts 4 days
[Architecture] is 100% completed
[Backend] lasts 8 days
[Backend] starts at [Architecture]'s end
[Backend] is 10% completed
[Frontend] lasts 10 days
[Frontend] starts at [Backend]'s end
@endgantt`,
  );
  await page.getByRole("button", { name: "Progress forecast: Off" }).click();
  await page.getByLabel("Forecast as of date").fill("2026-09-30");
  await page.getByRole("button", { name: "Apply to plan…" }).click();
  const dialog = page.getByRole("dialog", { name: "Apply forecast to plan" });
  await expect(dialog).toContainText("Backend");
  await expect(dialog).toContainText("Frontend");
  await expect(dialog).toContainText("Moves through dependency");
  await dialog.getByRole("button", { name: "Apply to plan" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".gantt-forecast-summary")).toContainText("+0 working days from plan");
  await expect(page.locator(".cm-content")).not.toContainText("[Backend] lasts 8 days");
  await expect(page.locator(".gantt-forecast-summary")).toContainText("saved remaining-work estimate");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".cm-content")).toContainText("[Backend] lasts 8 days");
  await expect(page.locator(".gantt-forecast-summary")).not.toContainText("saved remaining-work estimate");
});

test("applies a linked successor with a shorter saved remaining-work estimate", async ({ page }) => {
  await prepareEditor(page);
  await setSource(
    page,
    `@startgantt
Project starts 2026-09-20
sunday are closed
saturday are closed
[Architecture] starts 2026-09-21
[Architecture] lasts 6 days
[Architecture] is 75% completed
[Backend] lasts 8 days
[Frontend] lasts 10 days
[Testing] lasts 5 days
[Backend] starts at [Architecture]'s end
[Backend] is 10% completed
[Frontend] starts at [Backend]'s end
[Testing] starts at [Frontend]'s end
@endgantt`,
  );
  await page.getByRole("button", { name: "Progress forecast: Off" }).click();
  await page.getByLabel("Forecast as of date").fill("2026-09-30");
  await page
    .getByRole("navigation", { name: "Forecast tasks" })
    .getByRole("button", { name: /Testing/ })
    .click();
  await page.getByLabel("Remaining work · working days").fill("3");
  await page.getByLabel("Remaining work · working days").blur();
  await page.getByRole("button", { name: "Apply to plan…" }).click();
  const dialog = page.getByRole("dialog", { name: "Apply forecast to plan" });
  await expect(dialog).toContainText("[Testing] lasts 5 days");
  await expect(dialog).toContainText("lasts 3 days");
  await dialog.getByRole("button", { name: "Apply to plan" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".cm-content")).toContainText("[Testing] lasts 3 days");
  await expect(page.locator(".cm-content")).toContainText("[Testing] starts at [Frontend]'s end");
  await expect(page.locator(".gantt-forecast-summary")).toContainText("+0 working days from plan");
});

test("reviews allocation rounding before applying a resource-adjusted task", async ({ page }) => {
  await prepareEditor(page);
  await setSource(
    page,
    `@startgantt
Project starts 2026-09-21
saturday are closed
sunday are closed
[Build] starts 2026-09-21
[Build] on {Alice:50%} lasts 4 days
[Build] is 50% completed
@endgantt`,
  );
  await page.getByRole("button", { name: "Progress forecast: Off" }).click();
  await page.getByLabel("Forecast as of date").fill("2026-09-30");
  await page.getByRole("button", { name: "Apply to plan…" }).click();
  const dialog = page.getByRole("dialog", { name: "Apply forecast to plan" });
  await expect(dialog).toContainText("whole-day effort at 50% allocation");
  await expect(dialog).toContainText("2026-10-05 to 2026-10-06");
  await expect(dialog).toContainText("[Build] on {Alice:50%} lasts 6 days");
  await dialog.getByRole("button", { name: "Apply to plan" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".cm-content")).toContainText("[Build] on {Alice:50%} lasts 6 days");
  await expect(page.locator(".gantt-forecast-summary")).toContainText("+0 working days from plan");
});
