import { fillSource, fitDiagram, prepareEditor, setSource, source } from "./editor-helpers";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await prepareEditor(page);
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
  await inspector.getByText("Appearance", { exact: true }).click();
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
  await inspector.getByText("Appearance", { exact: true }).click();
  await inspector.getByRole("button", { name: "Choose color from a palette" }).click();
  await expect(inspector.locator('[aria-label="Color palette"]')).toBeVisible();
  await inspector.getByRole("button", { name: "Orange", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("[Build] is colored in Orange");
});

test("applies a dependency's line color as soon as it's picked from the palette", async ({ page }) => {
  await setSource(page, source("[A] lasts 2 days\n[B] starts at [A]'s end"));
  await fitDiagram(page);
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
  await page.getByRole("button", { name: "Help", exact: true }).click();
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
  await inspector.getByText("Appearance", { exact: true }).click();
  const color = inspector.getByRole("combobox", { name: "Color" });
  const listId = await color.getAttribute("list");
  expect(listId).toBeTruthy();
  for (const name of ["AliceBlue", "DarkOrange", "LightGreen", "OrangeRed", "YellowGreen"])
    await expect(inspector.locator(`datalist[id="${listId}"] option[value="${name}"]`)).toHaveCount(1);
  await color.fill("Ora");
  await expect(color).toHaveValue("Ora");
});

test("chooses an anchor fix and restores the error with undo", async ({ page }) => {
  const value = source(
    "[Design] lasts 2 days\n[Build] lasts 3 days\n[Build] starts at [Design]'s\n[Build] is 50 completed",
  );
  await fillSource(page, value);
  await page.getByLabel("Show source fix suggestions").click();
  const startFix = page.getByRole("button", { name: /Use predecessor start/ });
  await expect(startFix.locator("..")).toContainText("[Build] starts at [Design]'s start");
  await startFix.click();
  await expect(page.locator(".cm-content")).toContainText("[Build] starts at [Design]'s start");
  await expect(page.locator(".cm-content")).toContainText("[Build] is 50 completed");
  await page.locator(".cm-content").press("ControlOrMeta+z");
  await expect(page.locator(".cm-content")).not.toContainText("[Design]'s start");
  await page.getByLabel("Show source fix suggestions").click();
  await expect(page.getByRole("button", { name: /Use predecessor end/ })).toBeVisible();
});

test("repairs a misspelled task reference and supports undo", async ({ page }) => {
  await fillSource(
    page,
    source("[Backend] lasts 2 days\n[Frontend] lasts 3 days\n[Frontend] starts at [Backned]'s end"),
  );
  await page.getByLabel("Show source fix suggestions").click();
  await page.getByRole("button", { name: /Use task Backend/ }).click();
  await expect(page.locator(".cm-content")).toContainText("[Frontend] starts at [Backend]'s end");
  await expect(page.getByLabel("Show source fix suggestions")).toBeHidden();
  await page.locator(".cm-content").press("ControlOrMeta+z");
  await expect(page.locator(".cm-content")).toContainText("[Frontend] starts at [Backned]'s end");
  await page.getByLabel("Show source fix suggestions").click();
  await expect(page.getByRole("button", { name: /Use task Backend/ })).toBeVisible();
});

test("explains dependency cycles and reveals each relationship", async ({ page }) => {
  await fillSource(
    page,
    source(
      "[Architecture] lasts 2 days\n[Backend] lasts 3 days\n[Architecture] starts at [Backend]'s end\n[Backend] starts at [Architecture]'s end",
    ),
  );
  await page.getByRole("button", { name: "2 issues" }).click();
  const panel = page.getByRole("complementary", { name: "Issues" });
  const cycles = panel.getByRole("listitem").filter({ hasText: "Dependency cycle:" });
  await expect(cycles).toHaveCount(2);
  await expect(cycles.first()).toContainText("Backend → Architecture → Backend");
  await expect(cycles.last()).toContainText("Architecture → Backend → Architecture");
  await cycles.last().click();
  await expect(page.locator(".cm-activeLine")).toContainText("[Backend] starts at [Architecture]'s end");
});

test("detects and repairs project, weekday, dependency and completion keyword typos", async ({ page }) => {
  await fillSource(
    page,
    source(
      "Project start 2026-09-21\nsuunday are closed\n[Backend] lasts 2 days\n[Frontend] lasts 3 days\n[Architecture] lasts 6 days\n[Frontend] starts att [Backend]'s end\n[Architecture] iss 50% completed\n[Architecture] is 50% complet",
    ),
  );
  for (const keyword of ["starts", "sunday", "at", "is", "completed"]) {
    await page.getByLabel("Show source fix suggestions").click();
    await page.getByRole("button", { name: new RegExp(`Use ${keyword}\\b`) }).click();
  }
  const code = page.locator(".cm-content");
  await expect(code).toContainText("Project starts 2026-09-21");
  await expect(code).toContainText("sunday are closed");
  await expect(code).toContainText("[Frontend] starts at [Backend]'s end");
  await expect(code).not.toContainText("iss 50%");
  await expect.poll(() => code.innerText()).not.toMatch(/50% complet(?:\r?\n|$)/);
  await expect(page.getByLabel("Show source fix suggestions")).toBeHidden();
});

test("repairs calendar and inline typos without changing duration values", async ({ page }) => {
  await fillSource(
    page,
    source(
      "sunday ar closed\nsaturday are clsoed\nprintscale dayly\n[Backend] lasts 2 days\n[Frontend] lasts 3 days\n[Frontend] starts at [Backend]'s edn\n[Architecture] lasts 5 dys\n[Architecture] starts 2026-09-21 and iss 50% completed",
    ),
  );
  for (const keyword of ["are", "closed", "daily", "end", "days", "is"]) {
    await page.getByLabel("Show source fix suggestions").click();
    await page.getByRole("button", { name: new RegExp(`Use ${keyword}\\b`) }).click();
  }
  await expect(page.locator(".cm-content")).toContainText("[Architecture] lasts 5 days");
  await expect(page.locator(".cm-content")).toContainText("[Architecture] starts 2026-09-21 and is 50% completed");
  await expect(page.getByLabel("Show source fix suggestions")).toBeHidden();
});

test("compares baseline dependencies even when dates match and reports project finish shifts", async ({
  page,
  browserName,
}) => {
  test.setTimeout(browserName === "webkit" ? 120_000 : 60_000);
  const baseline =
    "@startgantt\nProject starts 2026-10-01\n[A] lasts 2 days\n[B] lasts 2 days\n[B] starts 3 days after [A]'s end\n@endgantt";
  await setSource(page, baseline);
  await expect(page.locator('[data-task-id="b"]')).toBeVisible();
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  const history = page.getByRole("dialog", { name: "Version history" });
  await history.getByLabel("New version name").fill("Dependency baseline");
  await history.getByRole("button", { name: "Create version" }).click();
  await history.getByRole("button", { name: "Select version Dependency baseline", exact: true }).click();
  await history.getByRole("button", { name: "Set as baseline" }).click();
  await history.getByRole("button", { name: "Close", exact: true }).click();
  // PlantUML starts "3 days after [A]'s end" on A's last day + 4, the same date as "5 days after [A]'s start".
  await setSource(page, baseline.replace("3 days after [A]'s end", "5 days after [A]'s start"));
  const report = page.locator(".schedule-analysis-report");
  await report.locator("summary").click();
  await expect(report.locator("summary")).toContainText("0 changed tasks · 1 dependency change");
  const dependencies = report.getByRole("region", { name: "Baseline dependency changes" });
  await expect(dependencies).toContainText("Changed");
  await expect(dependencies).toContainText("End → start · 3 days after");
  await expect(dependencies).toContainText("Start → start · 5 days after");
  const finish = report.getByRole("region", { name: "Baseline project finish comparison" });
  await expect(finish).toContainText("Baseline: 2026-10-07 · Current: 2026-10-07 · Unchanged");
  if (browserName === "chromium") {
    await dependencies.getByRole("button", { name: "Reveal dependency" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath("baseline-dependencies.png") });
  }
  if (browserName === "webkit") {
    // Verify accessible activation without WebKit's unstable scroll target inside
    // this absolutely positioned, scrollable report.
    await dependencies.getByRole("button", { name: "Reveal dependency" }).focus();
    await dependencies.getByRole("button", { name: "Reveal dependency" }).press("Enter");
  } else {
    await dependencies.getByRole("button", { name: "Reveal dependency" }).click();
  }
  await expect(page.locator(".statusbar")).toContainText("Ln 5");
  await setSource(page, baseline.replace("3 days after [A]'s end", "6 days after [A]'s start"));
  await expect(finish).toContainText("Current: 2026-10-08 · 1 calendar day later");
  await expect(page.locator(".cm-content .cm-line")).toHaveText(
    baseline.replace("3 days after [A]'s end", "6 days after [A]'s start").split("\n"),
  );
});
