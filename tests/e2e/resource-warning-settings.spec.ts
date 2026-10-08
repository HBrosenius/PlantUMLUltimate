import { expect, test, type Page } from "@playwright/test";
import { prepareEditor, setSource, source } from "./editor-helpers";

async function settings(page: Page) {
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menu", { name: "More", exact: true }).getByRole("menuitem", { name: "Settings…" }).click();
  return page.getByRole("dialog", { name: "Settings", exact: true });
}

test("can suppress the allocation banner without hiding workload and restore it after reload", async ({ page }) => {
  await prepareEditor(page);
  await setSource(
    page,
    source(
      "[A] on {Team lead:100%} starts 2026-09-01\n[A] lasts 2 days\n[B] on {Team lead:100%} starts 2026-09-01\n[B] lasts 2 days",
    ),
  );
  const warning = page.getByRole("alert", { name: "Resource over-allocation" });
  await expect(warning).toBeVisible();
  let dialog = await settings(page);
  await dialog.getByRole("checkbox", { name: "Show resource over-allocation warnings" }).uncheck();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(warning).toBeVisible();
  dialog = await settings(page);
  await dialog.getByRole("checkbox", { name: "Show resource over-allocation warnings" }).uncheck();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(warning).toHaveCount(0);
  await page.getByRole("button", { name: "Workload", exact: true }).click();
  await expect(page.locator(".resource-card")).toContainText("Peak 200%");
  await expect(page.getByRole("spinbutton", { name: "Capacity for Team lead" })).toHaveValue("100");
  await page.getByRole("button", { name: "Close resource workload" }).click();
  await page.reload();
  await expect(page.locator(".cm-content")).toBeVisible();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  if (await chooser.isVisible()) await chooser.getByRole("button", { name: "Gantt diagram" }).click();
  await setSource(
    page,
    source(
      "[A] on {Team lead:100%} starts 2026-09-01\n[A] lasts 2 days\n[B] on {Team lead:100%} starts 2026-09-01\n[B] lasts 2 days",
    ),
  );
  dialog = await settings(page);
  await expect(dialog.getByRole("checkbox", { name: "Show resource over-allocation warnings" })).not.toBeChecked();
  await expect(warning).toHaveCount(0);
  await dialog.getByRole("checkbox", { name: "Show resource over-allocation warnings" }).check();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(warning).toBeVisible();
});
