import { expect, test } from "@playwright/test";
import { PLANTUML_THEMES } from "../../apps/web/src/plantuml-theme";
import { prepareEditor, setSource, source } from "./editor-helpers";

test("keeps Gantt tasks interactive with every bundled theme", async ({ page }) => {
  await prepareEditor(page);
  const failures: string[] = [];
  for (const [index, theme] of PLANTUML_THEMES.entries()) {
    const label = `Theme task ${index}`;
    await setSource(page, source(`!theme ${theme}\n[${label}] starts 2026-09-01 and lasts 2 days\n[B] lasts 2 days`));
    try {
      const task = page.locator(`[data-task-id="${label.toLowerCase()}"]`);
      await expect(task).toBeVisible({ timeout: 3_000 });
      await task.locator(".bar").click();
      await expect(task).toHaveAttribute("data-selected", "true");
      await expect(task.locator("[data-dependency-handle]")).toHaveCount(2);
    } catch {
      failures.push(theme);
    }
  }
  expect(failures).toEqual([]);
});
