import { test, expect } from "@playwright/test";
import { fillSource, readEditorSource } from "./editor-helpers";

test.describe.configure({ timeout: 90_000 });

const source = (label: string, count = 1) =>
  [
    "@startgantt",
    `title ${label}`,
    "Project starts 2026-10-01",
    ...Array.from({ length: count }, (_, i) => `[${label} task ${i + 1}] lasts 2 days`),
    "@endgantt",
  ].join("\n");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ a, b }) => {
      localStorage.setItem(
        "plantuml-studio.workspace.recovery.v6",
        JSON.stringify({
          version: 7,
          documents: [a, b].map((text, i) => ({
            id: i ? "B" : "A",
            historyId: `preview-recovery-${i}`,
            diagramKind: "gantt",
            source: text,
            fileName: i ? "B.pumlu" : "A.pumlu",
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
    { a: source("Document A"), b: source("Document B") },
  );
  await page.goto("/");
  await expect(page.locator(".diagram svg")).toContainText("Document A", { timeout: 45_000 });
  await expect(page.locator(".render-details summary")).toHaveText("Preview current");
});

test("recovers from invalid syntax through Undo, Redo and a corrected latest source", async ({ page }) => {
  const original = source("Document A");
  const invalid = "@startgantt\n[Broken] starts nope\n@endgantt";
  const current = page.locator(".render-details summary");
  const preview = page.locator(".diagram svg");
  await fillSource(page, invalid);
  await expect(page.locator(".preview[data-render-status]")).toHaveAttribute("data-render-status", "error", {
    timeout: 45_000,
  });
  await expect(current).toHaveText("Showing last valid preview");
  await expect(preview).toContainText("Document A");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).toBe(original);
  await expect(current).toHaveText("Preview current");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).toBe(invalid);
  await expect(page.locator(".preview[data-render-status]")).toHaveAttribute("data-render-status", "error", {
    timeout: 45_000,
  });
  await expect(current).toHaveText("Showing last valid preview");
  await fillSource(page, source("Corrected latest"));
  await expect(preview).toContainText("Corrected latest", { timeout: 45_000 });
  await expect(current).toHaveText("Preview current");
  await expect(preview).not.toContainText("Document A");
  await expect(page.locator(".preview[data-render-status]")).toHaveAttribute("data-render-status", "idle");
});

test("keeps each document's latest preview after switching during rendering and Undo/Redo", async ({ page }) => {
  const updated = source("Pending A", 150);
  await fillSource(page, updated);
  await expect(page.locator(".preview[data-render-status]")).toHaveAttribute("data-render-status", "rendering");
  await page.locator(".document-tabs > button").filter({ hasText: "B.pumlu" }).click();
  await expect.poll(() => readEditorSource(page)).toBe(source("Document B"));
  await expect(page.locator(".diagram svg")).toContainText("Document B", { timeout: 45_000 });
  await expect(page.locator(".render-details summary")).toHaveText("Preview current");
  await expect(page.locator(".diagram svg")).not.toContainText("Pending A");
  await page.locator(".document-tabs > button").filter({ hasText: "A.pumlu" }).click();
  await expect.poll(() => readEditorSource(page)).toBe(updated);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).toBe(source("Document A"));
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).toBe(updated);
  await expect(page.locator(".diagram svg")).toContainText("Pending A task 150", { timeout: 45_000 });
  await expect(page.locator(".render-details summary")).toHaveText("Preview current");
  await expect(page.locator(".diagram svg")).not.toContainText("Document B");
});
