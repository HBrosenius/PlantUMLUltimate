import { expect, test } from "@playwright/test";
import { fillSource, prepareEditor, readEditorSource } from "./editor-helpers";
test.use({ hasTouch: true });
const source =
  "@startgantt\n' Preserve this comment\nProject starts 2026-10-02\n[Build] as [b] on {Morgan:50%} lasts 2 days\n[Build] is 20% completed\n[Test] lasts 1 day\n[Test] starts at [b]'s end\n@endgantt";
async function phone(page: import("@playwright/test").Page) {
  await prepareEditor(page);
  await fillSource(page, source);
  await page.setViewportSize({ width: 390, height: 844 });
  return page.getByRole("region", { name: "Mobile task list" });
}
test("touch check-in stages progress/resources, fits a reduced viewport and supports undo/redo", async ({
  page,
}, info) => {
  const list = await phone(page);
  await expect(list).toBeVisible();
  await expect(page.locator(".cm-editor")).toHaveCount(0);
  if (info.project.name === "chromium")
    await page.screenshot({ path: "docs/audits/2026-10-10-a33/task-list-phone.png" });
  await list.getByRole("button", { name: "Open task Build" }).tap();
  const sheet = page.getByRole("dialog", { name: "Task check-in: Build" });
  await sheet.getByLabel("Progress (%)").fill("150");
  await expect(sheet.getByRole("button", { name: "Apply check-in" })).toBeDisabled();
  await sheet.getByLabel("Progress (%)").fill("60");
  await sheet.getByLabel("Name", { exact: true }).fill("Sam");
  await page.setViewportSize({ width: 390, height: 480 });
  await expect(sheet.getByRole("button", { name: "Apply check-in" })).toBeInViewport({ ratio: 1 });
  await expect(sheet.getByRole("button", { name: "Cancel" })).toBeInViewport({ ratio: 1 });
  if (info.project.name === "chromium")
    await page.screenshot({ path: "docs/audits/2026-10-10-a33/check-in-reduced-viewport.png" });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("Progress (%)")).toHaveValue("60");
  await expect(sheet.getByRole("button", { name: "Apply check-in" })).toBeInViewport({ ratio: 1 });
  await sheet.getByRole("button", { name: "Apply check-in" }).tap();
  await expect(sheet).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Code", exact: true }).tap();
  const edited = await readEditorSource(page);
  expect(edited).toContain("[Build] as [b] on {Sam:50%} lasts 2 days");
  expect(edited).toContain("60% completed");
  expect(edited).toContain("' Preserve this comment");
  expect(edited).toContain("[Test] starts at [b]'s end");
  await page.getByRole("button", { name: "Undo", exact: true }).tap();
  expect(await readEditorSource(page)).toBe(source);
  await page.getByRole("button", { name: "Redo", exact: true }).tap();
  expect(await readEditorSource(page)).toBe(edited);
  await page.getByRole("button", { name: "Task list", exact: true }).tap();
  await list.getByLabel("Task scope").selectOption("unassigned");
  await expect(list.getByRole("button", { name: "Open task Build" })).toHaveCount(0);
  await expect(list.getByRole("button", { name: "Open task Test" })).toBeVisible();
});
test("cancels check-in, reveals a task without opening its inspector and restores desktop layout", async ({ page }) => {
  const list = await phone(page);
  await list.getByRole("button", { name: "Open task Build" }).tap();
  let sheet = page.getByRole("dialog", { name: "Task check-in: Build" });
  await sheet.getByLabel("Progress (%)").fill("90");
  await sheet.getByRole("button", { name: "Cancel" }).tap();
  await expect(list.getByRole("button", { name: "Open task Build" })).toBeFocused();
  await list.getByRole("button", { name: "Open task Build" }).tap();
  sheet = page.getByRole("dialog", { name: "Task check-in: Build" });
  await sheet.getByRole("button", { name: "View on diagram" }).tap();
  await expect(page.locator(".diagram svg")).toBeVisible();
  await expect(page.locator(".task-inspector:visible")).toHaveCount(0);
  await page.getByRole("button", { name: "Task list", exact: true }).tap();
  await expect(list).toBeVisible();
  await page.getByRole("button", { name: "Code", exact: true }).tap();
  expect(await readEditorSource(page)).toBe(source);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole("button", { name: "Tasks", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Split", exact: true })).toHaveAttribute("aria-pressed", "true");
});
test("browses WBS hierarchy by touch and reveals a work package", async ({ page }, info) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "WBS diagram" })
    .click();
  const wbs = "@startwbs\n*(root) Project\n**(build) Build\n***(test) Test\n@endwbs";
  await fillSource(page, wbs);
  await page.setViewportSize({ width: 390, height: 844 });
  const list = page.getByRole("region", { name: "Mobile WBS list" });
  await list.getByRole("button", { name: "Open work package Build" }).tap();
  await page.getByRole("dialog").getByRole("button", { name: "Test", exact: true }).tap();
  const sheet = page.getByRole("dialog", { name: "Work package: Test" });
  if (info.project.name === "chromium")
    await page.screenshot({ path: "docs/audits/2026-10-10-a33/wbs-properties-phone.png" });
  await sheet.getByRole("button", { name: "Parent: Build" }).tap();
  await page
    .getByRole("dialog", { name: "Work package: Build" })
    .getByRole("button", { name: "View on diagram" })
    .tap();
  await expect(page.locator(".diagram svg")).toBeVisible();
  await expect(page.locator(".task-inspector:visible")).toHaveCount(0);
  await page.getByRole("button", { name: "WBS list", exact: true }).tap();
  await expect(list.getByRole("button", { name: "Open work package Test" })).toBeVisible();
  await page.getByRole("button", { name: "Code", exact: true }).tap();
  expect(await readEditorSource(page)).toBe(wbs);
});

test("supports dark appearance and keyboard navigation in the phone sheet", async ({ page }, info) => {
  const list = await phone(page);
  await page.getByRole("button", { name: "More", exact: true }).tap();
  await page.getByRole("menuitem", { name: "Settings…" }).tap();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings.getByLabel("Theme", { exact: true }).selectOption("dark");
  await settings.getByRole("button", { name: "Apply", exact: true }).tap();
  await list.getByRole("button", { name: "Open task Build" }).focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "Task check-in: Build" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveCSS("background-color", "rgb(25, 28, 35)");
  await sheet.getByRole("button", { name: "Cancel" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(sheet.getByRole("button", { name: "Apply check-in" })).not.toBeFocused();
  await expect(sheet.getByRole("button", { name: "View on diagram" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(sheet.getByRole("button", { name: "Cancel" })).toBeFocused();
  if (info.project.name === "chromium") await page.screenshot({ path: "docs/audits/2026-10-10-a33/check-in-dark.png" });
  await page.keyboard.press("Escape");
  await expect(list.getByRole("button", { name: "Open task Build" })).toBeFocused();
});

test("keeps sheet actions inside a zoomed visual viewport", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "CDP page-scale control is Chromium-only");
  const list = await phone(page);
  await list.getByRole("button", { name: "Open task Build" }).tap();
  const sheet = page.getByRole("dialog", { name: "Task check-in: Build" });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1.25 });
  await expect
    .poll(() =>
      sheet.getByRole("button", { name: "View on diagram" }).evaluate((element) => {
        const bounds = element.getBoundingClientRect(),
          viewport = window.visualViewport!;
        return (
          bounds.left >= viewport.offsetLeft &&
          bounds.right <= viewport.offsetLeft + viewport.width + 1 &&
          bounds.bottom <= viewport.offsetTop + viewport.height + 1
        );
      }),
    )
    .toBe(true);
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
});
