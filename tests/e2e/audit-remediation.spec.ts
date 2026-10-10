import { test, expect, type Page } from "@playwright/test";

const key = "plantuml-studio.workspace.recovery.v6";
const source = (label: string) => `@startgantt\nProject starts 2026-09-01\n[${label}] lasts 2 days\n@endgantt`;
const document = (id: string) => ({
  id,
  historyId: `audit-${id}`,
  diagramKind: "gantt",
  source: source(id),
  fileName: `${id}.pumlu`,
  dirty: true,
  zoom: 1,
  cursor: { line: 1, column: 1 },
  revision: 0,
});
const session = {
  version: 7,
  documents: [document("A"), document("B")],
  activeDocumentId: "A",
  viewMode: "code",
  splitPercent: 50,
  theme: "light",
  advancedMode: true,
  defaultDiagramTheme: "",
  onboarded: true,
};
async function open(page: Page) {
  await page.goto("/");
  await expect(page.locator(".cm-content")).toBeVisible();
}
test.beforeEach(async ({ context }) => {
  await context.addInitScript(
    ({ key, session }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(session));
    },
    { key, session },
  );
});
test("save completion belongs to its original document after tab switching", async ({ page }) => {
  await page.addInitScript(() => {
    let bytes: BlobPart;
    (window as unknown as { showSaveFilePicker: () => Promise<unknown> }).showSaveFilePicker = async () => ({
      name: "saved-A.pumlu",
      getFile: async () => new File([bytes], "saved-A.pumlu"),
      createWritable: async () => ({
        write: async (data: BlobPart) => {
          bytes = data;
        },
        close: () =>
          new Promise<void>((resolve) => {
            (window as unknown as { finishSave: () => void }).finishSave = resolve;
          }),
      }),
    });
  });
  await open(page);
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save as…" }).click();
  await page.waitForFunction(() => Boolean((window as unknown as { finishSave?: unknown }).finishSave));
  await page.locator(".document-tabs > button").filter({ hasText: "B.pumlu" }).click();
  await page.evaluate(() => (window as unknown as { finishSave: () => void }).finishSave());
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).documents.find((d: { id: string }) => d.id === "A").dirty,
        key,
      ),
    )
    .toBe(false);
  const documents = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).documents, key);
  expect(documents.find((d: { id: string }) => d.id === "B")).toMatchObject({ fileName: "B.pumlu", dirty: true });
});
test("reloading one window restores its own session", async ({ page, context }) => {
  await open(page);
  const other = await context.newPage();
  await open(other);
  await other.locator(".cm-content").fill(source("OTHER"));
  await expect.poll(() => other.evaluate((key) => localStorage.getItem(key), key)).toContain("OTHER");
  await page.reload();
  await expect(page.locator(".cm-content")).toContainText("[A]");
  await expect(page.locator(".cm-content")).not.toContainText("OTHER");
});
test("stale render cannot be exported after switching documents", async ({ page }) => {
  test.setTimeout(75_000);
  await open(page);
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.locator(".diagram svg")).toContainText("A", { timeout: 60_000 });
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await page.locator(".document-tabs > button").filter({ hasText: "B.pumlu" }).click();
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Export/ }).hover();
  await expect(page.getByRole("menuitem", { name: "SVG", exact: true })).toBeDisabled();
});
test("resource directives are blocked for every line ending", async ({ page }) => {
  await page.goto("/");
  const filtered = await page.evaluate(async () => {
    const path = "/src/render/plantuml-source.ts";
    const { sourceForPlantUmlRenderer } = await import(path);
    return ["\r", "\n", "\r\n"].map((separator) =>
      sourceForPlantUmlRenderer(["@startuml", "!includeurl https://example.invalid/audit", "@enduml"].join(separator)),
    );
  });
  for (const text of filtered) expect(text).not.toContain("!includeurl");
});
test("editor starts when localStorage is denied", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Denied", "SecurityError");
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("button", { name: "File", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);
});
test("CPU-bound rendering in a warm worker is terminated while the editor remains responsive", async ({
  page,
  browserName,
}) => {
  test.setTimeout(60_000);
  if (browserName !== "webkit") await page.clock.install();
  await page.route("**/__renderer_assets__/canonical.worker.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `let calls = 0;
        self.onmessage = ({ data }) => {
          if (data.type === "initialize") self.postMessage({ type: "ready", nativeTextMetrics: true });
          if (data.type !== "render") return;
          if (++calls === 1) self.postMessage({ type: "result", requestId: data.requestId, durationMs: 1,
            svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Warmed</text></svg>' });
          else { while (true) {} }
        };`,
    }),
  );
  await open(page);
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.locator('iframe[title="Local PlantUML renderer"]')).toHaveCount(1);
  await expect(page.locator(".diagram svg")).toContainText("Warmed", { timeout: 15_000 });
  await page.locator(".cm-content").fill(source("Loop"));
  await page.waitForTimeout(1500);
  if (browserName !== "webkit") await page.clock.fastForward(31_000);
  await expect(page.getByText(/Rendering timed out/).first()).toBeVisible({ timeout: 35_000 });
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
});

test("stalled renderer initialization reaches an error and offers retry", async ({ page, browserName }) => {
  test.setTimeout(60_000);
  if (browserName !== "webkit") await page.clock.install();
  await page.route("**/__renderer_assets__/canonical.worker.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "self.onmessage = () => {};",
    }),
  );
  await open(page);
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.locator('iframe[title="Local PlantUML renderer"]')).toHaveCount(1);
  if (browserName !== "webkit") {
    await page.clock.fastForward(16_000);
    await page.waitForTimeout(300);
    await page.clock.fastForward(16_000);
  }
  await expect(page.getByText(/could not start after an automatic retry/).first()).toBeVisible({ timeout: 35_000 });
  await expect(page.getByRole("button", { name: "Retry rendering" })).toBeVisible();
});
