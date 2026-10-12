import { test, expect } from "@playwright/test";
import { prepareEditor, setSource, source, readEditorSource } from "./editor-helpers";

test("touchpad scrolling pans and pinch zooms without changing source or page zoom", async ({ page }) => {
  test.setTimeout(75_000);
  await prepareEditor(page);
  const text = source(Array.from({ length: 60 }, (_, i) => `[Task ${i + 1}] lasts 60 days`).join("\n"));
  await setSource(page, text);
  const viewport = page.locator(".preview-viewport");
  const zoom = page.getByRole("button", { name: /Reset zoom/ });
  const beforeZoom = await zoom.textContent();
  await viewport.evaluate((element) => {
    element.scrollTop = 0;
    element.scrollLeft = 0;
  });
  const prevented = await viewport.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return !element.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX: 25,
        deltaY: 35,
        clientX: bounds.left + 100,
        clientY: bounds.top + 100,
      }),
    );
  });
  expect(prevented).toBe(true);
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(zoom).toHaveText(beforeZoom!);
  const pageScale = await page.evaluate(() => window.visualViewport?.scale);
  expect(
    await viewport.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return !element.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaY: -30,
          clientX: bounds.left + 100,
          clientY: bounds.top + 100,
        }),
      );
    }),
  ).toBe(true);
  await expect(zoom).not.toHaveText(beforeZoom!);
  await expect(viewport).not.toHaveClass(/diagram-wheel-zooming/);
  expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(pageScale);
  // Ensure horizontal overflow exists: a fitted diagram cannot scroll sideways.
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeGreaterThan(50);
  for (const deltaMode of [0, 1]) {
    await viewport.evaluate((element) => {
      element.scrollLeft = 0;
    });
    await viewport.evaluate((element, mode) => {
      element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 30, deltaMode: mode }));
    }, deltaMode);
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await viewport.evaluate((element, mode) => {
      element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: -30, deltaMode: mode }));
    }, deltaMode);
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBe(0);
  }
  expect(await readEditorSource(page)).toBe(text);
});

test("navigates both what-if diagrams independently without editing either plan", async ({ page }) => {
  await prepareEditor(page);
  const text = source(Array.from({ length: 40 }, (_, i) => `[Task ${i + 1}] lasts 60 days`).join("\n"));
  await setSource(page, text);
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("menuitem", { name: "What-if scenario…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "What-if scenario", exact: true });
  await dialog.getByRole("button", { name: "Rendered preview" }).click();
  const base = dialog.getByLabel("Base plan rendered diagram", { exact: true });
  const scenario = dialog.getByLabel("Scenario preview", { exact: true });
  await expect(base.locator("svg")).toBeVisible();
  await expect(scenario.locator("svg")).toBeVisible();
  for (const viewport of [base, scenario.locator(".preview-viewport")]) {
    await viewport.evaluate((element) => {
      element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100 }));
    });
    await expect(viewport).not.toHaveClass(/diagram-wheel-zooming/);
    await expect
      .poll(() => viewport.evaluate((element) => element.scrollWidth - element.clientWidth))
      .toBeGreaterThan(50);
    await viewport.evaluate((element) => {
      element.scrollLeft = 0;
      element.scrollTop = 0;
      element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 35, deltaY: 35 }));
    });
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  }
  await dialog.getByRole("button", { name: "Reset base plan zoom", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Reset base plan zoom", exact: true })).toHaveText("100%");
  await expect(scenario.getByRole("button", { name: /Reset zoom/ })).not.toHaveText("100%");
  const link = dialog.getByRole("checkbox", { name: "Link zoom and scrolling" });
  await link.check();
  await expect(scenario.getByRole("button", { name: /Reset zoom/ })).toHaveText("100%");
  await dialog.getByRole("button", { name: "Zoom in base plan", exact: true }).click();
  await expect(scenario.getByRole("button", { name: /Reset zoom/ })).toHaveText("120%");
  for (const viewport of [base, scenario.locator(".preview-viewport")]) {
    await viewport.evaluate((element) => {
      element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -80 }));
    });
    await expect(viewport).not.toHaveClass(/diagram-wheel-zooming/);
    await expect
      .poll(async () => await dialog.getByRole("button", { name: "Reset base plan zoom", exact: true }).textContent())
      .toBe(await scenario.getByRole("button", { name: /Reset zoom/ }).textContent());
    await viewport.evaluate((element) => {
      element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 40, deltaY: 60 }));
    });
    const fraction = async (selector: typeof base) =>
      selector.evaluate((element) => ({
        x: element.scrollLeft / Math.max(1, element.scrollWidth - element.clientWidth),
        y: element.scrollTop / Math.max(1, element.scrollHeight - element.clientHeight),
      }));
    await expect
      .poll(async () => {
        const left = await fraction(base);
        const right = await fraction(scenario.locator(".preview-viewport"));
        return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
      })
      .toBeLessThan(0.02);
  }
  await link.uncheck();
  const scenarioZoom = await scenario.getByRole("button", { name: /Reset zoom/ }).textContent();
  await dialog.getByRole("button", { name: "Reset base plan zoom", exact: true }).click();
  await expect(scenario.getByRole("button", { name: /Reset zoom/ })).toHaveText(scenarioZoom!);
  await dialog.getByRole("button", { name: "Close what-if scenario", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(await readEditorSource(page)).toBe(text);
});
