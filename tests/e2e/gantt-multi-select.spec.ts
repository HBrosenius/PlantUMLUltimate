import { expect, test } from "@playwright/test";
import { prepareEditor, setSource, source } from "./editor-helpers";

test("selects several tasks to move, copy, paste and delete them together", async ({ page }) => {
  await prepareEditor(page);
  await setSource(
    page,
    source(
      "[Design] starts 2026-09-07\n[Design] lasts 2 days\n[Build] starts 2026-09-09\n[Build] lasts 3 days\n[Test] lasts 1 day",
    ),
  );
  const editor = page.locator(".cm-content");
  await page.locator('[data-task-id="design"] .bar').click();
  await page.locator('[data-task-id="build"] .bar').click({ modifiers: ["Shift"] });
  const inspector = page.getByRole("complementary", { name: "Selected tasks inspector" });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByText("2 tasks selected")).toBeVisible();
  await expect(page.locator('[data-task-id][data-selected="true"]')).toHaveCount(2);

  await inspector.getByLabel("Shift dates by days").fill("3");
  await inspector.getByRole("button", { name: "Move" }).click();
  await expect(editor).toContainText("[Design] starts 2026-09-10");
  await expect(editor).toContainText("[Build] starts 2026-09-12");
  await expect(page.locator(".statusbar")).toContainText("Moved 2 tasks");

  await page.locator('[data-task-id="design"] .bar').focus();
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(editor).toContainText("[Design copy] starts 2026-09-10");
  await expect(editor).toContainText("[Build copy] starts 2026-09-12");
  await expect(inspector.getByText("2 tasks selected")).toBeVisible();

  await inspector.getByRole("button", { name: "Delete 2 tasks" }).click();
  await expect(editor).not.toContainText("copy");
  await expect(inspector).toHaveCount(0);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(editor).toContainText("[Design copy]");
});

test("drags all selected tasks together", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit automation does not preserve SVG pointer coordinates for task drags");
  await prepareEditor(page);
  await setSource(
    page,
    source("[Design] starts 2026-09-07\n[Design] lasts 2 days\n[Build] starts 2026-09-09\n[Build] lasts 3 days"),
  );
  const editor = page.locator(".cm-content");
  await page.locator('[data-task-id="design"] .bar').click();
  await page.locator('[data-task-id="build"] .bar').click({ modifiers: ["Shift"] });
  await expect(page.getByRole("complementary", { name: "Selected tasks inspector" })).toBeVisible();

  const first = await page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-07"]').boundingBox();
  const second = await page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-08"]').boundingBox();
  const bar = await page.locator('[data-task-id="build"] .bar').boundingBox();
  expect(first && second && bar).toBeTruthy();
  const dayPixels = Math.abs(second!.x - first!.x);
  await page.mouse.move(bar!.x + bar!.width / 2, bar!.y + bar!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar!.x + bar!.width / 2 + dayPixels * 2, bar!.y + bar!.height / 2, { steps: 5 });
  await expect(page.locator(".interaction-feedback")).toHaveText("Move 2 tasks +2 days");
  await page.mouse.up();

  await expect(editor).toContainText("[Design] starts 2026-09-09");
  await expect(editor).toContainText("[Build] starts 2026-09-11");
  await expect(page.getByRole("complementary", { name: "Selected tasks inspector" })).toBeVisible();
  await expect(page.locator('[data-task-id][data-selected="true"]')).toHaveCount(2);
});
