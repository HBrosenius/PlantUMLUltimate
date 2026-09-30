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

test("warns before exporting source without forecast settings", async ({ page }) => {
  await prepareEditor(page);
  await setSource(page, "@startgantt\nProject starts 2026-09-21\n[Design] lasts 4 days\n@endgantt");
  await page.getByRole("button", { name: "Progress forecast: Off" }).click();
  await page.getByLabel("Forecast as of date").fill("2026-09-29");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export", exact: true }).click();
  let warning = "";
  page.once("dialog", async (dialog) => {
    warning = dialog.message();
    await dialog.accept();
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menu", { name: "Export" }).getByRole("menuitem", { name: "Source" }).click();
  const download = await downloadPromise;
  expect(warning).toContain("Plain .puml source does not include the progress forecast setting");
  expect(warning).toContain("time zone");
  expect(download.suggestedFilename()).toMatch(/\.puml$/);
});

test("copies a forecast summary with dates and the finish driver", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Clipboard permissions are only consistently exposed by Chromium");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await prepareEditor(page);
  await setSource(
    page,
    "@startgantt\nProject starts 2026-09-21\n[Design] starts 2026-09-21\n[Design] lasts 4 days\n[Design] is 50% completed\n@endgantt",
  );
  await page.getByRole("button", { name: "Progress forecast: Off" }).click();
  await page.getByLabel("Forecast as of date").fill("2026-09-29");
  await page.getByRole("button", { name: "Copy summary" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Copied forecast summary" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("Progress forecast (as of 2026-09-29)");
  expect(copied).toContain("Planned finish:");
  expect(copied).toContain("Projected finish:");
  expect(copied).toContain("Finish drivers: Design");
});

test("copies individual delays when the project finish remains on plan", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Clipboard permissions are only consistently exposed by Chromium");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
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
  await page.getByRole("button", { name: "Copy summary" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("Working days from plan: 0");
  expect(copied).toContain("Delayed tasks: 1\n- Short track: 2026-09-23 → 2026-10-01");
});

test("changes and restores the document forecast time zone", async ({ page }) => {
  await prepareEditor(page);
  await setSource(page, "@startgantt\nProject starts 2026-09-21\n[Design] lasts 4 days\n@endgantt");
  await page.getByRole("button", { name: "Progress forecast: Off" }).click();
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Document settings…" }).click();
  const settings = page.getByRole("dialog", { name: "Document settings" });
  const zone = settings.getByRole("textbox", { name: "Forecast time zone" });
  await zone.fill("Made/Up");
  await expect(settings.getByRole("alert")).toContainText("Enter a valid time zone");
  await expect(settings.getByRole("button", { name: "Apply" })).toBeDisabled();
  await zone.fill("Pacific/Kiritimati");
  await settings.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".gantt-forecast-summary")).toContainText("Today in Pacific/Kiritimati");

  await page.reload();
  await expect(page.locator(".gantt-forecast-summary")).toContainText("Today in Pacific/Kiritimati");
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  if (await chooser.isVisible()) await chooser.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Document settings…" }).click();
  await expect(
    page.getByRole("dialog", { name: "Document settings" }).getByRole("textbox", { name: "Forecast time zone" }),
  ).toHaveValue("Pacific/Kiritimati");
});
