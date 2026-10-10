import { expect, test } from "@playwright/test";
import { prepareEditor, fillSource, readEditorSource } from "./editor-helpers";

const source = `@startgantt
Project starts 2026-09-04
saturday are closed
sunday are closed
[Design] as [a] on {Alice} starts 2026-09-04
[a] lasts 3 days
[Build] as [b] on {Bob} starts at [a]'s end
[b] lasts 2 days
@endgantt`;

async function setup(page: import("@playwright/test").Page) {
  await prepareEditor(page);
  await fillSource(page, source);
  await expect(page.locator('[data-task-id="a"] .bar')).toBeVisible();
  const hint = page.getByRole("button", { name: "Dismiss editing hint" });
  if (await hint.isVisible()) await hint.click();
}

test("Gantt view controls, active filtering and keyboard timeline scrolling preserve source", async ({
  page,
}, testInfo) => {
  await setup(page);
  for (const group of ["Task navigation", "Preview zoom", "Overlays", "Schedule controls", "Resource filter"])
    await expect(page.getByRole("group", { name: group, exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Timeline zoom preset" })).toHaveCount(0);
  const zoom = page.getByRole("group", { name: "Preview zoom", exact: true });
  await zoom.getByRole("button", { name: /Reset zoom/ }).click();
  for (let i = 0; i < 5; i++) await zoom.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Critical path", exact: true }).click();
  await expect(page.getByRole("button", { name: "Critical path", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("combobox", { name: "Filter by resource", exact: true }).selectOption("Alice");
  await expect(page.getByText("Showing: Alice", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear filter", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Filter by resource", exact: true })).toHaveValue("");
  const slider = page.getByRole("slider", { name: "Timeline position", exact: true });
  await slider.focus();
  await slider.press("End");
  await expect
    .poll(() => page.locator(".gantt-preview .preview-viewport").evaluate((node) => node.scrollLeft))
    .toBeGreaterThan(0);
  await slider.press("Home");
  await expect.poll(() => page.locator(".gantt-preview .preview-viewport").evaluate((node) => node.scrollLeft)).toBe(0);
  expect(await readEditorSource(page)).toBe(source);
  await page.getByRole("button", { name: "Critical path", exact: true }).click();
  if (testInfo.project.name === "chromium") {
    await page.screenshot({ path: testInfo.outputPath("gantt-controls-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("button", { name: /^Move policy:/ })).toBeInViewport();
    await expect(page.getByRole("combobox", { name: "Filter by resource", exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("gantt-controls-phone.png") });
  }
});

test("move preference is visible and recoverable; timeline scale and task fields explain source edits", async ({
  page,
}) => {
  await setup(page);
  const policy = page.getByRole("button", { name: /^Move policy:/ });
  await expect(policy).toHaveText("Move policy: Always ask");
  await policy.click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings.getByLabel("When moving tasks").selectOption("cascade");
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(policy).toHaveText("Move policy: Always ask");
  await policy.click();
  await settings.getByLabel("When moving tasks").selectOption("cascade");
  await settings.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(policy).toHaveText("Move policy: Include dependents");
  expect(await readEditorSource(page)).toBe(source);
  await page.reload();
  await expect(policy).toHaveText("Move policy: Include dependents");
  await page.getByRole("button", { name: "Timeline scale…", exact: true }).click();
  const calendar = page.getByRole("complementary", { name: "Project and calendar inspector" });
  await expect(calendar).toContainText("Preview zoom only changes the canvas view");
  await calendar.getByRole("combobox", { name: "Timeline scale", exact: true }).selectOption("weekly");
  await calendar.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("printscale weekly");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).toBe(source);
  await expect(page.locator('[data-task-id="a"] .bar')).toBeVisible();
  await page.locator('[data-task-id="a"] .bar').click();
  const task = page.getByRole("complementary", { name: "Task inspector", exact: true });
  await expect(task.getByLabel("End", { exact: true })).toHaveValue("2026-09-08");
  await expect(task).toContainText("Calculated end: start + duration using the working calendar");
  await expect(task).toContainText("closed days can make the calendar span longer");
  await task.getByLabel("Progress (%)", { exact: true }).fill("40");
  await task.getByLabel("Progress (%)", { exact: true }).blur();
  await expect(page.locator(".cm-content")).toContainText("is 40% completed");
});
