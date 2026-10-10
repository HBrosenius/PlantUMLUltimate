import { expect, test } from "@playwright/test";
import { fillSource, prepareEditor, readEditorSource, setSource, source } from "./editor-helpers";

test("keeps long WBS outline results and footer inside the viewport", async ({ page }, testInfo) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "WBS diagram" })
    .click();
  await fillSource(
    page,
    `@startwbs\n* Root\n${Array.from({ length: 50 }, (_, i) => `** Item ${i + 1}`).join("\n")}\n@endwbs`,
  );
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 375, height: 844 },
    { width: 390, height: 844 },
    { width: 320, height: 420 },
  ]) {
    await page.emulateMedia({ colorScheme: viewport.width === 320 ? "dark" : "light" });
    await page.setViewportSize(viewport);
    await page.keyboard.press("Control+Shift+o");
    const dialog = page.getByRole("dialog", { name: "Diagram outline" });
    const rect = await dialog.boundingBox();
    expect(rect!.y).toBeGreaterThanOrEqual(0);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport.height);
    await expect(dialog.locator("footer")).toBeInViewport();
    if (testInfo.project.name === "chromium")
      await page.screenshot({ path: testInfo.outputPath(`outline-${viewport.width}.png`) });
    const results = dialog.getByRole("list", { name: "Diagram elements" });
    await results.evaluate((element) => (element.scrollTop = element.scrollHeight));
    await expect(results.getByRole("button", { name: /Item 50/ })).toBeInViewport();
    await dialog.getByRole("button", { name: "Close diagram outline" }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("keeps creation actions reachable in a short phone viewport without losing drafts", async ({ page }, testInfo) => {
  await prepareEditor(page);
  await page.setViewportSize({ width: 320, height: 420 });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Task/ }).click();
  const dialog = page.getByRole("dialog", { name: "Add task", exact: true });
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("Phone draft");
  const rect = await dialog.boundingBox();
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(420);
  await dialog.getByRole("button", { name: "Add task", exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole("button", { name: "Add task", exact: true })).toBeInViewport();
  if (testInfo.project.name === "chromium") await page.screenshot({ path: testInfo.outputPath("creation-320.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Phone draft");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("uses one phone pane and restores desktop Split without losing source", async ({ page }) => {
  await prepareEditor(page);
  const text = source("[Build] lasts 3 days");
  await setSource(page, text);
  const views = page.getByRole("navigation", { name: "View mode" });
  await views.getByRole("button", { name: "Split", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".workspace")).toHaveClass(/mode-diagram/);
  await views.getByRole("button", { name: "Code", exact: true }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(page.locator(".preview")).toHaveCount(0);
  expect(await readEditorSource(page)).toBe(text);
  const edited = text.replace("[Build]", "[Phone edit]");
  await fillSource(page, edited);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator(".workspace")).toHaveClass(/mode-split/);
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(page.locator(".preview")).toBeVisible();
  expect(await readEditorSource(page)).toBe(edited);
});

test("keeps editing help dismissals per diagram kind and offers a route to reopen", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "Dismiss editing hint" }).click();
  await expect(page.getByRole("button", { name: "Editing help" })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram" })
    .click();
  await expect(page.getByRole("note")).toContainText("Drag participants sideways");
  await page.getByRole("button", { name: "Dismiss editing hint" }).click();
  const tabs = page.getByRole("navigation", { name: "Open documents" });
  await tabs.getByRole("button").nth(0).click();
  await expect(page.getByRole("button", { name: "Editing help" })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Editing help" }).click();
  await expect(page.getByRole("note")).toContainText("new task");
  await page.getByRole("button", { name: "Dismiss editing hint" }).click();
  await tabs.getByRole("button").nth(1).click();
  await expect(page.getByRole("button", { name: "Editing help" })).toHaveAttribute("aria-expanded", "false");
  await page.setViewportSize({ width: 375, height: 844 });
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Commands…" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Collaborate…" })).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("keeps Sequence secondary message actions in a keyboard-accessible menu", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram" })
    .click();
  const original = "@startuml\nparticipant A\nparticipant B\nA -> B: Hello\n@enduml";
  await fillSource(page, original);
  await expect(page.locator(".preview[data-render-status]")).toHaveAttribute("data-render-status", "idle", {
    timeout: 45000,
  });
  await page.locator('[data-sequence-drag-hit][data-sequence-message-id="message-0"]').first().click();
  const trigger = page.getByRole("button", { name: "Message actions", exact: true });
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "From edge", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("menuitem", { name: "Mark lost", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).toBe(original.replace("A -> B: Hello", "A ->?: Hello"));
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await readEditorSource(page)).toBe(original);
});
