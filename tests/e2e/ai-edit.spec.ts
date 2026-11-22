import { readFileSync } from "node:fs";
import { prepareEditor, readEditorSource, setSource } from "./editor-helpers";
import { expect, test, type Page } from "./coverage";
import { mockAnthropic, type MockReply } from "./ai-mock";

const KEY = "sk-ant-e2e-secret-key";
const ORIGINAL = [
  "@startuml",
  'participant "Web App" as Web',
  'participant "Order Service" as Orders',
  "Web -> Orders : Create order",
  "Orders --> Web : Order id",
  "@enduml",
].join("\n");
const WITH_TIMEOUT = [
  "@startuml",
  'participant "Web App" as Web',
  'participant "Order Service" as Orders',
  "alt in time",
  "Web -> Orders : Create order",
  "else timeout",
  "Orders --> Web : Timed out",
  "end",
  "Orders --> Web : Order id",
  "@enduml",
].join("\n");
const answer = (revisedSource: string, summary = "Added a timeout path.", questions: string[] = []): MockReply => ({
  answer: { revisedSource, summary, questions },
});

async function newSequence(page: Page) {
  await page.getByRole("button", { name: "New diagram tab" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await chooser.getByRole("button", { name: "Sequence diagram" }).click();
  await chooser.getByRole("button", { name: "Create diagram", exact: true }).click();
  await setSource(page, ORIGINAL);
}

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

async function askFromPalette(page: Page) {
  await page.getByRole("button", { name: "Commands", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByRole("combobox").fill("Ask AI");
  await palette.getByRole("option", { name: /Ask AI to change the selection/ }).click();
}

async function askFromMessage(page: Page) {
  await page.locator("[data-sequence-message-id]").first().click({ button: "right", force: true });
  await page.getByRole("menuitem", { name: "Ask AI to change this…" }).click();
}

const aiDialog = (page: Page) => page.getByRole("dialog", { name: "Ask AI to change the selection" });

test.beforeEach(async ({ page }) => {
  await prepareEditor(page);
  await newSequence(page);
});

test("adds a timeout path to a message from the right-click menu, applies it, and undoes it", async ({ page }) => {
  const requests = await mockAnthropic(page, [answer(WITH_TIMEOUT)]);
  await enableAi(page);
  await askFromMessage(page);
  const dialog = aiDialog(page);
  await expect(dialog.getByText("Selected lines 4–4")).toBeVisible();
  await dialog.getByLabel("Instruction", { exact: true }).fill("Add a timeout path to this call");
  await dialog.getByText("What will be sent").click();
  await expect(dialog.getByLabel("Document and instruction")).toContainText("[[[SELECTION_START]]]");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();

  const review = dialog.getByRole("region", { name: "Proposal review" });
  await expect(review).toBeVisible({ timeout: 45_000 });
  await expect(review.getByText("Added a timeout path.")).toBeVisible();
  await expect(review.getByRole("figure", { name: "After (proposal)" }).locator("svg")).toBeVisible({
    timeout: 45_000,
  });
  const apply = review.getByRole("button", { name: "Apply all changes" });
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(dialog).toBeHidden();
  expect(await readEditorSource(page)).toBe(WITH_TIMEOUT);

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).toBe(ORIGINAL);

  expect(requests).toHaveLength(1);
  expect(requests[0]!.body.fallbacks).toBe("default");
  expect(requests[0]!.body.output_config?.format?.type).toBe("json_schema");
  expect(requests[0]!.body.system[0]!.cache_control).toEqual({ type: "ephemeral" });
  expect(requests[0]!.body.messages[0]!.content).toContain("[[[SELECTION_START]]]\nWeb -> Orders : Create order");
  expect(JSON.stringify(requests[0]!.body)).not.toContain(KEY);
});

test("opens from the palette with the editor selection and keeps the key out of documents and backups", async ({
  page,
}) => {
  const requests = await mockAnthropic(page, [answer(WITH_TIMEOUT)]);
  await enableAi(page);
  await page.locator(".cm-line", { hasText: "Web -> Orders" }).click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await askFromPalette(page);
  const dialog = aiDialog(page);
  await expect(dialog.getByText("Selected lines 4–4")).toBeVisible();
  await dialog.getByLabel("Instruction", { exact: true }).fill("Add a timeout path");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Proposal review" })).toBeVisible({ timeout: 45_000 });
  expect(requests).toHaveLength(1);
  await dialog.getByRole("button", { name: "Discard", exact: true }).click();

  // The key appears in no document, storage area or backup.
  expect(await readEditorSource(page)).not.toContain(KEY);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toContain(KEY);
  await page.getByRole("button", { name: "Commands", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByRole("combobox").fill("Back up workspace");
  const downloading = page.waitForEvent("download");
  await palette.getByRole("option", { name: /Back up workspace/ }).click();
  const download = await downloading;
  expect(readFileSync(await download.path(), "utf8")).not.toContain(KEY);
});

test("shows questions, takes answers and resends", async ({ page }) => {
  const requests = await mockAnthropic(page, [answer("", "", ["Which service times out?"]), answer(WITH_TIMEOUT)]);
  await enableAi(page);
  await askFromMessage(page);
  const dialog = aiDialog(page);
  await dialog.getByLabel("Instruction", { exact: true }).fill("Add a timeout");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog.getByText("Which service times out?")).toBeVisible({ timeout: 30_000 });
  await dialog.getByLabel("Which service times out?").fill("Order Service");
  await dialog.getByRole("button", { name: "Send answers" }).click();
  await expect(dialog.getByRole("region", { name: "Proposal review" })).toBeVisible({ timeout: 45_000 });
  expect(requests).toHaveLength(2);
  expect(requests[1]!.body.messages[0]!.content).toContain("Q: Which service times out?\nA: Order Service");
});

test("rejects an invalid proposal and retries once with the problems fed back", async ({ page }) => {
  const broken = WITH_TIMEOUT.replace("\nend\n", "\n");
  const requests = await mockAnthropic(page, [answer(broken), answer(WITH_TIMEOUT)]);
  await enableAi(page);
  await askFromMessage(page);
  const dialog = aiDialog(page);
  await dialog.getByLabel("Instruction", { exact: true }).fill("Add a timeout path");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  const review = dialog.getByRole("region", { name: "Proposal review" });
  await expect(review).toBeVisible({ timeout: 45_000 });
  await expect(review.getByText("Passed the checks on the second attempt.")).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1]!.body.messages[0]!.content).toContain("Your previous answer had these problems");
  expect(await readEditorSource(page)).toBe(ORIGINAL);
});

test("shows a failure when both attempts are invalid and leaves the document alone", async ({ page }) => {
  const broken = WITH_TIMEOUT.replace("\nend\n", "\n");
  const requests = await mockAnthropic(page, [answer(broken)]);
  await enableAi(page);
  await askFromMessage(page);
  const dialog = aiDialog(page);
  await dialog.getByLabel("Instruction", { exact: true }).fill("Add a timeout path");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("adds", { timeout: 45_000 });
  await expect(dialog.getByRole("button", { name: "Edit instruction" })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(await readEditorSource(page)).toBe(ORIGINAL);
});

test("explains a refusal and applies nothing", async ({ page }) => {
  await mockAnthropic(page, [{ stopReason: "refusal", refusalExplanation: "Not allowed." }]);
  await enableAi(page);
  await askFromMessage(page);
  const dialog = aiDialog(page);
  await dialog.getByLabel("Instruction", { exact: true }).fill("Do something");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("declined this request", { timeout: 30_000 });
  expect(await readEditorSource(page)).toBe(ORIGINAL);
});

test("maps a rejected key to a plain message", async ({ page }) => {
  await mockAnthropic(page, [{ httpStatus: 401 }]);
  await enableAi(page);
  await askFromMessage(page);
  const dialog = aiDialog(page);
  await dialog.getByLabel("Instruction", { exact: true }).fill("Add a timeout");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("API key was not accepted", { timeout: 30_000 });
});

test("cancels a request in flight", async ({ page }) => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => (release = resolve));
  await mockAnthropic(page, [{ ...answer(WITH_TIMEOUT), hold }]);
  await enableAi(page);
  await askFromMessage(page);
  const dialog = aiDialog(page);
  await dialog.getByLabel("Instruction", { exact: true }).fill("Add a timeout");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Drafting");
  await dialog.getByRole("button", { name: "Cancel request" }).click();
  await expect(dialog.getByRole("button", { name: "Send", exact: true })).toBeVisible();
  release();
  expect(await readEditorSource(page)).toBe(ORIGINAL);
});

test("points to Settings when the assistant is off", async ({ page }) => {
  const requests = await mockAnthropic(page, [answer(WITH_TIMEOUT)]);
  await askFromPalette(page);
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(settings.getByText(/The AI assistant can propose changes/)).toBeVisible();
  await expect(aiDialog(page)).toHaveCount(0);
  expect(requests).toHaveLength(0);
});
