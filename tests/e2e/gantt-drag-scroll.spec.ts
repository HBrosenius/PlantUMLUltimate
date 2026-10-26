import { expect, test } from "@playwright/test";
import { prepareEditor, setSource, source } from "./editor-helpers";

const wideTimeline = (alpha: string) =>
  source(`[Alpha] starts 2026-09-07\n[Alpha] lasts ${alpha} days\n[Beta] starts 2026-09-07\n[Beta] lasts 120 days`);

async function dayPixels(page: import("@playwright/test").Page) {
  const heads = page.locator('[data-timeline-header="top"][data-timeline-date]');
  return Math.abs((await heads.nth(1).boundingBox())!.x - (await heads.nth(0).boundingBox())!.x);
}

test("resizing on a scrollable timeline keeps the bar edge under the cursor and applies the dropped length", async ({
  page,
  browserName,
}) => {
  test.skip(browserName === "webkit", "WebKit automation does not preserve SVG pointer coordinates for task drags");
  await prepareEditor(page);
  await setSource(page, wideTimeline("3"));
  const viewport = page.locator(".preview-viewport");
  expect(await viewport.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeGreaterThan(200);
  await page.locator('[data-task-id="alpha"] .bar').click();
  const handle = (await page.locator('[data-task-id="alpha"] [data-resize-handle]').boundingBox())!;
  const dayPx = await dayPixels(page);
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dayPx * 10, y, { steps: 10 });
  // The timeline must not scroll away from the cursor: the ghost's end stays where the pointer is.
  expect(await viewport.evaluate((element) => element.scrollLeft)).toBe(0);
  await expect
    .poll(async () => {
      const ghost = (await page.locator(".task-drag-ghost").boundingBox())!;
      return Math.abs(ghost.x + ghost.width - (x + dayPx * 10));
    })
    .toBeLessThan(dayPx);
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("[Alpha] lasts 13 days");
});

test("dragging a task counts scrolling during the drag as distance travelled", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit automation does not preserve SVG pointer coordinates for task drags");
  await prepareEditor(page);
  await setSource(page, wideTimeline("2"));
  const viewport = page.locator(".preview-viewport");
  const bar = (await page.locator('[data-task-id="alpha"] .bar').boundingBox())!;
  const dayPx = await dayPixels(page);
  const x = bar.x + 3;
  const y = bar.y + bar.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dayPx * 2, y, { steps: 6 });
  await viewport.evaluate((element, by) => {
    element.scrollLeft += by;
  }, dayPx * 3);
  await page.mouse.move(x + dayPx * 2 + 1, y);
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("[Alpha] starts 2026-09-12");
});
