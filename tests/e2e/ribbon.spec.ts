import { expect, test, type Page } from "@playwright/test";
import { prepareEditor, fillSource, readEditorSource, source } from "./editor-helpers";

async function category(page: Page, name: string) {
  await page.getByRole("tab", { name, exact: true }).click();
}
async function group(page: Page, name: string) {
  const summary = page.locator(".ribbon-group > summary").filter({ hasText: name });
  if (await summary.isVisible()) {
    if (!(await summary.locator("..").getAttribute("open"))) {
      // An open details element has an empty open attribute.
      if (!(await summary.evaluate((node) => (node.parentElement as HTMLDetailsElement).open))) await summary.click();
    }
  }
}

test("categories preserve views and inspectors; ribbon and persistent controls precede documents", async ({ page }) => {
  await prepareEditor(page);
  await fillSource(page, source("[A] lasts 2 days\n[B] lasts 3 days"));
  const initial = await readEditorSource(page);
  await category(page, "Plan");
  await group(page, "Planning tools");
  await page.getByRole("button", { name: "Calendar & schedule", exact: true }).click();
  await expect(page.getByRole("button", { name: "Close project inspector" })).toBeVisible();
  await page.getByLabel("Project starts", { exact: true }).fill("2026-09-02");
  const activeView = await page
    .getByRole("navigation", { name: "View mode" })
    .getByRole("button", { pressed: true })
    .innerText();
  await category(page, "Insert");
  await expect(page.getByRole("button", { name: "Close project inspector" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "View mode" }).getByRole("button", { name: activeView, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Project starts", { exact: true })).toHaveValue("2026-09-02");
  await page.getByLabel("Project starts", { exact: true }).fill("2026-09-01");
  await page.getByRole("button", { name: "Close project inspector" }).click();
  await expect(page.getByRole("tab", { name: "Insert", exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: "Calendar & schedule", exact: true })).toHaveCount(0);
  const ribbon = await page.locator(".command-ribbon").boundingBox();
  const tabs = await page.getByRole("navigation", { name: "Open documents" }).boundingBox();
  expect(ribbon!.y + ribbon!.height).toBeLessThanOrEqual(tabs!.y + 1);
  await page.getByRole("button", { name: "Collapse ribbon" }).click();
  await expect(page.getByRole("tabpanel")).toBeHidden();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Commands", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Collaborate", exact: true })).toBeVisible();
  await category(page, "View");
  expect(await readEditorSource(page)).toBe(initial);
});

test("task and dependency creation work in Code, Split, Diagram and Tasks", async ({ page }) => {
  await prepareEditor(page);
  await fillSource(page, source("[A] lasts 2 days\n[B] lasts 3 days"));
  for (const [index, mode] of ["Code", "Split", "Diagram", "Tasks"].entries()) {
    await page.getByRole("navigation", { name: "View mode" }).getByRole("button", { name: mode, exact: true }).click();
    await category(page, "Insert");
    await group(page, "Insert elements");
    await page.getByRole("button", { name: "Task…", exact: true }).click();
    const task = page.getByRole("dialog", { name: "Add task", exact: true });
    await task.getByLabel("Name").fill(`Ribbon task ${index}`);
    await task.getByLabel("Start date").fill("2026-09-01");
    await task.getByRole("button", { name: "Add task", exact: true }).click();
    await expect(task).toBeHidden();
    await group(page, "Insert elements");
    await page.getByRole("button", { name: "Add dependency…" }).click();
    const dependency = page.getByRole("dialog", { name: "Add dependency", exact: true });
    await dependency.getByLabel("Predecessor", { exact: true }).selectOption({ label: "A" });
    await dependency.getByLabel("Successor", { exact: true }).selectOption({ label: `Ribbon task ${index}` });
    await dependency.getByRole("button", { name: "Add dependency", exact: true }).click();
    await expect(dependency).toBeHidden();
    await expect(page.getByRole("button", { name: "Add dependency…" })).toBeFocused();
    await expect(
      page.getByRole("navigation", { name: "View mode" }).getByRole("button", { name: mode, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByRole("navigation", { name: "View mode" }).getByRole("button", { name: "Code", exact: true }).click();
  const edited = await readEditorSource(page);
  for (let index = 0; index < 4; index++) expect(edited).toContain(`[Ribbon task ${index}] starts at [A]'s end`);
});

test("retargets Insert by document, preserves Plan position and keyboard category navigation", async ({ page }) => {
  await prepareEditor(page);
  await category(page, "Insert");
  const before = await page.getByRole("tab", { name: "Plan", exact: true }).boundingBox();
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram" })
    .click();
  await expect(page.getByRole("button", { name: "Participant…", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Task…", exact: true })).toHaveCount(0);
  const plan = page.getByRole("tab", { name: "Plan", exact: true });
  expect((await plan.boundingBox())!.x).toBe(before!.x);
  await plan.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Planning tools are for Gantt and WBS diagrams.", { exact: true })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "View", exact: true })).toBeFocused();
  await expect(page.getByRole("tab", { name: "View", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("responsive ribbon groups stay inside the screen in light and dark themes", async ({ page }, testInfo) => {
  await prepareEditor(page);
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page.locator(".app").evaluate((node, value) => node.setAttribute("data-theme", value), theme);
      await category(page, "Insert");
      await group(page, "Insert elements");
      for (const control of await page
        .locator(".command-ribbon button:visible, .command-ribbon summary:visible, .workspace-toolbar button:visible")
        .all()) {
        const bounds = await control.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      }
      await page.screenshot({ path: testInfo.outputPath(`ribbon-${width}-${theme}.png`) });
    }
  }
});

test("all seven diagram types retain applicable insertion tools in desktop and mobile ribbons", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await prepareEditor(page);
  for (const [kind, command] of [
    ["Gantt", "Task…"],
    ["Sequence", "Participant…"],
    ["WBS", "WBS node…"],
    ["Use Case", "Actor…"],
    ["Class", "Class, interface, or enum…"],
    ["Component", "Component or infrastructure…"],
    ["Activity", "Action…"],
  ]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    if (kind !== "Gantt") {
      await page.getByRole("button", { name: "New diagram tab" }).click();
      await page
        .getByRole("dialog", { name: "Choose a diagram type" })
        .getByRole("button", { name: `${kind} diagram`, exact: true })
        .click();
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ["light", "dark"]) {
        await page.locator(".app").evaluate((node, value) => node.setAttribute("data-theme", value), theme);
        await category(page, "Insert");
        await group(page, "Insert elements");
        await expect(page.getByRole("button", { name: command, exact: true })).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`${kind.replaceAll(" ", "-")}-${width}-${theme}.png`) });
      }
    }
  }
});

test("mobile creation returns focus to the invoking command after pointer editing", async ({ page }) => {
  await prepareEditor(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await category(page, "Insert");
  await group(page, "Insert elements");
  const task = page.getByRole("button", { name: "Task…", exact: true });
  await task.click();
  const dialog = page.getByRole("dialog", { name: "Add task", exact: true });
  await dialog.getByLabel("Name").click();
  await dialog.getByLabel("Name").fill("Mobile ribbon draft");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(task).toBeFocused();
});
