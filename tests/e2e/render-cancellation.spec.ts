import { expect, test, type Page } from "@playwright/test";
import { prepareEditor, fillSource, readEditorSource, setSource } from "./editor-helpers";

test.describe.configure({ timeout: 90_000 });

async function holdObsoleteRender(page: Page) {
  await page.route("**/__renderer_assets__/canonical.worker.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `
      addEventListener("message", (event) => {
        if (event.data?.type === "render" && event.data.renderSource?.includes("HOLD_RENDER_FOR_TEST")) {
          event.stopImmediatePropagation();
          console.info("render-test-held");
        }
      }, true);
      ${await response.text()}`,
    });
  });
}

test("replaces a held obsolete render while Split view stays editable", async ({ page }) => {
  await holdObsoleteRender(page);
  await prepareEditor(page);
  await setSource(page, "@startgantt\n[Original preview] lasts 2 days\n@endgantt");
  const frame = await page.locator('iframe[title="Local PlantUML renderer"]').elementHandle();
  const held = page.waitForEvent("console", { predicate: (message) => message.text() === "render-test-held" });
  await fillSource(page, "@startgantt\n[HOLD_RENDER_FOR_TEST] lasts 2 days\n@endgantt");
  await held;
  const latest = "@startgantt\n[Latest editable preview] lasts 3 days\n@endgantt";
  await fillSource(page, latest);
  await expect(page.locator(".diagram svg")).toContainText("Latest editable preview", { timeout: 45_000 });
  await expect(page.locator(".diagram svg")).not.toContainText("HOLD_RENDER_FOR_TEST");
  expect(await readEditorSource(page)).toBe(latest);
  // Replacing a worker should retain its sandbox frame and avoid a full asset reload.
  expect(await frame!.evaluate((element) => element.isConnected)).toBe(true);
  await expect(page.locator('iframe[title="Local PlantUML renderer"]')).toHaveCount(1);
});

for (const operation of ["switch", "close"] as const) {
  test(`${operation} disposes a held render and shows the other document`, async ({ page }) => {
    await holdObsoleteRender(page);
    await prepareEditor(page);
    await setSource(page, "@startgantt\n[Original preview] lasts 2 days\n@endgantt");
    await page.getByRole("button", { name: "New diagram tab" }).click();
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: "Gantt diagram", exact: true })
      .click();
    await setSource(page, "@startgantt\n[Other document] lasts 3 days\n@endgantt");
    const tabs = page.locator(".document-tabs > button:not(.new-tab)");
    await tabs.first().click();
    await expect(page.locator(".diagram svg")).toContainText("Original preview");
    const oldFrame = await page.locator('iframe[title="Local PlantUML renderer"]').elementHandle();
    const held = page.waitForEvent("console", { predicate: (message) => message.text() === "render-test-held" });
    await fillSource(page, "@startgantt\n[HOLD_RENDER_FOR_TEST] lasts 2 days\n@endgantt");
    await held;
    if (operation === "switch") await tabs.nth(1).click();
    else {
      page.on("dialog", (dialog) => dialog.accept());
      await tabs
        .first()
        .getByRole("button", { name: /^Close / })
        .click();
    }
    await expect(page.locator(".diagram svg")).toContainText("Other document");
    await expect.poll(() => oldFrame!.evaluate((element) => element.isConnected)).toBe(false);
    await expect(tabs).toHaveCount(operation === "switch" ? 2 : 1);
    await expect(page.locator('iframe[title="Local PlantUML renderer"]')).toHaveCount(1);
  });
}
