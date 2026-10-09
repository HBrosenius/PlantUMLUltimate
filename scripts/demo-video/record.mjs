/* global document, addEventListener */
// Records the WBS → Gantt demo as high-quality screencast frames plus a scene timeline.
// Usage: node scripts/demo-video/record.mjs --audio <dir-with-<id>.mp3|m4a|wav> [--url http://localhost:5225]
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
const url = args.url ?? "http://localhost:5225/";
const audioDir = args.audio;
const outDir = args.out ?? join(here, "out", "recording");
const ffprobe = process.env.FFPROBE ?? "ffprobe";
const narration = JSON.parse(readFileSync(join(here, "narration.json"), "utf8"));

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

// --- Setup (not recorded): dismiss onboarding so the video opens on the diagram chooser.
await page.goto(url);
const onboarding = page.getByRole("dialog", { name: "Welcome to PlantUML Ultimate" });
const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
await Promise.race([onboarding.waitFor(), chooser.waitFor()]);
if (await onboarding.isVisible()) await onboarding.getByRole("button", { name: "Get started" }).click();
await chooser.waitFor();
await page.mouse.move(mouse.x, mouse.y);
await wait(800);

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
    console.log(
      await page
        .locator('[aria-label^="Select WBS node"]')
        .evaluateAll((e) => e.map((x) => x.getAttribute("aria-label"))),
    );
    throw error;
  }
  const remaining = duration * 1000 + 700 - (Date.now() - start);
  if (remaining > 0) await wait(remaining);
}

const inspector = page.getByRole("complementary", { name: "Task inspector" });
const wbsNode = (name) => page.getByRole("button", { name: `Select WBS node ${name}` });
const bar = (id) => page.locator(`[data-task-id="${id}"]`).first();

async function plan(taskId, { complete, duration, person }) {
  await click(bar(taskId));
  await inspector.waitFor();
  await wait(500);
  if (duration) await typeInto(inspector.getByRole("spinbutton", { name: /^Duration/ }), duration);
  if (complete) await typeInto(inspector.getByLabel("Complete", { exact: true }), complete);
  await page.keyboard.press("Tab");
  await wait(500);
  if (person) {
    await click(inspector.getByRole("button", { name: "+ Add person" }));
    await typeInto(inspector.getByPlaceholder("Name").last(), person, { delay: 110 });
    await page.keyboard.press("Tab");
    await wait(700);
  }
}

await scene("01-intro", async () => {
  await wait(700);
  await click(chooser.getByRole("button", { name: "WBS diagram" }));
  await page.getByRole("button", { name: "Select WBS node Discovery" }).waitFor();
  await wait(1500);
  await point(wbsNode("Website redesign"), { ms: 900 });
  await wait(900);
  for (const name of ["Discovery", "Design", "Delivery"]) {
    await point(wbsNode(name), { ms: 800 });
    await wait(700);
  }
  await point(wbsNode("Frontend implementation"), { ms: 700 });
});

await scene("02-create", async () => {
  await wait(3200);
  await click(page.getByRole("button", { name: "Create Gantt chart from WBS" }));
  const dialog = page.getByRole("dialog", { name: "Create project from WBS" });
  await dialog.waitFor();
  await wait(500);
  await typeInto(dialog.getByLabel("Name"), "Website redesign");
  await click(dialog.getByLabel("Project start date"));
  await dialog.getByLabel("Project start date").fill("2026-10-05");
  await wait(700);
  await click(dialog.getByRole("button", { name: "Create Gantt chart" }));
});

await scene("03-project", async () => {
  const links = page.getByRole("region", { name: "Existing links" });
  await links.waitFor();
  await wait(1200);
  const items = links.locator("li");
  for (const index of [0, 2, 4, 6]) {
    if ((await items.count()) > index) {
      await point(items.nth(index), { ms: 700, dx: 0.3 });
      await wait(900);
    }
  }
});

await scene("04-gantt", async () => {
  await click(page.getByRole("button", { name: "Close project navigator" }));
  await bar("wbs_stakeholder_interviews").waitFor();
  await wait(1000);
  await point(bar("wbs_discovery"), { ms: 800 });
  await wait(700);
  await point(bar("wbs_stakeholder_interviews"), { ms: 700 });
  await wait(700);
  await point(bar("wbs_quality_assurance"), { ms: 900 });
  await wait(700);
  await point(page.locator(".diagram-link-icon").nth(2), { ms: 800 });
});

await scene("05-plan-alice", async () => {
  await plan("wbs_stakeholder_interviews", { complete: "100", person: "Alice" });
});

await scene("06-plan-bob", async () => {
  await plan("wbs_content_inventory", { complete: "60", person: "Bob" });
});

await scene("07-plan-carol", async () => {
  await plan("wbs_visual_design", { duration: "8", person: "Carol" });
});

await scene("08-back-to-wbs", async () => {
  await click(inspector.getByRole("button", { name: /Open linked WBS node/ }));
  await page.getByRole("complementary", { name: "WBS node inspector" }).waitFor();
  await wait(600);
  await click(page.getByRole("button", { name: "Close WBS node inspector" }));
  await wait(800);
  await point(wbsNode("Stakeholder interviews"), { ms: 900, dy: 1.6 });
  await wait(1200);
  await point(wbsNode("Content inventory"), { ms: 800, dy: 1.6 });
  await wait(1200);
  await point(wbsNode("Quality assurance"), { ms: 900, dy: 1.6 });
});

await scene("09-hover", async () => {
  for (const name of ["Stakeholder interviews", "Content inventory", "Visual design"]) {
    await point(wbsNode(name), { ms: 800 });
    await page.getByRole("complementary", { name: `Task details for ${name}` }).waitFor();
    await wait(2600);
  }
});

await scene("10-rename", async () => {
  await click(wbsNode("Visual design"));
  const wbsInspector = page.getByRole("complementary", { name: "WBS node inspector" });
  await wbsInspector.waitFor();
  await wait(500);
  await typeInto(wbsInspector.getByLabel("Label"), "Visual design & branding");
  await page.keyboard.press("Tab");
  await wait(1200);
  await click(wbsInspector.getByRole("button", { name: "Open linked Gantt task" }));
  await inspector.waitFor();
  await wait(800);
  await point(bar("wbs_visual_design"), { ms: 900, dx: 1.3 });
});

await scene("11-outro", async () => {
  await wait(1200);
  await card(
    "WBS and Gantt, always connected<small>Plan the what and the when together, in PlantUML Ultimate</small>",
    true,
  );
});
await wait(1500);

await cdp.send("Page.stopScreencast");
await wait(300);
writeFileSync(join(outDir, "timeline.json"), JSON.stringify({ frames, scenes, end: Date.now() / 1000 }, null, 2));
console.log(`Captured ${frames.length} frames → ${outDir}`);
await browser.close();
