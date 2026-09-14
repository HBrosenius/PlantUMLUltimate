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
  await expect(history.getByText("Add dependencies (2)", { exact: true })).toBeVisible();
  await expect(history.getByText("Unclassified source change", { exact: true })).toHaveCount(0);
});
