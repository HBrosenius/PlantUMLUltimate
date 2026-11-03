import { expect, test } from "@playwright/test";
import { openRibbonGroup, prepareEditor } from "./editor-helpers";

for (const width of [614, 1280, 1440]) {
  test(`creation and inspector controls remain clear at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 614 ? 724 : 900 });
    await prepareEditor(page);
    await page.getByRole("button", { name: "New diagram tab" }).click();
    const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
    const count = await page.locator(".document-tab").count();
    await chooser.getByRole("button", { name: "Sequence diagram", exact: true }).click();
    await expect(chooser).toBeVisible();
    await expect(page.locator(".document-tab")).toHaveCount(count);
    await expect(chooser.getByRole("button", { name: "Create diagram", exact: true })).toBeInViewport();
    await chooser.getByRole("button", { name: "Gantt diagram", exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath(`creation-${width}.png`) });
    await chooser.getByLabel("Diagram name").fill("Usability plan");
    await chooser.getByRole("button", { name: "Create diagram", exact: true }).click();
    await expect(chooser).toBeHidden();
    const inspector = page.getByRole("complementary", { name: "Project and calendar inspector" });
    await expect(inspector).toBeHidden();
    await openRibbonGroup(page, "Plan", "Planning tools");
    await page.getByRole("button", { name: "Calendar & schedule", exact: true }).click();
    await expect(inspector).toBeVisible();
    expect(await inspector.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toMatch(/rgba\([^)]*, 0\./);
    await expect(inspector.getByRole("button", { name: "Close project inspector" })).toBeInViewport();
    await inspector.getByRole("combobox", { name: "Time axis", exact: true }).selectOption("weekly");
    await expect(inspector.getByRole("status")).toContainText("Unapplied changes");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.keyboard.press("Escape");
    await expect(inspector).toBeVisible();
    await inspector.getByRole("button", { name: "Apply changes", exact: true }).click();
    await expect(inspector).toBeHidden();
    await openRibbonGroup(page, "Plan", "Planning tools");
    await page.getByRole("button", { name: "Calendar & schedule", exact: true }).click();
    await expect(inspector.getByRole("status")).toContainText("Diagram updated");
    await page.screenshot({ path: testInfo.outputPath(`calendar-${width}.png`) });
    await inspector.getByRole("button", { name: "Close project inspector" }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    await expect(settings.getByRole("spinbutton", { name: "Font size (px)" })).toBeInViewport();
    await expect(settings.getByRole("radio", { name: "Diagram only" })).toHaveCount(0);
    await settings.getByRole("button", { name: "New diagrams", exact: true }).click();
    await expect(settings.getByLabel("Default view", { exact: true })).toBeVisible();
    await settings.getByRole("button", { name: "Cancel", exact: true }).click();
    const close = page.getByRole("button", { name: "Close Usability plan", exact: true });
    await expect(close).toBeVisible();
    for (const control of [
      close,
      page.getByRole("button", { name: "New diagram tab", exact: true }),
      page.getByRole("button", { name: "No issues", exact: true }),
    ]) {
      const bounds = await control.boundingBox();
      expect(bounds?.width).toBeGreaterThanOrEqual(24);
      expect(bounds?.height).toBeGreaterThanOrEqual(24);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await close.evaluate((el) => el.parentElement?.tagName)).toBe("DIV");
  });
}

test("compact diagrams keep a stable origin while tall diagrams retain scrolling and manual zoom", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepareEditor(page);
  const { fillSource, source, waitForDiagramRender } = await import("./editor-helpers");
  await fillSource(page, source("[Build] lasts 3 days"));
  await waitForDiagramRender(page);
  const viewport = page.locator(".preview-viewport").first();
  const diagram = viewport.locator(".diagram");
  await expect.poll(() => diagram.evaluate((el) => parseFloat(getComputedStyle(el).marginTop))).toBe(0);
  const zoom = page.getByRole("button", { name: "Zoom in", exact: true });
  await zoom.click();
  await diagram.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((animation) => animation.finished));
  });
  const transform = await diagram.evaluate((el) => getComputedStyle(el).transform);
  await fillSource(page, source("[Build] lasts 4 days"));
  await waitForDiagramRender(page);
  await expect.poll(() => diagram.evaluate((el) => getComputedStyle(el).transform)).toBe(transform);
  await fillSource(page, source(Array.from({ length: 55 }, (_, i) => `[Task ${i}] lasts 3 days`).join("\n")));
  await waitForDiagramRender(page);
  await expect.poll(() => diagram.evaluate((el) => parseFloat(getComputedStyle(el).marginTop))).toBe(0);
  expect(await viewport.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await viewport.evaluate((el) => {
    el.scrollTop = 220;
    el.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
});
