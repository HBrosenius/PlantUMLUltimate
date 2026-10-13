import { expect, test } from "@playwright/test";
import { fillSource, prepareEditor, readEditorSource, source } from "./editor-helpers";

const key = "plantuml-studio.workspace.recovery.v6";
const first = source("[Unsaved delivery] lasts 3 days");
const second = "@startuml\nAlice -> Bob: Unsaved discussion\n@enduml";

test("reopens unsaved tabs, their active selection and a scenario without IndexedDB", async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { get: () => undefined });
  });
  await prepareEditor(page);
  await fillSource(page, first);
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("menuitem", { name: "What-if scenario…", exact: true }).click();
  const scenario = page.getByRole("dialog", { name: "What-if scenario", exact: true });
  await scenario.getByLabel("Scenario name", { exact: true }).fill("Crash recovery alternative");
  await scenario.getByLabel("Scenario assumptions", { exact: true }).fill("Keep two extra days");
  await scenario.getByLabel("Scenario duration", { exact: true }).fill("5");
  await scenario.getByRole("button", { name: "Update scenario", exact: true }).click();
  await scenario.getByRole("button", { name: "Save scenario", exact: true }).click();
  await expect(scenario.getByRole("status")).toContainText("Saved");
  await scenario.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram", exact: true })
    .click();
  await fillSource(page, second);
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const saved = JSON.parse(localStorage.getItem(key)!);
        return saved.documents.find((item: { id: string }) => item.id === saved.activeDocumentId)?.source;
      }, key),
    )
    .toBe(second);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto("/");
  await expect(reopened.locator(".cm-content")).toBeVisible();
  expect(await readEditorSource(reopened)).toBe(second);
  const tabs = reopened.locator(".document-tabs > button:not(.new-tab)");
  await expect(tabs).toHaveCount(2);
  await expect(reopened.locator(".file-save-indicator")).toContainText("Unsaved");
  await tabs.first().click();
  expect(await readEditorSource(reopened)).toBe(first);
  await reopened.getByRole("button", { name: "Plan", exact: true }).click();
  await reopened.getByRole("menuitem", { name: "What-if scenario…", exact: true }).click();
  const restored = reopened.getByRole("dialog", { name: "What-if scenario", exact: true });
  await restored.getByLabel("Saved scenario", { exact: true }).selectOption({ label: "Crash recovery alternative" });
  await restored.getByRole("button", { name: "Open saved scenario", exact: true }).click();
  await expect(restored.getByLabel("Scenario duration", { exact: true })).toHaveValue("5");
  await expect(restored.getByLabel("Scenario assumptions", { exact: true })).toHaveValue("Keep two extra days");
});

for (const damaged of ["null", '{"recoverySavedAt":9007199254740991,"documents":[null]}']) {
  test(`restores IndexedDB work when recovery journals contain ${damaged}`, async ({ page }) => {
    await prepareEditor(page);
    await fillSource(page, first);
    // Wait for the asynchronous backup, then damage only the synchronous copies.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<string | undefined>((resolve, reject) => {
              const open = indexedDB.open("plantuml-studio", 2);
              open.onerror = () => reject(open.error);
              open.onsuccess = () => {
                const db = open.result;
                const request = db
                  .transaction("workspace")
                  .objectStore("workspace")
                  .get(`current:${history.state.plantumlRecovery}`);
                request.onsuccess = () => {
                  resolve(request.result?.documents[0]?.source);
                  db.close();
                };
                request.onerror = () => {
                  reject(request.error);
                  db.close();
                };
              };
            }),
        ),
      )
      .toBe(first);
    await page.addInitScript(
      ({ key, damaged }) => {
        localStorage.setItem(key, damaged);
        localStorage.setItem(`${key}:${history.state.plantumlRecovery}`, damaged);
      },
      { key, damaged },
    );
    await page.reload();
    await expect(page.locator(".cm-content")).toBeVisible();
    expect(await readEditorSource(page)).toBe(first);
    await page.getByRole("button", { name: /^Browser storage:/ }).click();
    await expect(page.getByRole("region", { name: "Browser recovery details" })).toContainText(
      "Another saved copy was restored",
    );
  });
}

test("explains how to recover when every stored copy is damaged", async ({ page }) => {
  await page.addInitScript((key) => {
    if (!sessionStorage.getItem("damaged-fixture")) {
      localStorage.setItem(key, "null");
      sessionStorage.setItem("damaged-fixture", "1");
    }
  }, key);
  await page.goto("/");
  const storage = page.getByRole("button", { name: /^Browser storage:/ });
  await expect(storage).toContainText("Recovery unavailable");
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Gantt diagram", exact: true })
    .click();
  await expect(page.locator(".cm-content")).toBeVisible();
  await storage.click();
  await expect(page.getByRole("region", { name: "Browser recovery details" })).toContainText("Restore workspace");
});
