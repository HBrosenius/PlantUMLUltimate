import { expect, test } from "@playwright/test";
import { prepareEditor, readEditorSource, setSource, source } from "./editor-helpers";

const gantt = source(
  [
    "[Design] lasts 5 days",
    "[Build] lasts 8 days",
    "[Build] starts at [Design]'s end",
    "[Test] lasts 4 days",
    "[Test] starts at [Build]'s end",
  ].join("\n"),
);

test.describe("Stage mode", () => {
  test("fits the diagram, follows selection with dock and lens, edits live and exits to Split", async ({ page }) => {
    await prepareEditor(page);
    await setSource(page, gantt);

    const views = page.getByRole("navigation", { name: "View mode" });
    await views.getByRole("button", { name: "Stage", exact: true }).click();

    // Stage layout: one slim bar, no ribbon, the diagram fills the canvas.
    const workspace = page.locator(".workspace.mode-stage");
    await expect(workspace).toBeVisible();
    await expect(page.getByTestId("stage-topbar")).toBeVisible();
    await expect(page.locator(".command-ribbon")).toBeHidden();
    await expect(page.locator(".preview-tools")).toBeHidden();
    await expect(page.getByTestId("stage-cluster")).toBeVisible();
    await expect(page.getByTestId("source-lens")).toHaveAttribute("data-state", "strip");

    const svg = page.locator(".diagram svg");
    await expect(svg).toBeVisible();
    await expect
      .poll(async () => {
        const box = await svg.boundingBox();
        const area = await page.locator(".preview-viewport").boundingBox();
        if (!box || !area) return false;
        const inside =
          box.x >= area.x - 1 &&
          box.y >= area.y - 1 &&
          box.x + box.width <= area.x + area.width + 1 &&
          box.y + box.height <= area.y + area.height + 1;
        // Fitted means visible in full and large (at least a third of the canvas in one dimension).
        return inside && (box.width >= area.width / 3 || box.height >= area.height / 3);
      })
      .toBe(true);

    // Selecting a task shows the dock next to it and only its lines in the lens.
    const build = page.locator('.diagram [data-task-id="build"]').first();
    await build.click();
    const dock = page.getByRole("toolbar", { name: "Actions for Build" });
    await expect(dock).toBeVisible();
    await expect(dock.getByRole("button", { name: "Delete" })).toBeVisible();
    await expect(dock.getByRole("button", { name: "Open inspector" })).toBeVisible();
    const lens = page.getByTestId("source-lens");
    await expect(lens).toHaveAttribute("data-state", "peek");
    await expect(lens.locator(".cm-content")).toContainText("[Build] lasts 8 days");
    await expect(lens.locator(".cm-content")).not.toContainText("[Design] lasts");
    await expect(lens.locator(".cm-content")).not.toContainText("[Test] lasts");

    // Editing in the lens changes the source and the diagram.
    const widthBefore = (await page.locator('.diagram [data-task-id="build"]').first().boundingBox())!.width;
    await lens.locator(".cm-line", { hasText: "lasts 8 days" }).click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.keyboard.insertText("[Build] lasts 16 days");
    await expect.poll(() => readEditorSource(page)).toContain("[Build] lasts 16 days");
    await expect(lens.locator(".cm-content")).not.toContainText("[Design] lasts");
    await expect
      .poll(async () => (await page.locator('.diagram [data-task-id="build"]').first().boundingBox())!.width, {
        timeout: 20_000,
      })
      .toBeGreaterThan(widthBefore * 1.3);

    // Ctrl+E expands the lens to the full editor.
    await page.keyboard.press("Control+e");
    await expect(lens).toHaveAttribute("data-state", "expanded");
    await expect(lens.locator(".cm-content")).toContainText("[Design] lasts 5 days");
    await page.keyboard.press("Control+e");
    await expect(lens).not.toHaveAttribute("data-state", "expanded");

    // Exit returns to the unchanged Split layout with the ribbon and the code editor.
    await page.getByRole("button", { name: "Exit Stage" }).click();
    await expect(page.locator(".workspace.mode-split")).toBeVisible();
    await expect(page.locator(".command-ribbon")).toBeVisible();
    await expect(page.locator(".cm-content")).toContainText("[Design] lasts 5 days");
    await expect(page.getByTestId("stage-topbar")).toHaveCount(0);
  });

  test("dock and lens stay on the task across repeated dock actions", async ({ page }) => {
    await prepareEditor(page);
    await setSource(page, gantt);
    const views = page.getByRole("navigation", { name: "View mode" });
    await expect(views.getByRole("button", { name: "Stage", exact: true })).toHaveAttribute(
      "title",
      /Stage view \(Ctrl\/Cmd\+4\)/,
    );
    await views.getByRole("button", { name: "Stage", exact: true }).click();
    await page.locator('.diagram [data-task-id="build"]').first().click();
    const dock = page.getByRole("toolbar", { name: "Actions for Build" });
    const lens = page.getByTestId("source-lens");
    await expect(dock).toBeVisible();

    await dock.getByRole("button", { name: "+1d" }).click();
    await expect(page.locator(".diagram")).toHaveAttribute("data-selected-task", "build");
    await expect(dock).toBeVisible();
    await expect(lens).toHaveAttribute("data-state", "peek");
    await dock.getByRole("button", { name: "+1d" }).click();
    await expect(dock).toBeVisible();
    await expect(lens).toHaveAttribute("data-state", "peek");
    await expect(lens.locator(".cm-content")).toContainText("[Build] lasts 10 days");
    await expect(lens.locator(".cm-content")).not.toContainText("[Design] lasts");
  });

  test("sequence dock keeps the message selected after moving it", async ({ page }) => {
    await prepareEditor(page);
    await page.getByRole("button", { name: "New diagram tab" }).click();
    const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
    await chooser.getByRole("button", { name: "Sequence diagram" }).click();
    await chooser.getByRole("button", { name: "Create diagram", exact: true }).click();
    await setSource(page, "@startuml\nparticipant A\nparticipant B\nA -> B: one\nB -> A: two\nA -> B: three\n@enduml");
    await page
      .getByRole("navigation", { name: "View mode" })
      .getByRole("button", { name: "Stage", exact: true })
      .click();
    await page.locator("rect[data-sequence-drag-hit][data-sequence-message-id]").nth(1).click();
    const dock = page.getByRole("toolbar", { name: "Actions for two" });
    await expect(dock).toBeVisible();
    await dock.getByRole("button", { name: /Later/ }).click();
    await expect(page.getByRole("toolbar", { name: "Actions for two" })).toBeVisible();
    await expect(page.getByTestId("source-lens").locator(".cm-content")).toContainText("B -> A: two");
  });

  test("offers + Add with nothing selected and keeps commands in the palette", async ({ page }) => {
    await prepareEditor(page);
    await setSource(page, gantt);
    await page
      .getByRole("navigation", { name: "View mode" })
      .getByRole("button", { name: "Stage", exact: true })
      .click();
    const dock = page.getByRole("toolbar", { name: "Add to diagram" });
    await expect(dock).toBeVisible();
    await dock.getByRole("button", { name: "+ Add" }).click();
    await expect(page.getByRole("menuitem", { name: "Milestone" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /Ask or do/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("combobox", { name: "Search commands" }).fill("Split view");
    await expect(page.getByRole("option", { name: /Split view/ }).first()).toBeVisible();
  });

  test("True render shows the diagram as exported in the dark theme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await prepareEditor(page);
    await setSource(page, gantt);
    await page
      .getByRole("navigation", { name: "View mode" })
      .getByRole("button", { name: "Stage", exact: true })
      .click();
    const recolored = await page.locator(".diagram svg").innerHTML();
    await page.getByRole("button", { name: "True render" }).click();
    await expect(page.getByRole("button", { name: "True render" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => page.locator(".diagram svg").innerHTML()).not.toBe(recolored);
    // True render is the renderer output: the author's near-black text paint is back.
    expect(recolored).not.toContain('fill="#000000"');
    expect(await page.locator(".diagram svg").innerHTML()).toContain('fill="#000000"');
  });
});
