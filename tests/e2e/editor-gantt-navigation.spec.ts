import { pointInText, prepareEditor, setSource, source, waitForDiagramRender } from "./editor-helpers";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.beforeEach(async ({ page }) => {
  await prepareEditor(page);
});

test("selects a native PlantUML theme from document settings", async ({ page }) => {
  const openSettings = async () => {
    await page.getByRole("button", { name: "File" }).click();
    await page.getByRole("menu", { name: "File" }).getByRole("menuitem", { name: "Document settings…" }).click();
    return page.getByRole("dialog", { name: "Document settings" });
  };

  const diagram = page.locator(".diagram-svg-host svg");
  await expect(diagram).toBeVisible();
  const defaultSvg = await diagram.evaluate((element) => element.outerHTML);
  let settings = await openSettings();
  await settings.getByLabel("PlantUML theme").selectOption("blueprint");
  await expect
    .poll(() =>
      settings
        .getByLabel("Theme preview")
        .locator("svg")
        .evaluate((element) => element.outerHTML),
    )
    .toContain("#003153");
  await settings.getByRole("button", { name: "Apply" }).click();
  await expect(settings).toBeHidden();
  await expect(page.locator(".cm-content")).toContainText("!theme blueprint");
  await expect.poll(() => diagram.evaluate((element) => element.outerHTML)).not.toBe(defaultSvg);
  await expect.poll(() => diagram.evaluate((element) => element.outerHTML)).toContain("#003153");
  await page.locator('[data-task-id="architecture"] .bar').click();
  await expect(page.locator('[data-task-id="architecture"]')).toHaveAttribute("data-selected", "true");
  await expect(page.locator('[data-task-id="architecture"] [data-dependency-handle]')).toHaveCount(2);

  await page.waitForTimeout(450);
  await page.reload();
  await expect(page.locator(".cm-content")).toContainText("!theme blueprint");
  await expect.poll(() => diagram.evaluate((element) => element.outerHTML)).toContain("#003153");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menu", { name: "File" }).getByRole("menuitem", { name: "Export" }).hover();
  await page.getByRole("menu", { name: "Export" }).getByRole("menuitem", { name: "Quick download SVG" }).click();
  const downloadPath = await (await downloadPromise).path();
  expect(downloadPath).not.toBeNull();
  expect(readFileSync(downloadPath!, "utf8")).toContain("#003153");

  settings = await openSettings();
  await expect(settings.getByLabel("PlantUML theme")).toHaveValue("blueprint");
  await settings.getByLabel("PlantUML theme").selectOption("");
  await settings.getByRole("button", { name: "Apply" }).click();
  await expect(settings).toBeHidden();
  await expect(page.locator(".cm-content")).not.toContainText("!theme");
});

test("creates diagram dependencies with a hand-drawn PlantUML theme", async ({ page }) => {
  await setSource(
    page,
    source("!theme sketchy\n[A] starts 2026-09-01 and lasts 2 days\n[B] starts 2026-09-01 and lasts 2 days"),
  );
  await page.locator('[data-task-id="a"] .bar').click();
  await waitForDiagramRender(page);
  await page.locator('[data-task-id="a"] [data-dependency-handle="end"]').hover();
  await page.mouse.down();
  await page.locator('[data-task-id="b"] .bar').hover();
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("[B] starts at [A]'s end");
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
  const divider = page.locator(".divider[role=separator]");
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
});

test("searches the diagram outline and jumps to source and rendered selection", async ({ page }) => {
  await page.getByRole("button", { name: "Diagram", exact: true }).click();
  await expect(page.locator(".cm-content")).toHaveCount(0);
  await page.keyboard.press("Control+Shift+o");
  const outline = page.getByRole("dialog", { name: "Diagram outline" });
  const outlineSearch = outline.getByLabel("Search diagram elements");
  await expect(outlineSearch).toBeFocused();
  await outlineSearch.fill("Architecture");
  await expect(outline.getByRole("list", { name: "Diagram elements" }).getByRole("listitem")).toHaveCount(1);
  await outline.getByRole("button", { name: /Architecture/ }).click();

  await expect(outline).toBeHidden();
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(page.locator(".cm-selectionBackground").first()).toBeVisible();
  await expect(page.locator('[data-task-id="architecture"]')).toHaveAttribute("data-selected", "true");
  await expect(page.getByRole("complementary", { name: "Task inspector" }).getByLabel("Name")).toHaveValue(
    "Architecture",
  );

  await page.keyboard.press("Control+Shift+o");
  await expect(outlineSearch).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(outline).toBeHidden();
  // Escape dismisses the outline while retaining the selected task inspector.
  await expect(page.getByRole("complementary", { name: "Task inspector" })).toBeVisible();
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
  await expect(symbolMenu.getByRole("menuitem")).toHaveCount(6);
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
  await expect(menu.getByRole("menuitem")).toHaveCount(6);
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

test("duplicates a task from source and diagram context menus", async ({ page }) => {
  await setSource(page, source("[Build] on {Alice} lasts 3 days\n[Build] is colored in Blue"));
  const sourceTask = await pointInText(page, 3, "Build");
  await page.mouse.click(sourceTask.x, sourceTask.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Duplicate task" }).click();
  await expect(page.locator(".cm-content")).toContainText("[Build copy] on {Alice} lasts 3 days");
  await expect(page.locator(".cm-content")).toContainText("[Build copy] is colored in Blue");

  const diagramCopy = page.locator('[data-task-id="build copy"]').first();
  await expect(diagramCopy).toBeVisible();
  await diagramCopy.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Duplicate task" }).click();
  await expect(page.locator(".cm-content")).toContainText("[Build copy 2] on {Alice} lasts 3 days");
});

test("reports added, removed, moved, and out-of-range baseline tasks", async ({ page }) => {
  await setSource(page, source("[A] starts 2026-09-01\n[A] lasts 2 days\n[B] starts 2026-09-04\n[B] lasts 2 days"));
  // setSource deliberately accepts the previous successful SVG while a new render is pending.
  // Wait for this fixture's semantic overlay before capturing the version so slow CI browsers do
  // not accidentally store the default diagram as the baseline.
  await expect(page.locator('[data-task-id="a"]')).toBeVisible();
  await expect(page.locator('[data-task-id="b"]')).toBeVisible();
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

test.describe(() => {
  // At natural-size zoom these small plans sit low in the pane; on Linux fonts the preview toolbar wraps further
  // and the bottom-pinned baseline report / over-allocation alert would cover the bars being dragged.
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("clears baseline variance when a moved task returns to its original dates", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "WebKit automation does not preserve SVG pointer coordinates for task drags");
    await setSource(
      page,
      "@startgantt\nProject starts 2026-10-01\n[Frontend] starts 2026-10-02\n[Frontend] lasts 10 days\n@endgantt",
    );
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
      await waitForDiagramRender(page);
      const headers = page.locator('[data-timeline-header="top"]');
      await expect(headers.nth(1)).toBeVisible();
      let dayWidth = 0;
      await expect
        .poll(async () => {
          dayWidth = await headers.evaluateAll((elements) => {
            if (elements.length < 2) return 0;
            // Text glyph rounding at fitted zoom makes the first gap unreliable.
            const centers = elements.map((element) => {
              const box = element.getBoundingClientRect();
              return box.x + box.width / 2;
            });
            const gaps = centers
              .slice(1)
              .map((center, index) => center - centers[index]!)
              .filter((gap) => gap > 0.5)
              .sort((a, b) => a - b);
            return gaps[Math.floor(gaps.length / 2)] ?? 0;
          });
          return dayWidth;
        })
        .toBeGreaterThan(0);
      const pixels = dayWidth * days;
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
    await expect(page.locator(".cm-content")).toContainText("[Frontend] starts 2026-10-02");
    await expect(page.locator(".schedule-analysis-report summary")).toContainText("0 changed tasks");
    await expect(page.locator('[data-baseline-task-id="frontend"]')).toHaveCount(0);
  });
});
