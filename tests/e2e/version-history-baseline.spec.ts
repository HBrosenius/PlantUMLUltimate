import { expect, test } from "@playwright/test";
import { fillSource, prepareEditor } from "./editor-helpers";
import { DEFAULT_SOURCE } from "../../apps/web/src/model";

const oneDependency = DEFAULT_SOURCE.replace("[Backend] starts 2026-09-05", "").replace(
  "\n@endgantt",
  "\n[Backend] starts at [Architecture]'s end\n@endgantt",
);
const twoDependencies = oneDependency
  .replace("[Frontend] starts 2026-09-05", "")
  .replace("\n@endgantt", "\n[Frontend] starts at [Backend]'s end\n@endgantt");
const movedDependentTask = twoDependencies.replace(
  "[Frontend] starts at [Backend]'s end",
  "[Frontend] starts 2 days after [Backend]'s end",
);

async function openHistory(page: Parameters<typeof prepareEditor>[0]) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  return page.getByRole("dialog", { name: "Version history" });
}

test("history captures the initial source before opening and classifies later dependencies", async ({ page }) => {
  await prepareEditor(page);

  await fillSource(page, oneDependency, "[Backend] starts at [Architecture]'s end");
  let history = await openHistory(page);
  await expect(history.getByText("Add dependency Architecture → Backend", { exact: true })).toBeVisible();
  await history.getByRole("button", { name: "Close version history" }).click();

  await fillSource(page, twoDependencies, "[Frontend] starts at [Backend]'s end");
  history = await openHistory(page);
  await expect(history.getByText("Add dependency Backend → Frontend", { exact: true })).toBeVisible();
  await expect(history.getByRole("checkbox", { name: "Select Add dependency Backend → Frontend" })).toBeEnabled();
  await history.getByRole("button", { name: "Close version history" }).click();

  await page.reload();
  await expect(page.locator(".cm-content")).toContainText("[Frontend] starts at [Backend]'s end");
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  if (await chooser.isVisible()) await chooser.getByRole("button", { name: "Cancel" }).click();

  await fillSource(page, movedDependentTask, "[Frontend] starts 2 days after [Backend]'s end");
  history = await openHistory(page);
  await expect(history.getByText("Move task Frontend relative to Backend", { exact: true })).toBeVisible();
  await expect(history).toContainText("The dependency offset changes from 0 to 2 days.");
});

test("undoing a Gantt change leaves no semantic change to review", async ({ page }) => {
  await prepareEditor(page);
  await page.locator('[data-task-id="architecture"] .bar').click();
  const handle = await page.locator('[data-task-id="architecture"] [data-dependency-handle="end"]').boundingBox();
  const target = await page.locator('[data-task-id="backend"] .bar').boundingBox();
  expect(handle).not.toBeNull();
  expect(target).not.toBeNull();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("[Backend] starts at [Architecture]'s end");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".cm-content")).toContainText("[Backend] starts 2026-09-05");

  const history = await openHistory(page);
  await expect(history.getByText("No changes between these versions.", { exact: true })).toBeVisible();
});
