import { expect, test } from "@playwright/test";
import { fillSource, prepareEditor } from "./editor-helpers";

test.use({ locale: "sv-SE" });

test("forecast report exports projected dates and a plan comparison chart", async ({ page }) => {
  await prepareEditor(page);
  await fillSource(
    page,
    "@startgantt\n[API] on {Alice} starts 2026-10-01\n[API] lasts 5 days\n[API] is 40% completed\n@endgantt",
  );
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("menuitem", { name: "Reports…" }).click();
  const dialog = page.locator(".reports-dialog");
  await dialog.getByLabel("Report type", { exact: true }).selectOption("forecast");
  await dialog.getByLabel("As-of date", { exact: true }).fill("2026-10-08");
  const body = page.frameLocator('iframe[title="Exported email preview"]').locator("body");
  await expect(body).toContainText("Project projected finish: 2026-10-10");
  await expect(body).toContainText("3 working days (automatic)");
  await expect(body.locator("strong").filter({ hasText: "Forecast past planned finish" })).toBeVisible();
  await dialog.getByLabel("Include plan and forecast chart", { exact: true }).check();
  await expect(dialog.getByRole("button", { name: "Copy chart 1", exact: true })).toBeVisible();
  await expect(body.locator("img")).toHaveAttribute("src", /^data:image\/png/);
  await expect(body).toContainText("Plan and forecast · panel 1");
});

test("expanded reports preserve uncertainty and require explicit history capture", async ({ page }) => {
  await prepareEditor(page);
  await fillSource(
    page,
    "@startgantt\nProject starts 2026-10-01\n[API] as [api] on {Alice} starts 2026-10-01\n[api] ends 2026-10-07\n[api] is 60% completed\n[Docs] as [docs] on {Alice} starts 2026-10-08\n[docs] ends 2026-10-12\n@endgantt",
  );
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("menuitem", { name: "Reports…" }).click();
  const dialog = page.locator(".reports-dialog");
  await dialog.getByLabel("As-of date", { exact: true }).fill("2026-10-08");
  await dialog.getByLabel("Report type", { exact: true }).selectOption("progress");
  const body = page.frameLocator('iframe[title="Exported email preview"]').locator("body");
  await expect(body).toContainText("0.4 known remaining + up to 1 unknown");
  await dialog.getByLabel("Report type", { exact: true }).selectOption("history");
  await expect(body).toContainText("at least two comparable explicit observations");
  await dialog.getByRole("button", { name: "Record progress snapshot" }).click();
  await expect(dialog.getByRole("button", { name: "Refresh report" })).toBeVisible();
  await dialog.getByRole("button", { name: "Refresh report" }).click();
  await expect(dialog.getByLabel("Baseline reference segment").locator("option")).toHaveCount(1);
  await expect(body).toContainText("at least two comparable explicit observations");
});

test("report wording persists and Swedish dates appear in the exported preview", async ({ page }) => {
  await prepareEditor(page);
  await fillSource(
    page,
    "@startgantt\nProject starts 2026-10-01\n[Design review] on {Alice} starts 2026-10-01\n[Design review] lasts 3 days\n@endgantt",
  );
  const openReports = async () => {
    await page.getByRole("button", { name: "Plan", exact: true }).click();
    await page.getByRole("menuitem", { name: "Reports…" }).click();
  };
  await openReports();
  const dialog = page.locator(".reports-dialog");
  await dialog.getByLabel("As-of date", { exact: true }).fill("2026-10-08");
  await dialog.getByText("Message wording", { exact: true }).click();
  await dialog.getByLabel("Introduction", { exact: true }).fill("Please send your update.");
  await dialog.getByLabel("Sign-off", { exact: true }).fill("Tack,\nHenri");
  await expect(page.frameLocator('iframe[title="Exported email preview"]').locator("body")).toContainText(
    "As of 2026-10-08",
  );
  await dialog.screenshot({ path: "test-results/reports-desktop.png" });
  await dialog.getByRole("button", { name: "Close reports" }).click();
  await openReports();
  await dialog.getByText("Message wording", { exact: true }).click();
  await expect(dialog.getByLabel("Introduction", { exact: true })).toHaveValue("Please send your update.");
  await expect(dialog.getByLabel("Sign-off", { exact: true })).toHaveValue("Tack,\nHenri");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByRole("button", { name: "Copy for email", exact: true })).toBeVisible();
  const width = await dialog.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
  await dialog.screenshot({ path: "test-results/reports-mobile.png" });
});

test("opens Issues from a report error and restores the report draft", async ({ page }) => {
  await prepareEditor(page);
  await fillSource(page, "@startgantt\n[A] lasts -2 days\n@endgantt");
  const openReports = async () => {
    await page.getByRole("button", { name: "Plan", exact: true }).click();
    await page.getByRole("menuitem", { name: "Reports…" }).click();
  };
  await openReports();
  const dialog = page.locator(".reports-dialog");
  await dialog.getByText("Message wording", { exact: true }).click();
  await dialog.getByLabel("Introduction", { exact: true }).fill("Keep my report draft");
  await dialog.getByRole("button", { name: "Open Issues", exact: true }).click();
  await expect(dialog).toBeHidden();
  const issues = page.getByRole("complementary", { name: "Issues", exact: true });
  await expect(issues).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(issues).toBeHidden();
  await openReports();
  await dialog.getByText("Message wording", { exact: true }).click();
  await expect(dialog.getByLabel("Introduction", { exact: true })).toHaveValue("Keep my report draft");
});

test("unassigned plans offer an explicit summary and explain scope exclusions", async ({ page }) => {
  await prepareEditor(page);
  await fillSource(page, "@startgantt\nProject starts 2099-10-01\n[A] starts 2099-10-01\n[A] lasts 3 days\n@endgantt");
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("menuitem", { name: "Reports…" }).click();
  const dialog = page.locator(".reports-dialog");
  await expect(dialog.getByText(/No people are assigned/)).toBeVisible();
  await dialog.getByRole("button", { name: "Create coordinator summary", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Tasks", exact: true })).toHaveValue("All tasks");
  await expect(page.frameLocator('iframe[title="Exported email preview"]').locator("body")).toContainText("A");
  await dialog.getByText("Individual tasks · 0 excluded", { exact: true }).click();
  await dialog.getByLabel("A", { exact: true }).uncheck();
  await expect(dialog.getByText("All candidate tasks are individually excluded.")).toBeVisible();
  await dialog.getByRole("button", { name: "Reset exclusions", exact: true }).click();
  await expect(page.frameLocator('iframe[title="Exported email preview"]').locator("body")).toContainText("A");
  await dialog.screenshot({ path: "test-results/a15-reports.png" });
  await dialog.getByRole("button", { name: "Close reports" }).click();
  await page.getByRole("button", { name: "Workload", exact: true }).click();
  const workload = page.getByRole("complementary", { name: "Resource workload", exact: true });
  await workload.getByRole("button", { name: "Create coordinator summary", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Output", exact: true })).toHaveValue("combined");
  await expect(page.frameLocator('iframe[title="Exported email preview"]').locator("body")).toContainText("A");
  await page.setViewportSize({ width: 390, height: 844 });
  const width = await dialog.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
  await dialog.screenshot({ path: "test-results/a15-reports-phone.png" });
});
