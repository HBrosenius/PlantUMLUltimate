import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const origin = "http://127.0.0.1:4174";
const fixture = await readFile(new URL("../tests/fixtures/weekend-aware-large.puml", import.meta.url), "utf8");

const server = spawn(
  "npm",
  ["--workspace", "@plantuml-studio/web", "run", "preview", "--", "--host", "127.0.0.1", "--port", "4174"],
  { stdio: "ignore" },
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

const median = (values) => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
const timings = { startup: [], render: [], interaction: [] };

let browser;
try {
  await waitForServer();
  browser = await chromium.launch();
  for (let run = 0; run < 5; run += 1) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const startupAt = performance.now();
    await page.goto(origin);
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: "Gantt diagram" })
      .click();
    await page.locator(".diagram svg").waitFor({ state: "visible" });
    timings.startup.push(performance.now() - startupAt);
    await page.getByRole("button", { name: "Close project inspector" }).click();

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
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

console.table(
  Object.fromEntries(
    Object.entries(timings).map(([name, values]) => [
      name,
      { "median ms": median(values).toFixed(1), runs: values.length },
    ]),
  ),
);
