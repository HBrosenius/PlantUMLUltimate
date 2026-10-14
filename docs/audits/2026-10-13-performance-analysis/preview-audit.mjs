// Run from the repository root after npm run build. Uses only synthetic documents.
/* global process, fetch, setTimeout, window, localStorage, Element, SVGGraphicsElement,
   addEventListener, document, performance, requestAnimationFrame, PerformanceObserver, URL, console */
import { chromium, webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const output = process.env.PERFORMANCE_AUDIT_OUTPUT ?? "docs/audits/2026-10-13-performance-analysis";
await mkdir(output, { recursive: true });
const origin = "http://127.0.0.1:4176";
const server = spawn(
  process.execPath,
  [resolve("node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", "4176", "--strictPort"],
  { cwd: resolve("apps/web"), stdio: "ignore" },
);
const fixtures = {
  gantt:
    "@startgantt\ntitle Audit\nProject starts 2026-10-01\n" +
    Array.from({ length: 100 }, (_, i) => `[Task ${i}] starts 2026-10-01 and lasts 3 days`).join("\n") +
    "\n@endgantt",
  sequence:
    "@startuml\ntitle Audit\n" +
    Array.from({ length: 8 }, (_, i) => `participant S${i}`).join("\n") +
    "\n" +
    Array.from({ length: 60 }, (_, i) => `S${i % 8} -> S${(i + 1) % 8}: Message ${i}`).join("\n") +
    "\n@enduml",
  class:
    "@startuml\ntitle Audit\n" +
    Array.from({ length: 15 }, (_, i) => `class Entity${i} {\n+id: UUID\n+run(): void\n}`).join("\n") +
    "\n" +
    Array.from({ length: 14 }, (_, i) => `Entity${i} --> Entity${i + 1}`).join("\n") +
    "\n@enduml",
  wbs:
    "@startwbs\ntitle Audit\n* Root\n" +
    Array.from({ length: 60 }, (_, i) => `${i % 10 === 0 ? "**" : "***"} Node ${i}`).join("\n") +
    "\n@endwbs",
};
const records = [];
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {
      // Preview has not bound its port yet.
    }
    if (server.exitCode !== null) throw Error("Server failed");
    await new Promise((r) => setTimeout(r, 100));
  }
  for (const browserName of process.argv.slice(2).length ? process.argv.slice(2) : ["chromium"]) {
    const browser = await { chromium, webkit }[browserName].launch();
    try {
      for (const [kind, source] of Object.entries(fixtures)) {
        const context = await browser.newContext();
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.addInitScript(
          ({ kind, source }) => {
            if (window.top !== window) return;
            localStorage.setItem(
              "plantuml-studio.workspace.recovery.v6",
              JSON.stringify({
                version: 7,
                onboarded: true,
                activeDocumentId: "audit",
                viewMode: "split",
                splitPercent: 50,
                theme: "light",
                advancedMode: true,
                defaultDiagramTheme: "",
                documents: [
                  {
                    id: "audit",
                    historyId: "audit",
                    diagramKind: kind,
                    fileName: "Audit.pumlu",
                    source,
                    dirty: true,
                    zoom: 1,
                    zoomInitialized: true,
                    cursor: { line: 1, column: 1 },
                  },
                ],
              }),
            );
            globalThis.audit = {
              htmlWrites: 0,
              bboxCalls: 0,
              renderMessages: 0,
              engineMs: [],
              frames: [],
              longTasks: [],
            };
            const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
            Object.defineProperty(Element.prototype, "innerHTML", {
              ...descriptor,
              set(value) {
                if (this.matches?.(".diagram")) globalThis.audit.htmlWrites++;
                descriptor.set.call(this, value);
              },
            });
            const bbox = SVGGraphicsElement.prototype.getBBox;
            SVGGraphicsElement.prototype.getBBox = function (...args) {
              globalThis.audit.bboxCalls++;
              return bbox.apply(this, args);
            };
            addEventListener("message", (e) => {
              if (
                e.source === document.querySelector('iframe[title="Local PlantUML renderer"]')?.contentWindow &&
                e.data?.type === "result"
              ) {
                globalThis.audit.renderMessages++;
                globalThis.audit.engineMs.push(e.data.durationMs);
              }
            });
            addEventListener(
              "keydown",
              (e) => {
                if (e.key.length === 1) {
                  const start = performance.now();
                  requestAnimationFrame(() => globalThis.audit.frames.push(performance.now() - start));
                }
              },
              true,
            );
            if (PerformanceObserver.supportedEntryTypes.includes("longtask"))
              new PerformanceObserver((list) =>
                globalThis.audit.longTasks.push(...list.getEntries().map((e) => e.duration)),
              ).observe({ type: "longtask" });
          },
          { kind, source },
        );
        const start = performance.now();
        await page.goto(origin);
        await page.locator(".diagram svg").waitFor({ timeout: 60000 });
        await page.getByText("Preview current", { exact: true }).last().waitFor({ timeout: 60000 });
        await page.waitForTimeout(400);
        const startupMs = performance.now() - start;
        const initial = await page.evaluate(() => ({
          ...globalThis.audit,
          resources: performance
            .getEntriesByType("resource")
            .map((e) => ({ name: new URL(e.name).pathname, bytes: e.decodedBodySize, duration: e.duration })),
          nodes: document.querySelectorAll(".diagram svg *").length,
        }));
        const stages = [];
        for (let run = 0; run < 3; run++) {
          await page.locator(".cm-content").focus();
          await page.keyboard.press("ControlOrMeta+Home");
          await page.keyboard.press("ArrowDown");
          await page.keyboard.press("End");
          await page.waitForTimeout(200);
          await page.evaluate(() => {
            globalThis.audit = {
              htmlWrites: 0,
              bboxCalls: 0,
              renderMessages: 0,
              engineMs: [],
              frames: [],
              longTasks: [],
            };
          });
          const t = performance.now();
          await page.keyboard.type("abcdefghij", { delay: 20 });
          const typingMs = performance.now() - t;
          const during = await page.evaluate(() => ({ ...globalThis.audit }));
          await page.waitForFunction(
            (expected) => document.querySelector(".diagram svg")?.textContent.includes(expected),
            "Audit" + "abcdefghij".repeat(run + 1),
            { timeout: 60000 },
          );
          await page.getByText("Preview current", { exact: true }).last().waitFor({ timeout: 60000 });
          const settledMs = performance.now() - t;
          await page.waitForTimeout(250);
          stages.push({
            run: run + 1,
            typingMs,
            settledMs,
            during,
            settled: await page.evaluate(() => ({ ...globalThis.audit })),
          });
        }
        records.push({ browserName, kind, startupMs, initial, stages, errors });
        await writeFile(`${output}/preview-results.json`, JSON.stringify(records, null, 2));
        console.log(JSON.stringify({ browserName, kind, startupMs, stages, errors }));
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill();
}
