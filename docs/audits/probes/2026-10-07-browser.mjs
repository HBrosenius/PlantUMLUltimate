/* global URL, localStorage, window, File, DOMException, console, process */
// Isolated browser audit probes; no production services or user browser data are used.
// Run with the local Vite server on 127.0.0.1:5173.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const KEY = "plantuml-studio.workspace.recovery.v6";
const source = (label) => `@startgantt\nProject starts 2026-09-01\n[${label}] lasts 2 days\n@endgantt`;
const doc = (id, text) => ({
  id,
  historyId: `audit-${id}`,
  diagramKind: "gantt",
  source: text,
  fileName: `${id}.pumlu`,
  dirty: true,
  zoom: 1,
  cursor: { line: 1, column: 1 },
  revision: 0,
});
const session = {
  version: 7,
  documents: [doc("a", source("WINDOW A")), doc("b", source("WINDOW B"))],
  activeDocumentId: "a",
  viewMode: "code",
  splitPercent: 50,
  theme: "light",
  advancedMode: true,
  defaultDiagramTheme: "",
  onboarded: true,
};
const browser = await chromium.launch();
const reports = [];
async function run(name, action, seed = true) {
  const context = await browser.newContext();
  await context.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort(),
  );
  if (seed)
    await context.addInitScript(
      ({ key, value }) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
      },
      { key: KEY, value: session },
    );
  const page = await context.newPage();
  try {
    const details = await action(page, context);
    reports.push({ name, reproduced: true, details });
  } catch (error) {
    reports.push({ name, reproduced: false, error: String(error) });
  } finally {
    await context.close();
  }
}
async function open(page) {
  await page.goto("http://127.0.0.1:5173/");
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(page.locator(".cm-content")).toBeVisible();
}
async function recovered(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
}

await run("Completing Save As after switching tabs marks the wrong document clean", async (page) => {
  await page.addInitScript(() => {
    let bytes;
    window.showSaveFilePicker = async () => ({
      name: "saved-a.pumlu",
      getFile: async () => new File([bytes], "saved-a.pumlu"),
      createWritable: async () => ({
        write: async (data) => {
          bytes = data;
        },
        close: () =>
          new Promise((resolve) => {
            window.auditFinishSave = resolve;
          }),
      }),
    });
  });
  await open(page);
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Save/ }).first().hover();
  await page.getByRole("menuitem", { name: /Save (diagram|document) as/ }).click();
  await page.waitForFunction(() => Boolean(window.auditFinishSave));
  await page.locator(".document-tabs > button").filter({ hasText: "b.pumlu" }).click();
  await expect(page.locator(".cm-content")).toContainText("WINDOW B");
  await page.evaluate(() => window.auditFinishSave());
  await expect.poll(async () => (await recovered(page)).documents.find((d) => d.id === "b").dirty).toBe(false);
  const result = await recovered(page);
  assert.equal(result.documents.find((d) => d.id === "b").fileName, "saved-a.pumlu");
  return result.documents.map(({ id, dirty, fileName }) => ({ id, dirty, fileName }));
});

await run("Independent windows overwrite recovery", async (page, context) => {
  await open(page);
  const other = await context.newPage();
  await open(other);
  await other.locator(".cm-content").fill(source("OTHER WINDOW EDIT"));
  await expect.poll(async () => (await recovered(other)).documents[0].source).toContain("OTHER WINDOW EDIT");
  await page.reload();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(page.locator(".cm-content")).toContainText("OTHER WINDOW EDIT");
  return "Window A reloaded window B's source";
});

await run(
  "Denied localStorage prevents editor startup",
  async (page) => {
    await page.addInitScript(() =>
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("Denied by audit", "SecurityError");
        },
      }),
    );
    await page.goto("http://127.0.0.1:5173/");
    await expect(page.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
    assert.equal(await page.locator(".cm-content").count(), 0);
    return "Error boundary shown instead of editor";
  },
  false,
);

await run("Stale SVG can be exported under a different active document", async (page) => {
  await open(page);
  await page.getByRole("button", { name: "2 · split" }).click();
  await expect(page.locator(".diagram svg")).toContainText("WINDOW A", { timeout: 30_000 });
  await page.getByRole("button", { name: "1 · code" }).click();
  await page.locator(".document-tabs > button").filter({ hasText: "b.pumlu" }).click();
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Export/ }).hover();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "SVG", exact: true }).click();
  const download = await downloadPromise;
  const svg = await readFile(await download.path(), "utf8");
  assert.equal(download.suggestedFilename(), "b.svg");
  assert.match(svg, /WINDOW A/);
  assert.doesNotMatch(svg, /WINDOW B/);
  return "b.svg contains WINDOW A";
});

await run(
  "Bare carriage returns bypass resource directive filtering",
  async (page) => {
    await page.goto("http://127.0.0.1:5173/");
    const result = await page.evaluate(async () => {
      const path = "/src/render/plantuml-source.ts";
      const { sourceForPlantUmlRenderer } = await import(path);
      const directive = "!includeurl https://example.invalid/audit.puml";
      return {
        lf: sourceForPlantUmlRenderer(`@startuml\n${directive}\n@enduml`).includes(directive),
        cr: sourceForPlantUmlRenderer(`@startuml\r${directive}\r@enduml`).includes(directive),
      };
    });
    assert.equal(result.lf, false);
    assert.equal(result.cr, true);
    return "Directive blocked with LF but preserved with CR; no network access or exfiltration demonstrated";
  },
  false,
);
await browser.close();
console.log(JSON.stringify(reports, null, 2));
await writeFile(new URL("./2026-10-07-browser-results.json", import.meta.url), JSON.stringify(reports, null, 2) + "\n");
if (reports.some((item) => !item.reproduced)) process.exitCode = 1;
