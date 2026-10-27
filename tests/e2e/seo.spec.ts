import { expect, test } from "@playwright/test";

test.use({ javaScriptEnabled: false });

test("serves the guide and discovery metadata without JavaScript", async ({ page, request }) => {
  await page.goto("/guide/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create PlantUML diagrams in your browser");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://plantuml.brosenius.se/guide/");
  await expect(page.getByRole("link", { name: "Start editing diagrams" })).toHaveAttribute("href", "/");
  await expect(page.locator("pre code")).toHaveCount(3);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/seo-guide-mobile.png" });

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain("<loc>https://plantuml.brosenius.se/guide/</loc>");
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain("Sitemap: https://plantuml.brosenius.se/sitemap.xml");

  await page.goto("/");
  await expect(page).toHaveTitle("PlantUML Ultimate — Online PlantUML Editor");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://plantuml.brosenius.se/");
  await page.getByRole("link", { name: "PlantUML editor guide and diagram examples" }).click();
  await expect(page).toHaveURL(/\/guide\/$/);
});
