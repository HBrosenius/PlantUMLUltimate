import { expect, test } from "@playwright/test";
import { fillSource, readEditorSource } from "./editor-helpers";

const diagrams = {
  gantt: (label: string) => `@startgantt\n[${label}] lasts 2 days\n@endgantt`,
  sequence: (label: string) => `@startuml\nAlice -> Bob: ${label}\n@enduml`,
  class: (label: string) => `@startuml\nclass "${label}" as Item\n@enduml`,
  component: (label: string) => `@startuml\ncomponent "${label}" as Item\n@enduml`,
  activity: (label: string) => `@startuml\n:${label};\n@enduml`,
  usecase: (label: string) => `@startuml\nusecase "${label}" as Item\n@enduml`,
  wbs: (label: string) => `@startwbs\n* ${label}\n@endwbs`,
};

for (const [kind, source] of Object.entries(diagrams)) {
  test(`${kind} recovers from failure, slow rendering and timeout, including Retry and switching tabs`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.route("**/__renderer_assets__/canonical.worker.js", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: `
          addEventListener("message", (event) => {
            if (event.data?.type !== "render") return;
            if (event.data.renderSource?.includes("FAIL_NOTICE_TEST")) {
              event.stopImmediatePropagation();
              console.info("notice-test-failed");
              postMessage({ type: "result", requestId: event.data.requestId, error: "Test render failure" });
            } else if (event.data.renderSource?.includes("HOLD_NOTICE_TEST")) {
              event.stopImmediatePropagation();
              console.info("notice-test-held");
            }
          }, true);
          ${await response.text()}`,
      });
    });
    await page.addInitScript(
      ({ kind, original, other }) => {
        localStorage.setItem(
          "plantuml-studio.workspace.recovery.v6",
          JSON.stringify({
            version: 8,
            documents: [
              { id: "A", diagramKind: kind, source: original, fileName: "Recovery.pumlu" },
              { id: "B", diagramKind: "gantt", source: other, fileName: "Other.pumlu" },
            ].map((doc) => ({
              ...doc,
              historyId: doc.id,
              dirty: true,
              zoom: 1,
              cursor: { line: 1, column: 1 },
              revision: 0,
            })),
            activeDocumentId: "A",
            viewMode: "split",
            splitPercent: 50,
            theme: "light",
            advancedMode: true,
            defaultDiagramTheme: "",
            onboarded: true,
          }),
        );
      },
      { kind, original: source("Previous successful diagram"), other: diagrams.gantt("Other document") },
    );
    await page.goto("/");
    const svg = page.locator(".diagram svg");
    await expect(svg).toContainText("Previous successful diagram", { timeout: 45_000 });
    await fillSource(page, source("FAIL_NOTICE_TEST"));
    const error = page.locator(".render-notice.error");
    await expect(error).toContainText("Test render failure");
    await expect(error).toContainText("last successful diagram");
    await expect(svg).toContainText("Previous successful diagram");
    const failedRetry = page.waitForEvent("console", {
      predicate: (message) => message.text() === "notice-test-failed",
    });
    await error.getByRole("button", { name: "Retry rendering" }).click();
    await failedRetry;
    await expect(error).toContainText("Test render failure");

    // Advance only the browser's timers once the worker has accepted the held request.
    // Exercise the real 5s notice and 30s timeout without adding those waits to CI.
    await page.clock.install();
    const held = page.waitForEvent("console", { predicate: (message) => message.text() === "notice-test-held" });
    await fillSource(page, source("HOLD_NOTICE_TEST"));
    await held;
    await page.clock.fastForward(5_001);
    await expect(page.locator(".render-notice.rendering")).toContainText("Still rendering preview");
    await expect(svg).toContainText("Previous successful diagram");
    await page.clock.fastForward(25_001);
    await expect(error).toContainText("Rendering timed out");
    await expect(svg).toContainText("Previous successful diagram");
    const heldRetry = page.waitForEvent("console", { predicate: (message) => message.text() === "notice-test-held" });
    await error.getByRole("button", { name: "Retry rendering" }).click();
    await heldRetry;
    const retiredFrame = await page.locator('iframe[title="Local PlantUML renderer"]').elementHandle();
    await page.locator(".document-tabs > button").filter({ hasText: "Other.pumlu" }).click();
    await expect(svg).toContainText("Other document", { timeout: 45_000 });
    await expect.poll(() => retiredFrame!.evaluate((element) => element.isConnected)).toBe(false);
    const heldAgain = page.waitForEvent("console", { predicate: (message) => message.text() === "notice-test-held" });
    await page.locator(".document-tabs > button").filter({ hasText: "Recovery.pumlu" }).click();
    await heldAgain;
    const corrected = source("Corrected diagram");
    await fillSource(page, corrected);
    await expect(svg).toContainText("Corrected diagram", { timeout: 45_000 });
    expect(await readEditorSource(page)).toBe(corrected);
    await expect(svg).not.toContainText("Other document");
    await expect(page.locator(".render-notice")).toHaveCount(0);
    await expect(page.locator(".render-details summary")).toHaveText("Preview current");
    await expect(page.locator('iframe[title="Local PlantUML renderer"]')).toHaveCount(1);
  });
}
