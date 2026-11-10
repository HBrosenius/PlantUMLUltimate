import {
  openDiagramOptions,
  fitDiagram,
  openAddDialog,
  prepareEditor,
  setSource,
  source,
  waitForDiagramRender,
} from "./editor-helpers";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await prepareEditor(page);
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
  await expect(
    page.frameLocator('iframe[title="Local PlantUML renderer"]').locator('script[src*="viz-global"]'),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await expect(page.locator('iframe[title="Local PlantUML renderer"]')).toHaveCount(0);
  await expect(page.locator(".statusbar")).toContainText("Preview paused");
  await page.getByRole("button", { name: "Split", exact: true }).click();
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
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("[A] lasts 3 days");
});

test("shortens a weekend-starting task through every working endpoint", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit automation does not preserve SVG pointer coordinates for task drags");
  await setSource(page, source("saturday are closed\nsunday are closed\n[A] starts 2026-09-05\n[A] lasts 6 days"));
  await openDiagramOptions(page);
  await page.getByRole("button", { name: /^Move policy:/ }).click();
  await page.getByLabel("When moving tasks").selectOption("single");
  await page
    .getByRole("dialog", { name: "Settings", exact: true })
    .getByRole("button", { name: "Apply", exact: true })
    .click();
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
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("[B] on {Kalle:100%} starts 2026-09-05");
});

test("reviews a visual Backend to Frontend connection as one dependency change", async ({ page }) => {
  await page
    .getByRole("navigation", { name: "View mode" })
    .getByRole("button", { name: "Diagram", exact: true })
    .click();
  await waitForDiagramRender(page);
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  const history = page.getByRole("dialog", { name: "Version history" });
  await history.getByLabel("New version name").fill("Initial chart");
  await history.getByRole("button", { name: "Create version" }).click();
  await history.getByRole("button", { name: "Close", exact: true }).click();

  await page.locator('[data-task-id="backend"] .bar').click();
  await waitForDiagramRender(page);
  const handle = await page.locator('[data-task-id="backend"] [data-dependency-handle="end"]').boundingBox();
  const target = await page.locator('[data-task-id="frontend"] .bar').boundingBox();
  expect(handle).not.toBeNull();
  expect(target).not.toBeNull();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.getByRole("navigation", { name: "View mode" }).getByRole("button", { name: "Split", exact: true }).click();
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
  await page.getByRole("button", { name: "Diagram", exact: true }).click();
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

  await page.getByRole("button", { name: "Code", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("[A] ends at [B]'s end");
});

test("connects a later default task to an earlier task without breaking PlantUML rendering", async ({ page }) => {
  await fitDiagram(page);
  await page.locator("[data-task-id=testing] .bar").click();
  await waitForDiagramRender(page);
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
