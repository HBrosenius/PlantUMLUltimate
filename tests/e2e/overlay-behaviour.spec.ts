import { expect, test, type Page } from "./coverage";
import { pointInText, prepareEditor, setSource, source } from "./editor-helpers";

async function palette(page: Page, query: string) {
  await page.getByRole("button", { name: "Commands", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await dialog.getByRole("combobox").fill(query);
  return dialog;
}

async function newDiagram(page: Page, kind: string) {
  await page.getByRole("button", { name: "New diagram tab" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await chooser.getByRole("button", { name: `${kind} diagram` }).click();
  await chooser.getByRole("button", { name: "Create diagram", exact: true }).click();
  await expect(chooser).toBeHidden();
}

test("Escape closes every Activity and Class add dialog and returns focus", async ({ page }) => {
  await prepareEditor(page);
  for (const [kind, commands] of [
    ["Activity", ["action", "partition", "note", "structure", "terminal", "arrow"]],
    ["Class", ["package", "note"]],
  ] as const) {
    await newDiagram(page, kind);
    for (const command of commands) {
      const commandPalette = await palette(page, `Add ${command}…`);
      await commandPalette.getByRole("combobox").press("Enter");
      await expect(commandPalette).toBeHidden();
      const dialog = page.getByRole("dialog");
      await expect(dialog, `${kind} ${command}`).toBeVisible();
      await expect(dialog).toHaveAttribute("aria-modal", "true");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog"), `${kind} ${command} after Escape`).toHaveCount(0);
    }
  }
});

test("a palette command clicked with the mouse keeps the inspector it opens", async ({ page }) => {
  await prepareEditor(page);
  await newDiagram(page, "Activity");
  const commandPalette = await palette(page, "Diagram settings…");
  await commandPalette.getByRole("option").filter({ hasText: "Diagram settings…" }).click();
  const settings = page.getByRole("complementary", { name: "Activity settings" });
  await expect(settings).toBeVisible();
  // The opening click must not also count as a click outside the inspector.
  await page.waitForTimeout(300);
  await expect(settings).toBeVisible();
  // A real click elsewhere still dismisses it.
  await page.locator(".cm-content").click();
  await expect(settings).toBeHidden();
});

test("the symbol menu stays inside the window when opened near its bottom edge", async ({ page }) => {
  await prepareEditor(page);
  await setSource(page, source("[Build] lasts 3 days\n[Test] starts at [Build]'s end and lasts 2 days"));
  const first = await pointInText(page, 2, "Build");
  const width = page.viewportSize()!.width;
  const statusBar = (await page.locator(".statusbar").boundingBox())!.height;
  // Make the window end just below the reference (and the status bar under it), so a menu opening downwards
  // from the reference would run off-screen.
  await page.setViewportSize({ width, height: Math.ceil(first.y + 16 + statusBar) });
  const reference = await pointInText(page, 2, "Build");
  await expect(page.locator(".cm-content .cm-line").nth(2)).toBeInViewport();
  expect(reference.y).toBeLessThan(page.viewportSize()!.height);
  await page.mouse.click(reference.x, reference.y, { button: "right" });
  const menu = page.getByRole("menu", { name: "Symbol actions" });
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  // Every item can be reached.
  await expect(menu.getByRole("menuitem", { name: "Find references" })).toBeInViewport();
});
