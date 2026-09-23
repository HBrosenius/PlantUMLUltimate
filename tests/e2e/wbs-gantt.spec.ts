import { expect, test } from "@playwright/test";
import { prepareEditor, setSource } from "./editor-helpers";

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
  await page.getByRole("button", { name: "Close project navigator" }).click();
  const code = page.locator(".cm-content");
  await expect(code).toContainText("[Project] as [wbs_project] requires 5 days");
  await expect(code).toContainText("[↳ Design] as [wbs_design] requires 5 days");
  await expect(code).toContainText("[↳ ↳ Draft] as [wbs_draft] requires 5 days");
  await expect(code).toContainText("[wbs_build] starts at [wbs_draft]'s end");
  await expect(code).not.toContainText("lasts 5 days");
  await page.locator('[data-task-id="wbs_design"]').first().click();
  await page
    .getByRole("complementary", { name: "Task inspector" })
    .getByRole("button", { name: "Open linked WBS node: Design" })
    .click();
  await expect(page.getByRole("complementary", { name: "WBS node inspector" })).toBeVisible();
  await page
    .getByRole("complementary", { name: "WBS node inspector" })
    .getByRole("button", { name: "Open linked Gantt task" })
    .click();
  await expect(
    page
      .getByRole("complementary", { name: "Task inspector" })
      .getByRole("button", { name: "Open linked WBS node: Design" }),
  ).toBeVisible();
  await page.locator('[data-task-id="wbs_draft"]').first().click();
  await page
    .getByRole("complementary", { name: "Task inspector" })
    .getByLabel("Start", { exact: true })
    .fill("2026-09-01");
  await page.getByRole("complementary", { name: "Task inspector" }).getByLabel("Start", { exact: true }).blur();
  await expect(page.locator(".cm-content")).toContainText("[Project] as [wbs_project] starts 2026-09-01");
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
  await page.getByRole("button", { name: "Select WBS node Design" }).click();
  const inspector = page.getByRole("complementary", { name: "WBS node inspector" });
  await inspector.getByLabel("Linked Gantt task").selectOption({ label: "untitled.pumlu · Design" });
  await expect(page.locator(".cm-content")).toContainText("(design) Design");
  await inspector.getByRole("button", { name: "Open linked Gantt task" }).click();
  await expect(
    page
      .getByRole("complementary", { name: "Task inspector" })
      .getByRole("button", { name: "Open linked WBS node: Design" }),
  ).toBeVisible();
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
  await page.getByRole("button", { name: "Select WBS node Design" }).click();
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
  await setSource(page, "@startwbs\n*(plan) Plan\n**(build) Build\n@endwbs");
  await page.getByRole("button", { name: "Create Gantt chart from WBS" }).click();
  const name = page.getByRole("dialog", { name: "Create project from WBS" });
  await name.getByLabel("Name").fill("Linked plan");
  await name.getByRole("button", { name: "Create Gantt chart" }).click();
  await page.getByRole("button", { name: "Close project navigator" }).click();
  await page.locator('[data-task-id="wbs_build"]').first().click();
  const task = page.getByRole("complementary", { name: "Task inspector" });
  await task.getByLabel("Start", { exact: true }).fill("2026-09-23");
  await task.getByLabel("Start", { exact: true }).blur();
  await expect(page.locator(".cm-content")).toContainText("2026-09-23");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await page.getByRole("menu", { name: "Save" }).getByRole("menuitem", { name: "Save project", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as Window & { projectBytes?: number[] }).projectBytes?.length ?? 0))
    .toBeGreaterThan(100);
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
    await expect(reopened.getByRole("button", { name: "File", exact: true })).toBeVisible();
    const welcome = reopened.getByRole("dialog", { name: "Welcome to PlantUML Ultimate" });
    if (await welcome.isVisible()) {
      await welcome.getByRole("checkbox", { name: "Advanced mode" }).check();
      await welcome.getByRole("button", { name: "Get started" }).click();
    }
    const chooser = reopened.getByRole("dialog", { name: "Choose a diagram type" });
    if (await chooser.isVisible()) await chooser.getByRole("button", { name: "Gantt diagram" }).click();
    await reopened.getByRole("button", { name: "File", exact: true }).click();
    await reopened.getByRole("menuitem", { name: "Open", exact: true }).click();
    await reopened.getByRole("menu", { name: "Open" }).getByRole("menuitem", { name: "Project…" }).click();
    const navigator = reopened.getByRole("complementary", { name: "Project navigator" });
    await expect(navigator).toContainText("Linked plan WBS");
    await expect(navigator).toContainText("Linked plan schedule");
    await navigator.getByRole("button", { name: /^Linked plan schedule gantt/ }).click();
    await reopened.getByRole("button", { name: "Close project navigator" }).click();
    await reopened.getByRole("button", { name: "2 · split" }).click();
    await expect(reopened.locator(".cm-content")).toContainText("2026-09-23");
    await reopened
      .getByRole("navigation", { name: "Open documents" })
      .getByRole("button", { name: /^Linked plan WBS Project/ })
      .click();
    await reopened.getByRole("button", { name: "Select WBS node Build" }).click();
    await expect(reopened.getByRole("button", { name: "Open linked Gantt task" })).toBeVisible();
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
