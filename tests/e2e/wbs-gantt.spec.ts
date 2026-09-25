import { expect, test } from "@playwright/test";
import { prepareEditor, setSource } from "./editor-helpers";

async function selectWbsNode(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("button", { name: `Select WBS node ${name}` }).focus();
  await page.keyboard.press("Enter");
}

async function expectToolbarButtonInViewport(page: import("@playwright/test").Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeInViewport();
}

test("converts a nested WBS into linked Gantt entries without explicit dates", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "WBS diagram" })
    .click();
  await setSource(
    page,
    "@startwbs\n*(project) Project\n**(design) Design\n***(draft) Draft\n**(build) Build\ndraft -> build\n@endwbs",
  );
  await page.getByRole("button", { name: "Create Gantt chart from WBS" }).click();
  const projectName = page.getByRole("dialog", { name: "Create project from WBS" });
  await projectName.getByLabel("Name").fill("Project delivery");
  await projectName.getByRole("button", { name: "Create Gantt chart" }).click();
  await expect(page.getByRole("navigation", { name: "Open documents" })).toContainText("Project delivery schedule");
  const existingLinks = page.getByRole("region", { name: "Existing links" });
  await expect(existingLinks).toContainText("Project delivery WBS: Design");
  await expect(existingLinks).toContainText("Project delivery schedule: ↳ Design");
  await expect(existingLinks.locator("li")).toHaveCount(4);
  await page.getByRole("button", { name: "Rename Project delivery WBS" }).click();
  const renameDialog = page.getByRole("dialog", { name: "Rename diagram" });
  await renameDialog.getByLabel("Name").fill("Work breakdown");
  await renameDialog.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Open documents" })).toContainText("Work breakdown");
  await expect(existingLinks).toContainText("Work breakdown: Design");
  await expect(existingLinks.locator("li")).toHaveCount(4);
  await page.getByRole("button", { name: "Close project navigator" }).click();
  const code = page.locator(".cm-content");
  await expect(code).toContainText("[Project] as [wbs_project] requires 5 days");
  await expect(code).toContainText("[↳ Design] as [wbs_design] requires 5 days");
  await expect(code).toContainText("[↳ ↳ Draft] as [wbs_draft] requires 5 days");
  await expect(code).toContainText("[wbs_build] starts at [wbs_draft]'s end");
  await expect(code).not.toContainText("lasts 5 days");
  await page.locator('[data-task-id="wbs_design"]').first().click();
  await expect(page.locator('[data-task-id="wbs_design"]').first()).toHaveAttribute("data-project-linked", "true");
  await expect(page.locator(".diagram-link-icon")).toHaveCount(4);
  await page
    .getByRole("complementary", { name: "Task inspector" })
    .getByRole("status")
    .getByText(/Linked to Design/)
    .waitFor();
  await page
    .getByRole("complementary", { name: "Task inspector" })
    .getByRole("button", { name: "Open linked WBS node: Design" })
    .click();
  await expect(page.getByRole("complementary", { name: "WBS node inspector" })).toBeVisible();
  await expect(page.locator(".diagram-link-icon")).toHaveCount(4);
  await expect(page.getByRole("complementary", { name: "WBS node inspector" }).getByRole("status")).toContainText(
    "Linked to",
  );
  await expect(
    page.getByRole("complementary", { name: "WBS node inspector" }).getByLabel("Linked Gantt task"),
  ).not.toContainText("Build");
  await page
    .getByRole("complementary", { name: "WBS node inspector" })
    .getByRole("button", { name: "Open linked Gantt task" })
    .click();
  await expect(
    page
      .getByRole("complementary", { name: "Task inspector" })
      .getByRole("button", { name: "Open linked WBS node: Design" }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Task inspector" }).getByRole("combobox", { name: "Linked WBS node" }),
  ).not.toContainText("Build");
  await page.locator('[data-task-id="wbs_project"]').first().click();
  await page
    .getByRole("complementary", { name: "Task inspector" })
    .getByLabel("Start", { exact: true })
    .fill("2026-09-01");
  await page.getByRole("complementary", { name: "Task inspector" }).getByLabel("Start", { exact: true }).blur();
  await expect(page.locator(".cm-content")).toContainText("Project starts 2026-09-01");
  await expect(page.locator(".cm-content")).toContainText("[wbs_project] starts 2026-09-01");
  const scheduledPreview = page.getByRole("region", { name: "Diagram preview" }).locator("svg");
  await expect(scheduledPreview).toContainText("Draft");
  await expect(scheduledPreview).not.toContainText("No starting date for the project");
});

test("links an existing WBS node to an existing Gantt task", async ({ page }) => {
  await prepareEditor(page);
  await setSource(page, "@startgantt\n[Design] lasts 2 days\n@endgantt");
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "WBS diagram" })
    .click();
  await setSource(page, "@startwbs\n* Project\n** Design\n@endwbs");
  await selectWbsNode(page, "Design");
  const inspector = page.getByRole("complementary", { name: "WBS node inspector" });
  await inspector.getByLabel("Linked Gantt task").selectOption({ label: "untitled.pumlu · Design" });
  await expect(inspector.getByLabel("Linked Gantt task")).toHaveValue(/.+:.+/);
  await expect(page.locator(".cm-content")).toContainText("(design) Design");
  await inspector.getByRole("button", { name: "Open linked Gantt task" }).click();
  await expect(
    page
      .getByRole("complementary", { name: "Task inspector" })
      .getByRole("button", { name: "Open linked WBS node: Design" }),
  ).toBeVisible();
});

test("shows unlinked work in the project and adds selected items in either direction", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "WBS diagram" })
    .click();
  await setSource(page, "@startwbs\n*(project) Project\n**(design) Design\n@endwbs");
  await page.getByRole("button", { name: "Create Gantt chart from WBS" }).click();
  await page
    .getByRole("dialog", { name: "Create project from WBS" })
    .getByRole("button", { name: "Create Gantt chart" })
    .click();
  await expect(page.locator(".cm-content")).toContainText("[wbs_design] starts at [wbs_project]'s end");
  await page.getByRole("button", { name: "Close project navigator" }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Task…" }).click();
  const add = page.getByRole("dialog", { name: "Add task" });
  await add.getByLabel("Name").fill("Review");
  await add.getByLabel("Starts after").selectOption({ label: "↳ Design" });
  await add.getByRole("button", { name: "Add task" }).click();
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /Project: / }).click();
  await page.getByRole("menu", { name: "Project" }).getByRole("menuitem", { name: "Diagram connections" }).click();
  const coverage = page.getByRole("region", { name: "WBS–Gantt coverage" });
  await expect(coverage).toContainText("Unlinked: 0 WBS nodes · 1 Gantt task");
  const review = coverage.locator("li", { hasText: "Review" });
  await review.getByRole("button", { name: "Add to WBS" }).click();
  await expect(page.locator(".cm-content")).toContainText("Review");
  await expect(coverage).toContainText("Unlinked: 0 WBS nodes · 0 Gantt tasks");
  await page.getByRole("button", { name: "Close project navigator" }).click();
  const wbsSource = await page.locator(".cm-content").innerText();
  await setSource(page, wbsSource.replace("@endwbs", "**(build) Build\n@endwbs"));
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /Project: / }).click();
  await page.getByRole("menu", { name: "Project" }).getByRole("menuitem", { name: "Diagram connections" }).click();
  await expect(coverage).toContainText("Unlinked: 1 WBS node · 0 Gantt tasks");
  await coverage.locator("li", { hasText: "Build" }).getByRole("button", { name: "Add to Gantt" }).click();
  await expect(page.locator(".cm-content")).toContainText("[↳ Build] as [wbs_build]");
  await expect(coverage).toContainText("Unlinked: 0 WBS nodes · 0 Gantt tasks");
});

test("links two existing unlinked items from project coverage", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "WBS diagram" })
    .click();
  await setSource(page, "@startwbs\n*(project) Project\n**(design) Design\n@endwbs");
  await page.getByRole("button", { name: "Create Gantt chart from WBS" }).click();
  await page
    .getByRole("dialog", { name: "Create project from WBS" })
    .getByRole("button", { name: "Create Gantt chart" })
    .click();
  await page.getByRole("button", { name: "Close project navigator" }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Task…" }).click();
  const add = page.getByRole("dialog", { name: "Add task" });
  await add.getByLabel("Name").fill("Review");
  await add.getByLabel("Starts after").selectOption({ label: "↳ Design" });
  await add.getByRole("button", { name: "Add task" }).click();
  await page
    .getByRole("navigation", { name: "Open documents" })
    .getByRole("button", { name: /WBS Project/ })
    .click();
  const wbsSource = await page.locator(".cm-content").innerText();
  await setSource(page, wbsSource.replace("@endwbs", "**(build) Build\n@endwbs"));
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /Project: / }).click();
  await page.getByRole("menu", { name: "Project" }).getByRole("menuitem", { name: "Diagram connections" }).click();
  const coverage = page.getByRole("region", { name: "WBS–Gantt coverage" });
  await expect(coverage).toContainText("Unlinked: 1 WBS node · 1 Gantt task");
  await coverage.locator("li", { hasText: "Build" }).getByRole("button", { name: "Link existing" }).click();
  const inspector = page.getByRole("complementary", { name: "WBS node inspector" });
  const reviewOption = await inspector
    .getByLabel("Linked Gantt task")
    .locator("option", { hasText: "Review" })
    .getAttribute("value");
  await inspector.getByLabel("Linked Gantt task").selectOption(reviewOption!);
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /Project: / }).click();
  await page.getByRole("menu", { name: "Project" }).getByRole("menuitem", { name: "Diagram connections" }).click();
  await expect(coverage).toContainText("Unlinked: 0 WBS nodes · 0 Gantt tasks");
});

test("adds an unlinked Gantt task beneath its predecessor in the WBS once", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "WBS diagram" })
    .click();
  await setSource(page, "@startwbs\n*(project) Project\n**(design) Design\n@endwbs");
  await page.getByRole("button", { name: "Create Gantt chart from WBS" }).click();
  await page
    .getByRole("dialog", { name: "Create project from WBS" })
    .getByRole("button", { name: "Create Gantt chart" })
    .click();
  await page.getByRole("button", { name: "Close project navigator" }).click();
  const importButton = page.getByRole("button", { name: "Add missing Gantt tasks to WBS (0)" });
  await expect(importButton).toBeDisabled();
  await expectToolbarButtonInViewport(page, "Add");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Task…" }).click();
  const addTask = page.getByRole("dialog", { name: "Add task" });
  await addTask.getByLabel("Name").fill("Review");
  await addTask.getByLabel("Starts after").selectOption({ label: "↳ Design" });
  await addTask.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByRole("button", { name: "Add missing Gantt tasks to WBS (1)" })).toBeEnabled();
  await page.getByRole("button", { name: "Add missing Gantt tasks to WBS" }).click();
  await expect(page.getByRole("button", { name: "Add missing Gantt tasks to WBS (0)" })).toBeDisabled();
  await expect(page.locator(".cm-content")).toContainText("as [wbs_link_review]");
  await page.locator('[data-task-id="wbs_link_review"]').first().click();
  await page
    .getByRole("complementary", { name: "Task inspector" })
    .getByRole("button", { name: "Open linked WBS node: Review" })
    .click();
  await expect(page.getByRole("complementary", { name: "WBS node inspector" })).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText("***(review) Review");
  await expect(page.locator(".cm-content")).not.toContainText("design -> review");
  await expect(page.getByRole("button", { name: "Add missing WBS tasks to Gantt (0)" })).toBeDisabled();
  await page
    .getByRole("navigation", { name: "Open documents" })
    .getByRole("button", { name: /schedule Project/ })
    .click();
  await expect(page.getByRole("button", { name: "Add missing Gantt tasks to WBS (0)" })).toBeDisabled();
  await page
    .getByRole("navigation", { name: "Open documents" })
    .getByRole("button", { name: /WBS Project/ })
    .click();
  await expect(page.locator(".cm-content")).toContainText("(review) Review");
  expect((await page.locator(".cm-content").textContent())?.match(/\(review\) Review/g)).toHaveLength(1);
});

for (const policy of ["keep", "delete"] as const) {
  test(`${policy === "keep" ? "keeps the WBS subtree" : "deletes both diagrams"} when deleting a linked Gantt task`, async ({
    page,
  }) => {
    await prepareEditor(page);
    await page.getByRole("button", { name: "New document tab" }).click();
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: "WBS diagram" })
      .click();
    await setSource(page, "@startwbs\n*(project) Project\n**(design) Design\n***(draft) Draft\n@endwbs");
    await page.getByRole("button", { name: "Create Gantt chart from WBS" }).click();
    await page
      .getByRole("dialog", { name: "Create project from WBS" })
      .getByRole("button", { name: "Create Gantt chart" })
      .click();
    await page.getByRole("button", { name: "Close project navigator" }).click();
    await page.locator('[data-task-id="wbs_design"]').first().click();
    await page.getByRole("complementary", { name: "Task inspector" }).getByRole("button", { name: "Delete" }).click();
    const confirmation = page.getByRole("dialog", { name: "Delete linked Gantt work?" });
    await expect(confirmation).toContainText("2 nodes");
    await confirmation
      .getByRole("button", { name: policy === "keep" ? "Keep WBS node" : "Delete in both diagrams" })
      .click();
    await expect(page.locator(".cm-content")).not.toContainText("[↳ Design] as [wbs_design]");
    await page
      .getByRole("navigation", { name: "Open documents" })
      .getByRole("button", { name: /WBS Project/ })
      .click();
    if (policy === "keep") {
      await expect(page.locator(".cm-content")).toContainText("(design) Design");
      await expect(page.locator(".cm-content")).toContainText("(draft) Draft");
    } else {
      await expect(page.locator(".cm-content")).not.toContainText("(design) Design");
      await expect(page.locator(".cm-content")).not.toContainText("(draft) Draft");
    }
    await page
      .getByRole("navigation", { name: "Open documents" })
      .getByRole("button", { name: /schedule Project/ })
      .click();
    await expect(page.locator(".cm-content")).not.toContainText("[↳ Design] as [wbs_design]");
    if (policy === "keep") {
      await page
        .getByRole("navigation", { name: "Open documents" })
        .getByRole("button", { name: /WBS Project/ })
        .click();
      await page.getByRole("button", { name: "Add missing WBS tasks to Gantt" }).click();
      await expect(page.locator(".cm-content")).toContainText("[↳ Design] as [wbs_design]");
    }
  });
}

for (const policy of ["keep", "delete"] as const) {
  test(`${policy === "keep" ? "keeps" : "removes"} the former Gantt task when relinking a WBS node`, async ({
    page,
  }) => {
    await prepareEditor(page);
    await page.getByRole("button", { name: "New document tab" }).click();
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: "WBS diagram" })
      .click();
    await setSource(page, "@startwbs\n*(project) Project\n**(design) Design\n@endwbs");
    await page.getByRole("button", { name: "Create Gantt chart from WBS" }).click();
    await page
      .getByRole("dialog", { name: "Create project from WBS" })
      .getByRole("button", { name: "Create Gantt chart" })
      .click();
    await page.getByRole("button", { name: "Close project navigator" }).click();
    await expectToolbarButtonInViewport(page, "Add");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("menuitem", { name: "Task…" }).click();
    const add = page.getByRole("dialog", { name: "Add task" });
    await add.getByRole("textbox", { name: "Name" }).fill("Replacement");
    await add.getByRole("textbox", { name: "Start date" }).fill("2026-09-24");
    await add.getByRole("button", { name: "Add task" }).click();
    await page.locator('[data-task-id="wbs_design"]').first().click();
    await page
      .getByRole("complementary", { name: "Task inspector" })
      .getByRole("button", { name: "Open linked WBS node: Design" })
      .click();
    const picker = page.getByRole("complementary", { name: "WBS node inspector" }).getByLabel("Linked Gantt task");
    const target = await picker.locator("option", { hasText: "Replacement" }).getAttribute("value");
    await picker.selectOption(target!);
    const dialog = page.getByRole("dialog", { name: "Change linked Gantt task?" });
    await expect(dialog).toContainText("instead of");
    await dialog
      .getByRole("button", { name: policy === "keep" ? "Keep old task unlinked" : "Remove old task" })
      .click();
    await page
      .getByRole("complementary", { name: "WBS node inspector" })
      .getByRole("button", { name: "Open linked Gantt task" })
      .click();
    await expect(page.locator(".cm-content")).toContainText("[↳ Design] as [wbs_link_design]");
    if (policy === "keep") await expect(page.locator(".cm-content")).toContainText("[wbs_design]");
    else await expect(page.locator(".cm-content")).not.toContainText("[wbs_design]");
  });
}

test("keeps scheduled Gantt work when deleting its linked WBS node", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "WBS diagram" })
    .click();
  await setSource(page, "@startwbs\n*(project) Project\n**(design) Design\n@endwbs");
  await page.getByRole("button", { name: "Create Gantt chart from WBS" }).click();
  await page
    .getByRole("dialog", { name: "Create project from WBS" })
    .getByRole("button", { name: "Create Gantt chart" })
    .click();
  await page.getByRole("button", { name: "Close project navigator" }).click();
  await page.locator('[data-task-id="wbs_project"]').first().click();
  const task = page.getByRole("complementary", { name: "Task inspector" });
  await task.getByLabel("Start", { exact: true }).fill("2026-09-24");
  await task.getByLabel("Start", { exact: true }).blur();
  await expect(page.locator(".cm-content")).toContainText("Project starts 2026-09-24");
  await page.locator('[data-task-id="wbs_design"]').first().click();
  await task.getByLabel("Complete", { exact: true }).fill("60");
  await task.getByLabel("Complete", { exact: true }).blur();
  await task.getByRole("button", { name: "Open linked WBS node: Design" }).click();
  await page
    .getByRole("complementary", { name: "WBS node inspector" })
    .getByRole("button", { name: "Delete subtree" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Delete linked WBS work?" });
  await expect(dialog).toContainText("1 linked Gantt task is affected");
  await dialog.getByRole("button", { name: "Keep Gantt tasks" }).click();
  await expect(page.locator(".cm-content")).not.toContainText("(design) Design");
  await page
    .getByRole("navigation", { name: "Open documents" })
    .getByRole("button", { name: /schedule Project/ })
    .click();
  await expect(page.locator(".cm-content")).toContainText("[↳ Design] as [wbs_design]");
  await expect(page.locator(".cm-content")).toContainText("2026-09-24");
  await page.locator('[data-task-id="wbs_design"]').first().click();
  await expect(page.getByRole("complementary", { name: "Task inspector" }).getByRole("status")).toContainText(
    "Unlinked from WBS",
  );
});

test("deletes linked Gantt work when deleting in both diagrams", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "WBS diagram" })
    .click();
  await setSource(page, "@startwbs\n*(project) Project\n**(design) Design\n@endwbs");
  await page.getByRole("button", { name: "Create Gantt chart from WBS" }).click();
  await page
    .getByRole("dialog", { name: "Create project from WBS" })
    .getByRole("button", { name: "Create Gantt chart" })
    .click();
  await page.getByRole("button", { name: "Close project navigator" }).click();
  await page.locator('[data-task-id="wbs_design"]').first().click();
  await page
    .getByRole("complementary", { name: "Task inspector" })
    .getByRole("button", { name: "Open linked WBS node: Design" })
    .click();
  await page
    .getByRole("complementary", { name: "WBS node inspector" })
    .getByRole("button", { name: "Delete subtree" })
    .click();
  await page
    .getByRole("dialog", { name: "Delete linked WBS work?" })
    .getByRole("button", { name: "Delete in both diagrams" })
    .click();
  await page
    .getByRole("navigation", { name: "Open documents" })
    .getByRole("button", { name: /schedule Project/ })
    .click();
  await expect(page.locator(".cm-content")).not.toContainText("wbs_design");
});

test("marks a cyclic WBS dependency at its arrow", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "WBS diagram" })
    .click();
  await setSource(page, "@startwbs\n*(project) Project\n**(a) A\n**(b) B\na -> b\nb -> a\n@endwbs");
  await page.getByRole("button", { name: "Create Gantt chart from WBS" }).click();
  await page
    .getByRole("dialog", { name: "Create project from WBS" })
    .getByRole("button", { name: "Create Gantt chart" })
    .click();
  const issues = page.getByRole("region", { name: "WBS–Gantt issues" });
  await expect(issues).toContainText("would create a cycle");
  await issues.getByRole("button", { name: /would create a cycle/ }).click();
  await expect(page.getByRole("complementary", { name: "WBS arrow inspector" })).toBeVisible();
  await page.getByRole("button", { name: "Close project navigator" }).click();
  await page
    .getByRole("navigation", { name: "Open documents" })
    .getByRole("button", { name: /schedule Project/ })
    .click();
  await page.locator('[data-task-id="wbs_a"]').first().click();
  await page
    .getByRole("complementary", { name: "Task inspector" })
    .getByRole("button", { name: "Open linked WBS node: A" })
    .click();
  const marker = page.locator(".wbs-dependency-warning");
  await expect(marker).toHaveCount(1);
  await marker.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "WBS arrow inspector" }).getByRole("status")).toContainText(
    "would create a cycle",
  );
});

test("opens linked diagrams from both node context menus", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "WBS diagram" })
    .click();
  await setSource(page, "@startwbs\n*(project) Project\n**(design) Design\n@endwbs");
  await page.getByRole("button", { name: "Create Gantt chart from WBS" }).click();
  await page
    .getByRole("dialog", { name: "Create project from WBS" })
    .getByRole("button", { name: "Create Gantt chart" })
    .click();
  await page.getByRole("button", { name: "Close project navigator" }).click();
  await page.locator('[data-task-id="wbs_design"]').first().click({ button: "right" });
  await page
    .getByRole("menu", { name: "Symbol actions" })
    .getByRole("menuitem", { name: "Open linked WBS node" })
    .click();
  await expect(page.getByRole("complementary", { name: "WBS node inspector" })).toBeVisible();
  await page.getByRole("button", { name: "Select WBS node Design" }).focus();
  await page.keyboard.press("Shift+F10");
  await page
    .getByRole("menu", { name: "Symbol actions" })
    .getByRole("menuitem", { name: "Open linked Gantt task" })
    .click();
  await expect(page.getByRole("complementary", { name: "Task inspector" })).toContainText("Design");
});

test("opens an imported summary divider on the first click", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "WBS diagram" })
    .click();
  await setSource(page, "@startwbs\n* Project\n** Design\n@endwbs");
  await page.getByRole("button", { name: "Create Gantt chart from WBS" }).click();
  await page
    .getByRole("dialog", { name: "Create project from WBS" })
    .getByRole("button", { name: "Create Gantt chart" })
    .click();
  const divider = page.locator('[data-divider-index="0"]').first();
  await expect(divider).toBeVisible();
  await divider.click();
  await expect(page.getByRole("complementary", { name: "Divider inspector" })).toBeVisible();
});

test("Escape closes the WBS node inspector", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "WBS diagram" })
    .click();
  await setSource(page, "@startwbs\n* Project\n** Design\n@endwbs");
  await selectWbsNode(page, "Design");
  const inspector = page.getByRole("complementary", { name: "WBS node inspector" });
  await expect(inspector).toBeVisible();
  await inspector.getByLabel("Label").press("Escape");
  await expect(inspector).toHaveCount(0);
});

test("saves and reopens WBS and Gantt as one linked project file", async ({ page, browser }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    let bytes = new Uint8Array();
    const handle = {
      name: "Linked plan.pumlu",
      getFile: async () => new File([bytes], "Linked plan.pumlu"),
      createWritable: async () => ({
        write: async (data: Uint8Array | Blob) => {
          bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : Uint8Array.from(data);
          (window as Window & { projectBytes?: number[] }).projectBytes = [...bytes];
        },
        close: async () => undefined,
      }),
    };
    Object.assign(window, { showSaveFilePicker: async () => handle });
  });
  await prepareEditor(page);
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "WBS diagram" })
    .click();
  await setSource(
    page,
    "@startwbs\n<style>\nwbsDiagram {\n  node {\n    BackgroundColor #224466\n  }\n}\n</style>\n*(plan) Plan\n**(build) Build\n@endwbs",
  );
  await page.getByRole("button", { name: "Create Gantt chart from WBS" }).click();
  const name = page.getByRole("dialog", { name: "Create project from WBS" });
  await name.getByLabel("Name").fill("Linked plan");
  await name.getByRole("button", { name: "Create Gantt chart" }).click();
  await page.getByRole("button", { name: "Rename Linked plan WBS" }).click();
  const rename = page.getByRole("dialog", { name: "Rename diagram" });
  await rename.getByLabel("Name").fill("Work breakdown");
  await rename.getByRole("button", { name: "Rename", exact: true }).click();
  await page.getByRole("button", { name: "Close project navigator" }).click();
  await page.locator('[data-task-id="wbs_plan"]').first().click();
  const task = page.getByRole("complementary", { name: "Task inspector" });
  await task.getByLabel("Start", { exact: true }).fill("2026-09-23");
  await task.getByLabel("Start", { exact: true }).blur();
  await page.locator('[data-task-id="wbs_build"]').first().click();
  await task.getByLabel("Complete", { exact: true }).fill("60");
  await task.getByLabel("Complete", { exact: true }).blur();
  await expect(page.locator(".cm-content")).toContainText("2026-09-23");
  await expectToolbarButtonInViewport(page, "File");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await page.getByRole("menu", { name: "Save" }).getByRole("menuitem", { name: "Save project", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as Window & { projectBytes?: number[] }).projectBytes?.length ?? 0))
    .toBeGreaterThan(100);
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Project: Linked plan" }).click();
  await page.getByRole("menu", { name: "Project" }).getByRole("menuitem", { name: "Diagram connections" }).click();
  const projectNavigator = page.getByRole("complementary", { name: "Project navigator" });
  await expect(projectNavigator.locator(".project-save-status")).toHaveText("Saved");
  await expect(projectNavigator.locator(".project-index-status")).toHaveText("Links current");
  await expect(projectNavigator.locator(".project-save-status")).toHaveText("Saved");
  const bytes = await page.evaluate(() => (window as Window & { projectBytes?: number[] }).projectBytes!);

  const context = await browser.newContext();
  await context.addInitScript((saved: number[]) => {
    const handle = {
      name: "Linked plan.pumlu",
      getFile: async () => new File([new Uint8Array(saved)], "Linked plan.pumlu"),
    };
    Object.assign(window, { showOpenFilePicker: async () => [handle] });
  }, bytes);
  try {
    const reopened = await context.newPage();
    await reopened.goto("/");
    const welcome = reopened.getByRole("dialog", { name: "Welcome to PlantUML Ultimate" });
    const chooser = reopened.getByRole("dialog", { name: "Choose a diagram type" });
    await Promise.race([welcome.waitFor({ state: "visible" }), chooser.waitFor({ state: "visible" })]);
    if (await welcome.isVisible()) {
      await welcome.getByRole("checkbox", { name: "Advanced mode" }).check();
      await welcome.getByRole("button", { name: "Get started" }).click();
    }
    await chooser.getByRole("button", { name: "Gantt diagram" }).click();
    await reopened.getByRole("button", { name: "File", exact: true }).click();
    await reopened.getByRole("menuitem", { name: "Open", exact: true }).click();
    await reopened.getByRole("menu", { name: "Open" }).getByRole("menuitem", { name: "Project…" }).click();
    const navigator = reopened.getByRole("complementary", { name: "Project navigator" });
    await expect(navigator).toContainText("Work breakdown");
    await expect(navigator).toContainText("Linked plan schedule");
    await expect(navigator.getByRole("region", { name: "Existing links" }).locator("li")).toHaveCount(2);
    await expect(navigator.getByRole("region", { name: "WBS–Gantt coverage" })).toContainText(
      "Unlinked: 0 WBS nodes · 0 Gantt tasks",
    );
    await navigator.getByRole("button", { name: "Linked plan schedule: ↳ Build" }).click();
    await expect(reopened.getByRole("complementary", { name: "Task inspector" })).toBeVisible();
    await navigator.getByRole("button", { name: "Work breakdown: Build" }).click();
    await expect(reopened.getByRole("complementary", { name: "WBS node inspector" })).toBeVisible();
    await navigator.getByRole("button", { name: "Linked plan schedule: ↳ Build" }).click();
    await expect(reopened.getByRole("complementary", { name: "Task inspector" })).toBeVisible();
    await reopened.getByRole("button", { name: "2 · split" }).click();
    await expect(reopened.locator(".cm-content")).toContainText("2026-09-23");
    await reopened
      .getByRole("navigation", { name: "Open documents" })
      .getByRole("button", { name: /^Work breakdown Project/ })
      .click();
    await selectWbsNode(reopened, "Build");
    await expect(reopened.getByRole("button", { name: "Open linked Gantt task" })).toBeVisible();
    const progress = reopened.locator('.wbs-node-progress[aria-label="Build: 60% complete"]');
    await expect(progress).toBeVisible();
    const geometry = await progress.evaluate((element) => {
      const node = (element.previousElementSibling as SVGRectElement).getBBox();
      const track = element.querySelector<SVGRectElement>(".wbs-node-progress-track")!.getBBox();
      const fill = element.querySelector<SVGRectElement>(".wbs-node-progress-fill")!.getBBox();
      return {
        node: { x: node.x, y: node.y, right: node.x + node.width, bottom: node.y + node.height },
        track: { x: track.x, y: track.y, width: track.width, height: track.height },
        fill: { width: fill.width },
      };
    });
    expect(geometry.fill.width / geometry.track.width).toBeCloseTo(0.6);
    expect(geometry.track.x).toBeGreaterThan(geometry.node.x);
    expect(geometry.track.y).toBeGreaterThan(geometry.node.y);
    expect(geometry.track.x + geometry.track.width).toBeLessThan(geometry.node.right);
    expect(geometry.track.y + geometry.track.height).toBeLessThan(geometry.node.bottom);
    await expect(progress.locator(".wbs-node-progress-fill")).toHaveAttribute("fill", "#ffffff");
  } finally {
    await context.close();
  }
});

test("adds a task after an aliased WBS summary without invalidating the Gantt", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "WBS diagram" })
    .click();
  await page.getByRole("button", { name: "Create Gantt chart from WBS" }).click();
  await page
    .getByRole("dialog", { name: "Create project from WBS" })
    .getByRole("button", { name: "Create Gantt chart" })
    .click();
  await page.getByRole("button", { name: "Close project navigator" }).click();
  await expectToolbarButtonInViewport(page, "Add");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Task…" }).click();
  const dialog = page.getByRole("dialog", { name: "Add task" });
  await dialog.getByRole("textbox", { name: "Name" }).fill("Test");
  await dialog.getByLabel("Starts after").selectOption({ label: "Website redesign" });
  await dialog.getByRole("button", { name: "Add task" }).click();
  await expect(page.locator(".cm-content")).toContainText("[Test] starts at [wbs_website_redesign]'s end");
  const preview = page.getByRole("region", { name: "Diagram preview" });
  await expect(preview.locator("svg")).toContainText("Test");
  await expect(preview.locator("svg")).not.toContainText("Syntax Error");
});
