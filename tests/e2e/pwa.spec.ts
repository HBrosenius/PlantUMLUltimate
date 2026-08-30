import { expect, test } from "@playwright/test";

test("starts its production renderer and cached offline shell", async ({ page, context, browserName }) => {
  test.skip(!process.env.PWA_E2E, "Requires the production preview server");
  const dismissOnboarding = async () => {
    const onboarding = page.getByRole("dialog", { name: "Choose a diagram type" });
    await onboarding
      .waitFor({ state: "visible", timeout: 2_000 })
      .then(() => onboarding.getByRole("button", { name: "Cancel" }).click())
      .catch(() => undefined);
  };
  await page.goto("/");
  await dismissOnboarding();
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.ready;
    return Boolean(registration.active);
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await expect(page.locator(".toolbar")).toContainText("PlantUML Ultimate");
  await expect(page.locator(".diagram svg")).toBeVisible();
  if (browserName === "webkit") return;

  await context.setOffline(true);
  await page.reload();
  await dismissOnboarding();
  await expect(page.locator(".toolbar")).toContainText("PlantUML Ultimate");
  await expect(page.locator(".diagram svg")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.locator(".connection-offline")).toContainText("Offline");
});
