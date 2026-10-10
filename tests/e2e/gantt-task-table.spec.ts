import { expect, test } from "@playwright/test";
import { fillSource, prepareEditor, readEditorSource, waitForDiagramRender } from "./editor-helpers";
const source = `@startgantt
!theme cerulean
' Retain this comment
Project starts 2026-10-01
[Design] lasts 2 days
[Build] as [build] on {Morgan:50%} starts at [Design]'s end and lasts 3 days
[Build] is 20% completed
[Ship] lasts 1 day
[Ship] starts at [build]'s end
@endgantt`;
async function tasksView(page: Parameters<typeof prepareEditor>[0]) {
  await page
    .getByRole("navigation", { name: "View mode", exact: true })
    .getByRole("button", { name: "Tasks", exact: true })
    .click();
  return page.getByRole("region", { name: "Gantt task table", exact: true });
}
async function code(page: Parameters<typeof prepareEditor>[0]) {
  await page
    .getByRole("navigation", { name: "View mode", exact: true })
    .getByRole("button", { name: "Code", exact: true })
    .click();
  return readEditorSource(page);
}
test("edits task fields as one source change, preserves aliases/dependencies and undoes once", async ({ page }) => {
  await prepareEditor(page);
  const hint = page.getByRole("button", { name: "Dismiss editing hint", exact: true });
  if (await hint.isVisible()) await hint.click();
  await fillSource(page, source);
  await waitForDiagramRender(page);
  const table = await tasksView(page);
  await expect(page.locator(".cm-editor")).toHaveCount(0);
  await expect(page.locator(".diagram svg")).toBeVisible();
  await table.locator('tr[data-task-row="build"]').getByRole("textbox", { name: "Task name", exact: true }).focus();
  await expect(table.locator('tr[data-task-row="build"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".task-inspector:visible")).toHaveCount(0);
  await page.locator('.diagram [data-task-id="design"]').first().click();
  await expect(table.locator('tr[data-task-row="design"]')).toHaveAttribute("aria-selected", "true");
  const divider = page.getByRole("separator", { name: "Task table and chart divider" });
  await divider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(divider).toHaveAttribute("aria-valuenow", "60");
  await table
    .locator('tr[data-task-row="build"]')
    .getByRole("textbox", { name: "Task name", exact: true })
    .fill("Delivery");
  await table
    .locator('tr[data-task-row="build"]')
    .getByRole("textbox", { name: "Progress (%)", exact: true })
    .fill("101");
  await expect(table.getByRole("button", { name: "Apply changes", exact: true })).toBeDisabled();
  await table
    .locator('tr[data-task-row="build"]')
    .getByRole("textbox", { name: "Progress (%)", exact: true })
    .fill("75");
  await table
    .locator('tr[data-task-row="build"]')
    .getByRole("combobox", { name: "Resource 1 name", exact: true })
    .fill("Casey");
  await table
    .locator('tr[data-task-row="build"]')
    .getByRole("textbox", { name: "Resource 1 allocation (%)", exact: true })
    .fill("25");
  const shipRow = table.locator('tr[data-task-row="ship"]');
  await shipRow.getByRole("textbox", { name: "Duration", exact: true }).fill("2");
  await shipRow.getByRole("combobox", { name: "Duration unit", exact: true }).selectOption("week");

  await shipRow.getByRole("textbox", { name: "Progress (%)", exact: true }).fill("110");
  await expect(table.getByRole("button", { name: "Apply changes", exact: true })).toBeDisabled();
  expect(await page.locator(".cm-editor").count()).toBe(0);
  await shipRow.getByRole("textbox", { name: "Progress (%)", exact: true }).fill("50");
  await shipRow.getByRole("textbox", { name: "Task name", exact: true }).fill("Release");
  await table.getByRole("button", { name: "Apply changes", exact: true }).click();
  await waitForDiagramRender(page);
  await expect(table.locator('tr[data-task-row="build"]').getByRole("textbox", { name: "Task name" })).toHaveValue(
    "Delivery",
  );
  await expect(table.locator('tr[data-task-row="build"]').getByRole("textbox", { name: "Progress (%)" })).toHaveValue(
    "75",
  );
  await page.screenshot({ path: "test-results/a27-task-table-desktop.png" });
  const edited = await code(page);
  expect(edited).toContain("[Delivery] as [build] on {Casey:25%}");
  expect(edited).toContain("starts at [Design]'s end and lasts 3 days");
  expect(edited).toContain("[Release] starts at [build]'s end");
  expect(edited).toContain("[Release] is 50% completed");
  expect(edited).toContain("[Release] lasts 2 weeks");
  expect(edited).toContain("' Retain this comment");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await readEditorSource(page)).toBe(source);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect(await readEditorSource(page)).toBe(edited);
});
test("retains drafts across views, blocks stale edits, reloads and cancels safely", async ({ page }) => {
  await prepareEditor(page);
  const hint = page.getByRole("button", { name: "Dismiss editing hint", exact: true });
  if (await hint.isVisible()) await hint.click();
  await fillSource(page, source);
  await waitForDiagramRender(page);
  let table = await tasksView(page);
  await table
    .locator('tr[data-task-row="build"]')
    .getByRole("textbox", { name: "Task name", exact: true })
    .fill("Pending delivery");
  expect(await code(page)).toBe(source);
  await fillSource(page, source.replace("[Build] is 20% completed", "[Build] is 30% completed"));
  table = await tasksView(page);
  await expect(
    table.locator('tr[data-task-row="build"]').getByRole("textbox", { name: "Task name", exact: true }),
  ).toHaveValue("Pending delivery");
  await expect(table.getByRole("alert")).toContainText("source changed");
  await expect(table.getByRole("button", { name: "Apply changes", exact: true })).toBeDisabled();
  await table.getByRole("button", { name: "Reload staged rows from source", exact: true }).click();
  await expect(
    table.locator('tr[data-task-row="build"]').getByRole("textbox", { name: "Task name", exact: true }),
  ).toHaveValue("Build");
  await expect(
    table.locator('tr[data-task-row="build"]').getByRole("textbox", { name: "Progress (%)", exact: true }),
  ).toHaveValue("30");
  await table.getByRole("button", { name: "Discard changes", exact: true }).click();
  expect(await code(page)).toBe(source.replace("[Build] is 20% completed", "[Build] is 30% completed"));
});
test("switches table/chart on phones, keeps drafts and returns to desktop with a divider", async ({ page }) => {
  await prepareEditor(page);
  const hint = page.getByRole("button", { name: "Dismiss editing hint", exact: true });
  if (await hint.isVisible()) await hint.click();
  await fillSource(page, source);
  await waitForDiagramRender(page);
  let table = await tasksView(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await table
    .locator('tr[data-task-row="build"]')
    .getByRole("textbox", { name: "Progress (%)", exact: true })
    .fill("40");
  const panes = page.getByRole("navigation", { name: "Tasks pane", exact: true });
  await panes.getByRole("button", { name: "Chart", exact: true }).click();
  await expect(table).toHaveCount(0);
  await expect(page.locator(".diagram svg")).toBeVisible();
  await panes.getByRole("button", { name: "Table", exact: true }).click();
  table = page.getByRole("region", { name: "Gantt task table", exact: true });
  await expect(
    table.locator('tr[data-task-row="build"]').getByRole("textbox", { name: "Progress (%)", exact: true }),
  ).toHaveValue("40");
  await expect(table.getByRole("button", { name: "Apply changes", exact: true })).toBeInViewport();
  await page.screenshot({ path: "test-results/a27-task-table-phone.png" });
  await table.getByRole("button", { name: "Apply changes", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole("separator", { name: "Task table and chart divider" })).toBeVisible();
  await expect(page.locator(".diagram svg")).toBeVisible();
  await table.getByRole("button", { name: "Details Build", exact: true }).click();
  await expect(page.locator(".task-inspector:visible")).toBeVisible();
});
