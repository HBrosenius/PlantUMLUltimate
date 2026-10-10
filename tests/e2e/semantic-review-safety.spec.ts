import { expect, test } from "@playwright/test";
import { fillSource, prepareEditor } from "./editor-helpers";

const before = "@startgantt\nProject starts 2026-10-02\n[Build] as [b] lasts 2 days\n@endgantt";
const after = before.replace("[Build]", "[Compile]").replace("2 days", "3 days");

test("reviews aliased task fields and applies a proposed edit with one-step undo", async ({ page }, testInfo) => {
  await prepareEditor(page);
  await fillSource(page, before, "[Build] as [b]");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  const dialog = page.getByRole("dialog", { name: "Version history" });
  await dialog
    .getByLabel("PlantUML comparison file")
    .setInputFiles({ name: "proposal.puml", mimeType: "text/plain", buffer: Buffer.from(after) });
  await dialog.getByText("Review task fields", { exact: true }).click();
  const table = dialog.getByRole("table", { name: "Changed fields for Compile" });
  await expect(table).toContainText("Build");
  await expect(table).toContainText("Compile");
  await expect(table).toContainText("3 days");
  await dialog.getByRole("checkbox", { name: "Select Rename task Build to Compile" }).check();
  if (testInfo.project.name === "chromium") {
    await page.screenshot({ path: "docs/audits/2026-10-10-a31/desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await table.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "docs/audits/2026-10-10-a31/phone.png" });
  }
  await dialog.getByRole("button", { name: "Apply selected (1)" }).click();
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("[Compile] as [b] lasts 3 days");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("[Build] as [b] lasts 2 days");
});

test("keeps mixed unsupported changes unclassified with source fallback", async ({ page }) => {
  await prepareEditor(page);
  await fillSource(page, before, "[Build] as [b]");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  const dialog = page.getByRole("dialog", { name: "Version history" });
  await dialog.getByLabel("PlantUML comparison file").setInputFiles({
    name: "unsupported.puml",
    mimeType: "text/plain",
    buffer: Buffer.from(after.replace("3 days", "3 days\ncustom unsupported statement")),
  });
  await expect(dialog.getByRole("checkbox", { name: "Select Unclassified source change" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Source", exact: true }).click();
  await expect(dialog).toContainText("custom unsupported statement");
});
