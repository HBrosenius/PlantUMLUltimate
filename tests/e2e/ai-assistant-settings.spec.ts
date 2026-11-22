import { prepareEditor } from "./editor-helpers";
import { expect, test, type Page } from "./coverage";

async function aiSettings(page: Page) {
  await page.getByRole("button", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await dialog.getByRole("button", { name: "AI assistant", exact: true }).click();
  return dialog;
}

test("AI assistant is off by default, needs consent, and forgets the key on request", async ({ page }) => {
  await prepareEditor(page);
  let dialog = await aiSettings(page);
  await expect(dialog.getByText(/The AI assistant can propose changes/)).toBeVisible();
  await expect(dialog.getByLabel("Anthropic API key")).toHaveCount(0);
  await expect(dialog.getByRole("link", { name: "platform.claude.com" })).toHaveAttribute(
    "href",
    "https://platform.claude.com/",
  );
  await dialog.getByRole("button", { name: /turn on AI assistant/i }).click();
  await dialog.getByLabel("Model").selectOption("claude-sonnet-5-5");
  await dialog.getByLabel("Anthropic API key").fill("sk-ant-e2e-secret");
  await dialog.getByRole("button", { name: "Save key" }).click();
  await expect(dialog.getByRole("status")).toContainText("Key saved for this session.");
  await expect(dialog.getByLabel("Anthropic API key")).toHaveValue("");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();

  // The key stays in memory only: nothing in browser storage holds it.
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).not.toContain("sk-ant-e2e-secret");

  dialog = await aiSettings(page);
  await expect(dialog.getByLabel("Model")).toHaveValue("claude-sonnet-5-5");
  await dialog.getByRole("button", { name: "Forget key" }).click();
  await expect(dialog.getByRole("status")).toContainText("Key forgotten.");
});
