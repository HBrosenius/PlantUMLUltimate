import { expect, test } from "@playwright/test";
import { fillSource, prepareEditor } from "./editor-helpers";

test.beforeEach(async ({ page }) => prepareEditor(page));

for (const label of ["Move fixed dates to satisfy dependency", "Let dependency determine start date"]) {
  for (const paused of [false, true]) {
    test(`${label} preserves the schedule and supports undo${paused ? " with weekday pauses" : ""}`, async ({
      page,
    }) => {
      const original = [
        "@startgantt",
        "Project starts 2026-09-21",
        "saturday are closed",
        "sunday are closed",
        "[Backend] starts 2026-09-25 and lasts 1 day",
        "[Frontend] starts 2026-09-24 and lasts 2 days and is 50% completed",
        "[Frontend] starts at [Backend]'s end",
        ...(paused ? ["[Frontend] pauses on tuesday"] : []),
        "@endgantt",
      ].join("\n");
      await fillSource(page, original);
      const frontendBar = page.locator('.diagram [data-task-id="frontend"] .bar');
      await expect(frontendBar).toBeVisible({ timeout: 20_000 });
      await frontendBar.hover();
      const hover = page.getByLabel("Task details for Frontend");
      await expect(hover).toContainText("Schedule unresolved:");
      await expect(hover).toContainText("conflicts with 'Backend'");
      await expect(hover).not.toContainText("→");
      await page.getByLabel("Show source fix suggestions").click();
      const choice = page.getByRole("button", { name: new RegExp(label) });
      await expect(choice.locator("code")).toContainText(
        label.startsWith("Move") ? "starts 2026-09-28" : "[Frontend] lasts 2 days",
      );
      await choice.click();
      const editor = page.locator(".cm-content");
      await expect(editor).toContainText("lasts 2 days and is 50% completed");
      await expect(editor).toContainText("[Frontend] starts at [Backend]'s end");
      await expect(page.getByLabel("Show source fix suggestions")).toBeHidden();
      await expect(page.locator('.diagram [data-task-id="frontend"] .bar')).toBeVisible({ timeout: 20_000 });
      await page.locator('.diagram [data-task-id="frontend"] .bar').hover();
      await expect(page.getByLabel("Task details for Frontend")).toContainText(
        `2026-09-28 → 2026-09-${paused ? "30" : "29"}`,
      );
      await page.getByRole("button", { name: "Critical path", exact: true }).click();
      const report = page.locator(".critical-path-report");
      await expect(report).toContainText(`Critical path · ${paused ? 6 : 5} days`);
      await expect(report).toContainText("Backend");
      await expect(report).toContainText("Frontend");
      await editor.press("ControlOrMeta+z");
      await expect.poll(() => editor.innerText()).toBe(original);
      await page.getByLabel("Show source fix suggestions").click();
      await expect(page.getByRole("button", { name: new RegExp(label) })).toBeVisible();
      await expect(report).toContainText("Critical path unavailable");
      const blocker = report.getByRole("button", { name: /Frontend:.*conflicts/ });
      await expect(blocker).toBeVisible();
      await blocker.click();
      await expect(page.locator('.diagram [data-task-id="frontend"]')).toHaveAttribute("data-selected", "true");
    });
  }
}
