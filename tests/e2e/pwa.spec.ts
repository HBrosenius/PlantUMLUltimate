import { expect, test } from "@playwright/test";

test("installs its offline shell and starts without a network", async ({ page, context }) => {
  test.skip(!process.env.PWA_E2E, "Requires the production preview server");
  await page.goto("/");
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.ready;
    return Boolean(registration.active);
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await expect(page.locator(".toolbar")).toContainText("PlantUML Ultimate");

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".toolbar")).toContainText("PlantUML Ultimate");
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.locator(".connection-offline")).toContainText("Offline");
});
