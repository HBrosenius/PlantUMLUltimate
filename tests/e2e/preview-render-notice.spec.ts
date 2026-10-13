import { expect, test } from "@playwright/test";
import { fillSource, prepareEditor } from "./editor-helpers";

test("keeps a failed Sequence update visible with its previous diagram and retry", async ({ page }) => {
  test.setTimeout(90_000);
  await page.route("**/__renderer_assets__/canonical.worker.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `
      addEventListener("message", (event) => {
        if (event.data?.type === "render" && event.data.renderSource?.includes("FAIL_NOTICE_TEST")) {
          event.stopImmediatePropagation();
          postMessage({ type: "result", requestId: event.data.requestId, error: "Test render failure" });
        }
      }, true);
      ${await response.text()}`,
    });
  });
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram", exact: true })
    .click();
  await fillSource(page, "@startuml\nAlice -> Bob: Previous successful diagram\n@enduml");
  const svg = page.locator(".diagram svg");
  await expect(svg).toContainText("Previous successful diagram", { timeout: 45_000 });
  await fillSource(page, "@startuml\nAlice -> Bob: FAIL_NOTICE_TEST\n@enduml");
  const notice = page.locator(".render-notice.error");
  await expect(notice).toContainText("Test render failure");
  await expect(notice).toContainText("last successful diagram");
  await expect(svg).toContainText("Previous successful diagram");
  await notice.getByRole("button", { name: "Retry rendering" }).click();
  await expect(notice).toContainText("Test render failure");
  await fillSource(page, "@startuml\nAlice -> Bob: Corrected diagram\n@enduml");
  await expect(svg).toContainText("Corrected diagram", { timeout: 45_000 });
  await expect(page.locator(".render-notice")).toHaveCount(0);
  await expect(page.locator(".render-details summary")).toHaveText("Preview current");
});
