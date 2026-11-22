import { prepareEditor, readEditorSource, setSource } from "./editor-helpers";
import { expect, test, type Page } from "./coverage";
import { mockAnthropic, type MockReply } from "./ai-mock";

const KEY = "sk-ant-e2e-secret-key";
const ORIGINAL = [
  "@startgantt",
  "Project starts 2026-09-01",
  "[Design] lasts 5 days",
  "[Backend] starts at [Design]'s end",
  "[Backend] lasts 10 days",
  "[Testing] starts at [Backend]'s end",
  "[Testing] lasts 5 days",
  "@endgantt",
].join("\n");
const WITH_REVIEW = ORIGINAL.replace(
  "[Backend] lasts 10 days",
  "[Backend] lasts 10 days\n[Code review] starts at [Backend]'s end\n[Code review] lasts 2 days",
).replace("[Testing] starts at [Backend]'s end", "[Testing] starts at [Code review]'s end");
const answer = (revisedSource: string, summary = "Added a code review step."): MockReply => ({
  answer: { revisedSource, summary, questions: [] },
});
const aiDialog = (page: Page) => page.getByRole("dialog", { name: "Ask AI to change the selection" });

async function enableAi(page: Page) {
  await page.getByRole("button", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await dialog.getByRole("button", { name: "AI assistant", exact: true }).click();
  await dialog.getByRole("button", { name: /turn on AI assistant/i }).click();
  await dialog.getByLabel("Anthropic API key").fill(KEY);
  await dialog.getByRole("button", { name: "Save key" }).click();
  await expect(dialog.getByRole("status")).toContainText("Key saved");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
}

async function sendAndApply(page: Page, instruction: string) {
  const dialog = aiDialog(page);
  await dialog.getByLabel("Instruction", { exact: true }).fill(instruction);
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  const review = dialog.getByRole("region", { name: "Proposal review" });
  await expect(review).toBeVisible({ timeout: 45_000 });
  await expect(review.getByRole("figure", { name: "After (proposal)" }).locator("svg")).toBeVisible({
    timeout: 45_000,
  });
  // The change also edits the Testing line, which is outside the selection, so it must be confirmed.
  await expect(review.getByText("Outside your selection").first()).toBeVisible();
  await review.getByLabel("I have reviewed the changes outside my selection.").check();
  await review.getByRole("button", { name: "Apply all changes" }).click();
  await expect(dialog).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await prepareEditor(page);
  await setSource(page, ORIGINAL);
});

test("changes a Gantt task from its right-click menu, reviews the groups, applies and undoes", async ({ page }) => {
  const requests = await mockAnthropic(page, [answer(WITH_REVIEW)]);
  await enableAi(page);
  await page.locator("[data-task-id]").nth(1).click({ button: "right", force: true });
  await page.getByRole("menuitem", { name: "Ask AI to change this…" }).click();
  const dialog = aiDialog(page);
  await expect(dialog.getByText(/Selected lines \d+–\d+/)).toBeVisible();
  await sendAndApply(page, "Add a code review step after Backend");
  expect(await readEditorSource(page)).toBe(WITH_REVIEW);
  expect(requests).toHaveLength(1);
  expect(requests[0]!.body.system[0]!.text).toContain("Gantt diagram rules");
  expect(requests[0]!.body.messages[0]!.content).toContain("Diagram type: gantt");
  expect(requests[0]!.body.messages[0]!.content).toContain("[[[SELECTION_START]]]");

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).toBe(ORIGINAL);
});

test("starts from the Gantt task inspector and shows Gantt review details", async ({ page }) => {
  await mockAnthropic(page, [answer(WITH_REVIEW)]);
  await enableAi(page);
  await page.locator("[data-task-id]").nth(1).click({ force: true });
  await page.getByRole("button", { name: "Ask AI to change this task…" }).click();
  const dialog = aiDialog(page);
  await expect(dialog.getByText(/Selected lines \d+–\d+/)).toBeVisible();
  await dialog.getByLabel("Instruction", { exact: true }).fill("Add a code review step after Backend");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  const review = dialog.getByRole("region", { name: "Proposal review" });
  await expect(review).toBeVisible({ timeout: 45_000 });
  await expect(review.locator(".semantic-review-group").first()).toBeVisible();
  await expect(review.getByRole("figure", { name: "After (proposal)" }).locator("svg")).toBeVisible({
    timeout: 45_000,
  });
  // The change also edits the Testing line, which is outside the selection, so it must be confirmed.
  await expect(review.getByText("Outside your selection").first()).toBeVisible();
  await review.getByLabel("I have reviewed the changes outside my selection.").check();
  await review.getByRole("button", { name: "Apply all changes" }).click();
  await expect(dialog).toBeHidden();
  expect(await readEditorSource(page)).toBe(WITH_REVIEW);
});

test("asks the user a question before changing the plan, then proposes", async ({ page }) => {
  const requests = await mockAnthropic(page, [
    { answer: { revisedSource: "", summary: "", questions: ["How many days should the review take?"] } },
    answer(WITH_REVIEW),
  ]);
  await enableAi(page);
  await page.getByRole("button", { name: "Commands", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByRole("combobox").fill("Ask AI");
  await palette.getByRole("option", { name: /Ask AI to change the selection/ }).click();
  const dialog = aiDialog(page);
  await expect(dialog.getByText("No selection")).toBeVisible();
  await dialog.getByLabel("Instruction", { exact: true }).fill("Add a code review step after Backend");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog.getByText("How many days should the review take?")).toBeVisible({ timeout: 30_000 });
  await dialog.getByLabel("How many days should the review take?").fill("2");
  await dialog.getByRole("button", { name: "Send answers" }).click();
  await expect(dialog.getByRole("region", { name: "Proposal review" })).toBeVisible({ timeout: 45_000 });
  expect(requests).toHaveLength(2);
  expect(requests[1]!.body.messages[0]!.content).toContain("A: 2");
  expect(await readEditorSource(page)).toBe(ORIGINAL);
});
