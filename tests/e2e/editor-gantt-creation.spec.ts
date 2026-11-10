import { openRibbonGroup, openAddDialog, prepareEditor, setSource, source } from "./editor-helpers";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await prepareEditor(page);
});

test("groups creation commands in the Insert ribbon", async ({ page }) => {
  const modifier = await page.evaluate(() => (/Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? "⌥" : "Alt+"));
  await openRibbonGroup(page, "Insert", "Insert elements");
  const menu = page.getByRole("group", { name: "New diagram elements", exact: true });
  await expect(menu.getByRole("button")).toHaveText([
    `Task…${modifier}T`,
    `Milestone…${modifier}M`,
    `Divider…${modifier}D`,
    "Closed day…",
  ]);
  await menu.getByRole("button", { name: "Milestone…" }).click();
  await expect(page.getByRole("dialog", { name: "Add milestone" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Add milestone" })).toBeHidden();
});

test("opens creation dialogs with keyboard shortcuts", async ({ page }) => {
  await page.getByRole("tab", { name: "Insert", exact: true }).focus();
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
  // Keep the task and drag destination inside the canvas on every browser's SVG scale.
  await page.getByRole("button", { name: "Fit diagram", exact: true }).click();
  await task.locator(".bar").scrollIntoViewIfNeeded();
  const bar = await task.locator(".bar").boundingBox();
  expect(bar).not.toBeNull();
  await page.mouse.move(bar!.x + bar!.width / 2, bar!.y + bar!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar!.x + bar!.width / 2 + 80, bar!.y + bar!.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator(".cm-content")).not.toContainText("[New task] starts 2026-09-01");
});

test("places a newly added task on the selected task row", async ({ page, browserName }) => {
  test.setTimeout(browserName === "webkit" ? 120_000 : 60_000);
  await openAddDialog(page, "Task…");
  const dialog = page.getByRole("dialog", { name: "Add task" });
  await dialog.getByLabel("Name").fill("New task");
  await dialog.getByRole("button", { name: "Add task" }).click();

  await page.locator('[data-task-id="new task"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await inspector.getByText("Appearance", { exact: true }).click();
  await inspector.getByLabel("Display on same row as").selectOption("architecture");
  await expect(page.locator(".render-notice.rendering")).toBeHidden({ timeout: 45_000 });

  await expect(page.locator(".cm-content")).toContainText("[New task] displays on same row as [Architecture]");
  await expect(page.locator(".cm-content")).toContainText("[New task] starts at [Architecture]'s end");
  await expect
    .poll(async () => {
      const architecture = await page.locator('[data-task-id="architecture"] .bar').boundingBox();
      const newTask = await page.locator('[data-task-id="new task"] .bar').boundingBox();
      if (!architecture || !newTask) return undefined;
      return {
        sameRow: Math.abs(architecture.y - newTask.y) < architecture.height / 4,
        separated: newTask.x >= architecture.x + architecture.width,
      };
    })
    .toEqual({ sameRow: true, separated: true });
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
  await openRibbonGroup(page, "Plan", "Planning tools");
  await page.getByRole("button", { name: "Calendar & schedule" }).click();
  await expect(page.getByRole("group", { name: "Working days" }).locator("label")).toHaveText([
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
    "Sun",
  ]);
  await page.getByLabel("Diagram title").fill("Release roadmap — 2026");
  await page.getByRole("button", { name: "Apply changes", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("title Release roadmap — 2026");
  await expect(page.locator(".diagram svg")).toContainText("Release roadmap — 2026", { timeout: 20_000 });
});

test("adds a colored critical date from project settings", async ({ page }) => {
  await setSource(page, source("[Build] lasts 2 days"));
  await openRibbonGroup(page, "Plan", "Planning tools");
  await page.getByRole("button", { name: "Calendar & schedule" }).click();
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
      expect(Math.abs(item.left - item.expectedLeft), JSON.stringify(item)).toBeLessThan(1);
      expect(Math.abs(item.right - item.expectedRight), JSON.stringify(item)).toBeLessThan(1);
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
  // Linked task labels navigate on click; use the task's keyboard action to edit it.
  await page.locator('[data-task-id="build"][role="button"]').press("Enter");
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
  // Use the browser gesture so pointerup also produces the click consumed after a drag.
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dayWidth, start.y, { steps: 5 });
  await page.mouse.up();
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
