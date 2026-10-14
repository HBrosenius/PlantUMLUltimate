import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

// Use a production build: npm run build && node benchmarks/responsiveness.mjs
const require = createRequire(import.meta.url);
const origin = "http://127.0.0.1:4175";
const server = spawn(
  process.execPath,
  [
    join(dirname(require.resolve("vite/package.json")), "bin/vite.js"),
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4175",
    "--strictPort",
  ],
  {
    cwd: fileURLToPath(new URL("../apps/web", import.meta.url)),
    stdio: "ignore",
  },
);
const key = "plantuml-studio.workspace.recovery.v6";
const source = (count) =>
  `@startgantt\nProject starts 2026-09-01\n${Array.from({ length: count }, (_, i) => `[Task ${i}] starts 2026-09-01 and lasts ${(i % 5) + 1} days`).join("\n")}\n@endgantt`;
const session = {
  version: 7,
  onboarded: true,
  activeDocumentId: "large-0",
  viewMode: "code",
  splitPercent: 50,
  theme: "light",
  advancedMode: true,
  defaultDiagramTheme: "",
  documents: Array.from({ length: 12 }, (_, i) => ({
    id: `large-${i}`,
    historyId: `bench-${i}`,
    diagramKind: "gantt",
    fileName: `Large ${i}.pumlu`,
    source: source(i === 0 ? 300 : i === 1 ? 100 : 1000),
    dirty: true,
    zoom: 1,
    zoomInitialized: true,
    cursor: { line: 1, column: 1 },
  })),
};
const records = [];
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error("Preview server exited; check port 4175 and build the app first.");
    try {
      ready = (await fetch(origin)).ok;
    } catch {
      /* Server is starting. */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error("Preview server did not start.");
  browser = await chromium.launch();
  for (let run = 0; run < 5; run++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(({ key, session }) => globalThis.localStorage.setItem(key, JSON.stringify(session)), {
      key,
      session,
    });
    await page.goto(origin);
    await page.locator(".cm-content").waitFor();
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      globalThis.benchStats = {
        writes: 0,
        storageMs: 0,
        serializeMs: 0,
        longTasks: 0,
        longestTaskMs: 0,
        slowInputs: 0,
        slowestInputMs: 0,
      };
      const write = globalThis.Storage.prototype.setItem;
      globalThis.Storage.prototype.setItem = function (key, value) {
        const start = performance.now();
        try {
          return write.call(this, key, value);
        } finally {
          if (key.startsWith("plantuml-studio.workspace")) {
            globalThis.benchStats.writes++;
            globalThis.benchStats.storageMs += performance.now() - start;
          }
        }
      };
      const stringify = JSON.stringify;
      JSON.stringify = function (value, ...args) {
        const start = performance.now();
        try {
          return stringify.call(this, value, ...args);
        } finally {
          if (value?.documents) globalThis.benchStats.serializeMs += performance.now() - start;
        }
      };
      new globalThis.PerformanceObserver((list) => {
        for (const task of list.getEntries()) {
          globalThis.benchStats.longTasks++;
          globalThis.benchStats.longestTaskMs = Math.max(globalThis.benchStats.longestTaskMs, task.duration);
        }
      }).observe({ type: "longtask", buffered: false });
      // Event Timing: input to next paint (the INP signal) for keyboard and pointer input slower than 16 ms.
      new globalThis.PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          globalThis.benchStats.slowInputs++;
          globalThis.benchStats.slowestInputMs = Math.max(globalThis.benchStats.slowestInputMs, entry.duration);
        }
      }).observe({ type: "event", durationThreshold: 16, buffered: false });
    });
    const measure = async (stage, action) => {
      await page.evaluate(() => {
        globalThis.benchStats = {
          writes: 0,
          storageMs: 0,
          serializeMs: 0,
          longTasks: 0,
          longestTaskMs: 0,
          slowInputs: 0,
          slowestInputMs: 0,
        };
      });
      const start = performance.now();
      await action();
      const wallMs = performance.now() - start;
      // Include the trailing recovery/database debounce; exclude it from interaction wall time.
      await page.waitForTimeout(600);
      const record = {
        run: run + 1,
        stage,
        wallMs: Math.round(wallMs),
        ...(await page.evaluate(() => globalThis.benchStats)),
      };
      records.push(record);
      console.log(JSON.stringify(record));
    };
    const editor = page.locator(".cm-content");
    const cdp = await context.newCDPSession(page);
    // BENCH_CPU_THROTTLE=4 approximates a mid-range laptop; the default measures this machine unthrottled.
    const throttle = Number(process.env.BENCH_CPU_THROTTLE ?? 1);
    if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
    await editor.focus();
    await measure("cursor-20", async () => {
      for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowRight");
    });
    if (run === 0) {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.start");
    }
    await measure("typing-20", async () => {
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.press("Home");
      await page.keyboard.insertText("' ");
      await page.keyboard.type("responsiveness-check");
      await page.keyboard.press("Enter");
    });
    if (run === 0) {
      const { profile } = await cdp.send("Profiler.stop");
      const counts = new Map();
      for (const id of profile.samples ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
      console.log(
        JSON.stringify({
          stage: "typing-cpu-profile",
          hottest: profile.nodes
            .map((node) => ({ ...node.callFrame, samples: counts.get(node.id) ?? 0 }))
            .sort((a, b) => b.samples - a.samples)
            .slice(0, 20),
        }),
      );
    }
    await measure("switch-tabs-10", async () => {
      const tabs = page.locator(".document-tabs > button:not(.new-tab)");
      for (let i = 0; i < 10; i++) await tabs.nth(i % 2).click();
    });
    await measure("render-100", async () => {
      await page.getByRole("button", { name: "Split", exact: true }).click();
      await page.locator(".diagram svg").waitFor({ timeout: 60_000 });
      await page.getByRole("button", { name: "Reset zoom, 100%", exact: true }).waitFor();
    });
    await editor.focus();
    await measure("split-typing-20", async () => {
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.press("Home");
      await page.keyboard.insertText("' ");
      await page.keyboard.type("split-editing-check!");
      await page.keyboard.press("Enter");
    });
    await page.getByText("Preview current", { exact: true }).last().waitFor({ timeout: 60_000 });
    await measure("zoom-scroll-10", async () => {
      for (let i = 0; i < 5; i++)
        await page.getByRole("button", { name: i % 2 ? "Zoom out" : "Zoom in", exact: true }).click();
      const viewport = page.locator(".preview-viewport");
      const box = await viewport.boundingBox();
      if (!box) throw new Error("Diagram viewport is missing");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await viewport.evaluate((element) => {
        element.scrollTop = 200;
        element.scrollLeft = 40;
      });
      for (let i = 0; i < 5; i++) await page.mouse.wheel(12, 24);
    });
    await cdp.send("HeapProfiler.collectGarbage");
    console.log(
      JSON.stringify({ run: run + 1, stage: "main-frame-heap", ...(await cdp.send("Runtime.getHeapUsage")) }),
    );
    await context.close();
  }
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const summary = Object.fromEntries(
    [...new Set(records.map((r) => r.stage))].map((stage) => {
      const samples = records.filter((r) => r.stage === stage);
      return [
        stage,
        Object.fromEntries(
          [
            "wallMs",
            "writes",
            "storageMs",
            "serializeMs",
            "longTasks",
            "longestTaskMs",
            "slowInputs",
            "slowestInputMs",
          ].map((name) => [name, Number(median(samples.map((r) => r[name])).toFixed(1))]),
        ),
      ];
    }),
  );
  console.log(JSON.stringify({ workspaceBytes: Buffer.byteLength(JSON.stringify(session)), summary }, null, 2));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
