import { chromium, firefox, webkit } from "@playwright/test";
const records = [];
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ["chromium", "firefox", "webkit"]) {
  const browser = await { chromium, firefox, webkit }[name].launch();
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      globalThis.addEventListener("message", (event) => {
        const frame = globalThis.document.querySelector('iframe[title="Local PlantUML renderer"]');
        if (
          event.source !== frame?.contentWindow ||
          event.data?.type !== "result" ||
          typeof event.data.svg !== "string"
        )
          return;
        globalThis.renderBenchmarkResult = {
          text: new globalThis.DOMParser().parseFromString(event.data.svg, "image/svg+xml").documentElement.textContent,
          engineMs: event.data.durationMs,
        };
      });
    });
    await page.goto("http://127.0.0.1:5173/");
    await page.getByRole("radio", { name: "Diagram + code" }).check();
    await page.getByRole("button", { name: "Get started" }).click();
    let began = Date.now();
    await page.getByRole("button", { name: "Gantt diagram" }).click();
    await page.locator(".diagram svg").waitFor({ timeout: 60000 });
    await page.waitForFunction(() => Boolean(globalThis.renderBenchmarkResult), undefined, { timeout: 60000 });
    const coldMs = Date.now() - began;
    console.log(JSON.stringify({ browser: name, stage: "cold", coldMs }));
    const edits = [];
    for (let index = 0; index < 2; index++) {
      const source = `@startgantt\nProject starts 2026-09-01\n[Timing ${index}] lasts ${index + 2} days\n@endgantt`;
      began = Date.now();
      await page.locator(".cm-content").fill(source);
      await page.waitForFunction(
        (label) => globalThis.renderBenchmarkResult?.text?.includes(label),
        `Timing ${index}`,
        { timeout: 60000 },
      );
      edits.push({
        wallMs: Date.now() - began,
        engineMs: await page.evaluate(() => globalThis.renderBenchmarkResult.engineMs),
        status: await page.locator(".statusbar").innerText(),
      });
    }
    records.push({ browser: name, coldMs, edits });
    console.log(JSON.stringify(records.at(-1)));
  } finally {
    await browser.close();
  }
}
