import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const source = (body: string) => `@startgantt\nProject starts 2026-09-01\n${body}\n@endgantt`;

async function setSource(page: Page, value: string) {
  const editor = page.locator(".cm-content");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await editor.fill(value);
    if ((await editor.innerText()) === value) break;
    await editor.fill("");
  }
  await expect.poll(() => page.locator(".cm-content").innerText()).toBe(value);
  await expect(page.locator(".diagram svg")).toBeVisible();
  await expect(page.locator(".diagram svg")).not.toContainText("Syntax Error");
}

async function openAddDialog(page: Page, item: "Task…" | "Milestone…" | "Divider…") {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menu", { name: "Add" }).getByRole("menuitem", { name: item }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cm-content")).toBeVisible();
});

test("groups document commands in an accessible File and Export menu", async ({ page }) => {
  const file = page.getByRole("button", { name: "File" });
  await file.click();
  const menu = page.getByRole("menu", { name: "File" });
  await expect(menu.getByRole("menuitem")).toHaveText([
    "New",
    "Open…",
    "Save",
    "Save As…",
    "Backup workspace…",
    "Restore workspace…",
    "Export›",
  ]);
  await menu.getByRole("menuitem", { name: "Export" }).hover();
  const exportMenu = page.getByRole("menu", { name: "Export" });
  await expect(exportMenu.getByRole("menuitem")).toHaveText(["SVG", "PNG"]);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(file).toBeFocused();
});

test("groups creation commands in an accessible Add menu", async ({ page }) => {
  const add = page.getByRole("button", { name: "Add", exact: true });
  await add.click();
  const menu = page.getByRole("menu", { name: "Add" });
  await expect(menu.getByRole("menuitem")).toHaveText(["Task…", "Milestone…", "Divider…"]);
  await menu.getByRole("menuitem", { name: "Milestone…" }).click();
  await expect(page.getByRole("dialog", { name: "Add milestone" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Add milestone" })).toBeHidden();
});

test("suggests inline task continuations after a fixed start date", async ({ page }) => {
  await setSource(page, source("[New task] starts 2026-09-01"));
  const taskLine = page.locator(".cm-line").filter({ hasText: "[New task] starts 2026-09-01" });
  await taskLine.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" ");
  const completions = page.locator(".cm-tooltip-autocomplete");
  await expect(completions).toBeVisible();
  await expect(completions).toContainText("and ends");
  await expect(completions).toContainText("and lasts");
  await expect(completions).toContainText("and is colored in");
});

test("copies the current source from the code editor", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Clipboard permissions are only consistently exposed by Chromium");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const value = source("[Copy me] lasts 2 days");
  await setSource(page, value);
  await page.getByRole("button", { name: "Copy PlantUML source" }).click();
  await expect(page.getByRole("button", { name: "Copy PlantUML source" })).toHaveText("Copied!");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(value);
});

test("backs up and restores all open documents", async ({ page }) => {
  const original = source("[Backup target] lasts 2 days");
  await setSource(page, original);
  await page.getByRole("button", { name: "New document tab" }).click();
  await setSource(page, source("[Second tab] lasts 3 days"));
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Backup workspace…" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const backup = readFileSync(downloadPath!, "utf8");
  expect(JSON.parse(backup).session.documents).toHaveLength(2);

  await page.locator(".cm-content").fill(source("[Replaced] lasts 1 day"));
  await page.evaluate((contents) => {
    Object.defineProperty(window, "showOpenFilePicker", {
      configurable: true,
      value: async () => [{ name: "backup.json", getFile: async () => ({ text: async () => contents }) }],
    });
  }, backup);
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Restore workspace…" }).click();
  await expect(page.locator(".cm-content")).toContainText("[Second tab] lasts 3 days");
  await expect(page.locator(".document-tabs > button:not(.new-tab)")).toHaveCount(2);
});

test("protects dirty tabs from browser unload", async ({ page }) => {
  await page.locator(".cm-content").fill(source("[Unsaved] lasts 2 days"));
  await expect
    .poll(() =>
      page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    )
    .toBe(true);
});

test("rebuilds the renderer iframe once and explains a repeated bootstrap failure", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Direct srcdoc frame failure injection is Chromium-specific");
  const iframe = page.locator('iframe[title="Local PlantUML renderer"]');
  await expect(iframe).toHaveCount(1);
  const failCurrentFrame = async () => {
    const sourceDocument = await iframe.getAttribute("srcdoc");
    const channel = sourceDocument?.match(/const channel = ("[^"]+")/)?.[1];
    expect(channel).toBeTruthy();
    const frame = await (await iframe.elementHandle())!.contentFrame();
    await frame!.evaluate(
      (value) =>
        parent.postMessage(
          { channel: JSON.parse(value), type: "bootstrap-error", error: "Injected startup failure" },
          "*",
        ),
      channel!,
    );
  };
  await iframe.evaluate((element) => element.setAttribute("data-test-original-frame", "true"));
  await failCurrentFrame();
  await expect(iframe).toHaveCount(1);
  await expect(iframe).not.toHaveAttribute("data-test-original-frame", "true");
  await failCurrentFrame();
  await expect(page.getByRole("alert")).toContainText("could not start after an automatic retry");
  await expect(page.getByRole("alert")).toContainText("Browser security settings");
});

test("edits the diagram title from project settings", async ({ page }) => {
  await setSource(page, source("[Build] lasts 2 days"));
  await page.getByRole("button", { name: "Project" }).click();
  await page.getByLabel("Diagram title").fill("Release roadmap — 2026");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("title Release roadmap — 2026");
  await expect(page.locator(".diagram svg")).toContainText("Release roadmap — 2026", { timeout: 20_000 });
});

test("lists and reveals syntax that is preserved but not visually editable", async ({ page }) => {
  await setSource(page, source("skinparam handwritten true\n[A] starts 2026-09-01\n[A] lasts 2 days"));
  const count = page.getByRole("button", { name: "1 preserved line" });
  await expect(count).toBeVisible();
  await count.click();
  const panel = page.getByRole("complementary", { name: "Unsupported syntax" });
  await expect(panel).toContainText("skinparam handwritten true");
  await panel.getByRole("button", { name: /skinparam handwritten true/ }).click();
  await expect(panel).toBeHidden();
  await expect(page.locator(".cm-content")).toContainText("skinparam handwritten true");
});

test("keeps source fixes available outside the lint tooltip", async ({ page }) => {
  const value = source("[Build] [Build] starts 2026-09-01");
  await page.locator(".cm-content").fill(value);
  const fix = page.getByRole("button", { name: "Fix nearest source issue" });
  await expect(fix).toBeVisible();
  await expect(fix).toHaveText("Fix issue");
  await fix.click();
  await expect(page.locator(".cm-content")).toContainText("[Build] starts 2026-09-01");
  await expect(page.locator(".cm-content")).not.toContainText("[Build] [Build]");
  await expect(fix).toBeHidden();
});

test("renders a pasted document containing block and shorthand task notes", async ({ page }) => {
  const value = `@startgantt
title Project Gantt Chart — Weekend-Aware (Business Day) Logic
Project starts 2026-08-13
saturday are closed
sunday are closed
[Development] starts 2026-09-02 and lasts 7 days and is colored in Red
note right
  Source date was invalid in the original spreadsheet.
end note
[Open Risk ?] happens 2026-09-03
note right: Days needed = "?" — unscheduled until estimated
@endgantt`;
  await page.locator(".cm-content").fill(value);
  await expect(page.locator(".diagram svg")).toContainText("Development", { timeout: 20_000 });
  await expect(page.locator(".diagram svg")).toContainText("Open Risk ?");
  await expect(page.locator(".fallback-note")).toHaveCount(2);
  await expect(page.locator(".statusbar")).not.toContainText("Rendering timed out");
});

test("replaces the preview after pasting the large weekend-aware project", async ({ page }) => {
  const value = readFileSync("tests/fixtures/weekend-aware-large.puml", "utf8");
  await page.locator(".cm-content").fill(value);
  await expect(page.locator(".render-notice.rendering")).toContainText("Rendering updated preview");
  await expect(page.locator(".diagram svg")).toContainText("Unified End To End Testing", { timeout: 20_000 });
  await expect(page.locator(".diagram svg")).not.toContainText("Architecture");
  await expect(page.locator(".fallback-note")).toHaveCount(4);
  await expect(page.locator(".render-notice")).toBeHidden();
  await expect(page.getByLabel("Development performance metrics")).toContainText("32 tasks");
  await expect(page.getByLabel("Development performance metrics")).toContainText("Parse");
  await expect(page.getByLabel("Development performance metrics")).toContainText("Overlay");
});

test("makes a failed update explicit instead of silently showing the old preview", async ({ page }) => {
  await setSource(page, source("[Previous diagram] lasts 2 days"));
  await page.locator(".cm-content").fill("@startgantt\n[Broken] starts nope\n@endgantt");
  const error = page.getByRole("alert");
  await expect(error).toContainText("Preview could not be updated", { timeout: 20_000 });
  await expect(page.locator(".preview-viewport")).toHaveClass(/stale-preview/);
  await expect(page.getByRole("button", { name: "Retry rendering" })).toBeVisible();
});

test("shows a persistent live preview while moving a task horizontally", async ({ page }) => {
  await setSource(page, source("[A] starts 2026-09-01\n[A] lasts 3 days\n[B] starts 2026-09-05\n[B] lasts 2 days"));
  const bar = page.locator("[data-task-id=a] .bar");
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 120, box!.y + box!.height / 2, { steps: 4 });
  await expect(page.locator(".task-drag-ghost")).toHaveCount(1);
  await expect(page.locator("[data-task-id=a]")).toHaveAttribute("transform", /translate\([1-9]/);
  await page.mouse.up();
  await expect(page.locator(".cm-content")).not.toContainText("[A] starts 2026-09-01");
});

test("moves, resizes, and reorders focused tasks from the keyboard", async ({ page }) => {
  await setSource(
    page,
    source(
      "[A] starts 2026-09-01\n[A] lasts 2 days\n[B] starts 2026-09-05\n[B] lasts 2 days\n[C] starts 2026-09-09\n[C] lasts 2 days",
    ),
  );
  await page.locator("[data-task-id=a]").focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.locator(".cm-content")).toContainText("[A] starts 2026-09-02");
  await page.locator("[data-task-id=a]").focus();
  await page.keyboard.press("Alt+Shift+ArrowRight");
  await expect(page.locator(".cm-content")).toContainText("[A] lasts 3 days");
  await page.locator("[data-task-id=a]").focus();
  await page.keyboard.press("Control+ArrowDown");
  await expect
    .poll(async () => {
      const text = (await page.locator(".cm-content").textContent()) ?? "";
      return text.indexOf("[A] lasts") > text.indexOf("[B] lasts");
    })
    .toBe(true);
});

test("traps modal focus, closes with Escape, and restores the trigger", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Add", exact: true });
  await trigger.focus();
  await openAddDialog(page, "Task…");
  const dialog = page.getByRole("dialog", { name: "Add task" });
  await expect(dialog.getByLabel("Name")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Add task" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("adds fixed and relative milestones", async ({ page }) => {
  await setSource(page, source("[Build] starts 2026-09-01\n[Build] lasts 3 days"));

  await openAddDialog(page, "Milestone…");
  let dialog = page.getByRole("dialog", { name: "Add milestone" });
  await dialog.getByLabel("Name").fill("Code freeze");
  await dialog.getByRole("textbox", { name: "Date", exact: true }).fill("2026-09-08");
  await dialog.getByRole("button", { name: "Add milestone" }).click();
  await expect(page.locator(".cm-content")).toContainText("[Code freeze] happens 2026-09-08");

  await openAddDialog(page, "Milestone…");
  dialog = page.getByRole("dialog", { name: "Add milestone" });
  await dialog.getByLabel("Name").fill("Build complete");
  await dialog.locator("select").nth(0).selectOption("relative");
  await dialog.locator("select").nth(1).selectOption("Build");
  await dialog.locator("select").nth(2).selectOption("end");
  await dialog.getByRole("button", { name: "Add milestone" }).click();
  await expect(page.locator(".cm-content")).toContainText("[Build complete] happens at [Build]'s end");
  await expect(page.locator(".diagram svg")).toContainText("Build complete", { timeout: 20_000 });
});

test("inspects and drags milestones according to their date mode", async ({ page }) => {
  await setSource(
    page,
    source(
      "[Build] starts 2026-09-01\n[Build] lasts 3 days\n[Release] happens 2026-09-08\n[Follow up] happens at [Build]'s end",
    ),
  );
  const release = page.locator('[data-task-id="release"]');
  const relative = page.locator('[data-task-id="follow up"]');
  await expect(release).toHaveCount(1);
  await expect(relative).toHaveCount(1);

  await release.locator(".bar").click();
  const inspector = page.getByRole("complementary", { name: "Milestone inspector" });
  await expect(inspector).toBeVisible();
  await inspector.getByRole("textbox", { name: "Date", exact: true }).fill("2026-09-09");
  await inspector.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("[Release] happens 2026-09-09");
  await release.locator(".bar").click();
  await expect(page.getByRole("complementary", { name: "Milestone inspector" })).toBeVisible();
  await page.getByRole("button", { name: "Close milestone inspector" }).click();

  await expect(release).toHaveAttribute("data-draggable", "true");
  await release.focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.locator(".cm-content")).toContainText("[Release] happens 2026-09-10");

  await expect(relative).toHaveAttribute("data-draggable", "false");
  const beforeHorizontal = await page.locator(".cm-content").textContent();
  await relative.focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.locator(".cm-content")).toHaveText(beforeHorizontal!);

  await relative.focus();
  await page.keyboard.press("Control+ArrowUp");
  await expect
    .poll(async () => {
      const text = (await page.locator(".cm-content").textContent()) ?? "";
      return text.indexOf("[Follow up]") < text.indexOf("[Release]");
    })
    .toBe(true);
});

test("drags a fixed milestone directly by its enlarged diamond hit area", async ({ page, browserName }) => {
  test.skip(
    browserName === "firefox",
    "Firefox Playwright maps this offscreen SVG hit-area fixture differently; milestone dragging is covered above",
  );
  await setSource(
    page,
    source(
      "[Range] starts 2026-09-01 and ends 2026-09-20\n[Release] happens 2026-09-08\n[Follow up] happens at [Range]'s end",
    ),
  );
  const milestone = page.locator('[data-task-id="release"]');
  await expect(milestone).toHaveAttribute("data-draggable", "true");
  const initialTransform = await milestone.getAttribute("transform");
  const hit = await milestone.locator(".bar").boundingBox();
  expect(hit).not.toBeNull();
  expect(hit!.width).toBeGreaterThanOrEqual(20);
  expect(hit!.height).toBeGreaterThanOrEqual(20);
  await page.mouse.move(hit!.x + hit!.width / 2, hit!.y + hit!.height / 2);
  await page.mouse.down();
  await page.mouse.move(hit!.x + hit!.width / 2 + 160, hit!.y + hit!.height / 2, { steps: 5 });
  await expect.poll(() => milestone.getAttribute("transform")).not.toBe(initialTransform);
  await page.mouse.up();
  await expect(page.locator(".cm-content")).not.toContainText("[Release] happens 2026-09-08");
});

test("keeps dense charts selectable through the semantic overlay", async ({ page }) => {
  const tasks = Array.from(
    { length: 80 },
    (_, index) => `[Dense ${index}] starts 2026-09-${String((index % 27) + 1).padStart(2, "0")} and lasts 2 days`,
  );
  await setSource(
    page,
    source(
      [...tasks.slice(0, 40), "-- Midpoint --", ...tasks.slice(40), "[Dense release] happens 2026-09-28"].join("\n"),
    ),
  );
  await expect(page.locator('[data-task-id="dense 79"]')).toHaveCount(1, { timeout: 20_000 });
  await page.locator('[data-task-id="dense 79"] .bar').click();
  await expect(page.getByRole("complementary", { name: "Task inspector" })).toBeVisible();
  await page.getByRole("button", { name: "Close task inspector" }).click();
  await page.locator('[data-task-id="dense release"] .bar').click();
  await expect(page.getByRole("complementary", { name: "Milestone inspector" })).toBeVisible();
});

test("unloads the heavy renderer in code-only view and reloads it for preview", async ({ page }) => {
  await expect(page.locator('iframe[title="Local PlantUML renderer"]')).toHaveCount(1);
  await page.getByRole("button", { name: "1 · code" }).click();
  await expect(page.locator('iframe[title="Local PlantUML renderer"]')).toHaveCount(0);
  await expect(page.locator(".statusbar")).toContainText("Preview paused");
  await page.getByRole("button", { name: "2 · split" }).click();
  await expect(page.locator('iframe[title="Local PlantUML renderer"]')).toHaveCount(1);
  await expect(page.locator(".diagram svg")).toBeVisible({ timeout: 20_000 });
});

test("grows during resize and undo restores the duration", async ({ page }) => {
  await setSource(page, source("[A] starts 2026-09-01\n[A] lasts 3 days"));
  await page.locator("[data-task-id=a] .bar").click();
  await expect(page.getByRole("complementary", { name: "Task inspector" })).toBeVisible();
  const handle = page.locator("[data-task-id=a] [data-resize-handle]");
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const initialWidth = Number(await page.locator("[data-task-id=a] .bar").getAttribute("width"));
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 120, box!.y + box!.height / 2, { steps: 4 });
  await expect
    .poll(async () => Number(await page.locator(".task-drag-ghost").getAttribute("width")))
    .toBeGreaterThan(initialWidth);
  await page.mouse.up();
  await expect(page.locator(".cm-content")).not.toContainText("[A] lasts 3 days");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".cm-content")).toContainText("[A] lasts 3 days");
});

test("shows a live vertical preview and reorders task source", async ({ page }) => {
  await setSource(
    page,
    source(
      "[A] starts 2026-09-01\n[A] lasts 2 days\n[B] starts 2026-09-04\n[B] lasts 2 days\n[C] starts 2026-09-07\n[C] lasts 2 days",
    ),
  );
  const a = await page.locator("[data-task-id=a] .bar").boundingBox();
  const c = await page.locator("[data-task-id=c] .bar").boundingBox();
  expect(a).not.toBeNull();
  expect(c).not.toBeNull();
  await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
  await page.mouse.down();
  await page.mouse.move(a!.x + a!.width / 2, c!.y + c!.height / 2, { steps: 5 });
  await expect(page.locator(".task-drag-ghost")).toHaveCount(1);
  await expect(page.locator("[data-task-id=c]")).toHaveClass(/reorder-target/);
  await page.mouse.up();
  await expect
    .poll(async () => {
      const text = (await page.locator(".cm-content").textContent()) ?? "";
      return text.indexOf("[A] lasts") > text.indexOf("[B] lasts");
    })
    .toBe(true);
});

test("creates a dependency visually and undo removes it", async ({ page }) => {
  await setSource(
    page,
    source(
      "[A] starts 2026-09-01\n[A] lasts 2 days\n[B] starts 2026-09-05 and ends 2026-09-08 and is colored in LightBlue",
    ),
  );
  await page.locator("[data-task-id=a] .bar").click();
  const handle = await page.locator("[data-task-id=a] [data-dependency-handle]").boundingBox();
  const target = await page.locator("[data-task-id=b] .bar").boundingBox();
  expect(handle).not.toBeNull();
  expect(target).not.toBeNull();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 5 });
  await expect(page.locator("[data-task-id=b]")).toHaveClass(/connection-target/);
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("[B] starts at [A]'s end");
  await expect(page.locator(".cm-content")).toContainText("[B] lasts 4 days and is colored in LightBlue");
  await expect(page.locator(".cm-content")).not.toContainText("[B] [B]");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".cm-content")).toContainText(
    "[B] starts 2026-09-05 and ends 2026-09-08 and is colored in LightBlue",
  );
});

test("keeps resource capacities isolated between document tabs", async ({ page }) => {
  const firstSource = source("[A] on {Kalle:100%} starts 2026-09-01\n[A] lasts 2 days");
  await setSource(page, firstSource);
  await page.getByRole("button", { name: "Resources" }).click();
  await page.getByRole("spinbutton", { name: "Capacity for Kalle" }).fill("50");
  await expect(page.locator(".resource-card details")).toHaveCount(1);
  await page.getByRole("button", { name: "Close resource workload" }).click();
  await page.getByRole("button", { name: "New document tab" }).click();
  await setSource(page, firstSource.replaceAll("[A]", "[B]"));
  await page.getByRole("button", { name: "Resources" }).click();
  await expect(page.getByRole("spinbutton", { name: "Capacity for Kalle" })).toHaveValue("100");
  await expect(page.locator(".resource-card details")).toHaveCount(0);
});

test("shows resource over-allocation directly below the diagram", async ({ page }) => {
  await setSource(page, source("[A] on {Kalle:100%} starts 2026-09-01\n[A] lasts 2 days"));
  await page.getByRole("button", { name: "Resources" }).click();
  await page.getByRole("spinbutton", { name: "Capacity for Kalle" }).fill("50");
  await page.getByRole("button", { name: "Close resource workload" }).click();

  const warning = page.getByRole("alert", { name: "Resource over-allocation" });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("Kalle: 100% assigned / 50% capacity across 2 days (A)");
  await warning.getByRole("button", { name: "Review workload" }).click();
  await expect(page.getByRole("complementary", { name: "Resource workload" })).toBeVisible();
});

test("keeps duplicate displayed task names distinct through aliases", async ({ page }) => {
  await setSource(
    page,
    source("[Testing] as [BackendTest] requires 3 days\n[Testing] as [FrontendTest] requires 4 days"),
  );
  const backend = page.locator('[data-task-id="backendtest"]');
  const frontend = page.locator('[data-task-id="frontendtest"]');
  await expect(backend).toHaveCount(1);
  await expect(frontend).toHaveCount(1);
  const backendBox = await backend.boundingBox();
  const frontendBox = await frontend.boundingBox();
  expect(backendBox?.y).not.toBe(frontendBox?.y);
  await frontend.locator(".bar").click();
  await expect(page.getByRole("complementary", { name: "Task inspector" }).getByLabel("Name")).toHaveValue("Testing");
});

test("renders task and dependency notes at the same time", async ({ page }) => {
  await setSource(
    page,
    source(
      "[A] starts 2026-09-01\n[A] lasts 2 days\n[B] starts at [A]'s end\nnote bottom\nArrow explanation\nend note\n[B] lasts 1 day\nnote bottom\nTask explanation\nend note",
    ),
  );
  await expect(page.locator(".fallback-note")).toHaveCount(2);
  await expect(page.locator('[data-note-owner="dependency:0"]')).toContainText("Arrow explanation");
  await expect(page.locator('[data-note-owner="task:b"]')).toContainText("Task explanation");
  const connectorDistance = await page.evaluate(() => {
    const dependency = document.querySelector<SVGPathElement>('[data-dependency-index="0"].interaction-dependency');
    const connector = document.querySelector<SVGPathElement>('[data-note-owner="dependency:0"] .note-connector');
    if (!dependency || !connector) return Number.POSITIVE_INFINITY;
    const midpoint = dependency.getPointAtLength(dependency.getTotalLength() / 2);
    const start = connector
      .getAttribute("d")
      ?.match(/^M\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/)
      ?.slice(1)
      .map(Number);
    return start ? Math.hypot(midpoint.x - start[0]!, midpoint.y - start[1]!) : Number.POSITIVE_INFINITY;
  });
  expect(connectorDistance).toBeLessThan(1);
});

test("converts task end dates and durations in both directions", async ({ page }) => {
  await setSource(page, source("saturday are closed\nsunday are closed\n[A] starts 2026-09-04 and ends 2026-09-08"));
  await page.locator("[data-task-id=a] .bar").click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await inspector.getByRole("button", { name: "End → duration" }).click();
  await expect(inspector.getByRole("textbox", { name: "End", exact: true })).toHaveValue("");
  await expect(inspector.locator("label").filter({ hasText: "Duration" }).locator("input")).toHaveValue("3");
  await inspector.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("[A] lasts 3 days");
  await expect(page.locator(".cm-content")).not.toContainText("ends 2026-09-08");

  await page.locator("[data-task-id=a] .bar").click();
  await inspector.getByRole("button", { name: "Duration → end" }).click();
  await expect(inspector.getByRole("textbox", { name: "End", exact: true })).toHaveValue("2026-09-08");
  await expect(inspector.locator("label").filter({ hasText: "Duration" }).locator("input")).toHaveValue("");
  await inspector.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("[A] ends 2026-09-08");
  await expect(page.locator(".cm-content")).not.toContainText("lasts 3 days");
});
