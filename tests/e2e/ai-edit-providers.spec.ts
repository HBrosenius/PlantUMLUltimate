import { readFileSync } from "node:fs";
import { prepareEditor, readEditorSource, setSource } from "./editor-helpers";
import { expect, test, type Page } from "./coverage";
import { mockAnthropic, mockOpenAi, mockXai, type MockReply, type ResponsesMockReply } from "./ai-mock";

const ANTHROPIC_KEY = "sk-ant-e2e-secret-key";
const OPENAI_KEY = "sk-proj-e2e-openai-secret";
const XAI_KEY = "xai-e2e-grok-secret";
const ALL_KEYS = [ANTHROPIC_KEY, OPENAI_KEY, XAI_KEY];

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
const answer = (revisedSource: string, summary = "Added a timeout path."): MockReply & ResponsesMockReply => ({
  answer: { revisedSource, summary, questions: [] },
});

type ProviderId = "anthropic" | "openai" | "xai";
const LABELS: Record<ProviderId, string> = { anthropic: "Anthropic", openai: "OpenAI", xai: "xAI" };

async function newSequence(page: Page) {
  await page.getByRole("button", { name: "New diagram tab" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await chooser.getByRole("button", { name: "Sequence diagram" }).click();
  await chooser.getByRole("button", { name: "Create diagram", exact: true }).click();
  await setSource(page, ORIGINAL);
}

async function openAiSettings(page: Page) {
  await page.getByRole("button", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await dialog.getByRole("button", { name: "AI assistant", exact: true }).click();
  return dialog;
}

/** Chooses a provider in Settings, consents to it, optionally picks a model, and saves its key. */
async function configure(page: Page, provider: ProviderId, key: string | undefined, model?: string) {
  const dialog = await openAiSettings(page);
  await dialog.getByLabel(/^Provider/).selectOption(provider);
  const consent = dialog.getByRole("button", { name: /^I understand, (turn on AI assistant|use .+)$/ });
  if (await consent.count()) await consent.click();
  if (model) await dialog.getByLabel(/^Model/).selectOption(model);
  if (key) {
    await dialog.getByLabel(`${LABELS[provider]} API key`).fill(key);
    await dialog.getByRole("button", { name: "Save key" }).click();
    await expect(dialog.getByRole("status")).toContainText("Key saved");
  }
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
}

async function askFromMessage(page: Page) {
  await page.locator("[data-sequence-message-id]").first().click({ button: "right", force: true });
  await page.getByRole("menuitem", { name: "Ask AI to change this…" }).click();
}

const aiDialog = (page: Page) => page.getByRole("dialog", { name: "Ask AI to change the selection" });

async function sendInstruction(page: Page, instruction = "Add a timeout path to this call") {
  await askFromMessage(page);
  const dialog = aiDialog(page);
  await dialog.getByLabel("Instruction", { exact: true }).fill(instruction);
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await prepareEditor(page);
  await newSequence(page);
});

test("OpenAI: proposes, reviews, applies and undoes a change, naming the provider and endpoint", async ({ page }) => {
  const requests = await mockOpenAi(page, [answer(WITH_TIMEOUT)]);
  await configure(page, "openai", OPENAI_KEY);
  const dialog = await sendInstruction(page);
  await expect(dialog.getByText("Model: OpenAI, GPT-6.2 Sol.")).toBeVisible();
  await dialog.getByText("What will be sent").click();
  await expect(dialog.getByText(/OpenAI \(api\.openai\.com\)/)).toBeVisible();
  await expect(dialog.getByText(/https:\/\/api\.openai\.com\/v1\/responses/).first()).toBeVisible();
  await expect(dialog.getByLabel("Document and instruction")).toContainText("[[[SELECTION_START]]]");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();

  const review = dialog.getByRole("region", { name: "Proposal review" });
  await expect(review).toBeVisible({ timeout: 45_000 });
  await expect(review.getByText("Added a timeout path.")).toBeVisible();
  await expect(dialog.getByText(/Used 1500 input and 300 output tokens \(about \$/)).toBeVisible();
  const apply = review.getByRole("button", { name: "Apply all changes" });
  await expect(apply).toBeEnabled({ timeout: 45_000 });
  await apply.click();
  await expect(dialog).toBeHidden();
  expect(await readEditorSource(page)).toBe(WITH_TIMEOUT);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).toBe(ORIGINAL);

  expect(requests).toHaveLength(1);
  const [sent] = requests;
  expect(sent!.body.model).toBe("gpt-6.2-sol");
  expect(sent!.body.store).toBe(false);
  expect(sent!.body.text.format).toMatchObject({ type: "json_schema", strict: true });
  expect(sent!.body.input).toContain("[[[SELECTION_START]]]\nWeb -> Orders : Create order");
  expect(sent!.headers.authorization).toBe(`Bearer ${OPENAI_KEY}`);
  expect(JSON.stringify(sent!.body)).not.toContain(OPENAI_KEY);
});

test("xAI: proposes and applies a change through the same review", async ({ page }) => {
  const requests = await mockXai(page, [answer(WITH_TIMEOUT)]);
  await configure(page, "xai", XAI_KEY);
  const dialog = await sendInstruction(page);
  await expect(dialog.getByText("Model: xAI, Grok 4.7.")).toBeVisible();
  await dialog.getByText("What will be sent").click();
  await expect(dialog.getByText(/xAI \(api\.x\.ai\)/)).toBeVisible();
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  const review = dialog.getByRole("region", { name: "Proposal review" });
  await expect(review).toBeVisible({ timeout: 45_000 });
  const apply = review.getByRole("button", { name: "Apply all changes" });
  await expect(apply).toBeEnabled({ timeout: 45_000 });
  await apply.click();
  await expect(dialog).toBeHidden();
  expect(await readEditorSource(page)).toBe(WITH_TIMEOUT);

  expect(requests).toHaveLength(1);
  expect(requests[0]!.body.model).toBe("grok-4.7");
  expect(requests[0]!.body.text.format).toMatchObject({ type: "json_schema", strict: true });
  expect(requests[0]!.headers.authorization).toBe(`Bearer ${XAI_KEY}`);
});

test("switching provider in Settings sends the next request to that provider with only its own key", async ({
  page,
}) => {
  const anthropic = await mockAnthropic(page, [answer(WITH_TIMEOUT)]);
  const openai = await mockOpenAi(page, [answer(WITH_TIMEOUT)]);
  const xai = await mockXai(page, [answer(WITH_TIMEOUT)]);
  await configure(page, "anthropic", ANTHROPIC_KEY);
  await configure(page, "openai", OPENAI_KEY);

  // OpenAI is chosen now: the request goes there and carries only the OpenAI key.
  let dialog = await sendInstruction(page);
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Proposal review" })).toBeVisible({ timeout: 45_000 });
  await dialog.getByRole("button", { name: "Discard", exact: true }).click();
  expect(openai).toHaveLength(1);
  expect(anthropic).toHaveLength(0);

  // Back to Anthropic: its key is still there and the OpenAI key is not used.
  await configure(page, "anthropic", undefined);
  dialog = await sendInstruction(page);
  await expect(dialog.getByText("Model: Anthropic, Claude Opus 5.5.")).toBeVisible();
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Proposal review" })).toBeVisible({ timeout: 45_000 });
  await dialog.getByRole("button", { name: "Discard", exact: true }).click();
  expect(anthropic).toHaveLength(1);
  expect(JSON.stringify(anthropic[0]!.headers)).toContain(ANTHROPIC_KEY);
  expect(JSON.stringify(anthropic[0])).not.toContain(OPENAI_KEY);
  expect(openai[0]!.headers.authorization).toBe(`Bearer ${OPENAI_KEY}`);
  expect(JSON.stringify(openai[0])).not.toContain(ANTHROPIC_KEY);

  // xAI has no key and no consent yet: Ask AI points to Settings and nothing is sent.
  await configure(page, "xai", undefined);
  await page.locator("[data-sequence-message-id]").first().click({ button: "right", force: true });
  await page.getByRole("menuitem", { name: "Ask AI to change this…" }).click();
  await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
  await expect(aiDialog(page)).toHaveCount(0);
  expect(xai).toHaveLength(0);
});

test("Settings shows each provider's own console link and consent text", async ({ page }) => {
  const dialog = await openAiSettings(page);
  const provider = dialog.getByLabel(/^Provider/);
  await expect(dialog.getByRole("link", { name: "platform.claude.com" })).toBeVisible();
  await provider.selectOption("openai");
  await expect(dialog.getByText(/OpenAI, through its API \(api\.openai\.com\)/)).toBeVisible();
  await expect(dialog.getByRole("link", { name: "platform.openai.com" })).toHaveAttribute(
    "href",
    "https://platform.openai.com/",
  );
  await provider.selectOption("xai");
  await expect(dialog.getByText(/xAI, through its API \(api\.x\.ai\)/)).toBeVisible();
  await expect(dialog.getByRole("link", { name: "console.x.ai" })).toHaveAttribute("href", "https://console.x.ai/");
  await dialog.getByRole("button", { name: /^I understand, turn on AI assistant$/ }).click();
  const model = dialog.getByLabel(/^Model/);
  await expect(model.locator("option")).toHaveText(["Grok 4.7", "Grok 4.3", "Custom model id…"]);
});

test("a custom model id is sent as typed and shown with tokens but no cost", async ({ page }) => {
  const requests = await mockOpenAi(page, [answer(WITH_TIMEOUT)]);
  const settings = await openAiSettings(page);
  await settings.getByLabel(/^Provider/).selectOption("openai");
  await settings.getByRole("button", { name: /^I understand, turn on AI assistant$/ }).click();
  await settings.getByLabel(/^Model/).selectOption({ label: "Custom model id…" });
  await settings.getByRole("textbox", { name: "Custom model id" }).fill("gpt-7-preview");
  await settings.getByLabel("OpenAI API key").fill(OPENAI_KEY);
  await settings.getByRole("button", { name: "Save key" }).click();
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();

  const dialog = await sendInstruction(page);
  await expect(dialog.getByText("Model: OpenAI, gpt-7-preview.")).toBeVisible();
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Proposal review" })).toBeVisible({ timeout: 45_000 });
  await expect(dialog.getByText("Used 1500 input and 300 output tokens.")).toBeVisible();
  expect(requests[0]!.body.model).toBe("gpt-7-preview");
});

test("OpenAI: explains a refusal and applies nothing", async ({ page }) => {
  await mockOpenAi(page, [{ refusal: "I can't help with that request." }]);
  await configure(page, "openai", OPENAI_KEY);
  const dialog = await sendInstruction(page, "Do something");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("declined this request: I can't help with that request.", {
    timeout: 30_000,
  });
  expect(await readEditorSource(page)).toBe(ORIGINAL);
});

test("OpenAI: a cut-off answer asks for fewer lines, and a rejected key gets a plain message", async ({ page }) => {
  await mockOpenAi(page, [{ ...answer(WITH_TIMEOUT), incompleteReason: "max_output_tokens" }, { httpStatus: 401 }]);
  await configure(page, "openai", OPENAI_KEY);
  const dialog = await sendInstruction(page);
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Select fewer lines", { timeout: 30_000 });
  await dialog.getByRole("button", { name: "Edit instruction" }).click();
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("API key was not accepted", { timeout: 30_000 });
  expect(await readEditorSource(page)).toBe(ORIGINAL);
});

test("xAI: a wrong key, which xAI answers with HTTP 400, gets the plain bad-key message", async ({ page }) => {
  await mockXai(page, [{ httpStatus: 400, httpMessage: "Incorrect API key provided: xai-e2e***" }]);
  await configure(page, "xai", XAI_KEY);
  const dialog = await sendInstruction(page);
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("API key was not accepted", { timeout: 30_000 });
});

test("xAI: cancels a request in flight", async ({ page }) => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => (release = resolve));
  await mockXai(page, [{ ...answer(WITH_TIMEOUT), hold }]);
  await configure(page, "xai", XAI_KEY);
  const dialog = await sendInstruction(page);
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Drafting");
  await dialog.getByRole("button", { name: "Cancel request" }).click();
  await expect(dialog.getByRole("button", { name: "Send", exact: true })).toBeVisible();
  release();
  expect(await readEditorSource(page)).toBe(ORIGINAL);
});

test("no provider's key reaches documents, backups, browser storage or other IndexedDB databases", async ({ page }) => {
  await mockAnthropic(page, [answer(WITH_TIMEOUT)]);
  await mockOpenAi(page, [answer(WITH_TIMEOUT)]);
  await mockXai(page, [answer(WITH_TIMEOUT)]);
  // Remember each key on this device so the dedicated database holds all three.
  for (const [provider, key] of [
    ["anthropic", ANTHROPIC_KEY],
    ["openai", OPENAI_KEY],
    ["xai", XAI_KEY],
  ] as const) {
    const dialog = await openAiSettings(page);
    await dialog.getByLabel(/^Provider/).selectOption(provider);
    const consent = dialog.getByRole("button", { name: /^I understand, (turn on AI assistant|use .+)$/ });
    if (await consent.count()) await consent.click();
    await dialog.getByLabel("Remember this key on this device").check();
    await dialog.getByLabel(`${LABELS[provider]} API key`).fill(key);
    await dialog.getByRole("button", { name: "Save key" }).click();
    await expect(dialog.getByRole("status")).toContainText("Key saved on this device.");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  const dialog = await sendInstruction(page);
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Proposal review" })).toBeVisible({ timeout: 45_000 });
  await dialog.getByRole("button", { name: "Discard", exact: true }).click();

  const source = await readEditorSource(page);
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  const otherDatabases = await page.evaluate(async () => {
    const chunks: string[] = [];
    for (const info of await indexedDB.databases()) {
      if (!info.name || info.name === "plantuml-studio-ai-assistant") continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open(info.name!);
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      for (const store of Array.from(db.objectStoreNames)) {
        chunks.push(
          await new Promise<string>((resolve) => {
            const all = db.transaction(store).objectStore(store).getAll();
            all.onsuccess = () => resolve(JSON.stringify(all.result));
            all.onerror = () => resolve("");
          }),
        );
      }
      db.close();
    }
    return chunks.join("\n");
  });
  await page.getByRole("button", { name: "Commands", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByRole("combobox").fill("Back up workspace");
  const downloading = page.waitForEvent("download");
  await palette.getByRole("option", { name: /Back up workspace/ }).click();
  const backup = readFileSync(await (await downloading).path(), "utf8");
  for (const key of ALL_KEYS) {
    expect(source).not.toContain(key);
    expect(storage).not.toContain(key);
    expect(otherDatabases).not.toContain(key);
    expect(backup).not.toContain(key);
  }
});
