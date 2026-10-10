import { expect, test } from "@playwright/test";
import { fillSource, prepareEditor, readEditorSource, waitForDiagramRender } from "./editor-helpers";

async function prepareWbs(page: Parameters<typeof prepareEditor>[0]) {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "WBS diagram", exact: true })
    .click();
  await fillSource(
    page,
    `@startwbs\n* Delivery\n** Platform\n*** Deep leaf\n${Array.from({ length: 12 }, (_, i) => `** Workstream ${i + 1}\n*** Deliverable ${i + 1}`).join("\n")}\n@endwbs`,
  );
  await waitForDiagramRender(page);
}

test("searches displayed ancestry and keeps a hierarchical outline docked while navigating", async ({ page }) => {
  test.setTimeout(60_000);
  await prepareWbs(page);
  const original = await readEditorSource(page);
  await page.getByRole("button", { name: "Outline", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Diagram outline", exact: true });
  await modal.getByLabel("Search diagram elements").fill("Delivery Platform");
  await expect(modal.getByRole("button", { name: /Deep leaf/ })).toBeVisible();
  await modal.getByRole("button", { name: "Clear outline search", exact: true }).click();
  await modal.getByRole("button", { name: "Dock outline", exact: true }).click();
  const dock = page.getByRole("complementary", { name: "Diagram outline", exact: true });
  await expect(modal).toBeHidden();
  const root = dock.getByRole("button", { name: /^Delivery WBS node/ });
  const leaf = dock.getByRole("button", { name: /^Deep leaf WBS node/ });
  expect(parseFloat(await leaf.evaluate((element) => getComputedStyle(element).paddingInlineStart))).toBeGreaterThan(
    parseFloat(await root.evaluate((element) => getComputedStyle(element).paddingInlineStart)),
  );
  await dock.getByLabel("Search diagram elements").fill("Deep leaf");
  await expect(page.locator('.diagram [data-outline-match="true"]').first()).toBeVisible();
  await leaf.click();
  await expect(dock).toBeVisible();
  await expect(
    page
      .getByRole("complementary", { name: /WBS node inspector/ })
      .locator("textarea")
      .first(),
  ).toHaveValue("Deep leaf");
  expect(await readEditorSource(page)).toBe(original);
  await page.screenshot({ path: "test-results/a23-docked-outline.png" });
  await dock.getByRole("button", { name: "Clear outline search", exact: true }).click();
  await expect(page.locator('[data-outline-match="true"]')).toHaveCount(0);
  await page.setViewportSize({ width: 800, height: 720 });
  await expect(dock).toBeHidden();
  await expect(modal).toBeVisible();
  await expect(modal.getByRole("button", { name: "Dock outline", exact: true })).toHaveCount(0);
  await modal.getByRole("button", { name: "Close diagram outline", exact: true }).click();
});

test("scopes Find to canvas focus, preserves source search and keeps diagram view while revealing", async ({
  page,
}) => {
  await prepareEditor(page);
  const original = await readEditorSource(page);
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+f");
  await expect(page.locator(".cm-search")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Find in diagram", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Diagram", exact: true }).click();
  await page.locator('.diagram [tabindex="0"]').first().focus();
  await page.keyboard.press("ControlOrMeta+f");
  const find = page.getByRole("complementary", { name: "Find in diagram", exact: true });
  await expect(find.getByLabel("Search diagram elements")).toBeFocused();
  await find.getByLabel("Search diagram elements").fill("Architecture");
  await expect(find.getByRole("listitem")).toHaveCount(1);
  await expect(page.locator('[data-task-id="architecture"][data-outline-match="true"]').first()).toBeVisible();
  await page.screenshot({ path: "test-results/a23-canvas-find.png" });
  await find.getByRole("button", { name: /Architecture/ }).click();
  await expect(page.locator('[data-task-id="architecture"]')).toHaveAttribute("data-selected", "true");
  await expect(page.locator(".cm-content")).toHaveCount(0);
  await page.locator('.diagram [tabindex="0"]').first().focus();
  await page.keyboard.press("Escape");
  await expect(find).toBeHidden();
  await expect(page.getByRole("complementary", { name: "Task inspector", exact: true })).toBeVisible();
  await expect(page.locator('[data-outline-match="true"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Code", exact: true }).click();
  expect(await readEditorSource(page)).toBe(original);
});

test("retains the modal on phones with clear search and filter-aware empty states", async ({ page }) => {
  await prepareEditor(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Outline", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Diagram outline", exact: true });
  await expect(modal.getByRole("button", { name: "Dock outline", exact: true })).toHaveCount(0);
  await modal.getByLabel("Filter diagram element type").selectOption("task");
  await modal.getByLabel("Search diagram elements").fill("no such element");
  await expect(modal).toContainText("Try All types");
  await modal.getByRole("button", { name: "Clear outline search", exact: true }).click();
  await expect(modal.getByRole("listitem")).not.toHaveCount(0);
  await expect(modal.locator("footer")).toBeInViewport();
  await page.screenshot({ path: "test-results/a23-outline-phone.png" });
  await modal.getByRole("button", { name: "Close diagram outline", exact: true }).click();
  await page.getByRole("button", { name: "Find in diagram", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Find in diagram", exact: true })).toBeVisible();
});
