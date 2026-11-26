import { fitDiagram, prepareEditor, readEditorSource, setSource } from "./editor-helpers";
import { expect, test, type Page } from "./coverage";
import { mockAnthropic, type MockReply } from "./ai-mock";

// A fake key for the mocked provider: nothing here reaches a real API.
const KEY = "sk-ant-e2e-secret-key";
const ORIGINAL = `@startuml
!include <C4/C4_Container>
Person(customer, "Customer", "Buys products online")
System_Boundary(shop, "Web shop") {
  Container(web, "Web app", "React", "Shows the catalogue and the basket")
  Container(api, "API", "Java, Spring Boot", "Orders, payments and stock")
  ContainerDb(db, "Database", "PostgreSQL", "Orders and customers")
}
System_Ext(payments, "Payment provider", "Takes card payments")
Rel(customer, web, "Uses", "HTTPS")
Rel(web, api, "Calls", "JSON/HTTPS")
Rel(api, db, "Reads and writes", "SQL")
Rel(api, payments, "Takes payments", "HTTPS")
@enduml`;
const WITH_CACHE = ORIGINAL.replace(
  '  Container(api, "API", "Java, Spring Boot", "Orders, payments and stock")',
  '  Container(api, "API", "Java, Spring Boot", "Orders, payments and stock")\n  ContainerDb(cache, "Cache", "Redis", "Sessions")',
).replace(
  'Rel(api, db, "Reads and writes", "SQL")',
  'Rel(api, db, "Reads and writes", "SQL")\nRel(api, cache, "Caches sessions", "RESP")',
);

const answer = (revisedSource: string, summary = "Added a Redis cache used by the API."): MockReply => ({
  answer: { revisedSource, summary, questions: [] },
});
const aiDialog = (page: Page) => page.getByRole("dialog", { name: "Ask AI to change the selection" });
const hit = (page: Page, key: string) => page.locator(`.c4-semantic-hit[data-c4-object-id="${key}"]`);

async function openC4(page: Page) {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab", exact: true }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await chooser.getByRole("button", { name: "C4 diagram", exact: true }).click();
  await chooser.getByRole("button", { name: "Create diagram", exact: true }).click();
  await expect(chooser).toBeHidden();
  await setSource(page, ORIGINAL);
  await expect(hit(page, "api")).toBeAttached({ timeout: 45_000 });
  await fitDiagram(page);
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

async function send(page: Page, instruction: string) {
  const dialog = aiDialog(page);
  await dialog.getByLabel("Instruction", { exact: true }).fill(instruction);
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  const review = dialog.getByRole("region", { name: "Proposal review" });
  await expect(review).toBeVisible({ timeout: 45_000 });
  await expect(review.getByRole("figure", { name: "After (proposal)" }).locator("svg")).toBeVisible({
    timeout: 45_000,
  });
  return review;
}

test("changes a C4 container from its right-click menu, reviews C4 groups, applies and undoes", async ({ page }) => {
  test.setTimeout(150_000);
  await openC4(page);
  const requests = await mockAnthropic(page, [answer(WITH_CACHE)]);
  await enableAi(page);
  await hit(page, "api").click({ button: "right" });
  await page
    .getByRole("menu", { name: "Symbol actions" })
    .getByRole("menuitem", { name: "Ask AI to change this…" })
    .click();
  const dialog = aiDialog(page);
  await expect(dialog.getByText("Selected lines 6–6")).toBeVisible();

  const review = await send(page, "Add a Redis cache that the API uses for sessions");
  // The C4 review names elements and relationships, not lines.
  await expect(review.locator(".semantic-review-group").filter({ hasText: "cache" }).first()).toBeVisible();
  // The new relationship sits outside the selected line, so it must be confirmed first.
  await expect(review.getByText("Outside your selection").first()).toBeVisible();
  await review.getByLabel("I have reviewed the changes outside my selection.").check();
  await review.getByRole("button", { name: "Apply all changes" }).click();
  await expect(dialog).toBeHidden();
  expect(await readEditorSource(page)).toBe(WITH_CACHE);

  expect(requests).toHaveLength(1);
  expect(requests[0]!.body.system[0]!.text).toContain("C4 diagram rules");
  expect(requests[0]!.body.messages[0]!.content).toContain("Diagram type: c4");
  expect(requests[0]!.body.messages[0]!.content).toContain("[[[SELECTION_START]]]");
  expect(JSON.stringify(requests[0]!.body)).not.toContain(KEY);

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).toBe(ORIGINAL);
});

test("sends a whole boundary from the properties panel, and the toolbar has Ask AI", async ({ page }) => {
  test.setTimeout(150_000);
  await openC4(page);
  await mockAnthropic(page, [answer(WITH_CACHE)]);
  await enableAi(page);
  await expect(
    page.locator(".c4-preview .preview-tools").getByRole("button", { name: "Ask AI…", exact: true }),
  ).toBeVisible();
  await hit(page, "shop").click();
  await expect(page.getByText("Boundary inspector")).toBeVisible();
  await page.getByRole("button", { name: "Ask AI to change this…", exact: true }).click();
  // The boundary's whole block, from its opening line to its closing brace.
  await expect(aiDialog(page).getByText("Selected lines 4–8")).toBeVisible();
  await aiDialog(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(aiDialog(page)).toBeHidden();
});

test("retries once when a proposal breaks the C4 library's quote rule, and keeps the document unchanged", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await openC4(page);
  const broken = WITH_CACHE.replace('"Sessions"', '"The \\"session\\" store"');
  const requests = await mockAnthropic(page, [answer(broken), answer(WITH_CACHE)]);
  await enableAi(page);
  await hit(page, "api").click({ button: "right" });
  await page
    .getByRole("menu", { name: "Symbol actions" })
    .getByRole("menuitem", { name: "Ask AI to change this…" })
    .click();
  const review = await send(page, "Add a Redis cache that the API uses for sessions");
  expect(requests).toHaveLength(2);
  // The second request feeds the problem back to the model.
  expect(requests[1]!.body.messages[0]!.content).toMatch(/quote/i);
  await aiDialog(page).getByRole("button", { name: "Discard", exact: true }).click();
  await expect(review).toBeHidden();
  expect(await readEditorSource(page)).toBe(ORIGINAL);
});
