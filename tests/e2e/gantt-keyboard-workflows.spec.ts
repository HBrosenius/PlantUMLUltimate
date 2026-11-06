import { expect, test, type Page } from "@playwright/test";
import { prepareEditor, fillSource, readEditorSource } from "./editor-helpers";

const plan = `@startgantt
Project starts 2026-11-02
saturday are closed
sunday are closed
[Research] as [research] lasts 4 days
[Design] as [design] lasts 3 days
[design] starts 2026-11-06
[Build] as [build] lasts 3 days
[build] starts 2026-11-13
[design] -> [build]
@endgantt`;

async function openTask(page: Page, id: string, key = "Enter") {
  await page.locator(`[data-task-id="${id}"][role="button"]`).first().press(key);
  await expect(page.getByRole("complementary", { name: "Task inspector" })).toBeVisible();
}

for (const key of ["Enter", " "]) {
  test(`${JSON.stringify(key)} opens a task without replacing its selected source`, async ({ page }) => {
    await prepareEditor(page);
    await fillSource(page, plan);
    await openTask(page, "design", key);
    await expect(page.getByLabel("Duration", { exact: true })).toHaveValue("3");
    await page.getByRole("button", { name: "Close task inspector" }).click();
    expect(await readEditorSource(page)).toBe(plan);
    await expect(page.getByText("Preview current", { exact: true })).toBeVisible();
  });
}

test("only-task and cascade moves preserve durations and undo as one edit", async ({ page }) => {
  await prepareEditor(page);
  await fillSource(page, plan);
  for (const policy of ["single", "cascade"]) {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Settings", exact: true })
      .getByRole("button", { name: "Gantt", exact: true })
      .click();
    await page.getByLabel("When moving tasks").selectOption(policy);
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await openTask(page, "build");
    expect(await readEditorSource(page)).toBe(plan);
    await page.getByRole("button", { name: "Close task inspector" }).click();
    await page.locator('[data-task-id="design"][role="button"]').first().press("Alt+ArrowRight");
    await expect
      .poll(() => readEditorSource(page))
      .toContain(`[build] starts ${policy === "single" ? "2026-11-13" : "2026-11-14"}`);
    await expect.poll(() => readEditorSource(page)).toContain("[Design] as [design] lasts 3 days");
    await expect(page.getByText("Preview current", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => readEditorSource(page)).toBe(plan);
  }
});

test("adding a second person keeps the task duration and valid source", async ({ page }) => {
  await prepareEditor(page);
  await fillSource(
    page,
    "@startgantt\nProject starts 2026-11-02\n[Backend] as [backend] on {Sam:50%} lasts 8 days\n@endgantt",
  );
  await openTask(page, "backend");
  const resources = page.locator(".task-inspector summary").filter({ hasText: "Resources" });
  if (!(await resources.evaluate((element) => element.parentElement?.hasAttribute("open")))) await resources.click();
  await page.getByRole("button", { name: "+ Add person", exact: true }).click();
  await page.getByLabel("Allocation for person", { exact: true }).fill("50");
  await page.getByLabel("Person name", { exact: true }).nth(1).fill("Alex");
  await page.getByLabel("Person name", { exact: true }).nth(1).press("Tab");
  await expect.poll(() => readEditorSource(page)).toContain("{Alex:50%}");
  await expect.poll(() => readEditorSource(page)).toContain("{Sam:50%}");
  await expect(page.getByLabel("Duration", { exact: true })).toHaveValue("8");
  await expect(page.getByText("Preview current", { exact: true })).toBeVisible();
});

test("deleting the middle of a rendered compact chain pins survivors and undo restores it", async ({ page }) => {
  const chain =
    "@startgantt\nProject starts 2026-11-02\nsaturday are closed\nsunday are closed\n[Analysis] as [a] lasts 2 days\n[Design] as [b] lasts 2 days\n[b] starts at [a]'s end\n[Build] as [c] lasts 3 days\n[c] starts at [b]'s end\n[Gate] as [gate] happens at [b]'s end\n[a] -> [b] -> [c]\n@endgantt";
  await prepareEditor(page);
  await fillSource(page, chain);
  await expect(page.getByText("Preview current", { exact: true })).toBeVisible();
  await openTask(page, "b");
  expect(await readEditorSource(page)).toBe(chain);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).toContain("[a] -> [c]");
  await expect.poll(() => readEditorSource(page)).not.toContain("[b]");
  await expect.poll(() => readEditorSource(page)).toContain("[c] starts 2026-11-06");
  await expect.poll(() => readEditorSource(page)).toContain("[Gate] as [gate] happens 2026-11-05");
  await expect(page.getByText("Preview current", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).toBe(chain);
  await expect(page.getByText("Preview current", { exact: true })).toBeVisible();
});
