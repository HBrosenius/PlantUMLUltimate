import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

import { fillSource, openAddDialog, pointInText, prepareEditor, setSource, source } from "./editor-helpers";

test.beforeEach(async ({ page }) => {
  await prepareEditor(page);
});

test("zooms with the mouse wheel and pans with the middle mouse button", async ({ page, browserName }) => {
  await setSource(page, source("[Large task] lasts 40 days"));
  const viewport = page.locator(".preview-viewport");
  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(0, -500);
  await expect(page.getByRole("button", { name: /Reset zoom/ })).not.toHaveText("100%");
  if (browserName === "webkit") return;

  await viewport.evaluate((element) => {
    element.scrollLeft = 120;
  });
  const before = await viewport.evaluate((element) => element.scrollLeft);
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(box!.x + box!.width / 2 - 100, box!.y + box!.height / 2);
  await expect(viewport).toHaveClass(/diagram-pan-active/);
  await page.mouse.up({ button: "middle" });
  await expect(viewport).not.toHaveClass(/diagram-pan-active/);
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before);
});

test("keeps the split divider fixed while source selection highlights tasks", async ({ page }) => {
  await setSource(page, source("[Design] lasts 3 days\n[Build] starts at [Design]'s end and lasts 4 days"));
  const divider = page.getByRole("separator");
  const expectedDividerX = await page.evaluate(() => window.innerWidth / 2);
  await expect.poll(async () => (await divider.boundingBox())!.x).toBeCloseTo(expectedDividerX, 0);
  const editor = page.locator(".cm-content");
  const initialX = (await divider.boundingBox())!.x;

  const designLine = (await editor.locator(".cm-line").nth(2).boundingBox())!;
  const buildLine = (await editor.locator(".cm-line").nth(3).boundingBox())!;
  await page.mouse.move(designLine.x + 4, designLine.y + designLine.height / 2);
  await page.mouse.down();
  await page.mouse.move(buildLine.x + Math.min(180, buildLine.width - 4), buildLine.y + buildLine.height / 2, {
    steps: 5,
  });
  await page.mouse.up();

  await expect(page.locator(".cm-selectionBackground").first()).toBeVisible();
  await expect(page.locator('[data-task-id="design"][data-selected="true"]')).toHaveCount(1);
  await expect(page.getByRole("complementary", { name: "Task inspector" })).toHaveCount(0);
  await expect.poll(async () => (await divider.boundingBox())!.x).toBeCloseTo(initialX, 0);

  await page.locator('[data-task-id="build"] .bar').click();
  await expect(page.getByRole("complementary", { name: "Task inspector" })).toBeVisible();
  await expect.poll(async () => (await divider.boundingBox())!.x).toBeCloseTo(initialX, 0);
});

test("highlights and renames task and person references from the editor", async ({ page }) => {
  await setSource(
    page,
    source("[Build] on {Alice} lasts 3 days\n[Test] on {Alice:50%} starts at [Build]'s end and lasts 2 days"),
  );

  const taskReference = await pointInText(page, 3, "Build");
  await page.mouse.click(taskReference.x, taskReference.y);
  await expect(page.locator(".cm-symbol-reference")).toHaveCount(2);
  await expect(page.locator(".cm-symbol-reference-active")).toHaveText("Build");
  await page.keyboard.press("F2");
  const taskRename = page.getByRole("dialog", { name: "Rename task" });
  await expect(taskRename).toContainText("2 semantic occurrences");
  await taskRename.getByLabel("New name").fill("Compile");
  await taskRename.getByRole("button", { name: "Rename" }).click();
  await expect(page.locator(".cm-content")).toContainText("[Compile] on {Alice}");
  await expect(page.locator(".cm-content")).toContainText("starts at [Compile]'s end");

  const personReference = await pointInText(page, 2, "Alice");
  await page.mouse.click(personReference.x, personReference.y);
  await expect(page.locator(".cm-symbol-reference")).toHaveCount(2);
  await page.mouse.click(personReference.x, personReference.y, { button: "right" });
  const symbolMenu = page.getByRole("menu", { name: "Symbol actions" });
  await expect(symbolMenu).toBeVisible();
  await symbolMenu.getByRole("menuitem", { name: "Rename…" }).click();
  const personRename = page.getByRole("dialog", { name: "Rename person" });
  await expect(personRename).toContainText("2 semantic occurrences");
  await personRename.getByLabel("New name").fill("Alicia");
  await personRename.getByRole("button", { name: "Rename" }).click();
  await expect(page.locator(".cm-content")).toContainText("{Alicia}");
  await expect(page.locator(".cm-content")).toContainText("{Alicia:50%}");
});

test("finds and navigates semantic task references", async ({ page }) => {
  await setSource(page, source("[Build] lasts 3 days\n[Test] starts at [Build]'s end and lasts 2 days"));
  const taskReference = await pointInText(page, 3, "Build");
  await page.mouse.click(taskReference.x, taskReference.y, { button: "right" });
  const symbolMenu = page.getByRole("menu", { name: "Symbol actions" });
  await expect(symbolMenu.getByRole("menuitem")).toHaveCount(5);
  await symbolMenu.getByRole("menuitem", { name: "Find references" }).click();

  const references = page.getByRole("complementary", { name: "References for Build" });
  await expect(references).toContainText("2 occurrences");
  await expect(references.getByRole("listitem")).toHaveCount(2);
  await expect(references.getByRole("listitem").first()).toContainText("Line 3 · declaration");
  await expect(references.getByRole("listitem").last()).toContainText("Line 4 · reference");
  await references.getByRole("listitem").first().click();
  await expect(page.locator(".statusbar")).toContainText("Ln 3");
  const referenceAgain = await pointInText(page, 3, "Build");
  await page.mouse.click(referenceAgain.x, referenceAgain.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Rename…" }).click();
  const rename = page.getByRole("dialog", { name: "Rename task" });
  await rename.getByLabel("New name").fill("Compile");
  await rename.getByText("Preview 2 edits").click();
  await expect(rename.locator(".rename-preview code")).toContainText([
    "[Build] lasts 3 days",
    "[Compile] lasts 3 days",
  ]);
  await rename.getByRole("button", { name: "Rename" }).click();
  const renamedReferences = page.getByRole("complementary", { name: "References for Compile" });
  await expect(renamedReferences).toContainText("2 occurrences");
  await renamedReferences.getByRole("button", { name: "Close references" }).click();

  const taskDeclaration = await pointInText(page, 2, "Compile");
  await page.mouse.click(taskDeclaration.x, taskDeclaration.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Next reference" }).click();
  await expect(page.locator(".statusbar")).toContainText("Ln 4");
});

test("opens semantic actions from a diagram task", async ({ page }) => {
  await setSource(page, source("[Build] lasts 3 days\n[Test] starts at [Build]'s end and lasts 2 days"));
  const task = page.locator('[data-task-id="build"]').first();
  await expect(task).toBeVisible();
  await task.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Symbol actions" });
  await expect(menu.getByRole("menuitem")).toHaveCount(5);
  await menu.getByRole("menuitem", { name: "Find references" }).click();
  const references = page.getByRole("complementary", { name: "References for Build" });
  await expect(references).toContainText("2 occurrences");
  await references.getByRole("button", { name: "Close references" }).click();

  await task.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Reveal declaration" }).click();
  await expect(page.locator(".statusbar")).toContainText("Ln 3");

  await task.focus();
  await page.keyboard.press("Shift+F10");
  await menu.getByRole("menuitem", { name: "Rename…" }).click();
  const rename = page.getByRole("dialog", { name: "Rename task" });
  await rename.getByLabel("New name").fill("Compile");
  await rename.getByRole("button", { name: "Rename" }).click();
  await expect(page.locator(".cm-content")).toContainText("[Compile] lasts 3 days");
  await expect(page.locator(".cm-content")).toContainText("[Compile]'s end");
  await expect(page.locator('[data-task-id="compile"][tabindex="0"]').first()).toBeFocused();
});

test("reports added, removed, moved, and out-of-range baseline tasks", async ({ page }) => {
  await setSource(page, source("[A] starts 2026-09-01\n[A] lasts 2 days\n[B] starts 2026-09-04\n[B] lasts 2 days"));
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  const history = page.getByRole("dialog", { name: "Version history" });
  await history.getByLabel("New version name").fill("Planning baseline");
  await history.getByRole("button", { name: "Create version" }).click();
  await history.getByRole("button", { name: "Set as baseline" }).click();
  await history.getByRole("button", { name: "Close", exact: true }).click();

  await setSource(
    page,
    "@startgantt\nProject starts 2026-10-01\n[B] starts 2026-10-03\n[B] lasts 3 days\n[C] starts 2026-10-08\n[C] lasts 2 days\n@endgantt",
  );
  const report = page.locator(".schedule-analysis-report");
  await report.locator("summary").click();
  await expect(report).toContainText("A");
  await expect(report).toContainText("Removed after baseline");
  await expect(report).toContainText("C");
  await expect(report).toContainText("Added after baseline");
  await expect(report).toContainText("outside visible timeline");
  await expect(page.locator(".removed-baseline-lane")).toBeVisible();
  await expect(page.locator('.removed-baseline-bar[data-baseline-task-id="a"]')).toBeVisible();
  await expect(page.locator(".removed-baseline-label")).toContainText("A");
});

test("clears baseline variance when a moved task returns to its original dates", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit automation does not preserve SVG pointer coordinates for task drags");
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  const history = page.getByRole("dialog", { name: "Version history" });
  await history.getByLabel("New version name").fill("Original schedule");
  await history.getByRole("button", { name: "Create version" }).click();
  await history.getByRole("button", { name: "Set as baseline" }).click();
  await history.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator('[data-timeline-header="top"]').nth(1)).toBeVisible({ timeout: 20_000 });

  const task = page.locator('[data-task-id="frontend"]');
  const dragByDays = async (days: number) => {
    const firstDate = await page.locator('[data-timeline-header="top"]').nth(0).boundingBox();
    const secondDate = await page.locator('[data-timeline-header="top"]').nth(1).boundingBox();
    expect(firstDate).not.toBeNull();
    expect(secondDate).not.toBeNull();
    const pixels = (secondDate!.x - firstDate!.x) * days;
    const box = await task.locator(".bar").boundingBox();
    expect(box).not.toBeNull();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + pixels, y, { steps: 4 });
    await page.mouse.up();
  };
  await dragByDays(3);
  await expect(page.locator(".schedule-analysis-report summary")).toContainText("1 changed task");
  await expect(page.locator('[data-baseline-task-id="frontend"]')).toBeVisible();
  await dragByDays(-3);
  await expect(page.locator(".schedule-analysis-report summary")).toContainText("0 changed tasks");
  await expect(page.locator('[data-baseline-task-id="frontend"]')).toHaveCount(0);
});

test("groups creation commands in an accessible Add menu", async ({ page }) => {
  const modifier = await page.evaluate(() => (/Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? "⌥" : "Alt+"));
  const add = page.getByRole("button", { name: "Add", exact: true });
  await add.click();
  const menu = page.getByRole("menu", { name: "Add" });
  await expect(menu.getByRole("menuitem")).toHaveText([
    `Task…${modifier}T`,
    `Milestone…${modifier}M`,
    `Divider…${modifier}D`,
  ]);
  await menu.getByRole("menuitem", { name: "Milestone…" }).click();
  await expect(page.getByRole("dialog", { name: "Add milestone" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Add milestone" })).toBeHidden();
});

test("opens creation dialogs with keyboard shortcuts", async ({ page }) => {
  await page.getByRole("button", { name: "Add", exact: true }).focus();
  await page.keyboard.press("Alt+t");
  await expect(page.getByRole("dialog", { name: "Add task" })).toBeVisible();
  await page.keyboard.press("Alt+m");
  await expect(page.getByRole("dialog", { name: "Add milestone" })).toBeHidden();
  await page.keyboard.press("Escape");

  await page.keyboard.press("Alt+m");
  await expect(page.getByRole("dialog", { name: "Add milestone" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.keyboard.press("Alt+d");
  await expect(page.getByRole("dialog", { name: "Add separator" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.locator(".cm-content").click();
  await page.keyboard.press("Alt+t");
  await expect(page.getByRole("dialog", { name: "Add task" })).toBeVisible();
});

test("creates standalone tasks with a movable project-start date", async ({ page }) => {
  await setSource(page, source("[Existing] starts 2026-09-01 and lasts 2 days"));
  await openAddDialog(page, "Task…");
  const dialog = page.getByRole("dialog", { name: "Add task" });
  await dialog.getByLabel("Name").fill("New task");
  await expect(dialog.getByLabel("Start date")).toHaveValue("2026-09-01");
  await dialog.getByRole("button", { name: "Add task" }).click();
  await expect(page.locator(".cm-content")).toContainText("[New task] starts 2026-09-01");

  const task = page.locator('[data-task-id="new task"]');
  await expect(task).toHaveAttribute("data-draggable", "true");
  const bar = await task.locator(".bar").boundingBox();
  expect(bar).not.toBeNull();
  await page.mouse.move(bar!.x + bar!.width / 2, bar!.y + bar!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar!.x + bar!.width / 2 + 80, bar!.y + bar!.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator(".cm-content")).not.toContainText("[New task] starts 2026-09-01");
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

test("edits the diagram title from project settings", async ({ page }) => {
  await setSource(page, source("[Build] lasts 2 days"));
  await page.getByRole("button", { name: "Project" }).click();
  await expect(page.getByRole("group", { name: "Closed weekdays" }).locator("label")).toHaveText([
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
    "Sun",
  ]);
  await page.getByLabel("Diagram title").fill("Release roadmap — 2026");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("title Release roadmap — 2026");
  await expect(page.locator(".diagram svg")).toContainText("Release roadmap — 2026", { timeout: 20_000 });
});

test("adds a colored critical date from project settings", async ({ page }) => {
  await setSource(page, source("[Build] lasts 2 days"));
  await page.getByRole("button", { name: "Project" }).click();
  const highlights = page.getByRole("group", { name: "Highlighted dates" });
  await highlights.getByRole("button", { name: "Add highlighted date" }).click();
  await highlights.getByLabel("Highlight date").fill("2026-09-18");
  await highlights.getByLabel("Highlight through date").fill("2026-09-18");
  await highlights.getByLabel("Highlight color").fill("#ef4444");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("2026-09-18 is colored in #ef4444");
});

test("starts a highlighted date by clicking the timeline header", async ({ page }) => {
  await setSource(page, source("[Build] lasts 25 days"));
  const dateHeader = page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-18"]');
  await dateHeader.focus();
  await dateHeader.press("Enter");
  const menu = page.getByRole("dialog", { name: "2026-09-18" });
  await expect(menu).toBeVisible();
  await expect(menu).toContainText("No date setting");
  await menu.getByRole("button", { name: "Highlight date" }).click();

  const dialog = page.getByRole("dialog", { name: "Highlight 2026-09-18" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Color", { exact: true }).fill("#ffd700");
  await dialog.getByRole("button", { name: "Highlight" }).click();
  await expect(page.locator(".cm-content")).toContainText("2026-09-18 is colored in #ffd700");

  await dateHeader.focus();
  await dateHeader.press("Enter");
  const reopenedMenu = page.getByRole("dialog", { name: "2026-09-18" });
  await expect(reopenedMenu).toContainText("Currently highlighted");
  await reopenedMenu.getByRole("button", { name: "Clear date setting" }).click();
  await expect(page.locator(".cm-content")).not.toContainText("2026-09-18 is colored in");
});

test("opens the date action menu when a task inspector is already open", async ({ page }) => {
  await setSource(page, source("[Build] lasts 25 days"));
  await page.locator('[data-task-id="build"] .bar').click();
  await expect(page.getByRole("complementary", { name: "Task inspector" })).toBeVisible();
  const dateHeader = page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-18"]');
  await dateHeader.focus();
  await dateHeader.press("Enter");
  await expect(page.getByRole("complementary", { name: "Task inspector" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "2026-09-18" })).toBeVisible();
});

test("opens the date action menu from both timeline header rows", async ({ page }) => {
  await setSource(page, source("[Build] lasts 25 days"));
  const top = page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-18"]');
  const bottom = page.locator('[data-timeline-header="bottom"][data-timeline-date="2026-09-18"]');
  await expect(top).toHaveCount(1);
  await expect(bottom).toHaveCount(1);
  await top.focus();
  await top.press("Enter");
  await expect(page.getByRole("dialog", { name: "2026-09-18" })).toBeVisible();
  await page.getByRole("dialog", { name: "2026-09-18" }).getByRole("button", { name: "Close", exact: true }).click();
  await bottom.focus();
  await bottom.press("Enter");
  await expect(page.getByRole("dialog", { name: "2026-09-18" })).toBeVisible();
});

test("marks and clears a closed day by clicking the timeline header", async ({ page }) => {
  await setSource(page, source("[Build] lasts 25 days"));
  const dateHeader = page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-18"]');
  await dateHeader.focus();
  await dateHeader.press("Enter");
  const menu = page.getByRole("dialog", { name: "2026-09-18" });
  await menu.getByRole("button", { name: "Mark as closed day" }).click();
  await expect(page.locator(".cm-content")).toContainText("2026-09-18 is closed");

  await dateHeader.focus();
  await dateHeader.press("Enter");
  const reopenedMenu = page.getByRole("dialog", { name: "2026-09-18" });
  await expect(reopenedMenu).toContainText("Currently marked as a closed day");
  await expect(reopenedMenu.getByRole("button", { name: "Already a closed day" })).toBeDisabled();
  await reopenedMenu.getByRole("button", { name: "Clear date setting" }).click();
  await expect(page.locator(".cm-content")).not.toContainText("2026-09-18 is closed");
});

test("closed-day hatching aligns with real timeline grid boundaries across resize, zoom, and scroll", async ({
  page,
}) => {
  await setSource(page, source("saturday are closed\nsunday are closed\n[Build] starts 2026-09-01 and lasts 45 days"));
  const measure = async () =>
    page.locator(".diagram svg").evaluate((svg) => {
      const number = (element: Element, name: string) => Number(element.getAttribute(name));
      const labels = [...svg.querySelectorAll<SVGTextElement>('[data-timeline-header="top"]')].map((text) => {
        const box = text.getBBox();
        return { closed: text.getAttribute("data-closed-date") === "true", center: box.x + box.width / 2 };
      });
      const gaps = labels
        .slice(1)
        .map((label, index) => label.center - labels[index]!.center)
        .filter((gap) => gap > 0.5)
        .sort((a, b) => a - b);
      const width = gaps[Math.floor(gaps.length / 2)]!;
      const closedLabels = labels.filter((label) => label.closed);
      const lowerWeekdayTop = [...svg.querySelectorAll<SVGTextElement>("text")]
        .filter((text) => /^(?:Mo|Tu|We|Th|Fr|Sa|Su)$/i.test(text.textContent?.trim() ?? ""))
        .map((text) => text.getBBox().y)
        .sort((a, b) => b - a)[0]!;
      const lowerWeekdayBaseline = [...svg.querySelectorAll<SVGTextElement>("text")]
        .filter((text) => /^(?:Mo|Tu|We|Th|Fr|Sa|Su)$/i.test(text.textContent?.trim() ?? ""))
        .map((text) => number(text, "y"))
        .sort((a, b) => b - a)[0]!;
      return [...svg.querySelectorAll<SVGRectElement>(".closed-day-hatching rect")].map((rect, index) => {
        const left = number(rect, "x");
        const right = left + number(rect, "width");
        const bottom = number(rect, "y") + number(rect, "height");
        const center = closedLabels[index]!.center;
        return {
          left,
          right,
          expectedLeft: center - width / 2,
          expectedRight: center + width / 2,
          bottom,
          expectedBottom: lowerWeekdayTop,
          lowerWeekdayBaseline,
        };
      });
    });
  const assertAligned = (items: Awaited<ReturnType<typeof measure>>) => {
    expect(items.length).toBeGreaterThan(4);
    for (const item of items) {
      // Browser font metrics can shift the calculated column center by a sub-pixel,
      // especially on Linux runners. A real column error is roughly 16 SVG units.
      expect(Math.abs(item.left - item.expectedLeft), JSON.stringify(item)).toBeLessThan(0.75);
      expect(Math.abs(item.right - item.expectedRight), JSON.stringify(item)).toBeLessThan(0.75);
      // SVG font metrics can settle a fraction of a unit after the overlay effect runs.
      // The important invariant is that hatching ends at the top of the lower header
      // and never extends through its date labels.
      expect(Math.abs(item.bottom - item.expectedBottom), JSON.stringify(item)).toBeLessThan(2);
      expect(item.bottom, JSON.stringify(item)).toBeLessThan(item.lowerWeekdayBaseline);
    }
  };
  const waitForHatching = () =>
    expect.poll(() => page.locator(".closed-day-hatching rect").count(), { timeout: 5_000 }).toBeGreaterThan(4);
  await waitForHatching();
  assertAligned(await measure());
  await page.setViewportSize({ width: 820, height: 720 });
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.locator(".preview-viewport").evaluate((element) => {
    element.scrollLeft = 300;
  });
  await waitForHatching();
  assertAligned(await measure());
});

test("edits pauses and links with structured inspector rows", async ({ page }) => {
  await setSource(
    page,
    source(
      "[Build] starts 2026-09-01 and lasts 5 days\n[Build] pauses on monday\n[Build] links to [[https://example.com Existing]]",
    ),
  );
  await page.locator('[data-task-id="build"]').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector.getByLabel("Pause date or weekday")).toHaveValue("monday");
  await inspector.getByRole("button", { name: "Add pause" }).click();
  await inspector.getByLabel("Pause date or weekday").nth(1).fill("2026-09-04");
  await expect(inspector.getByLabel("Link URL")).toHaveValue("https://example.com");
  await inspector.getByRole("button", { name: "Add link" }).click();
  await inspector.getByLabel("Link URL").nth(1).fill("https://plantuml.com/gantt-diagram");
  await inspector.getByLabel("Link label").nth(1).fill("PlantUML reference");
  await inspector.getByLabel("Link label").nth(1).blur();
  await expect(page.locator(".cm-content")).toContainText("[Build] pauses on 2026-09-04");
  await expect(page.locator(".cm-content")).toContainText("[[https://plantuml.com/gantt-diagram PlantUML reference]]");
});

test("drags a vertical separator and closes its inspector on an outside click", async ({ page }) => {
  await setSource(page, source("[Build] starts 2026-09-01 and lasts 8 days\nSeparator just at [Build]'s end"));
  const separator = page.locator('[data-vertical-separator-index="0"]');
  const box = await separator.boundingBox();
  expect(box).not.toBeNull();
  const dayWidth = await separator.evaluate((element) => {
    const svg = element.ownerSVGElement!;
    const scale = Math.abs(svg.getScreenCTM()?.a ?? 1);
    return Number(element.getAttribute("data-day-width") ?? 16) * scale;
  });
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  await separator.dispatchEvent("pointerdown", {
    pointerId: 18,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
  });
  await page.evaluate(
    ({ x, y }) =>
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 18,
          pointerType: "mouse",
          buttons: 1,
          clientX: x,
          clientY: y,
        }),
      ),
    { x: start.x + dayWidth, y: start.y },
  );
  await page.evaluate(
    ({ x, y }) =>
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 18,
          pointerType: "mouse",
          button: 0,
          clientX: x,
          clientY: y,
        }),
      ),
    { x: start.x + dayWidth, y: start.y },
  );
  await expect(page.locator(".cm-content")).toContainText("Separator just 1 day after [Build]'s end");
  await separator.dispatchEvent("click");
  await expect(page.getByRole("complementary", { name: "Vertical separator inspector" })).toBeVisible();
  await page.getByRole("button", { name: "File" }).click();
  await expect(page.getByRole("complementary", { name: "Vertical separator inspector" })).toBeHidden();
});

test("highlights a horizontal separator in the source editor when selected", async ({ page }) => {
  await setSource(page, source("[Planning] lasts 2 days\n-- Delivery --\n[Build] lasts 3 days"));
  const separator = page.getByRole("button", { name: "Move divider Delivery" });
  await expect(separator).toBeVisible();
  await separator.dispatchEvent("click");
  await expect(page.getByRole("complementary", { name: "Divider inspector" })).toBeVisible();
  await expect(page.locator(".cm-selectionBackground")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() ?? "")).toContain("-- Delivery --");
});

test("previews and uses every horizontal separator insertion boundary", async ({ page }) => {
  await setSource(page, source("[Planning] lasts 2 days\n[Build] lasts 3 days\n[Review] lasts 1 day\n-- Delivery --"));
  const separator = page.getByRole("button", { name: "Move divider Delivery" });
  const planning = await page.locator('[data-task-id="planning"] .bar').boundingBox();
  const build = await page.locator('[data-task-id="build"] .bar').boundingBox();
  const separatorBox = await separator.boundingBox();
  expect(planning).not.toBeNull();
  expect(build).not.toBeNull();
  expect(separatorBox).not.toBeNull();
  const targetY = (planning!.y + planning!.height + build!.y) / 2;
  const pointerX = separatorBox!.x + separatorBox!.width / 2;
  const pointerY = separatorBox!.y + separatorBox!.height / 2;
  await separator.dispatchEvent("pointerdown", {
    pointerId: 7,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    clientX: pointerX,
    clientY: pointerY,
  });
  await page.evaluate(
    ({ clientX, clientY }) =>
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 7,
          pointerType: "mouse",
          buttons: 1,
          clientX,
          clientY,
        }),
      ),
    { clientX: pointerX, clientY: targetY },
  );
  await expect(page.locator(".divider-drop-indicator")).toHaveCount(1);
  await expect(page.locator(".interaction-feedback")).toContainText("between Planning and Build");
  await page.evaluate(
    ({ clientX, clientY }) =>
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 7,
          pointerType: "mouse",
          button: 0,
          clientX,
          clientY,
        }),
      ),
    { clientX: pointerX, clientY: targetY },
  );
  await expect(page.locator(".divider-drop-indicator")).toHaveCount(0);
  await expect
    .poll(() => page.locator(".cm-content").innerText())
    .toMatch(/\[Planning][\s\S]*-- Delivery --[\s\S]*\[Build]/);
});

test("moves the Automated Web Testing separator below Unified End To End Testing", async ({ page }) => {
  await setSource(
    page,
    source(
      "-- Automated Web Testing --\n" +
        "[Unified UnMasked Messaging Download Report Testing] is colored in Orange\n" +
        "[Unified UnMasked Messaging Download Report Testing] lasts 10 days\n" +
        "[Unified End To End Testing] lasts 10 days\n" +
        "[Unified End To End Testing] is colored in Orange\n" +
        "[Automated Rating Data Web Test Plan] starts 2026-08-25 and lasts 7 days\n" +
        "[Automated Rating Data Web Test Plan] is colored in lightOrange\n" +
        "[Automated Unmasked Data Web Test Plan] starts 2026-08-25 and lasts 7 days\n" +
        "[Unified End To End Testing] starts at [Unified UnMasked Messaging Download Report Testing]'s end",
    ),
  );
  const separator = page.getByRole("button", { name: "Move divider Automated Web Testing" });
  const unified = await page.locator('[data-task-id="unified end to end testing"] .bar').boundingBox();
  const automated = await page.locator('[data-task-id="automated rating data web test plan"] .bar').boundingBox();
  const separatorBox = await separator.boundingBox();
  expect(unified).not.toBeNull();
  expect(automated).not.toBeNull();
  expect(separatorBox).not.toBeNull();
  const targetY = (unified!.y + unified!.height + automated!.y) / 2;
  const pointerX = separatorBox!.x + separatorBox!.width / 2;
  await separator.dispatchEvent("pointerdown", {
    pointerId: 8,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    clientX: pointerX,
    clientY: separatorBox!.y + separatorBox!.height / 2,
  });
  await page.evaluate(
    ({ clientX, clientY }) =>
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 8,
          pointerType: "mouse",
          buttons: 1,
          clientX,
          clientY,
        }),
      ),
    { clientX: pointerX, clientY: targetY },
  );
  await expect(page.locator(".interaction-feedback")).toContainText(
    "between Unified End To End Testing and Automated Rating Data Web Test Plan",
  );
  await page.evaluate(
    ({ clientX, clientY }) =>
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 8,
          pointerType: "mouse",
          clientX,
          clientY,
        }),
      ),
    { clientX: pointerX, clientY: targetY },
  );
  await expect
    .poll(() => page.locator(".cm-content").innerText())
    .toMatch(
      /\[Unified End To End Testing] is colored in Orange[\s\S]*-- Automated Web Testing --[\s\S]*\[Automated Rating Data Web Test Plan]/,
    );
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
  await fillSource(page, value);
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
  await fillSource(page, value, "Development");
  await expect(page.locator(".diagram svg")).toContainText("Development", { timeout: 20_000 });
  await expect(page.locator(".diagram svg")).toContainText("Open Risk ?");
  await expect(page.locator(".fallback-note")).toHaveCount(2);
  await expect(page.locator(".statusbar")).not.toContainText("Rendering timed out");
});

test("replaces the preview after pasting the large weekend-aware project", async ({ page }) => {
  const value = readFileSync("tests/fixtures/weekend-aware-large.puml", "utf8");
  await fillSource(page, value, "Project Gantt Chart — Weekend-Aware");
  await expect(page.locator(".document-tabs > button.active .dirty-dot.visible")).toBeVisible();
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

test("snaps a Monday task to the previous Friday using dated timeline columns", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit automation does not preserve SVG pointer coordinates for task drags");
  await setSource(page, source("saturday are closed\nsunday are closed\n[A] starts 2026-09-07\n[A] lasts 3 days"));
  const friday = await page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-04"]').boundingBox();
  const monday = await page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-07"]').boundingBox();
  const bar = await page.locator("[data-task-id=a] .bar").boundingBox();
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
  await expect(page.locator(".cm-content")).toContainText("[A] starts 2026-09-04");
  await expect(page.locator(".cm-content")).not.toContainText("[A] starts 2026-09-02");
});

test("moves the default Backend task from Monday to the preceding Friday", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit automation does not preserve SVG pointer coordinates for task drags");
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
  const delta = friday!.x + friday!.width / 2 - (monday!.x + monday!.width / 2);
  const startX = bar!.x + bar!.width / 2;
  const startY = bar!.y + bar!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.evaluate(
    ({ clientX, clientY }) =>
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          buttons: 1,
          clientX,
          clientY,
          pointerId: 1,
          pointerType: "mouse",
        }),
      ),
    { clientX: startX + delta, clientY: startY },
  );
  await expect(page.locator(".interaction-feedback")).toHaveText("Move -3 days");
  await task.dispatchEvent("lostpointercapture", { clientX: 0, clientY: 0 });
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("[A] starts 2026-09-04");
  await expect(page.locator(".cm-content")).not.toContainText("[A] starts 2026-09-02");
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
  const renderer = page.locator('iframe[title="Local PlantUML renderer"]');
  await expect(renderer).toHaveCount(1);
  await expect(renderer).not.toHaveAttribute("srcdoc", /viz-global/);
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
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector).toBeVisible();
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
  await expect(inspector.locator("label").filter({ hasText: "Duration" }).locator("input")).not.toHaveValue("3");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".cm-content")).toContainText("[A] lasts 3 days");
});

test("shortens a weekend-starting task through every working endpoint", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit automation does not preserve SVG pointer coordinates for task drags");
  await setSource(page, source("saturday are closed\nsunday are closed\n[A] starts 2026-09-05\n[A] lasts 6 days"));
  await page.getByLabel("Schedule").selectOption("single");
  await page.locator("[data-task-id=a] .bar").click();
  await expect(page.locator("[data-task-id=a]")).toHaveAttribute("data-selected", "true");
  const handle = page.locator("[data-task-id=a] [data-resize-handle]");
  const box = await handle.boundingBox();
  const firstDate = await page.locator('[data-timeline-header="top"]').nth(0).boundingBox();
  const secondDate = await page.locator('[data-timeline-header="top"]').nth(1).boundingBox();
  expect(box).not.toBeNull();
  expect(firstDate).not.toBeNull();
  expect(secondDate).not.toBeNull();
  const dayPixels = Math.abs(secondDate!.x - firstDate!.x);
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 - dayPixels, box!.y + box!.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("[A] lasts 5 days");
  await expect(page.locator(".cm-content")).toContainText("[A] starts 2026-09-05");
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
      "[A] starts 2026-09-01\n[A] lasts 2 days\n[B] on {Kalle:100%} starts 2026-09-05\n[B] lasts 4 days and is colored in LightBlue",
    ),
  );
  await page.locator("[data-task-id=a] .bar").click();
  const handle = await page.locator('[data-task-id=a] [data-dependency-handle="end"]').boundingBox();
  const target = await page.locator("[data-task-id=b] .bar").boundingBox();
  expect(handle).not.toBeNull();
  expect(target).not.toBeNull();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 5 });
  await expect(page.locator("[data-task-id=b]")).toHaveClass(/connection-target/);
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("[B] on {Kalle:100%} starts at [A]'s end");
  await expect(page.locator(".cm-content")).toContainText("[B] lasts 4 days and is colored in LightBlue");
  await expect(page.locator(".cm-content")).not.toContainText("[B] [B]");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".cm-content")).toContainText("[B] on {Kalle:100%} starts 2026-09-05");
});

test("reviews a visual Backend to Frontend connection as one dependency change", async ({ page }) => {
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  const history = page.getByRole("dialog", { name: "Version history" });
  await history.getByLabel("New version name").fill("Initial chart");
  await history.getByRole("button", { name: "Create version" }).click();
  await history.getByRole("button", { name: "Close", exact: true }).click();

  await page.locator('[data-task-id="backend"] .bar').click();
  const handle = await page.locator('[data-task-id="backend"] [data-dependency-handle="end"]').boundingBox();
  const target = await page.locator('[data-task-id="frontend"] .bar').boundingBox();
  expect(handle).not.toBeNull();
  expect(target).not.toBeNull();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("[Frontend] starts at [Backend]'s end");

  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  const review = history.getByLabel("Semantic changes");
  await expect(review).toContainText("Add dependency Backend → Frontend");
  await expect(review).not.toContainText("Add task Frontend");
  await expect(review).not.toContainText("Unclassified source change");
  await expect(history.locator(".semantic-review-group")).toHaveCount(1);
  await history.getByRole("button", { name: "Show Add dependency Backend → Frontend in rendered diagrams" }).click();
  const renderedComparison = history.getByLabel("Rendered differences");
  await expect(renderedComparison.locator(".interaction-hit").first()).toHaveCSS("fill", "rgba(0, 0, 0, 0)", {
    timeout: 20_000,
  });
  await expect(
    history.getByLabel("Current working copy rendered diagram").locator(".semantic-render-highlight"),
  ).toHaveCount(1, { timeout: 20_000 });
});

test("connects task end anchors to create an end-to-end dependency", async ({ page }) => {
  await setSource(page, source("[A] lasts 2 days\n[B] lasts 4 days"));
  await page.locator('[data-task-id="a"] .bar').click();
  await expect(page.locator('[data-task-id="a"] [data-dependency-handle]')).toHaveCount(2);
  const sourceHandle = await page.locator('[data-task-id="a"] [data-dependency-handle="end"]').boundingBox();
  const targetHandle = await page.locator('[data-task-id="b"] [data-dependency-target-handle="end"]').boundingBox();
  expect(sourceHandle).not.toBeNull();
  expect(targetHandle).not.toBeNull();

  await page.mouse.move(sourceHandle!.x + sourceHandle!.width / 2, sourceHandle!.y + sourceHandle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetHandle!.x + targetHandle!.width / 2, targetHandle!.y + targetHandle!.height / 2, {
    steps: 5,
  });
  await expect(page.locator('[data-task-id="b"] [data-dependency-target-handle="end"]')).toHaveClass(
    /connection-target/,
  );
  await page.mouse.up();

  await expect(page.locator(".cm-content")).toContainText("[B] ends at [A]'s end");
});

test("connects task anchors after switching to diagram-only view", async ({ page }) => {
  await setSource(page, source("[A] lasts 2 days\n[B] lasts 4 days"));
  // Put the editor cursor inside task [A] first, so sourceHighlightedTaskId locks onto "a"
  // while the editor is still visible, then switch to diagram-only view: the editor (and its
  // onCursorChange handler) unmounts, so that highlight must not survive and shadow a task
  // clicked directly in the diagram afterward.
  await page.locator(".cm-line").filter({ hasText: "[A] lasts 2 days" }).click();
  await page.getByRole("button", { name: "3 · diagram" }).click();
  await expect(page.locator(".cm-content")).toHaveCount(0);

  await page.locator('[data-task-id="b"] .bar').click();
  await expect(page.locator('[data-task-id="b"] [data-dependency-handle]')).toHaveCount(2);
  const sourceHandle = await page.locator('[data-task-id="b"] [data-dependency-handle="end"]').boundingBox();
  const targetHandle = await page.locator('[data-task-id="a"] [data-dependency-target-handle="end"]').boundingBox();
  expect(sourceHandle).not.toBeNull();
  expect(targetHandle).not.toBeNull();

  await page.mouse.move(sourceHandle!.x + sourceHandle!.width / 2, sourceHandle!.y + sourceHandle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetHandle!.x + targetHandle!.width / 2, targetHandle!.y + targetHandle!.height / 2, {
    steps: 5,
  });
  await page.mouse.up();

  await page.getByRole("button", { name: "1 · code" }).click();
  await expect(page.locator(".cm-content")).toContainText("[A] ends at [B]'s end");
});

test("connects a later default task to an earlier task without breaking PlantUML rendering", async ({ page }) => {
  await page.locator("[data-task-id=testing] .bar").click();
  const handle = await page.locator('[data-task-id=testing] [data-dependency-handle="end"]').boundingBox();
  const target = await page.locator("[data-task-id=frontend] .bar").boundingBox();
  expect(handle).not.toBeNull();
  expect(target).not.toBeNull();

  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 5 });
  await expect(page.locator("[data-task-id=frontend]")).toHaveClass(/connection-target/);
  await page.mouse.up();

  await expect
    .poll(async () => {
      const text = (await page.locator(".cm-content").innerText()) ?? "";
      return text.indexOf("[Frontend] starts at [Testing]'s end") > text.indexOf("[Testing] lasts 5 days");
    })
    .toBe(true);
  await expect(page.locator(".diagram svg")).not.toContainText("Syntax Error");
  await expect(page.locator(".render-notice")).toBeHidden();
});

test("migrates dependencies in every persisted open Gantt tab on reload", async ({ page }) => {
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const request = indexedDB.open("plantuml-studio", 2);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("workspace", "readwrite");
    transaction.objectStore("workspace").put(
      {
        version: 4,
        activeDocumentId: "first",
        viewMode: "split",
        splitPercent: 50,
        theme: "system",
        documents: [
          {
            id: "first",
            historyId: "history-first",
            diagramKind: "gantt",
            source:
              "@startgantt\n[Frontend] starts at [Testing]'s end\n[Frontend] lasts 3 days\n[Testing] lasts 2 days\n@endgantt",
            fileName: "first.puml",
            dirty: false,
            zoom: 1,
            cursor: { line: 1, column: 1 },
          },
          {
            id: "second",
            historyId: "history-second",
            diagramKind: "gantt",
            source: "@startgantt\n[B] starts at [A]'s end\n[B] lasts 2 days\n[A] lasts 1 day\n@endgantt",
            fileName: "second.puml",
            dirty: false,
            zoom: 1,
            cursor: { line: 1, column: 1 },
          },
        ],
      },
      "current",
    );
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });

  await page.reload();
  await expect(page.locator('.document-tabs > button[title="first.puml — unsaved changes"]')).toBeVisible();
  await expect(page.locator('.document-tabs > button[title="second.puml — unsaved changes"]')).toBeVisible();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  if (await chooser.isVisible()) await chooser.getByRole("button", { name: "Cancel" }).click();
  await expect
    .poll(async () => {
      const text = await page.locator(".cm-content").innerText();
      return text.indexOf("[Frontend] starts at [Testing]'s end") > text.indexOf("[Testing] lasts 2 days");
    })
    .toBe(true);
  await page.locator('.document-tabs > button[title="second.puml — unsaved changes"]').click();
  await expect
    .poll(async () => {
      const text = await page.locator(".cm-content").innerText();
      return text.indexOf("[B] starts at [A]'s end") > text.indexOf("[A] lasts 1 day");
    })
    .toBe(true);
});

test("removes one person from a task with multiple assignments", async ({ page }) => {
  await setSource(page, source("[A] on {Kalle:100%} {Lisa:50%} starts 2026-09-01\n[A] lasts 4 days"));
  await page.locator('[data-task-id="a"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector.getByLabel("Person name")).toHaveCount(2);
  await inspector.getByRole("button", { name: "Remove Kalle" }).click();

  await expect(inspector.getByLabel("Person name")).toHaveCount(1);
  await expect(inspector.getByLabel("Person name")).toHaveValue("Lisa");
  await expect(page.locator(".cm-content")).toContainText("[A] on {Lisa:50%} starts 2026-09-01");
  await expect(page.locator(".cm-content")).not.toContainText("{Kalle:100%}");
});

test("edits an end-to-end task relationship from the task inspector", async ({ page }) => {
  await setSource(page, source("[A] starts 2026-09-01\n[A] lasts 5 days\n[B] lasts 3 days\n[B] starts at [A]'s end"));
  await page.locator('[data-task-id="b"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector.getByLabel("Linked task")).toHaveValue("a");
  await inspector.getByLabel("Relationship").selectOption("end-after-end");
  await expect(page.locator(".cm-content")).toContainText("[B] ends at [A]'s end");
  await expect(page.locator(".cm-content")).not.toContainText("[B] starts at [A]'s end");

  await expect(page.getByRole("complementary", { name: "Task inspector" }).getByLabel("Relationship")).toHaveValue(
    "end-after-end",
  );
});

test("shows an existing end-linked relationship in the task inspector", async ({ page }) => {
  await setSource(
    page,
    source(
      "[Prototype design] lasts 13 days and is colored in Lavender/LightBlue\n[Write tests] lasts 5 days and ends at [Prototype design]'s end\n[Hire tests writers] lasts 6 days and ends at [Write tests]'s start",
    ),
  );
  await page.locator('[data-task-id="write tests"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector.getByLabel("Linked task")).toHaveValue("prototype design");
  await expect(inspector.getByLabel("Relationship")).toBeEnabled();
  await expect(inspector.getByLabel("Relationship")).toHaveValue("end-after-end");
});

test("keeps the relationship choice available before selecting a linked task", async ({ page }) => {
  await setSource(page, source("[A] lasts 2 days\n[B] lasts 2 days"));
  await page.locator('[data-task-id="b"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector.getByLabel("Linked task")).toHaveValue("");
  await expect(inspector.getByLabel("Relationship")).toBeEnabled();
  await inspector.getByLabel("Relationship").selectOption("end-after-end");
  await inspector.getByLabel("Linked task").selectOption("a");
  await expect(page.locator(".cm-content")).toContainText("[B] ends at [A]'s end");
});

test("keeps resource capacities isolated between document tabs", async ({ page }) => {
  const firstSource = source("[A] on {Kalle:100%} starts 2026-09-01\n[A] lasts 2 days");
  await setSource(page, firstSource);
  await page.getByRole("button", { name: "Resources" }).click();
  await page.getByRole("spinbutton", { name: "Capacity for Kalle" }).fill("50");
  await expect(page.locator(".resource-card details")).toHaveCount(1);
  await page.getByRole("button", { name: "Close resource workload" }).click();
  await page.getByRole("button", { name: "New document tab" }).click();
  await page.getByRole("button", { name: "Gantt diagram" }).click();
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

test("does not over-allocate a person when multiple people shorten a task", async ({ page }) => {
  await setSource(
    page,
    source(
      "saturday are closed\nsunday are closed\n[Backend] on {Kalle:100%} {Tyra:100%} starts 2026-09-07\n[Backend] lasts 8 days\n[Testing] on {Tyra:100%} starts 2026-09-14\n[Testing] lasts 5 days",
    ),
  );

  await expect(page.getByRole("alert", { name: "Resource over-allocation" })).toHaveCount(0);
  await page.getByRole("button", { name: "Resources" }).click();
  const tyra = page.locator(".resource-card").filter({ has: page.getByRole("button", { name: "Tyra" }) });
  await expect(tyra).toContainText("Peak 100%");
});

test("shows resource over-allocation after dragging assigned tasks into overlap", async ({ page }) => {
  await setSource(page, source("[A] starts 2026-09-01\n[A] lasts 3 days\n[B] starts 2026-09-08\n[B] lasts 3 days"));
  for (const taskId of ["a", "b"]) {
    await page.locator(`[data-task-id="${taskId}"] .bar`).click();
    const inspector = page.getByRole("complementary", { name: "Task inspector" });
    await inspector.getByRole("button", { name: "+ Add person" }).click();
    await inspector.getByLabel("Person name").fill("Kalle");
    await inspector.getByLabel("Person name").blur();
    await expect(page.locator(".cm-content")).toContainText(
      taskId === "a" ? "[A] on {Kalle:100%} starts 2026-09-01" : "[B] on {Kalle:100%} starts 2026-09-08",
    );
  }
  const warning = page.getByRole("alert", { name: "Resource over-allocation" });
  await expect(warning).toHaveCount(0);
  const firstTask = page.locator('[data-task-id="a"] .bar');
  const secondTask = page.locator('[data-task-id="b"] .bar');
  await expect(firstTask).toBeVisible();
  await expect(secondTask).toBeVisible();
  const readRect = (task: typeof firstTask) =>
    task.evaluate((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    });
  let first = await readRect(firstTask);
  let second = await readRect(secondTask);
  await expect
    .poll(async () => {
      first = await readRect(firstTask);
      second = await readRect(secondTask);
      return Math.min(first.width, second.width);
    })
    .toBeGreaterThan(0);

  const start = { x: second.x + second.width / 2, y: second.y + second.height / 2 };
  const targetPoint = { x: first.x + first.width / 2, y: start.y };
  await secondTask.dispatchEvent("pointerdown", {
    pointerId: 19,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
  });
  await page.evaluate(
    ({ x, y }) =>
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 19,
          pointerType: "mouse",
          buttons: 1,
          clientX: x,
          clientY: y,
        }),
      ),
    targetPoint,
  );
  await page.evaluate(
    ({ x, y }) =>
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 19,
          pointerType: "mouse",
          button: 0,
          clientX: x,
          clientY: y,
        }),
      ),
    targetPoint,
  );

  await expect(page.locator(".cm-content")).toContainText("[B] on {Kalle:100%} starts 2026-09-01");
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("Kalle: 200% assigned / 100% capacity");

  await expect
    .poll(async () => {
      const a = await page.locator('[data-task-id="a"] .bar').boundingBox();
      const b = await page.locator('[data-task-id="b"] .bar').boundingBox();
      return a && b ? Math.abs(a.x - b.x) : Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(10);

  await page.locator('[data-task-id="a"] .bar').click();
  const handle = await page.locator('[data-task-id="a"] [data-dependency-handle="end"]').boundingBox();
  const target = await page.locator('[data-task-id="b"] .bar').boundingBox();
  expect(handle).not.toBeNull();
  expect(target).not.toBeNull();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 6 });
  await page.mouse.up();

  await expect(page.locator(".cm-content")).toContainText("[B] on {Kalle:100%} starts at [A]'s end");
  await expect(warning).toHaveCount(0);
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

test("shows allocation-adjusted dates in the task hover card", async ({ page }) => {
  await setSource(page, source("[More tasks] on {Kalle:75%} starts 2026-09-01\n[More tasks] lasts 20 days"));
  await page.locator('[data-task-id="more tasks"] .bar').hover();
  const card = page.getByLabel("Task details for More tasks");
  await expect(card).toBeVisible();
  await expect(card).toContainText("2026-09-01 → 2026-09-27");
  await expect(card).toContainText("Kalle 75%");
});

test("saves task inspector text fields on blur instead of while typing", async ({ page }) => {
  await setSource(page, source("[Build] lasts 2 days"));
  await page.locator('[data-task-id="build"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector.getByRole("button", { name: "Apply" })).toHaveCount(0);
  await inspector.getByLabel("Color", { exact: true }).fill("Orange");
  await expect(page.locator(".cm-content")).not.toContainText("[Build] is colored in Orange");
  await inspector.getByLabel("Color", { exact: true }).blur();
  await expect(page.locator(".cm-content")).toContainText("[Build] is colored in Orange");
  await expect(inspector).toBeVisible();
  await inspector.getByLabel("Name").fill("Compile");
  await expect(page.locator(".cm-content")).not.toContainText("[Compile]");
  await inspector.getByLabel("Name").blur();
  await expect(page.locator(".cm-content")).toContainText("[Compile] is colored in Orange");
});

test("applies a color picked from the palette immediately, without a separate blur", async ({ page }) => {
  await setSource(page, source("[Build] lasts 2 days"));
  await page.locator('[data-task-id="build"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await inspector.getByRole("button", { name: "Choose color from a palette" }).click();
  await expect(inspector.locator('[aria-label="Color palette"]')).toBeVisible();
  await inspector.getByRole("button", { name: "Orange", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("[Build] is colored in Orange");
});

test("applies a dependency's line color as soon as it's picked from the palette", async ({ page }) => {
  await setSource(page, source("[A] lasts 2 days\n[B] starts at [A]'s end"));
  await page.getByRole("button", { name: "Select dependency from A to B" }).click();
  const inspector = page.getByRole("complementary", { name: "Dependency inspector" });
  await expect(inspector).toBeVisible();
  await inspector.getByRole("button", { name: "Choose line color from a palette" }).click();
  await inspector.getByRole("button", { name: "Red", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("with Red link");
});

test("closes inspectors on any outside click and switches directly to another task", async ({ page }) => {
  await setSource(page, source("[A] lasts 2 days\n[B] lasts 2 days"));
  await page.locator('[data-task-id="a"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector.getByLabel("Name")).toHaveValue("A");
  await page.getByRole("button", { name: "Help" }).click();
  await expect(inspector).toHaveCount(0);
  await page.getByRole("button", { name: "Close help" }).click();

  await page.locator('[data-task-id="a"] .bar').click();
  await page.locator('[data-task-id="b"] .bar').click();
  await expect(page.getByRole("complementary", { name: "Task inspector" }).getByLabel("Name")).toHaveValue("B");
});

test("restores diagram focus after closing and workspace focus after deleting", async ({ page, browserName }) => {
  await setSource(page, source("[Build] lasts 2 days"));
  const task = page.locator('[data-task-id="build"][tabindex="0"]').first();
  await task.click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await inspector.getByLabel("Name").fill("");
  await expect(inspector.getByRole("alert")).toHaveText("Enter a task name.");
  await inspector.getByLabel("Name").fill("Build");
  await inspector.getByRole("button", { name: "Close task inspector" }).click();
  await expect(page.locator('[data-task-id="build"]:focus')).toHaveCount(1);

  await task.click();
  page.once("dialog", (dialog) => void dialog.accept());
  await inspector.getByRole("button", { name: /Delete/ }).click();
  if (browserName !== "webkit") await expect(page.locator("main.workspace")).toBeFocused();
});

test("navigates between task inspectors with the preview arrows", async ({ page }) => {
  await page.locator('[data-task-id="architecture"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector.getByLabel("Name")).toHaveValue("Architecture");

  await page.getByRole("button", { name: "Next task" }).click();
  await expect(inspector.getByLabel("Name")).toHaveValue("Backend");
  await expect(inspector).toBeVisible();

  await page.getByRole("button", { name: "Previous task" }).click();
  await expect(inspector.getByLabel("Name")).toHaveValue("Architecture");
  await expect(inspector).toBeVisible();
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
  const end = inspector.getByRole("textbox", { name: "End", exact: true });
  const duration = inspector.locator("label").filter({ hasText: "Duration" }).locator('input[type="number"]');

  await expect(duration).toHaveValue("3");
  await expect(duration).toHaveAttribute("readonly", "");
  await end.fill("2026-09-09");
  await expect(duration).toHaveValue("4");
  await end.blur();

  await inspector.getByRole("button", { name: "Switch to duration ⇄" }).click();
  await expect(end).toHaveValue("2026-09-09");
  await expect(end).toHaveAttribute("readonly", "");
  await expect(duration).toHaveValue("4");
  await expect(duration).not.toHaveAttribute("readonly", "");
  await expect(page.locator(".cm-content")).toContainText("[A] lasts 4 days");
  await expect(page.locator(".cm-content")).not.toContainText("ends 2026-09-09");

  await duration.fill("3");
  await expect(end).toHaveValue("2026-09-08");

  await inspector.getByRole("button", { name: "Switch to end date ⇄" }).click();
  await expect(end).toHaveValue("2026-09-08");
  await expect(end).not.toHaveAttribute("readonly", "");
  await expect(duration).toHaveValue("3");
  await expect(duration).toHaveAttribute("readonly", "");
  await expect(page.locator(".cm-content")).toContainText("[A] ends 2026-09-08");
  await expect(page.locator(".cm-content")).not.toContainText("lasts 3 days");
});

test("converts a dependent task from duration to an editable explicit end", async ({ page }) => {
  await setSource(page, source("[A] starts 2026-09-01 and lasts 2 days\n[B] starts at [A]'s end and lasts 3 days"));
  await page.locator('[data-task-id="b"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  const end = inspector.getByRole("textbox", { name: "End", exact: true });
  const duration = inspector.locator("label").filter({ hasText: "Duration" }).locator('input[type="number"]');
  const derivedEnd = await end.inputValue();
  expect(derivedEnd).not.toBe("");

  await inspector.getByRole("button", { name: "Switch to end date ⇄" }).click();

  await expect(end).toHaveValue(derivedEnd);
  await expect(end).not.toHaveAttribute("readonly", "");
  await expect(duration).toHaveValue("3");
  await expect(duration).toHaveAttribute("readonly", "");
  await expect(page.locator(".cm-content")).toContainText(`[B] ends ${derivedEnd}`);
  await expect(page.locator(".cm-content")).not.toContainText("[B] lasts 3 days");
});

test("suggests PlantUML color names in the task inspector", async ({ page }) => {
  await setSource(page, source("[A] starts 2026-09-01 and lasts 3 days"));
  await page.locator("[data-task-id=a] .bar").click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  const color = inspector.getByRole("combobox", { name: "Color" });
  const listId = await color.getAttribute("list");
  expect(listId).toBeTruthy();
  for (const name of ["AliceBlue", "DarkOrange", "LightGreen", "OrangeRed", "YellowGreen"])
    await expect(inspector.locator(`datalist[id="${listId}"] option[value="${name}"]`)).toHaveCount(1);
  await color.fill("Ora");
  await expect(color).toHaveValue("Ora");
});
