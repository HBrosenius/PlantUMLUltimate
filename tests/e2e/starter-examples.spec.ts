import { expect, test } from "@playwright/test";

test("creates a document from a starter example", async ({ page }) => {
  await page.goto("/");
  const onboarding = page.getByRole("dialog", { name: "Welcome to PlantUML Ultimate" });
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await Promise.race([onboarding.waitFor({ state: "visible" }), chooser.waitFor({ state: "visible" })]);
  if (await onboarding.isVisible()) {
    // The Code view is hidden in basic mode, so opt into advanced mode to inspect the source.
    await onboarding.getByRole("radio", { name: "Diagram + code" }).check();
    await onboarding.getByRole("button", { name: "Get started" }).click();
  }
  await expect(chooser).toBeVisible();
  await expect(chooser.getByRole("heading", { name: "Start from an example" })).toBeVisible();
  await chooser.getByRole("button", { name: /Login with OAuth/ }).click();

  await expect(chooser).toBeHidden();
  const editor = page.locator(".cm-content");
  await expect(editor).toContainText('participant "Identity provider" as IdP');
  await expect(editor).toContainText("alt consent granted");
  await expect(page.getByText("login-with-oauth.pumlu").first()).toBeVisible();
  await expect(page.locator(".diagram svg")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".diagram svg")).not.toContainText("Syntax Error");
  await expect(page.locator(".diagram svg")).toContainText("Exchange code for tokens");
});
