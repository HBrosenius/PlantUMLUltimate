import { expect, test } from "@playwright/test";
import { prepareEditor, openRibbonGroup } from "./editor-helpers";

test("local installs expose their address, distinctive manifest, icon and About details", async ({
  page,
}, testInfo) => {
  await prepareEditor(page);
  await expect(page).toHaveTitle("PlantUML Ultimate — Local");
  const banner = page.getByRole("note", { name: "App environment" });
  await expect(banner).toContainText("Local development");
  await expect(banner).toContainText(new URL(page.url()).origin);
  await expect(banner.getByRole("link", { name: "Open production app" })).toHaveAttribute(
    "href",
    "https://plantuml.brosenius.se",
  );
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest-local.webmanifest");
  const manifest = await (await page.request.get("/manifest-local.webmanifest")).json();
  expect(manifest.name).toBe("PlantUML Ultimate — Local");
  expect(manifest.icons[0].src).toBe("/icon-local.svg");
  expect((await page.request.get(manifest.icons[0].src)).ok()).toBe(true);
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await page.getByText("About this app", { exact: true }).click();
  const about = page.locator(".help-about");
  await expect(about).toContainText(new URL(page.url()).origin);
  await expect(about).toContainText("Local development");
  await expect(about.locator("dd").last()).toHaveText(/^\d+\.\d+\.\d+/);
  await page.screenshot({ path: testInfo.outputPath("about-local.png") });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 375, height: 844 });
  await expect(banner).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("local-mobile.png") });
});

test("failed local Jira requests explain the local server dependency", async ({ page }) => {
  await page.route("**/__jira/api/**", (route) => route.abort());
  await page.route("https://jira.plantuml.brosenius.se/api/**", (route) => route.abort());
  await prepareEditor(page);
  await openRibbonGroup(page, "Plan", "Planning tools");
  await page.getByRole("button", { name: "Jira…", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Jira integration" })).toContainText("Start that server");
  await expect(page.getByRole("dialog", { name: "Jira integration" })).toContainText("https://plantuml.brosenius.se");
});
