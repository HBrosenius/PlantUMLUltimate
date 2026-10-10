import { expect, test, type Page } from "@playwright/test";
import { prepareEditor, fillSource, readEditorSource } from "./editor-helpers";

async function palette(page: Page, query = "") {
  await page.getByRole("button", { name: "Commands", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await dialog.getByRole("combobox").fill(query);
  return dialog;
}
async function run(page: Page, label: string) {
  const dialog = await palette(page, label);
  await dialog.getByRole("option").filter({ hasText: label }).click();
}

test("palette creation commands match every diagram family", async ({ page }) => {
  await prepareEditor(page);
  for (const [kind, action] of [
    ["Gantt", "Add task…"],
    ["WBS", "Add WBS node…"],
    ["Sequence", "Add participant…"],
    ["Use Case", "Add actor…"],
    ["Class", "Add entity…"],
    ["Component", "Add entity…"],
    ["Activity", "Add action…"],
  ]) {
    if (kind !== "Gantt") {
      await page.getByRole("button", { name: "New diagram tab" }).click();
      await page
        .getByRole("dialog", { name: "Choose a diagram type" })
        .getByRole("button", { name: `${kind} diagram` })
        .click();
    }
    const dialog = await palette(page);
    await expect(dialog.getByRole("option").filter({ hasText: action! })).toBeEnabled();
    if (kind !== "Sequence")
      await expect(dialog.getByRole("option").filter({ hasText: "Add participant…" })).toHaveCount(0);
    await expect(dialog.getByRole("option").filter({ hasText: "Reports…" })).toHaveCount(kind === "Gantt" ? 1 : 0);
    await expect(dialog.getByRole("option").filter({ hasText: "Jira…" })).toHaveCount(kind === "Gantt" ? 1 : 0);
    await dialog.getByRole("combobox").fill(action!);
    await dialog.getByRole("combobox").press("Enter");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

test("palette navigation uses existing handlers and recent commands stay applicable", async ({ page }, testInfo) => {
  await prepareEditor(page);
  await fillSource(page, "@startgantt\nProject starts 2026-09-04\n[Design] as [a] lasts 3 days\n@endgantt");
  await expect(page.locator(".diagram svg")).toBeVisible();
  const original = await readEditorSource(page);
  await run(page, "Document settings…");
  await expect(page.getByRole("dialog", { name: "Document settings", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await run(page, "Version history…");
  await expect(page.getByRole("dialog", { name: /Version history/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const zoomBeforeFit = await page.getByRole("button", { name: /Reset zoom/ }).textContent();
  await run(page, "Fit diagram");
  await expect(page.getByRole("button", { name: /Reset zoom/ })).not.toHaveText(zoomBeforeFit!);
  expect(await readEditorSource(page)).toBe(original);
  await page
    .getByRole("navigation", { name: "View mode" })
    .getByRole("button", { name: "Diagram", exact: true })
    .click();
  await run(page, "Go to line…");
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Go to line:" })).toBeVisible();
  await page.getByRole("textbox", { name: "Go to line:" }).fill("2");
  await page.getByRole("textbox", { name: "Go to line:" }).press("Enter");
  await expect(page.locator(".statusbar")).toContainText("Ln 2");
  expect(await readEditorSource(page)).toBe(original);
  await page.evaluate(async () => {
    const modulePath = "/node_modules/.vite/deps/@codemirror_view.js";
    const { EditorView } = await import(modulePath);
    const editor = EditorView.findFromDOM(document.querySelector(".cm-editor"));
    const position = editor.state.doc.toString().indexOf("Design") + 2;
    editor.dispatch({ selection: { anchor: position } });
  });
  await run(page, "Rename symbol at cursor…");
  await expect(page.getByRole("dialog", { name: /Rename task/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await run(page, "Reports…");
  await page.keyboard.press("Escape");
  let dialog = await palette(page);
  await expect(dialog.getByText("Recent commands", { exact: true })).toBeVisible();
  if (testInfo.project.name === "chromium") await page.screenshot({ path: testInfo.outputPath("recent-commands.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram" })
    .click();
  dialog = await palette(page);
  await expect(dialog.getByRole("option").filter({ hasText: "Reports…" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await run(page, "Previous tab");
  await expect(page.locator(".cm-content")).toContainText("Design");
  await run(page, "Next tab");
  await expect(page.locator(".cm-content")).not.toContainText("Design");
  await run(page, "Close tab");
  await expect(page.locator(".cm-content")).toContainText("Design");
});
