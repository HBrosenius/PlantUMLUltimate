import { expect, test } from "@playwright/test";
import { fillSource, prepareEditor } from "./editor-helpers";

test.use({ locale: "sv-SE" });

test("report wording persists and Swedish dates appear in the exported preview", async ({ page }) => {
  await prepareEditor(page);
  await fillSource(
    page,
    "@startgantt\nProject starts 2026-10-01\n[Design review] on {Alice} starts 2026-10-01\n[Design review] lasts 3 days\n@endgantt",
  );
  const openReports = async () => {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "Reports…" }).click();
  };
  await openReports();
  const dialog = page.locator(".reports-dialog");
  await dialog.getByLabel("As-of date", { exact: true }).fill("2026-10-08");
  await dialog.getByLabel("Introduction", { exact: true }).fill("Please send your update.");
  await dialog.getByLabel("Sign-off", { exact: true }).fill("Tack,\nHenri");
  await expect(page.frameLocator('iframe[title="Exported email preview"]').locator("body")).toContainText(
    "As of 2026-10-08",
  );
  await dialog.screenshot({ path: "test-results/reports-desktop.png" });
  await dialog.getByRole("button", { name: "Close reports" }).click();
  await openReports();
  await expect(dialog.getByLabel("Introduction", { exact: true })).toHaveValue("Please send your update.");
  await expect(dialog.getByLabel("Sign-off", { exact: true })).toHaveValue("Tack,\nHenri");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByRole("button", { name: "Copy for email", exact: true })).toBeVisible();
  const width = await dialog.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
  await dialog.screenshot({ path: "test-results/reports-mobile.png" });
});
