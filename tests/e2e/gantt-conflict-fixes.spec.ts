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
      for (const label of ["Total slack", "Free slack"]) {
        await expect(
          hover.locator("dl > div").filter({ has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) }),
        ).toContainText("Unavailable");
      }
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

test("distinguishes task and milestone slack units on a closed weekend", async ({ page }) => {
  await fillSource(
    page,
    "@startgantt\nProject starts 2026-09-21\nsaturday are closed\nsunday are closed\n[Build] starts 2026-09-25 and lasts 1 day\n[Release] happens 2026-09-26\n@endgantt",
  );
  await page.getByRole("button", { name: "Critical path", exact: true }).click();
  const report = page.locator(".critical-path-report");
  const milestone = report
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: "Release", exact: true }) });
  await expect(milestone).toContainText("Milestone (0 days)");
  await expect(milestone).toContainText("0 calendar days");
  const task = report.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Build", exact: true }) });
  await expect(task).toContainText("0 working days");
  await page.locator('.diagram [data-task-id="release"]').first().hover();
  const hover = page.getByLabel("Task details for Release");
  for (const label of ["Total slack", "Free slack"]) {
    await expect(
      hover.locator("dl > div").filter({ has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) }),
    ).toContainText("0 calendar days");
  }
});

test("shows a selectable critical chain through a linked milestone", async ({ page }) => {
  await fillSource(
    page,
    "@startgantt\nProject starts 2026-09-21\nsaturday are closed\nsunday are closed\n[Build] starts 2026-09-21 and lasts 5 days\n[Build] pauses on tuesday\n[Release] happens at [Build]'s end\n[Deploy] starts at [Release]'s end and lasts 2 days\n@endgantt",
  );
  await page.getByRole("button", { name: "Critical path", exact: true }).click();
  const row = page
    .locator(".critical-path-report")
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: "Build", exact: true }) });
  await expect(row).toContainText("Build → Release (milestone) → Deploy");
  await row.getByRole("button", { name: "Release (milestone)", exact: true }).click();
  await expect(page.locator('.diagram [data-task-id="release"]')).toHaveAttribute("data-selected", "true");
});

test("shows dates and slack for every task and highlights critical tasks", async ({ page }) => {
  await fillSource(
    page,
    [
      "@startgantt",
      "Project starts 2026-09-21",
      "saturday are closed",
      "sunday are closed",
      "[Architecture] starts 2026-09-24 and lasts 6 days",
      "[Backend] lasts 8 days",
      "[Frontend] lasts 10 days",
      "[Testing] lasts 5 days",
      "[Backend] starts at [Architecture]'s end",
      "[Frontend] starts 5 days after [Backend]'s end",
      "[Testing] starts 3 days after [Frontend]'s end",
      "@endgantt",
    ].join("\n"),
  );
  await page.getByRole("button", { name: "Critical path", exact: true }).click();
  const report = page.locator(".critical-path-report");
  for (const [name, duration, slack, critical] of [
    ["Architecture", 6, 1, false],
    ["Backend", 8, 1, false],
    ["Frontend", 10, 0, true],
    ["Testing", 5, 0, true],
  ] as const) {
    const row = report.getByRole("row").filter({ has: page.getByRole("rowheader", { name, exact: true }) });
    await expect(row).toHaveAttribute("data-critical", String(critical));
    await expect(row.getByRole("cell").nth(3)).toHaveText(`${duration} working days`);
    await expect(row.getByRole("cell").nth(4)).toHaveText(`${slack} working days`);
    await expect(row.getByRole("cell").nth(5)).toHaveText("0 working days");
  }
  const testing = report
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: "Testing", exact: true }) });
  await expect(testing.getByRole("cell").nth(2)).toHaveText("2026-11-06");
  await expect(testing.getByRole("cell").nth(6)).toHaveText("2026-11-02");
  await expect(testing.getByRole("cell").nth(7)).toHaveText("2026-11-06");
  const backend = report
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: "Backend", exact: true }) });
  await expect(backend.getByRole("cell").nth(6)).toHaveText("2026-10-05");
  await expect(backend.getByRole("cell").nth(7)).toHaveText("2026-10-14");
  await page.locator('.diagram [data-task-id="backend"] .bar').hover();
  const hover = page.getByLabel("Task details for Backend");
  await expect(
    hover.locator("dl > div").filter({ has: page.locator("dt", { hasText: /^Total slack$/ }) }),
  ).toContainText("1 working days");
  await expect(
    hover.locator("dl > div").filter({ has: page.locator("dt", { hasText: /^Free slack$/ }) }),
  ).toContainText("0 working days");
});
