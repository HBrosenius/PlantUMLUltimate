import { expect, test } from "@playwright/test";
import { prepareEditor, setSource, source } from "./editor-helpers";

test("keeps both toolbars usable across desktop and phone layouts", async ({ page }) => {
  await prepareEditor(page);
  for (const width of [1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page
      .getByRole("navigation", { name: "View mode" })
      .getByRole("button", { name: "Diagram", exact: true })
      .click();
    for (const toolbar of await page.locator(".toolbar").all()) {
      expect(await toolbar.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Workload", exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Filter by resource", exact: true })).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "View mode" })
        .getByRole("button", { name: width <= 600 ? "Diagram" : "Split", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Calendar & schedule" }).click();
    const panel = page.getByRole("complementary", { name: "Project and calendar inspector" });
    const rect = await panel.boundingBox();
    const toolbarRect = await page.getByRole("region", { name: "Diagram controls" }).boundingBox();
    expect(rect!.y).toBeGreaterThanOrEqual(toolbarRect!.y + toolbarRect!.height);
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    await panel.getByRole("button", { name: "Close project inspector" }).click();
  }
});

test("protects staged properties until applied or explicitly discarded", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "Calendar & schedule" }).click();
  const panel = page.getByRole("complementary", { name: "Project and calendar inspector" });
  await panel.getByLabel("Diagram title", { exact: true }).fill("Unapplied draft");
  page.once("dialog", (dialog) => dialog.dismiss());
  await panel.getByRole("button", { name: "Close project inspector" }).click();
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Diagram title", { exact: true })).toHaveValue("Unapplied draft");
  await panel.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("Unapplied draft");
  await expect(panel).toBeHidden();
});

test("does not discard invalid automatic task changes on close", async ({ page }) => {
  await prepareEditor(page);
  await setSource(page, source("[Build] lasts 3 days"));
  await page.getByRole("button", { name: "Select Build", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Task inspector", exact: true });
  await panel.getByLabel("Name", { exact: true }).fill("");
  page.once("dialog", (dialog) => dialog.dismiss());
  await panel.getByRole("button", { name: "Close task inspector" }).click();
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Enter a task name.")).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText("[Build]");
  page.once("dialog", (dialog) => dialog.accept());
  await panel.getByRole("button", { name: "Close task inspector" }).click();
  await expect(panel).toBeHidden();
});

test("reports a requested download separately from a confirmed file write", async ({ page }) => {
  await prepareEditor(page);
  await page.evaluate(() => {
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined });
  });
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await downloaded;
  await expect(page.locator(".file-save-indicator")).toHaveText("Download requested");
  await expect(page.locator(".file-save-indicator")).not.toContainText("Saved to file");
});

test("opens secondary actions by keyboard and restores the trigger on Escape", async ({ page }) => {
  await prepareEditor(page);
  const more = page.getByRole("button", { name: "More", exact: true });
  await more.focus();
  await more.press("ArrowDown");
  const menu = page.getByRole("menu", { name: "More", exact: true });
  await expect(menu.getByRole("menuitem", { name: "Presentation & local review…" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Settings…" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Help" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(more).toBeFocused();
});

test("shows preserved source through the single Issues entry", async ({ page }) => {
  await prepareEditor(page);
  await setSource(page, source("skinparam handwritten true\n[Build] lasts 3 days"));
  await page.getByRole("button", { name: "Issues (1)", exact: true }).click();
  const issues = page.getByRole("complementary", { name: "Issues", exact: true });
  await issues.getByText("Preserved source (1)").click();
  await expect(issues).toContainText("Some syntax can only be edited in Code view");
  await issues.getByRole("button", { name: /skinparam handwritten true/ }).click();
  await expect(page.locator(".cm-content")).toContainText("skinparam handwritten true");
});

test("remembers properties width and fits a diagram into its canvas", async ({ page }) => {
  await prepareEditor(page);
  await setSource(page, source("[Build] lasts 30 days"));
  await page.getByRole("button", { name: "Select Build", exact: true }).click();
  const width = page.getByRole("separator", { name: "Properties panel width" });
  const before = Number(await width.getAttribute("aria-valuenow"));
  await width.focus();
  await width.press("ArrowLeft");
  await expect(width).toHaveAttribute("aria-valuenow", String(before + 16));
  await page.getByRole("button", { name: "Close task inspector" }).click();
  await page.getByRole("button", { name: "Select Build", exact: true }).click();
  await expect(width).toHaveAttribute("aria-valuenow", String(before + 16));
  await page.getByRole("button", { name: "Close task inspector" }).click();
  await page.getByRole("button", { name: "Fit diagram", exact: true }).click();
  await expect
    .poll(async () =>
      page.locator(".diagram svg").evaluate((svg) => {
        const viewport = svg.closest(".diagram-viewport") ?? svg.closest(".preview")!;
        return svg.getBoundingClientRect().width <= viewport.clientWidth;
      }),
    )
    .toBe(true);
});

test("reorders diagram tabs through the keyboard context menu", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram" })
    .click();
  const tabs = page.locator(".document-tabs > button:not(.new-tab)");
  await tabs.last().focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Move tab left", exact: true }).click();
  await expect(tabs.first()).toHaveClass("active");
  await tabs.last().click();
  await expect(page.locator(".cm-content")).toContainText("@startgantt");
  await tabs.first().click();
  await expect(page.locator(".cm-content")).toContainText("@startuml");
});

test("keeps controls and properties reachable at doubled UI scale", async ({ page }) => {
  await prepareEditor(page);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.locator(".app").evaluate((app) => {
    app.style.zoom = "2";
  });
  await page.getByRole("button", { name: "Calendar & schedule", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Project and calendar inspector" });
  await panel.getByLabel("Diagram title", { exact: true }).fill("Large UI");
  await panel.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(page.locator(".cm-content")).toContainText("Large UI");
  const save = await page.getByRole("button", { name: "Save", exact: true }).boundingBox();
  expect(save!.x + save!.width).toBeLessThanOrEqual(1280);
});

test("gives Calendar, Workload, Issues, and task properties one side-panel owner", async ({ page }, testInfo) => {
  await prepareEditor(page);
  await setSource(page, source("[Build] on {Alice} lasts 3 days"));
  const workload = page.getByRole("complementary", { name: "Resource workload" });
  const calendar = page.getByRole("complementary", { name: "Project and calendar inspector" });
  await page.getByRole("button", { name: "Workload", exact: true }).click();
  await expect(workload).toBeVisible();
  await page.getByRole("button", { name: "Calendar & schedule" }).click();
  await expect(calendar).toBeVisible();
  await expect(workload).toBeHidden();
  await expect(page.locator(".task-inspector:visible")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("calendar-exclusive.png") });
  await calendar.getByLabel("Diagram title", { exact: true }).fill("Retained draft");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Workload", exact: true }).click();
  await expect(calendar.getByLabel("Diagram title", { exact: true })).toHaveValue("Retained draft");
  await expect(workload).toBeHidden();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Workload", exact: true }).click();
  await expect(workload).toBeVisible();
  await expect(calendar).toBeHidden();
  await expect(page.locator(".task-inspector:visible")).toHaveCount(1);
  expect((await page.getByRole("region", { name: "Diagram preview" }).boundingBox())!.width).toBeGreaterThan(200);
  await page.screenshot({ path: testInfo.outputPath("workload-exclusive.png") });
  await workload.getByRole("button", { name: "Rename Alice", exact: true }).click();
  await workload.getByRole("textbox", { name: "New name for Alice" }).fill("Alice draft");
  await page.getByRole("button", { name: "Workload", exact: true }).focus();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.keyboard.press("Escape");
  await expect(workload.getByRole("textbox", { name: "New name for Alice" })).toHaveValue("Alice draft");
  page.once("dialog", (dialog) => dialog.accept());
  await page.keyboard.press("Escape");
  await expect(workload).toBeHidden();
  await expect(page.getByRole("button", { name: "Workload", exact: true })).toBeFocused();
  await expect(page.locator(".cm-content")).not.toContainText("Alice draft");
  await page.getByRole("button", { name: "Workload", exact: true }).click();
  await page.getByRole("button", { name: /^Issues/ }).click();
  const issues = page.getByRole("complementary", { name: "Issues", exact: true });
  await expect(issues).toBeVisible();
  await expect(workload).toBeHidden();
  await page.getByRole("button", { name: "Select Build", exact: true }).click();
  const task = page.getByRole("complementary", { name: "Task inspector", exact: true });
  await expect(task).toBeVisible();
  await expect(issues).toBeHidden();
  await page.getByRole("button", { name: /^Issues/ }).click();
  await expect(issues).toBeVisible();
  await expect(task).toBeHidden();
  await issues.getByRole("button", { name: "Close issues", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(issues).toBeHidden();
  await expect(page.getByRole("button", { name: /^Issues/ })).toBeFocused();
});

test("labels a retained preview by its rendered revision and recovers on undo", async ({ page }) => {
  await prepareEditor(page);
  const valid = source("[Build] lasts 3 days");
  await setSource(page, valid);
  const label = page.locator(".render-details summary");
  await expect(label).toHaveText("Preview current");
  const bars = page.locator(".diagram svg rect[data-visual-task-id]");
  const geometry = () =>
    bars.evaluateAll((elements) =>
      elements.map((element) => ["x", "y", "width", "height"].map((name) => element.getAttribute(name))),
    );
  const before = await geometry();
  const { fillSource } = await import("./editor-helpers");
  await fillSource(
    page,
    source(
      "monday are closed\ntuesday are closed\nwednesday are closed\nthursday are closed\nfriday are closed\nsaturday are closed\nsunday are closed\n[Build] lasts 3 days",
    ),
  );
  await expect(page.locator(".preview[data-render-status]")).toHaveAttribute("data-render-status", "error");
  await expect(label).toHaveText("Showing last valid preview");
  await expect(page.locator(".diagram svg")).toBeVisible();
  await expect(page.locator(".diagram svg")).toContainText("Build");
  expect(await geometry()).toEqual(before);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".cm-content .cm-line")).toHaveText(valid.split("\n"));
  await expect(label).toHaveText("Preview current");
});
