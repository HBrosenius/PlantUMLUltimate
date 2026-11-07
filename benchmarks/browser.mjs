import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

// BENCH_ORIGIN measures an already running server (for example a baseline build) instead of starting one.
const origin = process.env.BENCH_ORIGIN ?? "http://127.0.0.1:4174";
const fixture = await readFile(new URL("../tests/fixtures/weekend-aware-large.puml", import.meta.url), "utf8");

const server = process.env.BENCH_ORIGIN
  ? undefined
  : spawn(
      "npm",
      ["--workspace", "@plantuml-studio/web", "run", "preview", "--", "--host", "127.0.0.1", "--port", "4174"],
      {
        stdio: "ignore",
      },
    );

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(origin)).ok) return;
    } catch {
      // Preview has not bound its port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Vite preview did not start");
}

const recoveryKey = "plantuml-studio.workspace.recovery.v6";
const gantt = (count) =>
  `@startgantt\nProject starts 2026-09-01\n${Array.from({ length: count }, (_, i) => `[Task ${i}] starts 2026-09-${String((i % 27) + 1).padStart(2, "0")} and lasts ${(i % 5) + 1} days`).join("\n")}\n@endgantt`;
const sequence = "@startuml\nparticipant Alice\nparticipant Bob\nAlice -> Bob: hello\nBob --> Alice: hi\n@enduml";
const classDiagram = '@startuml\nclass Order {\n  +id: String\n}\nclass Customer\nCustomer "1" -- "*" Order\n@enduml';
const seededDocument = (id, diagramKind, source) => ({
  id,
  historyId: `bench-${id}`,
  diagramKind,
  fileName: `${id}.pumlu`,
  source,
  dirty: true,
  zoom: 1,
  zoomInitialized: true,
  cursor: { line: 1, column: 1 },
});
const seededSession = (documents) => ({
  version: 8,
  onboarded: true,
  activeDocumentId: documents[0].id,
  viewMode: "split",
  splitPercent: 50,
  theme: "light",
  advancedMode: true,
  defaultDiagramTheme: "",
  documents,
});
/** Records the renderer's `ready` and `result` replies with page timestamps (capture phase, like the app). */
const recordRendererMessages = () => {
  globalThis.rendererMessages = [];
  addEventListener(
    "message",
    (event) => {
      const data = event.data;
      if (data && typeof data.channel === "string" && data.channel.startsWith("plantuml-"))
        globalThis.rendererMessages.push([data.type, performance.now(), data.durationMs ?? null]);
    },
    true,
  );
};
const resultCount = (page) => page.evaluate(() => rendererMessages.filter((m) => m[0] === "result").length);

const median = (values) => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
const timings = {
  startup: [],
  render: [],
  interaction: [],
  "keystroke to preview": [],
  "tab switch (first visit)": [],
  "tab switch (cached)": [],
};
const counters = { "renderer boots per 7 tab switches": [] };

async function measureStartupAndInteraction(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const startupAt = performance.now();
  await page.goto(origin);
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Gantt diagram" })
    .click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Create diagram", exact: true })
    .click();
  await page.locator(".diagram svg").waitFor({ state: "visible" });
  timings.startup.push(performance.now() - startupAt);
  // Older builds opened a project inspector here; it is optional now.
  await page
    .getByRole("button", { name: "Close project inspector" })
    .click({ timeout: 500 })
    .catch(() => undefined);

  const renderAt = performance.now();
  await page.locator(".cm-content").fill(fixture);
  const task = page.locator('[data-task-id="unified messaging search back end"] .bar');
  await task.waitFor({ state: "visible" });
  timings.render.push(performance.now() - renderAt);

  const interactionAt = performance.now();
  await task.click();
  await page.getByRole("complementary", { name: "Task inspector" }).waitFor({ state: "visible" });
  timings.interaction.push(performance.now() - interactionAt);
  await context.close();
}

/**
 * Editing and tab switching in a seeded Split session: a four-task Gantt, a larger Gantt, a class diagram
 * and a sequence diagram, so the layout engine alternates between native and Graphviz.
 */
async function measureEditingAndTabs(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(recordRendererMessages);
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
    key: recoveryKey,
    session: seededSession([
      seededDocument("a", "gantt", gantt(4)),
      seededDocument("b", "gantt", gantt(30)),
      seededDocument("c", "class", classDiagram),
      seededDocument("d", "sequence", sequence),
    ]),
  });
  const page = await context.newPage();
  await page.goto(origin);
  await page.locator(".diagram svg").first().waitFor({ state: "visible" });
  await page.waitForTimeout(1000);

  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  for (let edit = 0; edit < 10; edit += 1) {
    const before = await resultCount(page);
    const typedAt = await page.evaluate(() => performance.now());
    await page.keyboard.type(String.fromCharCode(97 + edit));
    await page.waitForFunction((count) => rendererMessages.filter((m) => m[0] === "result").length > count, before);
    const resultAt = await page.evaluate(() => rendererMessages.filter((m) => m[0] === "result").at(-1)[1]);
    // The first edit can include one-time engine warm-up.
    if (edit > 0) timings["keystroke to preview"].push(resultAt - typedAt);
    await page.waitForTimeout(250);
  }

  const tabs = page.locator(".document-tab > button:first-child");
  const bootsBefore = await page.evaluate(() => rendererMessages.filter((m) => m[0] === "ready").length);
  const visited = new Set([0]);
  for (const index of [1, 0, 1, 2, 3, 0, 2]) {
    const firstVisit = !visited.has(index);
    visited.add(index);
    const clickedAt = await page.evaluate(() => {
      globalThis.previousSvg = document.querySelector(".diagram svg");
      return performance.now();
    });
    await tabs.nth(index).click();
    await page.waitForFunction(() => {
      const svg = document.querySelector(".diagram svg");
      return svg && svg !== globalThis.previousSvg;
    });
    const shownAt = await page.evaluate(() => performance.now());
    timings[firstVisit ? "tab switch (first visit)" : "tab switch (cached)"].push(shownAt - clickedAt);
    await page.waitForTimeout(500);
  }
  const bootsAfter = await page.evaluate(() => rendererMessages.filter((m) => m[0] === "ready").length);
  counters["renderer boots per 7 tab switches"].push(bootsAfter - bootsBefore);
  await context.close();
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch();
  for (let run = 0; run < 5; run += 1) {
    await measureStartupAndInteraction(browser);
    await measureEditingAndTabs(browser);
  }
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
}

console.table(
  Object.fromEntries(
    Object.entries(timings).map(([name, values]) => [
      name,
      { "median ms": median(values).toFixed(1), samples: values.length },
    ]),
  ),
);
console.table(
  Object.fromEntries(
    Object.entries(counters).map(([name, values]) => [name, { median: median(values), runs: values.length }]),
  ),
);
