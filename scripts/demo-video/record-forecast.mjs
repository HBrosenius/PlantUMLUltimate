/* global document, addEventListener */
// Records the Progress forecast demo as high-quality screencast frames plus a scene timeline.
// Usage: node scripts/demo-video/record-forecast.mjs --audio <dir-with-<id>.mp3|m4a|wav> [--url http://localhost:5225]
// Each scene lasts at least as long as its narration clip so the voice lines up when building.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, index, all) => (index % 2 ? pairs : [...pairs, [value.replace(/^--/, ""), all[index + 1]]]),
      [],
    ),
);
const url = args.url ?? "http://localhost:5185/";
const audioDir = args.audio;
const outDir = args.out ?? join(here, "out", "recording-forecast");
const ffprobe = process.env.FFPROBE ?? "ffprobe";
const narration = JSON.parse(readFileSync(join(here, "narration-forecast.json"), "utf8"));

function clipDuration(id) {
  if (!audioDir) return narration.find((clip) => clip.id === id).text.split(/\s+/).length / 2.6;
  const file = readdirSync(audioDir).find((name) => name.startsWith(id + "."));
  if (!file) throw new Error(`Missing audio clip for ${id} in ${audioDir}`);
  return Number(
    execFileSync(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join(audioDir, file)])
      .toString()
      .trim(),
  );
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, "frames"), { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 });
await context.addInitScript(() => {
  const install = () => {
    if (document.getElementById("demo-cursor")) return;
    const style = document.createElement("style");
    style.textContent = `
      #demo-cursor{position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;
        transform:translate(-100px,-100px);transition:transform 16ms linear}
      #demo-cursor svg{filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))}
      .demo-click{position:fixed;z-index:2147483646;pointer-events:none;width:34px;height:34px;margin:-17px 0 0 -17px;
        border-radius:50%;border:3px solid rgba(37,99,235,.85);animation:demo-click .5s ease-out forwards}
      @keyframes demo-click{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}
      #demo-card{position:fixed;inset:0;z-index:2147483645;display:grid;place-items:center;pointer-events:none;
        background:rgba(15,23,42,.88);color:#fff;font:600 56px/1.2 system-ui,-apple-system,sans-serif;text-align:center;
        opacity:0;transition:opacity .8s ease}
      #demo-card small{display:block;margin-top:18px;font-weight:400;font-size:28px;color:#cbd5e1}`;
    document.documentElement.append(style);
    const cursor = document.createElement("div");
    cursor.id = "demo-cursor";
    cursor.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2l14 9.5-6.2 1.2 3.6 6.8-2.6 1.3-3.6-6.8L3 18z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.documentElement.append(cursor);
    addEventListener(
      "mousemove",
      (event) => (cursor.style.transform = `translate(${event.clientX - 3}px,${event.clientY - 2}px)`),
      true,
    );
    addEventListener(
      "mousedown",
      (event) => {
        const ring = document.createElement("div");
        ring.className = "demo-click";
        ring.style.left = event.clientX + "px";
        ring.style.top = event.clientY + "px";
        document.documentElement.append(ring);
        setTimeout(() => ring.remove(), 600);
      },
      true,
    );
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", install);
  else install();
});

const page = await context.newPage();
const wait = (ms) => page.waitForTimeout(ms);
let mouse = { x: 800, y: 450 };

async function glide(x, y, ms = 650) {
  const steps = Math.max(8, Math.round(ms / 16));
  const from = { ...mouse };
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    await page.mouse.move(from.x + (x - from.x) * ease, from.y + (y - from.y) * ease);
    await wait(16);
  }
  mouse = { x, y };
}
async function point(locator, { ms, dx = 0.5, dy = 0.5 } = {}) {
  // WBS overlays are rebuilt on every render, so a target can detach mid-lookup; retry briefly.
  let box;
  for (let attempt = 0; attempt < 8 && !box; attempt += 1) {
    try {
      box = await locator.boundingBox({ timeout: 2000 });
      const viewport = page.viewportSize();
      if (box && (box.y < 0 || box.y + box.height > viewport.height)) {
        await locator.scrollIntoViewIfNeeded({ timeout: 2000 });
        box = await locator.boundingBox({ timeout: 2000 });
      }
    } catch {
      box = undefined;
      await wait(150);
    }
  }
  if (!box) throw new Error(`No box for ${locator}`);
  await glide(box.x + box.width * dx, box.y + box.height * dy, ms);
}
async function click(locator, options) {
  await point(locator, options);
  await wait(150);
  await page.mouse.down();
  await wait(70);
  await page.mouse.up();
  await wait(250);
}
async function typeInto(locator, text, { delay = 85 } = {}) {
  await click(locator);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(text, { delay });
  await wait(200);
}
async function card(html, show) {
  await page.evaluate(
    ([content, visible]) => {
      let element = document.getElementById("demo-card");
      if (!element) {
        element = document.createElement("div");
        element.id = "demo-card";
        document.documentElement.append(element);
      }
      if (content) element.innerHTML = content;
      element.style.opacity = visible ? "1" : "0";
    },
    [html, show],
  );
  await wait(900);
}

// --- Setup (not recorded): load the demo plan with forecast off, so the video opens on the plain Gantt chart.
const demoSource = `@startgantt
Project starts 2026-09-21
saturday are closed
sunday are closed
today is colored in #AAF
[Discovery] starts 2026-09-21
[Discovery] lasts 5 days
[Discovery] is 100% completed
[Backend] lasts 10 days
[Backend] starts at [Discovery]'s end
[Backend] is 10% completed
[Design] lasts 4 days
[Design] starts at [Discovery]'s end
[Design] is 100% completed
[Frontend] lasts 5 days
[Frontend] starts at [Design]'s end
[Frontend] is 0% completed
[Integration] lasts 5 days
[Integration] starts at [Backend]'s end
[Integration] starts at [Frontend]'s end
[Launch] happens at [Integration]'s end
@endgantt`;
await page.goto(url);
const onboarding = page.getByRole("dialog", { name: "Welcome to PlantUML Ultimate" });
const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
await Promise.race([onboarding.waitFor(), chooser.waitFor()]);
if (await onboarding.isVisible()) {
  await onboarding.getByRole("radio", { name: "Diagram + code" }).check();
  await onboarding.getByRole("button", { name: "Get started" }).click();
}
await chooser.getByRole("button", { name: "Gantt diagram" }).click();
await page.locator(".cm-content").fill(demoSource);
await page.locator(".diagram svg").waitFor();
await page
  .getByRole("button", { name: "Close project inspector" })
  .click()
  .catch(() => {});
await page.getByRole("button", { name: "Diagram", exact: true }).click();
await page.getByLabel("Timeline zoom preset").selectOption("fit");
for (let i = 0; i < 6; i += 1) await page.getByRole("button", { name: "Zoom in" }).click();
await page.mouse.move(mouse.x, mouse.y);
await wait(1200);

// --- Screencast capture.
const cdp = await context.newCDPSession(page);
const frames = [];
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  const file = `f${String(frames.length).padStart(6, "0")}.jpg`;
  frames.push({ file, ts: metadata.timestamp });
  writeFileSync(join(outDir, "frames", file), Buffer.from(data, "base64"));
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080 });
await wait(300);

const scenes = [];
async function scene(id, actions) {
  const duration = clipDuration(id);
  const start = Date.now();
  scenes.push({ id, start: start / 1000, duration });
  console.log(`▶ ${id} (${duration.toFixed(1)}s narration)`);
  try {
    await actions();
  } catch (error) {
    await page.screenshot({ path: join(outDir, `error-${id}.png`) });
    throw error;
  }
  const remaining = duration * 1000 + 700 - (Date.now() - start);
  if (remaining > 0) await wait(remaining);
}

async function dismissHover() {
  await glide(1500, 420, 500);
  await page.mouse.down();
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await wait(400);
}
const bar = (id) => page.locator(`[data-task-id="${id}"]`).first();
const summary = page.locator(".gantt-forecast-summary");
const taskButton = (name) => page.getByRole("navigation", { name: "Forecast tasks" }).getByRole("button", { name });
const forecastToggle = page.getByRole("button", { name: /^Progress forecast:/ });

await scene("01-intro", async () => {
  await wait(1500);
  await point(bar("launch"), { ms: 900 });
  await wait(600);
  await point(bar("integration"), { ms: 700 });
  await point(bar("launch"), { ms: 600 });
  await dismissHover();
});

await scene("02-turn-on", async () => {
  await wait(800);
  await click(forecastToggle);
  await summary.waitFor();
  await wait(900);
  const asOf = page.getByLabel("Forecast as of date");
  await click(asOf);
  await asOf.fill("2026-10-02");
  await wait(1200);
});

await scene("03-result", async () => {
  await point(summary.locator("strong").first(), { ms: 800 });
  await wait(1500);
  await point(summary.locator(".gantt-forecast-shift"), { ms: 700 });
  await wait(1500);
  await point(bar("backend"), { ms: 900 });
  await wait(1200);
  await glide(1060, 332, 900);
  await wait(1200);
  await dismissHover();
});

await scene("04-why", async () => {
  await click(taskButton("Backend"));
  const inspectorPane = page.locator(".gantt-forecast-inspector");
  await inspectorPane.getByText("WHY DID THIS MOVE?").waitFor();
  await wait(1500);
  await point(inspectorPane.locator(".gantt-forecast-dates span").first(), { ms: 800 });
  await wait(1800);
  await point(inspectorPane.locator(".gantt-forecast-dates span").nth(1), { ms: 700 });
  await wait(1800);
  await point(inspectorPane.locator("p").last(), { ms: 700 });
});

await scene("05-causes", async () => {
  await click(page.getByRole("button", { name: "View project finish causes" }));
  const causes = page.getByRole("region", { name: "Project finish causes" });
  await causes.waitFor();
  await wait(1500);
  await point(causes.locator("li button").first(), { ms: 800 });
  await wait(2500);
  await point(taskButton("Discovery"), { ms: 800 });
});

await scene("06-what-if", async () => {
  await click(taskButton("Backend"));
  const remaining = page.getByLabel(/Remaining work/);
  await remaining.waitFor();
  await typeInto(remaining, "6", { delay: 150 });
  await page.keyboard.press("Enter");
  await wait(800);
  await page.evaluate(() => {
    for (let node = document.querySelector(".gantt-forecast-summary"); node; node = node.parentElement)
      node.scrollTop = 0;
  });
  await wait(700);
  await point(summary.locator("strong").first(), { ms: 800 });
  await wait(1500);
  await point(summary.locator(".gantt-forecast-warning"), { ms: 900 });
});

await scene("07-apply", async () => {
  await click(page.getByRole("button", { name: "Use automatic" }));
  const applyButton = page.getByRole("button", { name: "Apply to plan…" });
  await applyButton.waitFor();
  await wait(1200);
  await click(applyButton);
  const dialog = page.getByRole("dialog", { name: "Apply forecast to plan" });
  await dialog.waitFor();
  await wait(1500);
  const rows = dialog.locator("tbody tr");
  for (let index = 0; index < (await rows.count()); index += 1) {
    await point(rows.nth(index), { ms: 700, dx: 0.3 });
    await wait(1100);
  }
  await click(dialog.getByRole("button", { name: "Apply to plan" }));
  await wait(1500);
  await point(summary.locator(".gantt-forecast-shift"), { ms: 800 });
});

await scene("08-outro", async () => {
  await wait(1000);
  await card("Know where you really stand<small>Progress forecast, in PlantUML Ultimate</small>", true);
});
await wait(1500);

await cdp.send("Page.stopScreencast");
await wait(300);
writeFileSync(join(outDir, "timeline.json"), JSON.stringify({ frames, scenes, end: Date.now() / 1000 }, null, 2));
console.log(`Captured ${frames.length} frames → ${outDir}`);
await browser.close();
