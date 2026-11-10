import { openRibbonGroup, fillSource, openAddDialog, prepareEditor, setSource, source } from "./editor-helpers";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.beforeEach(async ({ page }) => {
  await prepareEditor(page);
});

test("lists and reveals syntax that is preserved but not visually editable", async ({ page }) => {
  await setSource(page, source("skinparam handwritten true\n[A] starts 2026-09-01\n[A] lasts 2 days"));
  const count = page.getByRole("button", { name: "1 issues" });
  await expect(count).toBeVisible();
  await count.click();
  const panel = page.getByRole("complementary", { name: "Issues" });
  await panel.getByText("Preserved source (1)").click();
  await expect(panel).toContainText("skinparam handwritten true");
  await panel.getByRole("button", { name: /skinparam handwritten true/ }).click();
  await expect(page.locator(".cm-content")).toContainText("skinparam handwritten true");
  await panel.getByRole("button", { name: "Close issues" }).click();
  await expect(panel).toBeHidden();
});

test("keeps source fixes available outside the lint tooltip", async ({ page }) => {
  const value = source("[Build] [Build] starts 2026-09-01");
  await fillSource(page, value);
  const fix = page.getByLabel("Show source fix suggestions");
  await expect(fix).toBeVisible();
  await expect(fix).toHaveText("Fix issue");
  await fix.click();
  const suggestion = page
    .getByRole("list", { name: "Source fix suggestions", exact: true })
    .getByRole("listitem")
    .filter({ has: page.locator("code", { hasText: "[Build] starts 2026-09-01" }) });
  await suggestion.getByRole("button", { name: /Apply fix/ }).click();
  await expect(page.locator(".cm-content")).toContainText("[Build] starts 2026-09-01");
  await expect(page.locator(".cm-content")).not.toContainText("[Build] [Build]");
  await expect(fix).toBeHidden();
});

test("repairs order-sensitive relationship statements from the editor", async ({ page }) => {
  await setSource(
    page,
    source(
      "[Prototype delivered] happens 2026-09-25\n[Front End] lasts 20 days\n[Front End Testing] starts at [Front End]'s end\n[Front End Testing] lasts 20 days\n[Front End] starts at [Prototype delivered]'s end",
    ),
  );
  const repair = page.getByLabel("Show source fix suggestions");
  await expect(repair).toBeVisible();
  await repair.click();
  await page.getByRole("button", { name: /Repair 1 order-sensitive relationship statement/ }).click();
  await expect
    .poll(async () => {
      const text = await page.locator(".cm-content").innerText();
      return (
        text.indexOf("[Front End Testing] starts at [Front End]'s end") >
        text.indexOf("[Front End] starts at [Prototype delivered]'s end")
      );
    })
    .toBe(true);
  await expect(repair).toBeHidden();
  await expect(page.locator(".diagram svg")).not.toContainText("Syntax Error");
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
  await fillSource(page, value, "Development");
  await expect(page.locator(".diagram svg")).toContainText("Development", { timeout: 20_000 });
  await expect(page.locator(".diagram svg")).toContainText("Open Risk ?");
  await expect(page.locator(".fallback-note")).toHaveCount(2);
  await expect(page.locator(".statusbar")).not.toContainText("Rendering timed out");
});

test("replaces the preview after pasting the large weekend-aware project", async ({ page }) => {
  const value = readFileSync("tests/fixtures/weekend-aware-large.puml", "utf8");
  await fillSource(page, value, "Project Gantt Chart — Weekend-Aware");
  await expect(page.locator(".document-tab > button.active .dirty-dot.visible")).toBeVisible();
  await expect(page.locator(".render-notice.rendering")).toContainText("Rendering updated preview");
  await expect(page.locator(".diagram svg")).toContainText("Unified End To End Testing", { timeout: 20_000 });
  await expect(page.locator(".diagram svg")).not.toContainText("Architecture");
  await expect(page.locator(".fallback-note")).toHaveCount(4);
  await expect(page.locator(".render-notice")).toBeHidden();
  await expect(page.getByLabel("Development performance metrics")).toContainText("tasks");
  await expect(page.getByLabel("Development performance metrics")).toContainText("Parse");
  await expect(page.getByLabel("Development performance metrics")).toContainText("Overlay");
});

test("makes a failed update explicit instead of silently showing the old preview", async ({ page }) => {
  await setSource(page, source("[Previous diagram] lasts 2 days"));
  await page.locator(".cm-content").fill("@startgantt\n[Broken] starts nope\n@endgantt");
  const error = page.locator(".render-notice.error");
  // A syntax error names the failing line and offers to reveal it; retrying the same source cannot help.
  await expect(error).toContainText("Line 2 can't be drawn", { timeout: 20_000 });
  await expect(error).toContainText("[Broken] starts nope");
  await expect(page.locator(".preview-viewport")).toHaveClass(/stale-preview/);
  await error.getByRole("button", { name: "Go to line 2" }).click();
  await expect(page.locator(".statusbar")).toContainText("Ln 2");
});

test("explains oversized previews and recovers after reducing the diagram", async ({ page }) => {
  test.setTimeout(60_000);
  await setSource(page, source("[Previous diagram] lasts 2 days"));
  const oversized = `@startgantt\nProject starts 2026-10-01\n${Array.from({ length: 300 }, (_, index) => `[Task ${index + 1}] lasts 2 days`).join("\n")}\n@endgantt`;
  await fillSource(page, oversized);
  const notice = page.getByRole("alert", { name: "Preview size limit" });
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await expect(notice).toContainText("source remains available to edit and save");
  await expect(notice).toContainText("earlier successful render");
  await notice.getByRole("button", { name: "Continue editing" }).click();
  await expect(notice).toBeHidden();
  await expect(page.locator(".cm-content")).toContainText("[Task 300] lasts 2 days");
  await fillSource(page, source("[Recovered diagram] lasts 2 days"));
  await expect(page.locator('[data-task-id="recovered diagram"]')).toBeVisible({ timeout: 20_000 });
  await expect(notice).toHaveCount(0);
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

test("edits, reviews, and applies a delivery scenario from the rendered preview", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit automation does not preserve SVG pointer coordinates for task drags");
  await setSource(page, source("[A] starts 2026-09-01\n[A] lasts 3 days\n[B] starts 2026-09-08\n[B] lasts 2 days"));

  await openRibbonGroup(page, "Plan", "Planning tools");
  await page.getByRole("button", { name: "What-if scenario…" }).click();
  const dialog = page.getByRole("dialog", { name: "What-if scenario", exact: true });
  await dialog.getByRole("button", { name: "Rendered preview" }).click();
  const scenario = dialog.getByLabel("Scenario preview");
  await expect(scenario.locator("svg")).toBeVisible({ timeout: 20_000 });

  // The comparison toolbar can put the first task below the dialog's visible area.
  // Scroll before measuring coordinates for real pointer dragging.
  await scenario.locator('[data-task-id="a"] .bar').scrollIntoViewIfNeeded();
  const firstDate = await scenario.locator('[data-timeline-header="top"]').nth(0).boundingBox();
  const secondDate = await scenario.locator('[data-timeline-header="top"]').nth(1).boundingBox();
  const bar = await scenario.locator('[data-task-id="a"] .bar').boundingBox();
  expect(firstDate).not.toBeNull();
  expect(secondDate).not.toBeNull();
  expect(bar).not.toBeNull();
  const dayPixels = Math.abs(secondDate!.x - firstDate!.x);
  await page.mouse.move(bar!.x + bar!.width / 2, bar!.y + bar!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar!.x + bar!.width / 2 + dayPixels * 2, bar!.y + bar!.height / 2, { steps: 4 });
  await page.mouse.up();

  await dialog.getByRole("button", { name: "Edit scenario" }).click();
  await dialog.getByRole("button", { name: "Edit PlantUML source" }).click();
  await expect(dialog.getByLabel("Scenario source")).toContainText("[A] starts 2026-09-03");

  await dialog.getByRole("button", { name: "Rendered preview" }).click();
  await scenario.locator('[data-task-id="a"] .bar').click();
  const resizeHandle = await scenario.locator('[data-task-id="a"] [data-resize-handle]').boundingBox();
  expect(resizeHandle).not.toBeNull();
  await page.mouse.move(resizeHandle!.x + resizeHandle!.width / 2, resizeHandle!.y + resizeHandle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    resizeHandle!.x + resizeHandle!.width / 2 + dayPixels,
    resizeHandle!.y + resizeHandle!.height / 2,
    { steps: 3 },
  );
  await page.mouse.up();

  await dialog.getByRole("button", { name: "Edit scenario" }).click();
  await expect(dialog.getByLabel("Scenario source")).toContainText("[A] lasts 4 days");
  await dialog.getByRole("button", { name: "Review and apply…" }).click();
  await expect(dialog.getByLabel("Scenario source patch")).toContainText("[A] starts 2026-09-03");
  await expect(dialog.getByLabel("Scenario source patch")).toContainText("[A] lasts 4 days");
  await dialog.getByRole("button", { name: "Apply scenario" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.locator(".cm-content")).toContainText("[A] starts 2026-09-03");
  await expect(page.locator(".cm-content")).toContainText("[A] lasts 4 days");
});

test("snaps a Monday task to the previous Friday using dated timeline columns", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit automation does not preserve SVG pointer coordinates for task drags");
  await setSource(page, source("saturday are closed\nsunday are closed\n[A] starts 2026-09-07\n[A] lasts 3 days"));
  const { delta, startX, startY } = await page.locator("[data-task-id=a] .bar").evaluate((element) => {
    const bar = element as SVGGraphicsElement;
    const svg = bar.ownerSVGElement;
    const friday = svg?.querySelector<SVGGraphicsElement>(
      '[data-timeline-header="top"][data-timeline-date="2026-09-04"]',
    );
    const monday = svg?.querySelector<SVGGraphicsElement>(
      '[data-timeline-header="top"][data-timeline-date="2026-09-07"]',
    );
    if (!friday || !monday) throw new Error("Dated timeline columns are unavailable");
    const fridayRect = friday.getBoundingClientRect();
    const mondayRect = monday.getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();
    return {
      delta: fridayRect.x + fridayRect.width / 2 - (mondayRect.x + mondayRect.width / 2),
      startX: barRect.x + barRect.width / 2,
      startY: barRect.y + barRect.height / 2,
    };
  });
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + delta, startY, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("[A] starts 2026-09-04");
  await expect(page.locator(".cm-content")).not.toContainText("[A] starts 2026-09-02");
});

test("moves a weekend-start Backend task from Monday to the preceding Friday", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit automation does not preserve SVG pointer coordinates for task drags");
  await setSource(
    page,
    source(
      "saturday are closed\nsunday are closed\n[Architecture] starts 2026-09-01\n[Architecture] lasts 4 days\n[Backend] starts 2026-09-05\n[Backend] lasts 8 days",
    ),
  );
  const friday = await page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-04"]').boundingBox();
  const monday = await page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-07"]').boundingBox();
  const bar = await page.locator("[data-task-id=backend] .bar").boundingBox();
  expect(friday).not.toBeNull();
  expect(monday).not.toBeNull();
  expect(bar).not.toBeNull();
  const delta = friday!.x + friday!.width / 2 - (monday!.x + monday!.width / 2);
  const startX = bar!.x + bar!.width / 2;
  const startY = bar!.y + bar!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + delta, startY, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("[Backend] starts 2026-09-04");
  await expect(page.locator(".cm-content")).not.toContainText("[Backend] starts 2026-09-02");
});

test("keeps the last valid drag position when pointer capture is lost", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit automation does not preserve SVG pointer coordinates for task drags");
  await setSource(page, source("saturday are closed\nsunday are closed\n[A] starts 2026-09-07\n[A] lasts 3 days"));
  const friday = await page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-04"]').boundingBox();
  const monday = await page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-07"]').boundingBox();
  const task = page.locator("[data-task-id=a]");
  const bar = await task.locator(".bar").boundingBox();
  expect(friday).not.toBeNull();
  expect(monday).not.toBeNull();
  expect(bar).not.toBeNull();
  const startX = bar!.x + bar!.width / 2;
  const startY = bar!.y + bar!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.evaluate(
    ({ startX, clientY }) => {
      const center = (selector: string) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        return rect.left + rect.width / 2;
      };
      const delta =
        center('[data-timeline-header="top"][data-timeline-date="2026-09-04"]') -
        center('[data-timeline-header="top"][data-timeline-date="2026-09-07"]');
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          buttons: 1,
          clientX: startX + delta,
          clientY,
          pointerId: 1,
          pointerType: "mouse",
        }),
      );
    },
    { startX, clientY: startY },
  );
  await expect(page.locator(".interaction-feedback")).toHaveText("Move -3 days");
  await task.dispatchEvent("lostpointercapture", { clientX: 0, clientY: 0 });
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("[A] starts 2026-09-04");
  await expect(page.locator(".cm-content")).not.toContainText("[A] starts 2026-09-02");
});

test("leaves a task unchanged when its drag or resize is cancelled", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit automation does not preserve SVG pointer coordinates for task drags");
  await setSource(page, source("[A] starts 2026-09-07\n[A] lasts 3 days"));
  const task = page.locator("[data-task-id=a]");
  const bar = await task.locator(".bar").boundingBox();
  const first = await page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-07"]').boundingBox();
  const second = await page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-08"]').boundingBox();
  expect(bar).not.toBeNull();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  const dayPixels = Math.abs(second!.x - first!.x);
  const cancel = () =>
    page.evaluate(() =>
      window.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1, pointerType: "mouse" })),
    );

  await page.mouse.move(bar!.x + bar!.width / 2, bar!.y + bar!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar!.x + bar!.width / 2 + dayPixels * 2, bar!.y + bar!.height / 2, { steps: 4 });
  await expect(page.locator(".interaction-feedback")).toHaveText("Move +2 days");
  await cancel();
  await page.mouse.up();
  await expect(page.locator(".interaction-feedback")).not.toHaveText(/Move/);
  await expect(page.locator(".cm-content")).toContainText("[A] starts 2026-09-07");

  await task.locator(".bar").click();
  const handle = await task.locator("[data-resize-handle]").boundingBox();
  expect(handle).not.toBeNull();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle!.x + handle!.width / 2 + dayPixels * 2, handle!.y + handle!.height / 2, { steps: 4 });
  await cancel();
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("[A] lasts 3 days");
  await expect(page.locator(".cm-content")).toContainText("[A] starts 2026-09-07");
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
  const trigger = page.getByRole("button", { name: "Task…", exact: true });
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
