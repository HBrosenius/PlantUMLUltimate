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
  expect(await readEditorSource(page)).toBe(text);
});
