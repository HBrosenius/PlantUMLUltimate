import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const source = (body: string) => `@startgantt\nProject starts 2026-09-01\n${body}\n@endgantt`;

async function setSource(page: Page, value: string) {
  const editor = page.locator(".cm-content");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await editor.fill(value);
    if ((await editor.innerText()) === value) break;
    await editor.fill("");
  }
  await expect.poll(() => page.locator(".cm-content").innerText()).toBe(value);
  await expect(page.locator(".diagram svg")).toBeVisible();
  await expect(page.locator(".diagram svg")).not.toContainText("Syntax Error");
}

async function openAddDialog(page: Page, item: "Task…" | "Milestone…" | "Divider…") {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menu", { name: "Add" }).getByRole("menuitem", { name: item }).click();
}

async function pointInText(page: Page, lineIndex: number, needle: string) {
  return page
    .locator(".cm-content .cm-line")
    .nth(lineIndex)
    .evaluate((line, searched) => {
      const fullText = line.textContent ?? "";
      const target = fullText.indexOf(searched);
      if (target < 0) throw new Error(`Could not find ${searched}`);
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let offset = target + Math.max(1, Math.floor(searched.length / 2));
      let node: Node | null = walker.nextNode();
      while (node) {
        const length = node.textContent?.length ?? 0;
        if (offset <= length) {
          const range = document.createRange();
          range.setStart(node, offset);
          range.setEnd(node, Math.min(length, offset + 1));
          const rect = range.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        offset -= length;
        node = walker.nextNode();
      }
      throw new Error(`Could not locate ${searched}`);
    }, needle);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await expect(chooser).toBeVisible();
  await expect(page.locator('iframe[title="Local PlantUML renderer"]')).toHaveCount(0);
  await chooser.getByRole("button", { name: "Gantt diagram" }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
});

test("shows the diagram splash after closing the final tab", async ({ page }) => {
  await page.getByRole("button", { name: "Close untitled.puml", exact: true }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await expect(chooser).toBeVisible();
  await chooser.getByRole("button", { name: "Sequence diagram" }).click();
  await expect(page.locator(".cm-content")).toContainText("@startuml");
  await expect(page.locator(".document-tabs > button:not(.new-tab)")).toHaveCount(1);
});

test("zooms with the mouse wheel and pans with the middle mouse button", async ({ page }) => {
  await setSource(page, source("[Large task] lasts 40 days"));
  const viewport = page.locator(".preview-viewport");
  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(0, -500);
  await expect(page.getByRole("button", { name: /Reset zoom/ })).not.toHaveText("100%");

  await viewport.evaluate((element) => {
    element.scrollLeft = 120;
  });
  const before = await viewport.evaluate((element) => element.scrollLeft);
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(box!.x + box!.width / 2 - 100, box!.y + box!.height / 2);
  await expect(viewport).toHaveClass(/diagram-pan-active/);
  await page.mouse.up({ button: "middle" });
  await expect(viewport).not.toHaveClass(/diagram-pan-active/);
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before);
});

test("keeps the split divider fixed while source selection highlights tasks", async ({ page }) => {
  await setSource(page, source("[Design] lasts 3 days\n[Build] starts at [Design]'s end and lasts 4 days"));
  const divider = page.getByRole("separator");
  const editor = page.locator(".cm-content");
  const initialX = (await divider.boundingBox())!.x;

  const designLine = (await editor.locator(".cm-line").nth(2).boundingBox())!;
  const buildLine = (await editor.locator(".cm-line").nth(3).boundingBox())!;
  await page.mouse.move(designLine.x + 4, designLine.y + designLine.height / 2);
  await page.mouse.down();
  await page.mouse.move(buildLine.x + Math.min(180, buildLine.width - 4), buildLine.y + buildLine.height / 2, {
    steps: 5,
  });
  await page.mouse.up();

  await expect(page.locator(".cm-selectionBackground").first()).toBeVisible();
  await expect(page.locator('[data-task-id="design"][data-selected="true"]')).toHaveCount(1);
  await expect(page.getByRole("complementary", { name: "Task inspector" })).toHaveCount(0);
  await expect.poll(async () => (await divider.boundingBox())!.x).toBeCloseTo(initialX, 0);

  await page.locator('[data-task-id="build"] .bar').click();
  await expect(page.getByRole("complementary", { name: "Task inspector" })).toBeVisible();
  await expect.poll(async () => (await divider.boundingBox())!.x).toBeCloseTo(initialX, 0);
});

test("highlights and renames task and person references from the editor", async ({ page }) => {
  await setSource(
    page,
    source("[Build] on {Alice} lasts 3 days\n[Test] on {Alice:50%} starts at [Build]'s end and lasts 2 days"),
  );

  const taskReference = await pointInText(page, 3, "Build");
  await page.mouse.click(taskReference.x, taskReference.y);
  await expect(page.locator(".cm-symbol-reference")).toHaveCount(2);
  await expect(page.locator(".cm-symbol-reference-active")).toHaveText("Build");
  await page.keyboard.press("F2");
  const taskRename = page.getByRole("dialog", { name: "Rename task" });
  await expect(taskRename).toContainText("2 semantic occurrences");
  await taskRename.getByLabel("New name").fill("Compile");
  await taskRename.getByRole("button", { name: "Rename" }).click();
  await expect(page.locator(".cm-content")).toContainText("[Compile] on {Alice}");
  await expect(page.locator(".cm-content")).toContainText("starts at [Compile]'s end");

  const personReference = await pointInText(page, 2, "Alice");
  await page.mouse.click(personReference.x, personReference.y);
  await expect(page.locator(".cm-symbol-reference")).toHaveCount(2);
  await page.mouse.click(personReference.x, personReference.y, { button: "right" });
  const symbolMenu = page.getByRole("menu", { name: "Symbol actions" });
  await expect(symbolMenu).toBeVisible();
  await symbolMenu.getByRole("menuitem", { name: "Rename…" }).click();
  const personRename = page.getByRole("dialog", { name: "Rename person" });
  await expect(personRename).toContainText("2 semantic occurrences");
  await personRename.getByLabel("New name").fill("Alicia");
  await personRename.getByRole("button", { name: "Rename" }).click();
  await expect(page.locator(".cm-content")).toContainText("{Alicia}");
  await expect(page.locator(".cm-content")).toContainText("{Alicia:50%}");
});

test("finds and navigates semantic task references", async ({ page }) => {
  await setSource(page, source("[Build] lasts 3 days\n[Test] starts at [Build]'s end and lasts 2 days"));
  const taskReference = await pointInText(page, 3, "Build");
  await page.mouse.click(taskReference.x, taskReference.y, { button: "right" });
  const symbolMenu = page.getByRole("menu", { name: "Symbol actions" });
  await expect(symbolMenu.getByRole("menuitem")).toHaveCount(5);
  await symbolMenu.getByRole("menuitem", { name: "Find references" }).click();

  const references = page.getByRole("complementary", { name: "References for Build" });
  await expect(references).toContainText("2 occurrences");
  await expect(references.getByRole("listitem")).toHaveCount(2);
  await expect(references.getByRole("listitem").first()).toContainText("Line 3 · declaration");
  await expect(references.getByRole("listitem").last()).toContainText("Line 4 · reference");
  await references.getByRole("listitem").first().click();
  await expect(page.locator(".statusbar")).toContainText("Ln 3");
  const referenceAgain = await pointInText(page, 3, "Build");
  await page.mouse.click(referenceAgain.x, referenceAgain.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Rename…" }).click();
  const rename = page.getByRole("dialog", { name: "Rename task" });
  await rename.getByLabel("New name").fill("Compile");
  await rename.getByText("Preview 2 edits").click();
  await expect(rename.locator(".rename-preview code")).toContainText([
    "[Build] lasts 3 days",
    "[Compile] lasts 3 days",
  ]);
  await rename.getByRole("button", { name: "Rename" }).click();
  const renamedReferences = page.getByRole("complementary", { name: "References for Compile" });
  await expect(renamedReferences).toContainText("2 occurrences");
  await renamedReferences.getByRole("button", { name: "Close references" }).click();

  const taskDeclaration = await pointInText(page, 2, "Compile");
  await page.mouse.click(taskDeclaration.x, taskDeclaration.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Next reference" }).click();
  await expect(page.locator(".statusbar")).toContainText("Ln 4");
});

test("opens semantic actions from a diagram task", async ({ page }) => {
  await setSource(page, source("[Build] lasts 3 days\n[Test] starts at [Build]'s end and lasts 2 days"));
  const task = page.locator('[data-task-id="build"]').first();
  await expect(task).toBeVisible();
  await task.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Symbol actions" });
  await expect(menu.getByRole("menuitem")).toHaveCount(5);
  await menu.getByRole("menuitem", { name: "Find references" }).click();
  const references = page.getByRole("complementary", { name: "References for Build" });
  await expect(references).toContainText("2 occurrences");
  await references.getByRole("button", { name: "Close references" }).click();

  await task.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Reveal declaration" }).click();
  await expect(page.locator(".statusbar")).toContainText("Ln 3");

  await task.focus();
  await page.keyboard.press("Shift+F10");
  await menu.getByRole("menuitem", { name: "Rename…" }).click();
  const rename = page.getByRole("dialog", { name: "Rename task" });
  await rename.getByLabel("New name").fill("Compile");
  await rename.getByRole("button", { name: "Rename" }).click();
  await expect(page.locator(".cm-content")).toContainText("[Compile] lasts 3 days");
  await expect(page.locator(".cm-content")).toContainText("[Compile]'s end");
});

test("shows Sequence diagrams without a Beta badge", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  const sequenceChoice = chooser.getByRole("button", { name: "Sequence diagram" });
  await expect(sequenceChoice).toBeVisible();
  await expect(sequenceChoice.getByText("Beta", { exact: true })).toHaveCount(0);
});

test("highlights, finds, and renames Sequence participant references", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram" })
    .click();
  await setSource(
    page,
    '@startuml\nactor "API User" as User\ndatabase Store\nUser -> Store: User requests data\nactivate User\nnote right of User: User is waiting\n@enduml',
  );

  const aliasReference = await pointInText(page, 3, "User");
  await page.mouse.click(aliasReference.x, aliasReference.y);
  await expect(page.locator(".cm-symbol-reference")).toHaveCount(5);
  await expect(page.getByRole("complementary", { name: "Participant inspector" })).toHaveCount(0);

  await page.mouse.click(aliasReference.x, aliasReference.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Find references" }).click();
  const references = page.getByRole("complementary", { name: "References for User" });
  await expect(references).toContainText("5 occurrences");
  await references.getByRole("button", { name: "Close references" }).click();

  await page.mouse.click(aliasReference.x, aliasReference.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Rename…" }).click();
  const rename = page.getByRole("dialog", { name: "Rename participant alias" });
  await expect(rename).toContainText("4 semantic occurrences");
  await rename.getByLabel("New name").fill("Client");
  await rename.getByRole("button", { name: "Rename" }).click();
  await expect(page.locator(".cm-content")).toContainText('actor "API User" as Client');
  await expect(page.locator(".cm-content")).toContainText("Client -> Store: User requests data");
  await expect(page.locator(".cm-content")).toContainText("note right of Client: User is waiting");
});

test("highlights, finds, and renames Use Case actor references", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Use Case diagram" })
    .click();
  await setSource(
    page,
    '@startuml\nactor "Customer" as C\nusecase "Place order" as Order\nC --> Order : Customer places Order\nnote right of C : Customer note\n@enduml',
  );

  const actorReference = await pointInText(page, 3, "C");
  await page.mouse.click(actorReference.x, actorReference.y);
  await expect(page.locator(".cm-symbol-reference")).toHaveCount(4);
  await expect(page.getByRole("complementary", { name: "Use Case object inspector" })).toHaveCount(0);

  await page.mouse.click(actorReference.x, actorReference.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Find references" }).click();
  const references = page.getByRole("complementary", { name: "References for C" });
  await expect(references).toContainText("4 occurrences");
  await references.getByRole("button", { name: "Close references" }).click();

  await page.mouse.click(actorReference.x, actorReference.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Rename…" }).click();
  const rename = page.getByRole("dialog", { name: "Rename actor alias" });
  await expect(rename).toContainText("3 semantic occurrences");
  await rename.getByLabel("New name").fill("order");
  await expect(rename.getByRole("alert")).toHaveText("Alias “order” is already used");
  await expect(rename.getByRole("button", { name: "Rename" })).toBeDisabled();
  await rename.getByLabel("New name").fill("Buyer Alias");
  await expect(rename.getByRole("alert")).toContainText("Alias can only contain");
  await expect(rename.getByRole("button", { name: "Rename" })).toBeDisabled();
  await rename.getByLabel("New name").fill("Buyer");
  await expect(rename.getByRole("alert")).toHaveCount(0);
  await rename.getByRole("button", { name: "Rename" }).click();
  await expect(page.locator(".cm-content")).toContainText('actor "Customer" as Buyer');
  await expect(page.locator(".cm-content")).toContainText("Buyer --> Order : Customer places Order");
  await expect(page.locator(".cm-content")).toContainText("note right of Buyer : Customer note");
});

test("highlights, finds, and renames Class entity references", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: /Class diagram/ })
    .click();
  await setSource(
    page,
    '@startuml\nclass "Customer account" as Account {\n  +owner: Account\n}\ninterface Customer\nAccount --> Customer : Account serves Customer\nnote right of Account : Account note\n@enduml',
  );

  const entityReference = await pointInText(page, 5, "Account");
  await page.mouse.click(entityReference.x, entityReference.y);
  await expect(page.locator(".cm-symbol-reference")).toHaveCount(4);
  await expect(page.getByRole("complementary", { name: "Class object inspector" })).toHaveCount(0);

  await page.mouse.click(entityReference.x, entityReference.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Find references" }).click();
  const references = page.getByRole("complementary", { name: "References for Account" });
  await expect(references).toContainText("4 occurrences");
  await references.getByRole("button", { name: "Close references" }).click();

  await page.mouse.click(entityReference.x, entityReference.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Rename…" }).click();
  const rename = page.getByRole("dialog", { name: "Rename class entity alias" });
  await expect(rename).toContainText("3 semantic occurrences");
  await rename.getByLabel("New name").fill("Profile");
  await rename.getByRole("button", { name: "Rename" }).click();
  await expect(page.locator(".cm-content")).toContainText('class "Customer account" as Profile');
  await expect(page.locator(".cm-content")).toContainText("+owner: Account");
  await expect(page.locator(".cm-content")).toContainText("Profile --> Customer : Account serves Customer");
  await expect(page.locator(".cm-content")).toContainText("note right of Profile : Account note");
});

test("edits structured Class members and reveals rendered members", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: /Class diagram/ })
    .click();
  await setSource(
    page,
    "@startuml\nclass Account {\n  -id: UUID\n  {static} +open(owner: User): Account\n  custom member syntax\n}\n@enduml",
  );

  const renderedMember = page.locator('[data-class-member-id="account:member-0"]');
  await expect(renderedMember).toBeVisible({ timeout: 20_000 });
  const methodSource = await pointInText(page, 3, "open");
  await page.mouse.click(methodSource.x, methodSource.y);
  await expect(page.locator('[data-class-member-id="account:member-1"].class-selected-object')).toBeVisible();
  await renderedMember.click({ button: "right" });
  const actions = page.getByRole("menu", { name: "Class member actions" });
  await expect(actions.getByRole("menuitem")).toHaveCount(2);
  await actions.getByRole("menuitem", { name: "Reveal in code" }).click();
  await expect(page.locator(".statusbar")).toContainText("Ln 3");

  await renderedMember.click();
  const inspector = page.getByRole("complementary", { name: "Class object inspector" });
  const firstMember = inspector.getByRole("listitem").first();
  await expect(firstMember.getByLabel("Member name")).toHaveValue("id");
  await expect(firstMember.getByLabel("Member type")).toHaveValue("UUID");
  await firstMember.getByLabel("Member name").fill("identifier");
  await firstMember.getByLabel("Member name").blur();
  await expect(page.locator(".cm-content")).toContainText("-identifier: UUID");
  await expect(page.locator(".cm-content")).toContainText("custom member syntax");

  await inspector.getByLabel("New member kind").selectOption("method");
  await inspector.getByLabel("New member name").fill("close");
  await inspector.getByLabel("New member type").fill("void");
  await inspector.getByRole("button", { name: "Add member" }).click();
  await expect(page.locator(".cm-content")).toContainText("close(): void");
});

test("shows parser problems and applies a safe quick fix", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: /Class diagram/ })
    .click();
  const editor = page.locator(".cm-content");
  await editor.fill("@startuml\nclass Order {\n  +id: UUID\n@enduml");

  const problemCount = page.getByRole("button", { name: "⚠ 1 problem" });
  await expect(problemCount).toBeVisible();
  await problemCount.click();
  const problems = page.getByRole("complementary", { name: "Problems" });
  await expect(problems.getByRole("listitem")).toContainText("missing }");
  await problems.getByRole("listitem").click();
  await expect(page.locator(".statusbar")).toContainText("Ln 2");
  await problems.getByRole("button", { name: "Close class member block" }).click();
  await expect.poll(() => editor.innerText()).toContain("+id: UUID\n}\n@enduml");
  await expect(problemCount).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText(/Close class member block|✓ Valid/);
});

test("rejects an invalid visual edit without adding it to undo history", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Use Case diagram" })
    .click();
  const original = '@startuml\nactor "Alpha" as A\nusecase "Beta" as B\n@enduml';
  await setSource(page, original);

  await page.locator('[data-usecase-object-id="a"]').first().dispatchEvent("click");
  const inspector = page.getByRole("complementary", { name: "Use Case object inspector" });
  await expect(inspector).toBeVisible();
  await inspector.getByLabel("Alias").fill("B");
  await inspector.getByLabel("Alias").blur();

  const problems = page.getByRole("complementary", { name: "Problems" });
  await expect(problems).toBeVisible();
  await expect(problems).toContainText("Duplicate alias: B");
  await expect(problems).toContainText("The operation would introduce duplicate alias: b");
  await expect.poll(() => page.locator(".cm-content").innerText()).toBe(original);
  await expect(page.locator(".statusbar").getByRole("status")).toContainText("Cancelled update actor alpha");

  await problems.getByRole("button", { name: "Close problems" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => page.locator(".cm-content").innerText()).not.toBe(original);
});

test("highlights and renames distinct Activity actions and partitions", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: /Activity diagram/ })
    .click();
  await setSource(
    page,
    '@startuml\npartition "Operations" {\n:Review order;\nnote right\nReview order note\nend note\n:Review order;\n}\n@enduml',
  );

  const action = await pointInText(page, 2, "Review order");
  await page.mouse.click(action.x, action.y);
  await expect(page.locator(".cm-symbol-reference")).toHaveCount(1);
  await expect(page.getByRole("complementary", { name: "Activity action inspector" })).toHaveCount(0);
  await page.mouse.click(action.x, action.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Find references" }).click();
  const references = page.getByRole("complementary", { name: "References for Review order" });
  await expect(references).toContainText("1 occurrence");
  await references.getByRole("button", { name: "Close references" }).click();

  await page.mouse.click(action.x, action.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Rename…" }).click();
  const actionRename = page.getByRole("dialog", { name: "Rename activity action" });
  await actionRename.getByLabel("New name").fill("Approve order");
  await actionRename.getByRole("button", { name: "Rename" }).click();
  await expect(page.locator(".cm-content")).toContainText(":Approve order;");
  await expect(page.locator(".cm-content")).toContainText("Review order note");
  await expect
    .poll(async () => ((await page.locator(".cm-content").innerText()).match(/:Review order;/g) ?? []).length)
    .toBe(1);

  const partition = await pointInText(page, 1, "Operations");
  await page.mouse.click(partition.x, partition.y);
  await page.keyboard.press("F2");
  const partitionRename = page.getByRole("dialog", { name: "Rename activity partition" });
  await partitionRename.getByLabel("New name").fill("Fulfilment");
  await partitionRename.getByRole("button", { name: "Rename" }).click();
  await expect(page.locator(".cm-content")).toContainText('partition "Fulfilment"');
});

test("highlights, finds, and renames WBS node aliases", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "WBS diagram" })
    .click();
  await setSource(
    page,
    "@startwbs\n*(project) Project\n**(plan) Plan\n**(deliver) Deliver\nplan -> deliver #Blue\n@endwbs",
  );

  const aliasReference = await pointInText(page, 4, "plan");
  await page.mouse.click(aliasReference.x, aliasReference.y);
  await expect(page.locator(".cm-symbol-reference")).toHaveCount(3);
  await expect(page.getByRole("complementary", { name: "WBS node inspector" })).toHaveCount(0);
  await page.mouse.click(aliasReference.x, aliasReference.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Find references" }).click();
  const references = page.getByRole("complementary", { name: "References for plan" });
  await expect(references).toContainText("3 occurrences");
  await references.getByRole("button", { name: "Close references" }).click();

  await page.mouse.click(aliasReference.x, aliasReference.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Rename…" }).click();
  const rename = page.getByRole("dialog", { name: "Rename WBS node alias" });
  await expect(rename).toContainText("2 semantic occurrences");
  await rename.getByLabel("New name").fill("planning");
  await rename.getByRole("button", { name: "Rename" }).click();
  await expect(page.locator(".cm-content")).toContainText("**(planning) Plan");
  await expect(page.locator(".cm-content")).toContainText("planning -> deliver #Blue");
});

test("creates and visually edits a WBS diagram", async ({ page, browserName }) => {
  test.skip(
    browserName === "webkit",
    "WebKit automation does not preserve SVG pointer identity across compound WBS drags",
  );
  test.setTimeout(60_000);
  await page.getByRole("button", { name: "New document tab" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  const choice = chooser.getByRole("button", { name: "WBS diagram" });
  await expect(choice.getByText("Beta", { exact: true })).toBeVisible();
  await choice.click();
  await expect(page.getByRole("region", { name: "WBS diagram preview" })).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText("@startwbs");
  await expect(page.locator(".wbs-diagram svg")).toBeVisible({ timeout: 20_000 });
  const design = page.locator("[data-wbs-node-id]").filter({ hasText: "Design" }).first();
  await expect(design).toBeVisible();
  await design.focus();
  await page.keyboard.press("Enter");
  const inspector = page.getByRole("complementary", { name: "WBS node inspector" });
  await inspector.getByLabel("Label").fill("Experience design");
  await inspector.getByLabel("Background color").fill("LightBlue");
  await inspector.getByLabel("Text color").fill("DarkBlue");
  await inspector.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("**[#LightBlue] <color:#DarkBlue>Experience design</color>");
  const movedDesign = page.locator("text[data-wbs-node-id]", { hasText: "Experience design" }).first();
  const discovery = page.locator("text[data-wbs-node-id]", { hasText: "Discovery" }).first();
  const from = await movedDesign.boundingBox();
  const to = await discovery.boundingBox();
  expect(from).not.toBeNull();
  expect(to).not.toBeNull();
  await page.keyboard.down("Shift");
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 8 });
  await expect(page.locator(".wbs-drag-preview")).toContainText("Experience design");
  await expect(page.locator(".wbs-drag-preview")).toContainText("Place before Discovery");
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect
    .poll(() => page.locator(".cm-content").innerText())
    .toMatch(/\*\*\[#LightBlue\] <color:#DarkBlue>Experience design<\/color>[\s\S]*\*\* Discovery/);
  const wbsPreview = page.getByRole("region", { name: "WBS diagram preview" });
  await expect(wbsPreview).toHaveAttribute("data-render-status", "idle");
  const delivery = page.locator("text[data-wbs-node-id]", { hasText: "Delivery" }).first();
  const newParent = page.locator("text[data-wbs-node-id]", { hasText: "Discovery" }).first();
  const deliveryBox = await delivery.boundingBox();
  const parentBox = await newParent.boundingBox();
  expect(deliveryBox).not.toBeNull();
  expect(parentBox).not.toBeNull();
  await page.mouse.move(deliveryBox!.x + deliveryBox!.width / 2, deliveryBox!.y + deliveryBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(parentBox!.x + parentBox!.width / 2, parentBox!.y + parentBox!.height / 2, { steps: 8 });
  await expect(page.locator(".wbs-drag-preview")).toContainText("Move inside Discovery");
  await page.mouse.up();
  await expect.poll(() => page.locator(".cm-content").innerText()).toMatch(/\*\* Discovery[\s\S]*\*\*\* Delivery/);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "WBS node…" }).click();
  const add = page.getByRole("dialog", { name: "Add WBS node" });
  await add.getByLabel("Label").fill("Operations");
  await add.getByLabel("Position").selectOption("child");
  await add.getByRole("button", { name: "Add node" }).click();
  await expect(page.locator(".cm-content")).toContainText("Operations");
  await expect(wbsPreview).toHaveAttribute("data-render-status", "idle");
  const connectionSource = page.locator("text[data-wbs-node-id]", { hasText: "Discovery" }).first();
  await connectionSource.focus();
  await page.keyboard.press("Enter");
  const connectHandle = page.locator('[aria-label="Drag to connect Discovery"]');
  const connectFrom = await connectHandle.boundingBox();
  const connectTo = await page
    .locator("text[data-wbs-node-id]", { hasText: "Experience design" })
    .first()
    .boundingBox();
  expect(connectFrom).not.toBeNull();
  expect(connectTo).not.toBeNull();
  await page.mouse.move(connectFrom!.x + connectFrom!.width / 2, connectFrom!.y + connectFrom!.height / 2);
  await page.mouse.down();
  await page.mouse.move(connectTo!.x + connectTo!.width / 2, connectTo!.y + connectTo!.height / 2, { steps: 8 });
  await expect(page.locator(".wbs-connection-preview")).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("discovery -> experience_design");
  await expect(wbsPreview).toHaveAttribute("data-render-status", "idle");
  await expect(page.locator(".wbs-diagram svg")).not.toContainText("Syntax Error");
  const secondSource = page.locator("text[data-wbs-node-id]", { hasText: "Delivery" }).first();
  await secondSource.focus();
  await page.keyboard.press("Enter");
  const secondHandle = page.locator('[aria-label="Drag to connect Delivery"]');
  await expect(secondHandle).toHaveCount(1);
  const secondFrom = await secondHandle.boundingBox();
  const secondTo = await page.locator("text[data-wbs-node-id]", { hasText: "Experience design" }).first().boundingBox();
  expect(secondFrom).not.toBeNull();
  expect(secondTo).not.toBeNull();
  await page.mouse.move(secondFrom!.x + secondFrom!.width / 2, secondFrom!.y + secondFrom!.height / 2);
  await page.mouse.down();
  await page.mouse.move(secondTo!.x + secondTo!.width / 2, secondTo!.y + secondTo!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("delivery -> experience_design");
  await expect(wbsPreview).toHaveAttribute("data-render-status", "idle");
  await expect(page.locator(".wbs-relationship-hit")).toHaveCount(2);
  const firstArrow = page.getByRole("button", { name: "Select WBS arrow from discovery to experience_design" });
  await firstArrow.focus();
  await page.keyboard.press("Enter");
  const arrowInspector = page.getByRole("complementary", { name: "WBS arrow inspector" });
  await expect(page.locator(".wbs-relationship-endpoint")).toHaveCount(2);
  const fromEndpoint = page.getByRole("button", { name: "Drag from end of WBS arrow" });
  const stationaryToX = await page.getByRole("button", { name: "Drag to end of WBS arrow" }).getAttribute("cx");
  const stationaryToY = await page.getByRole("button", { name: "Drag to end of WBS arrow" }).getAttribute("cy");
  const fromEndpointBox = await fromEndpoint.boundingBox();
  const operationsTarget = await page
    .locator("text[data-wbs-node-id]", { hasText: "Operations" })
    .first()
    .boundingBox();
  expect(fromEndpointBox).not.toBeNull();
  expect(operationsTarget).not.toBeNull();
  await page.mouse.move(
    fromEndpointBox!.x + fromEndpointBox!.width / 2,
    fromEndpointBox!.y + fromEndpointBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    operationsTarget!.x + operationsTarget!.width / 2,
    operationsTarget!.y + operationsTarget!.height / 2,
    { steps: 8 },
  );
  await expect(page.locator(".wbs-connection-preview")).toHaveAttribute("x1", stationaryToX!);
  await expect(page.locator(".wbs-connection-preview")).toHaveAttribute("y1", stationaryToY!);
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("operations -> experience_design");
  await expect(wbsPreview).toHaveAttribute("data-render-status", "idle");
  const toEndpoint = page.getByRole("button", { name: "Drag to end of WBS arrow" });
  const toEndpointBox = await toEndpoint.boundingBox();
  const deliveryTarget = await page.locator("text[data-wbs-node-id]", { hasText: "Delivery" }).first().boundingBox();
  expect(toEndpointBox).not.toBeNull();
  expect(deliveryTarget).not.toBeNull();
  await page.mouse.move(toEndpointBox!.x + toEndpointBox!.width / 2, toEndpointBox!.y + toEndpointBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(deliveryTarget!.x + deliveryTarget!.width / 2, deliveryTarget!.y + deliveryTarget!.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("operations -> delivery");
  await expect(wbsPreview).toHaveAttribute("data-render-status", "idle");
  await arrowInspector.getByLabel("Arrow color").fill("DarkGreen");
  await arrowInspector.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("operations -> delivery #DarkGreen");
  await arrowInspector.getByRole("button", { name: "Delete arrow" }).click();
  await expect(page.locator(".cm-content")).not.toContainText("operations -> delivery");
  await expect(page.locator(".cm-content")).toContainText("delivery -> experience_design");
  await page.getByRole("button", { name: "WBS", exact: true }).click();
  const settings = page.getByRole("complementary", { name: "WBS settings" });
  await settings.getByLabel("Diagram title").fill("Delivery breakdown");
  await settings.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("title Delivery breakdown");
});

test("creates and edits Class diagram objects, members, relationships, packages, and settings", async ({ page }) => {
  test.setTimeout(60_000);
  await page.getByRole("button", { name: "New document tab" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await expect(chooser.getByRole("button", { name: /Class diagram/ }).getByText("Beta")).toHaveCount(0);
  await chooser.getByRole("button", { name: /Class diagram/ }).click();
  await expect(page.getByRole("region", { name: "Class diagram preview" })).toBeVisible();
  await expect(page.locator('iframe[title="Local PlantUML renderer"]')).toHaveAttribute("srcdoc", /viz-global/);
  await expect(page.locator(".cm-content")).toContainText("class Order");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Class, interface, or enum…" }).click();
  const add = page.getByRole("dialog", { name: "Add Class object" });
  await add.getByLabel("Class object type").selectOption("enum");
  await add.getByLabel("Name").fill("OrderStatus");
  await add.getByLabel("Alias").fill("Status");
  await add.getByLabel("Members").fill("NEW\nSUBMITTED");
  await add.getByRole("button", { name: "Add object" }).click();
  await expect(page.locator(".cm-content")).toContainText('enum "OrderStatus" as Status');

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Relationship…" }).click();
  const rel = page.getByRole("dialog", { name: "Add Class relationship" });
  await rel.getByLabel("From", { exact: true }).selectOption("order");
  await rel.getByLabel("To", { exact: true }).selectOption("status");
  await rel.getByLabel("Relationship").selectOption("composition");
  await rel.getByLabel("Label").fill("state");
  await rel.getByLabel("From multiplicity").fill("1");
  await rel.getByLabel("To multiplicity").fill("many");
  await rel.getByLabel("Color").fill("DarkGreen");
  await rel.getByRole("button", { name: "Add relationship" }).click();
  await expect(page.locator(".cm-content")).toContainText('Order "1" *-[#DarkGreen]-> "many" Status : state');

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Package or namespace…" }).click();
  const classPackage = page.getByRole("dialog", { name: "Add Class package" });
  await classPackage.getByLabel("Package name").fill("Reporting");
  await classPackage.getByLabel("Package alias").fill("Reports");
  await classPackage.getByLabel("Color").fill("Lavender");
  await classPackage.getByLabel("Parent container").selectOption("ordering");
  await classPackage.getByRole("button", { name: "Add package" }).click();
  await expect(page.locator(".cm-content")).toContainText('package "Reporting" as Reports #Lavender');

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Note…" }).click();
  const classNote = page.getByRole("dialog", { name: "Add Class note" });
  await classNote.getByLabel("Attached to").selectOption("status");
  await classNote.getByLabel("Position").selectOption("left");
  await classNote.getByLabel("Text").fill("Lifecycle state");
  await classNote.getByLabel("Color").fill("Wheat");
  await classNote.getByRole("button", { name: "Add note" }).click();
  await expect(page.locator(".cm-content")).toContainText("note left of Status #Wheat : Lifecycle state");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Note…" }).click();
  const relationshipNote = page.getByRole("dialog", { name: "Add Class note" });
  await relationshipNote.getByLabel("Attached to").selectOption("relationship-2");
  await expect(relationshipNote.getByLabel("Position")).toHaveCount(0);
  await relationshipNote.getByLabel("Text").fill("State ownership");
  await relationshipNote.getByLabel("Color").fill("LightYellow");
  await relationshipNote.getByRole("button", { name: "Add note" }).click();
  await expect(page.locator(".cm-content")).toContainText("note on link #LightYellowState ownershipend note");

  const renderedRelationshipNote = page.locator('[data-class-object-type="note"][data-class-object-id="note-1"]');
  await expect(renderedRelationshipNote).toBeVisible({ timeout: 20_000 });
  await renderedRelationshipNote.focus();
  await renderedRelationshipNote.press("Enter");
  const noteInspector = page.getByRole("complementary", { name: "Class note inspector" });
  await expect(noteInspector).toBeVisible();
  await expect(noteInspector.getByLabel("Attached to")).toHaveValue("relationship-2");
  await noteInspector.getByLabel("Attached to").selectOption("status");
  await expect(noteInspector.getByLabel("Position")).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText("note right of Status #LightYellow");
  await noteInspector.getByLabel("Attached to").selectOption("relationship-2");
  await expect(noteInspector.getByLabel("Position")).toHaveCount(0);
  await expect(page.locator(".cm-content")).toContainText("note on link #LightYellowState ownershipend note");
  await expect(page.locator(".class-diagram").locator("..")).not.toHaveClass(/stale-preview/);

  await expect(page.locator(".class-connect-handle")).toHaveCount(4, { timeout: 20_000 });
  await expect(page.locator(".class-move-handle")).toHaveCount(4);
  await expect(page.getByRole("group", { name: "Class containers" }).getByRole("button")).toHaveCount(2);

  const moveStatus = page.locator('[data-class-move-id="status"]');
  const reportingTarget = page.getByRole("group", { name: "Class containers" }).getByRole("button", {
    name: "Ordering / Reporting",
  });
  const moveBox = await moveStatus.boundingBox();
  const targetBox = await reportingTarget.boundingBox();
  expect(moveBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(moveBox!.x + moveBox!.width / 2, moveBox!.y + moveBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 7 });
  await expect(reportingTarget).toHaveClass(/class-active-drop/);
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText(
    'package "Reporting" as Reports #Lavender {enum "OrderStatus" as Status',
  );

  await page.locator(".class-relationship-hit").first().click({ force: true });
  await expect(page.locator(".class-relationship-endpoint")).toHaveCount(2);
  const fromEndpoint = page.locator('[data-class-relationship-endpoint="from"]');
  const repositoryTarget = page.locator('[data-class-object-type="entity"][data-class-object-id="orderrepository"]');
  const endpointBox = await fromEndpoint.boundingBox();
  const repositoryBox = await repositoryTarget.boundingBox();
  expect(endpointBox).not.toBeNull();
  expect(repositoryBox).not.toBeNull();
  await page.mouse.move(endpointBox!.x + endpointBox!.width / 2, endpointBox!.y + endpointBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(repositoryBox!.x + repositoryBox!.width / 2, repositoryBox!.y + repositoryBox!.height / 2, {
    steps: 7,
  });
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText('OrderRepository "1" *-- "many" OrderLine');

  const orderLineHit = page.locator('[data-class-object-type="entity"][data-class-object-id="orderline"]');
  await orderLineHit.focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => page.locator(".cm-content").innerText()).toMatch(/class OrderLine[\s\S]*class Order/);
  await orderLineHit.focus();
  await page.keyboard.press("c");
  await expect(page.getByText("Choose another class and press Enter · Esc cancels")).toBeVisible();
  const statusHit = page.locator('[data-class-object-type="entity"][data-class-object-id="status"]');
  await statusHit.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content")).toContainText("OrderLine --> Status");

  const renderedReportingPackage = page.getByRole("button", { name: "Select package Reporting", exact: true });
  await expect(renderedReportingPackage).toHaveAttribute("data-class-object-id", "reports");
  await renderedReportingPackage.focus();
  await renderedReportingPackage.press("Enter");
  const packageInspector = page.getByRole("complementary", { name: "Class package inspector" });
  await expect(packageInspector.getByLabel("Package name")).toHaveValue("Reporting");
  await packageInspector.getByLabel("Parent container").selectOption("");
  await expect(
    page.getByRole("group", { name: "Class containers" }).getByRole("button", { name: "Reporting", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Class", exact: true }).click();
  const settings = page.getByRole("complementary", { name: "Class settings" });
  await settings.getByLabel("Layout direction").selectOption("left-to-right");
  await expect(page.locator(".cm-content")).toContainText("left to right direction");
});

test("creates and edits Activity actions, partitions, and notes", async ({ page }) => {
  test.setTimeout(60_000);
  await page.getByRole("button", { name: "New document tab" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  const activityChoice = chooser.getByRole("button", { name: /Activity diagram/ });
  await expect(activityChoice.getByText("Beta", { exact: true })).toBeVisible();
  await activityChoice.click();
  await expect(page.getByRole("region", { name: "Activity diagram preview" })).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText(":Receive order;");
  await expect(page.locator(".activity-diagram svg")).toBeVisible({ timeout: 20_000 });

  await page.locator('[data-activity-object-id="control-0"]').first().click({ force: true });
  const controlInspector = page.getByRole("complementary", { name: "Activity control inspector" });
  await controlInspector.getByLabel("Condition").fill("Payment approved?");
  await controlInspector.getByLabel("Condition").blur();
  await expect(page.locator(".cm-content")).toContainText("if (Payment approved?) then (yes)");

  await page.getByRole("button", { name: "Activity", exact: true }).click();
  const settings = page.getByRole("complementary", { name: "Activity settings" });
  await settings.getByLabel("Title").fill("Order lifecycle");
  await settings.getByLabel("Title").blur();
  await expect(page.locator(".cm-content")).toContainText("title Order lifecycle");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Partition…" }).click();
  const partition = page.getByRole("dialog", { name: "Add Activity partition" });
  await partition.getByLabel("Name").fill("Operations");
  await partition.getByLabel("Color").fill("Lavender");
  await partition.getByRole("button", { name: "Add partition" }).click();
  await expect(page.locator(".cm-content")).toContainText('partition "Operations" #Lavender');
  await page.getByRole("group", { name: "Activity partitions" }).getByRole("button", { name: "Operations" }).click();
  const partitionInspector = page.getByRole("complementary", { name: "Activity partition inspector" });
  await partitionInspector.getByLabel("Name").fill("Operations team");
  await partitionInspector.getByLabel("Name").blur();
  await expect(page.locator(".cm-content")).toContainText('partition "Operations team" #Lavender');

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Action…" }).click();
  const action = page.getByRole("dialog", { name: "Add Activity action" });
  await action.getByLabel("Text").fill("Archive order");
  await action.getByLabel("Partition").selectOption("operations-team");
  await action.getByLabel("Stereotype").fill("service");
  await action.getByLabel("Color").fill("PaleGreen");
  await action.getByRole("button", { name: "Add action" }).click();
  await expect(page.locator(".cm-content")).toContainText(":Archive order; <<service>> <<#PaleGreen>>");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Action…" }).click();
  const secondAction = page.getByRole("dialog", { name: "Add Activity action" });
  await secondAction.getByLabel("Text").fill("Index archive");
  await secondAction.getByLabel("Partition").selectOption("operations-team");
  await secondAction.getByRole("button", { name: "Add action" }).click();
  const secondActionHit = page.locator('[data-activity-object-id="action-6"]');
  await expect(secondActionHit).toBeVisible({ timeout: 20_000 });
  await secondActionHit.scrollIntoViewIfNeeded();
  const handleBox = await secondActionHit.boundingBox();
  const targetBox = await page.locator('[data-activity-object-id="action-5"]').boundingBox();
  expect(handleBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 4, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText(":Index archive;:Archive order;");

  const renderedAction = page.getByRole("button", { name: "Select action Archive order" });
  await expect(renderedAction).toBeVisible({ timeout: 20_000 });
  await renderedAction.click({ force: true });
  const inspector = page.getByRole("complementary", { name: "Activity action inspector" });
  await inspector.getByLabel("Text").fill("Archive completed order");
  await inspector.getByLabel("Text").blur();
  await expect(page.locator(".cm-content")).toContainText(":Archive completed order; <<service>> <<#PaleGreen>>");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Note…" }).click();
  const note = page.getByRole("dialog", { name: "Add Activity note" });
  await note.getByLabel("Position").selectOption("left");
  await note.getByLabel("Attached to").selectOption({ label: "Archive completed order" });
  await note.getByLabel("Text").fill("Stored for audit");
  await note.getByRole("button", { name: "Add note" }).click();
  await expect(page.locator(".cm-content")).toContainText("note leftStored for auditend note");
  const renderedNote = page.getByRole("group", { name: "Activity notes" }).getByRole("button", {
    name: "Stored for audit",
  });
  await expect(renderedNote).toBeVisible({ timeout: 20_000 });
  await renderedNote.click();
  const noteInspector = page.getByRole("complementary", { name: "Activity note inspector" });
  await noteInspector.getByLabel("Text").fill("Stored for compliance audit");
  await noteInspector.getByLabel("Text").blur();
  await expect(page.locator(".cm-content")).toContainText("note leftStored for compliance auditend note");
  await noteInspector.getByLabel("Attached to").selectOption({ label: "Index archive" });
  await expect
    .poll(async () => {
      const source = await page.locator(".cm-content").textContent();
      return (
        (source?.indexOf("Stored for compliance audit") ?? -1) < (source?.indexOf("Archive completed order") ?? -1)
      );
    })
    .toBe(true);

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Flow arrow…" }).click();
  const flowArrow = page.getByRole("dialog", { name: "Add Activity flow arrow" });
  await flowArrow.getByLabel("Place after").selectOption({ label: "Archive completed order" });
  await flowArrow.getByLabel("Label").fill("continue");
  await flowArrow.getByLabel("Line style").selectOption("dashed");
  await flowArrow.getByLabel("Color").fill("Blue");
  await flowArrow.getByRole("button", { name: "Add arrow" }).click();
  await expect(page.locator(".cm-content")).toContainText("-[#Blue,dashed]-> [continue]");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Flow structure…" }).click();
  const structure = page.getByRole("dialog", { name: "Add Activity flow structure" });
  await structure.getByLabel("Structure").selectOption("while");
  await structure.getByLabel("Condition").fill("Archive pending?");
  await structure.getByLabel("First action").fill("Check archive status");
  await structure.getByLabel("Partition").selectOption("operations-team");
  await structure.getByRole("button", { name: "Add structure" }).click();
  await expect(page.locator(".cm-content")).toContainText("while (Archive pending?) is (yes)");
  await expect(page.locator(".cm-content")).toContainText(":Check archive status;");
  await expect(page.locator(".cm-content")).toContainText("endwhile (no)");
  const renderedLoop = page
    .getByRole("group", { name: "Activity controls" })
    .getByRole("button", { name: "Archive pending?" });
  await expect(renderedLoop).toBeVisible({ timeout: 20_000 });
  await renderedLoop.click({ force: true });
  const loopInspector = page.getByRole("complementary", { name: "Activity control inspector" });
  await loopInspector.getByRole("button", { name: "Delete flow structure" }).click();
  await expect(page.locator(".cm-content")).not.toContainText("Archive pending?");
  await expect(page.locator(".cm-content")).not.toContainText("Check archive status");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Terminal…" }).click();
  const terminal = page.getByRole("dialog", { name: "Add Activity terminal" });
  await terminal.getByLabel("Terminal").selectOption("kill");
  await terminal.getByRole("button", { name: "Add terminal" }).click();
  await expect(page.locator(".cm-content")).toContainText("kill@enduml");
  await page.getByRole("group", { name: "Activity terminals" }).getByRole("button", { name: /kill/ }).click();
  const terminalInspector = page.getByRole("complementary", { name: "Activity terminal inspector" });
  await terminalInspector.getByRole("button", { name: "Delete terminal" }).click();
  await expect(page.locator(".cm-content")).not.toContainText("kill@enduml");
});

test("creates and edits Use Case objects through diagram-specific tools", async ({ page }) => {
  test.setTimeout(60_000);
  await page.getByRole("button", { name: "New document tab" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await expect(chooser.getByRole("button", { name: "Use Case diagram" }).getByText("Beta")).toHaveCount(0);
  await chooser.getByRole("button", { name: "Use Case diagram" }).click();
  await expect(page.getByRole("region", { name: "Use Case diagram preview" })).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText("actor Customer");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Actor…" }).click();
  const actorDialog = page.getByRole("dialog", { name: "Add Use Case object" });
  await actorDialog.getByLabel("Name").fill("Administrator");
  await actorDialog.getByLabel("Alias").fill("Admin");
  await actorDialog.getByLabel("Color").fill("#LightBlue");
  await actorDialog.getByRole("button", { name: "Add actor" }).click();
  await expect(page.locator(".cm-content")).toContainText('actor "Administrator" as Admin #LightBlue');
  await page.locator('[data-usecase-object-id="admin"]').first().click();
  const actorInspector = page.getByRole("complementary", { name: "Use Case object inspector" });
  await expect(actorInspector).toBeVisible();
  await expect(actorInspector.getByLabel("Name")).toHaveValue("Administrator");
  await actorInspector.getByRole("button", { name: "Close Use Case object inspector" }).click();

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Relationship…" }).click();
  const relationship = page.getByRole("dialog", { name: "Add Use Case relationship" });
  await relationship.getByLabel("From", { exact: true }).selectOption("admin");
  await relationship.getByLabel("To", { exact: true }).selectOption("order");
  await relationship.getByLabel("Relationship", { exact: true }).selectOption("association");
  await relationship.getByLabel("Label").fill("manages");
  await relationship.getByRole("button", { name: "Add relationship" }).click();
  await expect(page.locator(".cm-content")).toContainText("Admin --> Order : manages");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Package or boundary…" }).click();
  const container = page.getByRole("dialog", { name: "Add Use Case package" });
  await container.getByLabel("Name").fill("Administration");
  await container.getByRole("button", { name: "Add container" }).click();
  await expect(page.locator(".cm-content")).toContainText('rectangle "Administration"');
  await expect(page.locator('.usecase-package-drop-hit[data-usecase-object-id="administration"]')).toHaveCount(1);

  const connectionHandle = page.locator('[data-usecase-connect-from="admin"]').first();
  const browseTarget = page.locator('[data-usecase-object-id="browse"]').first();
  const handleBox = await connectionHandle.boundingBox();
  const browseBox = await browseTarget.boundingBox();
  expect(handleBox).not.toBeNull();
  expect(browseBox).not.toBeNull();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(browseBox!.x + browseBox!.width / 2, browseBox!.y + browseBox!.height / 2, { steps: 5 });
  const previewLine = page.locator(".usecase-connection-preview");
  await expect(previewLine).toBeVisible();
  const snappedCoordinates = await previewLine.evaluate((line) => ({
    x1: Number(line.getAttribute("x1")),
    y1: Number(line.getAttribute("y1")),
    x2: Number(line.getAttribute("x2")),
    y2: Number(line.getAttribute("y2")),
  }));
  const expectedAnchors = await page.evaluate(() => {
    const source = document.querySelector<SVGGraphicsElement>('[data-usecase-connect-from="admin"]')!;
    const target = document.querySelector<SVGGraphicsElement>('[data-usecase-connect-from="browse"]')!;
    const svg = source.ownerSVGElement!;
    const matrix = svg.getScreenCTM()!.inverse();
    const center = (element: SVGGraphicsElement) => {
      const box = element.getBoundingClientRect();
      const point = new DOMPoint(box.left + box.width / 2, box.top + box.height / 2).matrixTransform(matrix);
      return { x: point.x, y: point.y };
    };
    return { source: center(source), target: center(target) };
  });
  expect(snappedCoordinates.x1).toBeCloseTo(expectedAnchors.source.x, 1);
  expect(snappedCoordinates.y1).toBeCloseTo(expectedAnchors.source.y, 1);
  expect(snappedCoordinates.x2).toBeCloseTo(expectedAnchors.target.x, 1);
  expect(snappedCoordinates.y2).toBeCloseTo(expectedAnchors.target.y, 1);
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("Admin --> Browse");

  await page.locator('[data-usecase-object-id="admin"]').first().dispatchEvent("click");
  const containmentInspector = page.getByRole("complementary", { name: "Use Case object inspector" });
  await expect(containmentInspector).toBeVisible();
  await containmentInspector.getByLabel("Container").selectOption("administration");
  await expect
    .poll(() => page.locator(".cm-content").innerText())
    .toContain('rectangle "Administration" {\nactor "Administrator"');

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Note…" }).click();
  const note = page.getByRole("dialog", { name: "Add Use Case note" });
  await note.getByLabel("Attached to").selectOption("admin");
  await note.getByLabel("Text").fill("Maintains access");
  await note.getByRole("button", { name: "Add note" }).click();
  await expect(page.locator(".cm-content")).toContainText("note right of Admin : Maintains access");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Note…" }).click();
  const floatingNote = page.getByRole("dialog", { name: "Add Use Case note" });
  await floatingNote.getByLabel("Attached to").selectOption("");
  await floatingNote.getByLabel("Alias").fill("ReleaseRisk");
  await floatingNote.getByLabel("Text").fill("Confirm the release owner");
  await floatingNote.getByRole("button", { name: "Add note" }).click();
  await expect(page.locator(".cm-content")).toContainText('note "Confirm the release owner" as ReleaseRisk');
  await page.locator('[data-usecase-object-id="note-1"]').first().dispatchEvent("click");
  const noteInspector = page.getByRole("complementary", { name: "Use Case note inspector" });
  await expect(noteInspector.getByLabel("Attached to")).toHaveValue("");
  await expect(noteInspector.getByLabel("Alias")).toHaveValue("ReleaseRisk");
});

test("edits general Use Case settings without rewriting diagram objects", async ({ page }) => {
  test.setTimeout(60_000);
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Use Case diagram" })
    .click();

  await page.getByRole("button", { name: "Use Case", exact: true }).click();
  const settings = page.getByRole("complementary", { name: "Use Case settings" });
  await expect(settings).toBeVisible();
  await settings.getByLabel("Layout direction").selectOption("top-to-bottom");
  await expect(page.locator(".cm-content")).toContainText("top to bottom direction");
  await settings.getByLabel("Package style").selectOption("folder");
  await expect(page.locator(".cm-content")).toContainText("skinparam packageStyle folder");
  await settings.getByLabel("Show shadows").uncheck();
  await expect(page.locator(".cm-content")).toContainText("skinparam shadowing false");
  await settings.getByLabel("Hide stereotype labels").check();
  await expect(page.locator(".cm-content")).toContainText("hide stereotype");

  await settings.getByLabel("Diagram title").fill("Customer portal");
  await settings.getByLabel("Caption").click();
  await expect(page.locator(".cm-content")).toContainText("title Customer portal");
  await settings.getByLabel("Actor fill").fill("#LightBlue");
  await settings.getByLabel("Actor border").click();
  await expect(page.locator(".cm-content")).toContainText("skinparam actorBackgroundColor #LightBlue");
  await expect(page.locator(".cm-content")).toContainText("actor Customer");
  await expect(page.locator(".cm-content")).toContainText('usecase "Browse products" as Browse');
});

test("inspects arrow properties and reconnects a Use Case endpoint visually", async ({ page }) => {
  test.setTimeout(60_000);
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Use Case diagram" })
    .click();
  await setSource(
    page,
    '@startuml\nleft to right direction\nactor "Alpha" as A\nusecase "Beta" as B\nusecase "Gamma" as C\nA --> B : uses\n@enduml',
  );

  const arrowHit = page.locator('.usecase-relationship-hit[data-usecase-object-id="relationship-0"]').first();
  await expect(arrowHit).toHaveCount(1);
  await arrowHit.dispatchEvent("click");
  const inspector = page.getByRole("complementary", { name: "Use Case relationship inspector" });
  await expect(inspector).toBeVisible();
  await inspector.getByLabel("Line style").selectOption("dashed");
  await expect(page.locator(".cm-content")).toContainText("A -[dashed]-> B : uses");

  const endpoint = page.locator(
    '[data-usecase-relationship-id="relationship-0"][data-usecase-relationship-endpoint="to"]',
  );
  const target = page.locator('[data-usecase-object-id="c"]').first();
  const endpointBox = await endpoint.boundingBox();
  const targetBox = await target.boundingBox();
  expect(endpointBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(endpointBox!.x + endpointBox!.width / 2, endpointBox!.y + endpointBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move((endpointBox!.x + targetBox!.x) / 2, (endpointBox!.y + targetBox!.y) / 2);
  await expect(page.locator(".usecase-connection-preview")).toBeVisible();
  await expect(page.locator(".usecase-valid-drop").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".usecase-connection-preview")).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("A -[dashed]-> B : uses");

  await expect(endpoint).toBeVisible();
  const retryEndpointBox = await endpoint.boundingBox();
  expect(retryEndpointBox).not.toBeNull();
  await page.mouse.move(
    retryEndpointBox!.x + retryEndpointBox!.width / 2,
    retryEndpointBox!.y + retryEndpointBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("A -[dashed]-> C : uses");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".cm-content")).toContainText("A -[dashed]-> B : uses");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.locator(".cm-content")).toContainText("A -[dashed]-> C : uses");
});

test("selects and reorders Use Case objects with the keyboard", async ({ page }) => {
  test.setTimeout(60_000);
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Use Case diagram" })
    .click();
  await setSource(
    page,
    '@startuml\nleft to right direction\nactor "User" as First\nactor "User" as Second\nusecase "Review" as Review\n@enduml',
  );

  const secondActor = page.locator('[data-usecase-object-id="second"]').first();
  await expect(secondActor).toBeVisible();
  await secondActor.focus();
  await page.keyboard.press("Enter");
  const inspector = page.getByRole("complementary", { name: "Use Case object inspector" });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByLabel("Alias")).toHaveValue("Second");

  await secondActor.focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect
    .poll(() => page.locator(".cm-content").innerText())
    .toMatch(/actor "User" as Second[\s\S]*actor "User" as First/);

  await secondActor.focus();
  await page.keyboard.press("c");
  await expect(page.getByText("Choose a target and press Enter · Esc cancels")).toBeVisible();
  const review = page.locator('[data-usecase-object-id="review"]').first();
  await review.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content")).toContainText("Second --> Review");

  await secondActor.focus();
  await page.keyboard.press("c");
  await page.keyboard.press("Escape");
  await expect(page.getByText("Focus an object and press C to connect")).toBeVisible();
});

test("keeps Use Case selection aligned after zoom and responsive resizing", async ({ page }) => {
  test.setTimeout(60_000);
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Use Case diagram" })
    .click();
  await setSource(
    page,
    '@startuml\nleft to right direction\nactor "Alpha" as A\nusecase "Beta" as B\nA --> B : uses\n@enduml',
  );

  const preview = page.getByRole("region", { name: "Use Case diagram preview" });
  await preview.getByRole("button", { name: "Zoom in" }).click();
  await preview.getByRole("button", { name: "Zoom in" }).click();
  await page.setViewportSize({ width: 820, height: 700 });

  const beta = page.locator('[data-usecase-object-id="b"]').first();
  await expect(beta).toBeVisible();
  await beta.dispatchEvent("click");
  await expect(page.getByRole("complementary", { name: "Use Case object inspector" }).getByLabel("Alias")).toHaveValue(
    "B",
  );

  const arrow = page.locator('.usecase-relationship-hit[data-usecase-object-id="relationship-0"]').first();
  await arrow.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "Use Case relationship inspector" })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.usecase-relationship-hit[data-usecase-object-id="relationship-0"]').first()).toHaveCount(
    1,
  );
});

test("groups document commands in an accessible File and Export menu", async ({ page }) => {
  const file = page.getByRole("button", { name: "File" });
  await file.click();
  const menu = page.getByRole("menu", { name: "File" });
  await expect(menu.getByRole("menuitem")).toHaveText([
    "New",
    "Open…",
    "Save",
    "Save As…",
    "Version history…",
    "Backup workspace…",
    "Restore workspace…",
    "Export›",
  ]);
  await menu.getByRole("menuitem", { name: "Export" }).hover();
  const exportMenu = page.getByRole("menu", { name: "Export" });
  await expect(exportMenu.getByRole("menuitem")).toHaveText(["Source", "SVG", "PNG"]);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(file).toBeFocused();
});

test("creates, compares, and restores durable document versions", async ({ page }) => {
  const first = source("[A] lasts 2 days");
  const second = source("[B] lasts 4 days");
  await setSource(page, first);
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  const dialog = page.getByRole("dialog", { name: "Version history" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("New version name").fill("First draft");
  await dialog.getByRole("button", { name: "Create version" }).click();
  await expect(dialog.getByRole("button", { name: "Select version First draft" })).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  await page.reload();
  await expect(page.locator(".cm-content")).toBeVisible();
  await page.getByRole("dialog", { name: "Choose a diagram type" }).getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  await expect(dialog.getByRole("button", { name: "Select version First draft" })).toBeVisible();
  await dialog.getByLabel("Selected version name").fill("Baseline");
  await dialog.getByRole("button", { name: "Save name" }).click();
  await expect(dialog.getByRole("button", { name: "Select version Baseline" })).toBeVisible();
  await dialog.getByRole("button", { name: "Unpin", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Pin", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Pin", exact: true }).click();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  await setSource(page, second);
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  await expect(dialog.getByRole("table", { name: "Source differences" })).toContainText("[B] lasts 4 days");
  await dialog.getByRole("button", { name: "Rendered", exact: true }).click();
  await expect(dialog.getByLabel("Rendered differences").locator("svg")).toHaveCount(2, { timeout: 20_000 });
  await dialog.getByRole("button", { name: "Source", exact: true }).click();
  await dialog.getByLabel("New version name").fill("Discard me");
  await dialog.getByRole("button", { name: "Create version" }).click();
  await dialog.getByRole("button", { name: "Select version Discard me" }).click();
  page.once("dialog", (confirmation) => void confirmation.accept());
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Select version Discard me" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Select version Baseline" }).click();
  await dialog.getByLabel("Changes only").check();
  await expect(dialog.getByRole("table", { name: "Source differences" })).not.toContainText(
    "Project starts 2026-09-01",
  );
  await dialog.getByRole("button", { name: "Restore this version" }).click();
  await expect(page.locator(".cm-content")).toContainText("[A] lasts 2 days");
  await expect(page.locator(".cm-content")).not.toContainText("[B] lasts 4 days");
});

test("starts a new version lineage after Save As", async ({ page }) => {
  await setSource(page, source("[Original lineage] lasts 2 days"));
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  const history = page.getByRole("dialog", { name: "Version history" });
  await history.getByLabel("New version name").fill("Old lineage");
  await history.getByRole("button", { name: "Create version" }).click();
  await history.getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async () => ({
        name: "forked-plan.puml",
        createWritable: async () => ({ write: async () => undefined, close: async () => undefined }),
      }),
    });
  });

  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Save As…" }).click();
  await expect(page.locator(".document-tabs > button.active")).toContainText("forked-plan.puml");
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  await expect(history.getByRole("button", { name: "Select version Saved as new file" })).toBeVisible();
  await expect(history.getByRole("button", { name: "Select version Old lineage" })).toHaveCount(0);
});

test("reports added, removed, moved, and out-of-range baseline tasks", async ({ page }) => {
  await setSource(page, source("[A] starts 2026-09-01\n[A] lasts 2 days\n[B] starts 2026-09-04\n[B] lasts 2 days"));
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  const history = page.getByRole("dialog", { name: "Version history" });
  await history.getByLabel("New version name").fill("Planning baseline");
  await history.getByRole("button", { name: "Create version" }).click();
  await history.getByRole("button", { name: "Set as baseline" }).click();
  await history.getByRole("button", { name: "Close", exact: true }).click();

  await setSource(
    page,
    "@startgantt\nProject starts 2026-10-01\n[B] starts 2026-10-03\n[B] lasts 3 days\n[C] starts 2026-10-08\n[C] lasts 2 days\n@endgantt",
  );
  const report = page.locator(".schedule-analysis-report");
  await report.locator("summary").click();
  await expect(report).toContainText("A");
  await expect(report).toContainText("Removed after baseline");
  await expect(report).toContainText("C");
  await expect(report).toContainText("Added after baseline");
  await expect(report).toContainText("outside visible timeline");
  await expect(page.locator(".removed-baseline-lane")).toBeVisible();
  await expect(page.locator('.removed-baseline-bar[data-baseline-task-id="a"]')).toBeVisible();
  await expect(page.locator(".removed-baseline-label")).toContainText("A");
});

test("clears baseline variance when a moved task returns to its original dates", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit automation does not preserve SVG pointer coordinates for task drags");
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  const history = page.getByRole("dialog", { name: "Version history" });
  await history.getByLabel("New version name").fill("Original schedule");
  await history.getByRole("button", { name: "Create version" }).click();
  await history.getByRole("button", { name: "Set as baseline" }).click();
  await history.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator('[data-timeline-header="top"]').nth(1)).toBeVisible({ timeout: 20_000 });

  const task = page.locator('[data-task-id="frontend"]');
  const dragByDays = async (days: number) => {
    const firstDate = await page.locator('[data-timeline-header="top"]').nth(0).boundingBox();
    const secondDate = await page.locator('[data-timeline-header="top"]').nth(1).boundingBox();
    expect(firstDate).not.toBeNull();
    expect(secondDate).not.toBeNull();
    const pixels = (secondDate!.x - firstDate!.x) * days;
    const box = await task.locator(".bar").boundingBox();
    expect(box).not.toBeNull();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + pixels, y, { steps: 4 });
    await page.mouse.up();
  };
  await dragByDays(3);
  await expect(page.locator(".schedule-analysis-report summary")).toContainText("1 changed task");
  await expect(page.locator('[data-baseline-task-id="frontend"]')).toBeVisible();
  await dragByDays(-3);
  await expect(page.locator(".schedule-analysis-report summary")).toContainText("0 changed tasks");
  await expect(page.locator('[data-baseline-task-id="frontend"]')).toHaveCount(0);
});

test("groups creation commands in an accessible Add menu", async ({ page }) => {
  const modifier = await page.evaluate(() => (/Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? "⌥" : "Alt+"));
  const add = page.getByRole("button", { name: "Add", exact: true });
  await add.click();
  const menu = page.getByRole("menu", { name: "Add" });
  await expect(menu.getByRole("menuitem")).toHaveText([
    `Task…${modifier}T`,
    `Milestone…${modifier}M`,
    `Divider…${modifier}D`,
  ]);
  await menu.getByRole("menuitem", { name: "Milestone…" }).click();
  await expect(page.getByRole("dialog", { name: "Add milestone" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Add milestone" })).toBeHidden();
});

test("creates a Sequence tab with diagram-specific tools", async ({ page, browserName }) => {
  test.skip(
    browserName === "webkit",
    "WebKit automation does not preserve SVG pointer identity across compound Sequence reconnects",
  );
  test.setTimeout(60_000);
  await page.getByRole("button", { name: "New document tab" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await expect(chooser).toBeVisible();
  await expect(chooser.locator(".diagram-kind-preview")).toHaveCount(6);
  await chooser.getByRole("button", { name: "Sequence diagram" }).click();
  await expect(page.locator(".cm-content")).toContainText("@startuml");
  await expect(page.locator(".cm-content")).toContainText("User -> System: Request");
  await expect(page.getByRole("button", { name: "Project" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Resources" })).toBeHidden();
  await page.getByRole("button", { name: "Sequence", exact: true }).click();
  const sequenceSettings = page.getByRole("complementary", { name: "Sequence settings" });
  await sequenceSettings.getByLabel("Diagram title").fill("Checkout flow");
  await sequenceSettings.getByLabel("Automatically activate lifelines").check();
  await sequenceSettings.getByLabel("Hide participant footboxes").check();
  await sequenceSettings.getByLabel("Enable autonumbering").check();
  await sequenceSettings.getByLabel("Start").fill("10");
  await sequenceSettings.getByLabel("Increment").fill("5");
  await sequenceSettings.getByLabel("Format").fill("000");
  await sequenceSettings.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("title Checkout flow");
  await expect(page.locator(".cm-content")).toContainText("autoactivate on");
  await expect(page.locator(".cm-content")).toContainText("hide footbox");
  await expect(page.locator(".cm-content")).toContainText('autonumber 10 5 "000"');

  await page.getByRole("button", { name: "Add", exact: true }).click();
  const sequenceAddMenu = page.getByRole("menu", { name: "Add" });
  await expect(sequenceAddMenu.getByRole("menuitem", { name: "Participant…" })).toBeVisible();
  await expect(sequenceAddMenu.getByRole("menuitem", { name: "Message…" })).toBeVisible();
  await expect(sequenceAddMenu.getByRole("menuitem", { name: "Autonumber…" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Participant…" }).click();
  const participant = page.getByRole("dialog", { name: "Add participant" });
  await expect(participant.locator('datalist option[value="#LightBlue"]')).toHaveCount(1);
  await expect(participant.getByLabel("Color", { exact: true })).toHaveAttribute("list", /.+/);
  await expect(participant.getByLabel("Spot color")).toHaveAttribute("list", /.+/);
  await participant.getByRole("combobox", { name: "Participant kind" }).click();
  await participant.getByRole("option", { name: /Database/ }).click();
  await participant.getByLabel("Name").fill("Orders");
  await participant.getByLabel("Stereotype").fill("Store");
  await participant.getByLabel("Spot character").fill("D");
  await participant.getByLabel("Spot color").fill("#FDE68A");
  await participant.getByLabel("Display order").fill("30");
  await participant.getByRole("button", { name: "Add participant" }).click();
  await expect(page.locator(".cm-content")).toContainText("database Orders <<(D,#FDE68A) Store>> order 30");
  await expect(page.getByRole("region", { name: "Sequence diagram preview" })).toBeVisible();

  const renderedOrders = page.locator('[data-sequence-drag-hit][aria-label="Drag participant Orders"]').first();
  await renderedOrders.focus();
  await renderedOrders.press("Enter");
  await expect(page.locator(".cm-selectionBackground")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() ?? "")).toContain("database Orders");
  const participantInspector = page.getByRole("complementary", { name: "Participant inspector" });
  await expect(participantInspector).toBeVisible();
  await expect(participantInspector.getByRole("combobox", { name: "Participant kind" })).toContainText("Database");
  await participantInspector.getByRole("combobox", { name: "Participant kind" }).click();
  await expect(participantInspector.getByRole("option", { name: /Actor/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await participantInspector.getByLabel("Name").fill("Order store");
  await participantInspector.getByLabel("Alias").fill("Orders");
  await participantInspector.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText(
    'database "Order store" as Orders <<(D,#FDE68A) Store>> order 30',
  );
  await page.getByRole("button", { name: "Copy code" }).click();
  await expect(participantInspector).toBeHidden();

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Message…" }).click();
  const edgeMessage = page.getByRole("dialog", { name: "Add message" });
  await edgeMessage.getByLabel("Message type").selectOption("outgoing");
  await edgeMessage.getByLabel("From", { exact: true }).fill("User");
  await edgeMessage.getByRole("combobox", { name: "Arrow type" }).click();
  await edgeMessage.getByRole("option", { name: /Custom PlantUML syntax/ }).click();
  await edgeMessage.getByLabel("Custom Arrow type").fill("-[#red]>");
  await edgeMessage.getByLabel("Message", { exact: true }).fill("Boundary event");
  await edgeMessage.getByRole("button", { name: "Add message" }).click();
  await expect(page.locator(".cm-content")).toContainText("User -[#red]>]: Boundary event");

  const renderedRequest = page.locator('[data-sequence-drag-hit][aria-label="Drag message Request"]');
  await renderedRequest.focus();
  await renderedRequest.press("Enter");
  await expect(page.locator(".cm-selectionBackground")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ""))
    .toContain("User -> System: Request");
  await expect(page.locator(".sequence-selected-message-line")).toHaveCount(1);
  await expect(page.locator(".sequence-selected-message-head")).toBeVisible();
  await expect(page.locator('[data-sequence-message-id="message-0"][data-sequence-message-endpoint]')).toHaveCount(2);
  const messageInspector = page.getByRole("complementary", { name: "Message inspector" });
  await expect(messageInspector).toBeVisible();
  await messageInspector.getByRole("combobox", { name: "Arrow type" }).click();
  await expect(messageInspector.getByRole("listbox", { name: "Arrow type choices" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(messageInspector.getByRole("listbox", { name: "Arrow type choices" })).toBeHidden();
  await expect(messageInspector.getByRole("combobox", { name: "Arrow type" })).toBeFocused();
  await messageInspector.getByRole("combobox", { name: "Arrow type" }).click();
  await messageInspector.getByRole("option", { name: /Dotted open arrowhead/ }).click();
  await messageInspector.getByRole("combobox", { name: "Lifecycle modifiers" }).click();
  await messageInspector.getByRole("option", { name: /Activate target/ }).click();
  await messageInspector.getByLabel("Message text").fill("Create request");
  await messageInspector.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("User -->> System ++: Create request");
  await expect(page.locator(".sequence-diagram").locator("..")).not.toHaveClass(/stale-preview/);
  const renderedCreateRequest = page.locator('[data-sequence-drag-hit][aria-label="Drag message Create request"]');
  await renderedCreateRequest.focus();
  await renderedCreateRequest.press("Enter");

  const requestText = page.locator('[data-sequence-message-endpoint="to"][data-sequence-message-id="message-0"]');
  const ordersParticipant = page.locator('.sequence-participant-anchor[data-sequence-participant-id="orders"]');
  const senderParticipant = page.locator('.sequence-participant-anchor[data-sequence-participant-id="user"]');
  const requestBox = await requestText.boundingBox();
  const ordersBox = await ordersParticipant.boundingBox();
  expect(requestBox).not.toBeNull();
  expect(ordersBox).not.toBeNull();
  await page.mouse.move(requestBox!.x + requestBox!.width / 2, requestBox!.y + requestBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(ordersBox!.x + ordersBox!.width / 2, ordersBox!.y + ordersBox!.height / 2, { steps: 6 });
  await expect(page.locator(".sequence-reconnect-preview")).toHaveCount(1);
  await expect(page.locator(".sequence-reconnect-preview-head")).toBeVisible();
  await expect(page.locator(".sequence-reconnect-preview")).toHaveAttribute(
    "x1",
    (await senderParticipant.getAttribute("cx"))!,
  );
  await page.mouse.up();
  await expect(page.locator(".sequence-reconnect-preview")).toHaveCount(0);
  await expect(page.locator(".cm-content")).toContainText("User -->> Orders ++: Create request");
  await expect(page.locator(".sequence-diagram").locator("..")).not.toHaveClass(/stale-preview/);
  await renderedCreateRequest.focus();
  await renderedCreateRequest.press("Enter");

  const senderHandle = page.locator('[data-sequence-message-endpoint="from"][data-sequence-message-id="message-0"]');
  const systemAnchor = page.locator('.sequence-participant-anchor[data-sequence-participant-id="system"]');
  const senderBox = await senderHandle.boundingBox();
  const systemAnchorBox = await systemAnchor.boundingBox();
  expect(senderBox).not.toBeNull();
  expect(systemAnchorBox).not.toBeNull();
  await page.mouse.move(senderBox!.x + senderBox!.width / 2, senderBox!.y + senderBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    systemAnchorBox!.x + systemAnchorBox!.width / 2,
    systemAnchorBox!.y + systemAnchorBox!.height / 2,
    { steps: 6 },
  );
  await expect(page.locator(".sequence-reconnect-preview")).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("System -->> Orders ++: Create request");

  if (await messageInspector.isVisible())
    await messageInspector.getByRole("button", { name: "Close message inspector" }).click();

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Message…" }).click();
  const standardMessage = page.getByRole("dialog", { name: "Add message" });
  await standardMessage.getByLabel("From", { exact: true }).fill("User");
  await standardMessage.getByLabel("To", { exact: true }).fill("Orders");
  await standardMessage.getByLabel("Message", { exact: true }).fill("New message");
  await standardMessage.getByRole("button", { name: "Add message" }).click();
  await expect(page.locator(".cm-content")).toContainText("User -> Orders: New message");

  const systemParticipant = page.locator('[data-sequence-drag-hit][data-sequence-participant-id="system"]').first();
  const refreshedUserParticipant = page
    .locator('[data-sequence-drag-hit][data-sequence-participant-id="user"]')
    .first();
  const systemBox = await systemParticipant.boundingBox();
  const refreshedUserBox = await refreshedUserParticipant.boundingBox();
  expect(systemBox).not.toBeNull();
  expect(refreshedUserBox).not.toBeNull();
  await page.mouse.move(systemBox!.x + systemBox!.width / 2, systemBox!.y + systemBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    refreshedUserBox!.x + refreshedUserBox!.width / 2,
    refreshedUserBox!.y + refreshedUserBox!.height / 2,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => {
      const text = await page.locator(".cm-content").innerText();
      return text.indexOf("participant System") < text.indexOf("participant User");
    })
    .toBe(true);

  const responseMessage = page.locator('[data-sequence-drag-hit][data-sequence-message-id="message-1"]');
  const firstMessage = page.locator('[data-sequence-drag-hit][data-sequence-message-id="message-0"]');
  const responseBox = await responseMessage.boundingBox();
  const firstMessageBox = await firstMessage.boundingBox();
  expect(responseBox).not.toBeNull();
  expect(firstMessageBox).not.toBeNull();
  await page.mouse.move(responseBox!.x + responseBox!.width / 2, responseBox!.y + responseBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    firstMessageBox!.x + firstMessageBox!.width / 2,
    firstMessageBox!.y + firstMessageBox!.height / 2,
    { steps: 6 },
  );
  await expect(page.locator(".sequence-message-move-preview")).toHaveCount(1);
  await expect(page.locator(".sequence-message-move-preview-head")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(".sequence-message-move-preview")).toHaveCount(0);
  await expect
    .poll(async () => {
      const text = await page.locator(".cm-content").innerText();
      return text.indexOf("System --> User: Response") < text.indexOf("System -->> Orders ++: Create request");
    })
    .toBe(true);

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Combined fragment…" }).click();
  const fragmentDialog = page.getByRole("dialog", { name: "Add Sequence fragment" });
  await fragmentDialog.getByLabel("Label", { exact: true }).fill("Successful request");
  await fragmentDialog.getByLabel("Second branch label").fill("Failure");
  await fragmentDialog.getByLabel("Header color").fill("#Gold");
  await fragmentDialog.getByLabel("Background color").fill("#LightBlue");
  await fragmentDialog.getByLabel("Second branch color").fill("#Pink");
  await fragmentDialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("alt#Gold #LightBlue Successful request");
  await expect(page.locator(".cm-content")).toContainText("else #Pink Failure");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Activation…" }).click();
  const activationDialog = page.getByRole("dialog", { name: "Add Sequence activation" });
  await activationDialog.getByLabel("Participant").selectOption("System");
  await activationDialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("activate System");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Note…" }).click();
  const noteDialog = page.getByRole("dialog", { name: "Add Sequence note" });
  await noteDialog.getByLabel("Shape").selectOption("rnote");
  await noteDialog.getByRole("combobox").nth(3).selectOption("User");
  await noteDialog.getByRole("combobox").nth(4).selectOption("Orders");
  await noteDialog.getByLabel("Text").fill("Persist the request\nThen confirm");
  await noteDialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("rnote over User, Orders");
  await expect(page.locator(".cm-content")).toContainText("Then confirm");
  await expect(page.locator(".cm-content")).toContainText("end note");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Flow controls and page breaks…" }).click();
  const separatorDialog = page.getByRole("dialog", { name: "Add Sequence separator" });
  await separatorDialog.getByLabel("Label").fill("Persistence");
  await separatorDialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("== Persistence ==");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Flow controls and page breaks…" }).click();
  const flowDialog = page.getByRole("dialog", { name: "Add Sequence separator" });
  await flowDialog.getByLabel("Structure").selectOption("create");
  await page
    .getByRole("dialog", { name: "Add Sequence create" })
    .getByLabel("Participant type")
    .selectOption("control");
  await page.getByRole("dialog", { name: "Add Sequence create" }).getByLabel("Name").fill("Worker");
  await page
    .getByRole("dialog", { name: "Add Sequence create" })
    .getByRole("button", { name: "Add", exact: true })
    .click();
  await expect(page.locator(".cm-content")).toContainText("create control Worker");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Flow controls and page breaks…" }).click();
  await page.getByRole("dialog", { name: "Add Sequence separator" }).getByLabel("Structure").selectOption("return");
  const returnDialog = page.getByRole("dialog", { name: "Add Sequence return" });
  await returnDialog.getByLabel("Return text").fill("Completed");
  await returnDialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("return Completed");
  await expect(page.locator(".sequence-diagram svg")).not.toContainText("Syntax Error");

  await page.locator(".cm-line").filter({ hasText: "alt#Gold #LightBlue Successful request" }).click();
  const structureInspector = page.getByRole("complementary", { name: "Sequence structure inspector" });
  await expect(structureInspector).toBeVisible();
  await structureInspector.getByLabel("Branch 2 label").fill("Rejected");
  await structureInspector.getByLabel("Branch 2 color").fill("#Red");
  await structureInspector.getByRole("button", { name: "Add branch" }).click();
  await structureInspector.getByLabel("Branch 3 label").fill("Timed out");
  await structureInspector.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("else #Red Rejected");
  await expect(page.locator(".cm-content")).toContainText("else Timed out");

  await page.locator(".cm-line").filter({ hasText: "alt#Gold" }).click();
  await expect(structureInspector).toBeVisible();
  await structureInspector.getByLabel("Fragment type").selectOption("loop");
  await structureInspector.getByLabel("Label", { exact: true }).fill("Retry request");
  await structureInspector.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("loop#Gold #LightBlue Retry request");

  await page.locator(".cm-line").filter({ hasText: "activate System" }).click();
  await expect(structureInspector).toBeVisible();
  await structureInspector.getByLabel("Action").selectOption("deactivate");
  await structureInspector.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("deactivate System");

  await page.locator(".cm-line").filter({ hasText: "== Persistence ==" }).click();
  await expect(structureInspector).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await structureInspector.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".cm-content")).not.toContainText("== Persistence ==");
});

test("configures advanced Sequence layout and style with undo and redo", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram" })
    .click();
  await page.getByRole("button", { name: "Sequence", exact: true }).click();

  const settings = page.getByRole("complementary", { name: "Sequence settings" });
  await settings.getByLabel("Enable Teoz layout engine").check();
  await settings.getByLabel("Message alignment").selectOption("center");
  await settings.getByLabel("Place response text below arrows").check();
  await settings.getByLabel("Message wrap width").fill("180");
  await settings.getByLabel("Participant padding").fill("24");
  await settings.getByLabel("Box padding").fill("12");
  await settings.getByLabel("Arrow color").fill("#2563EB");
  await settings.getByLabel("Participant fill").fill("#EFF6FF");
  await settings.getByLabel("Note fill").fill("#FEF3C7");
  await settings.getByRole("button", { name: "Apply" }).click();

  const editor = page.locator(".cm-content");
  await expect(editor).toContainText("!pragma teoz true");
  await expect(editor).toContainText("skinparam sequenceMessageAlign center");
  await expect(editor).toContainText("skinparam responseMessageBelowArrow true");
  await expect(editor).toContainText("skinparam maxMessageSize 180");
  await expect(editor).toContainText("skinparam ParticipantPadding 24");
  await expect(editor).toContainText("skinparam BoxPadding 12");
  await expect(editor).toContainText("skinparam sequenceArrowColor #2563EB");
  await expect(editor).toContainText("skinparam sequenceParticipantBackgroundColor #EFF6FF");
  await expect(editor).toContainText("skinparam noteBackgroundColor #FEF3C7");
  await expect(page.locator(".diagram svg")).not.toContainText("Syntax Error");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(editor).not.toContainText("!pragma teoz true");
  await expect(editor).not.toContainText("skinparam sequenceArrowColor #2563EB");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(editor).toContainText("!pragma teoz true");
  await expect(editor).toContainText("skinparam sequenceArrowColor #2563EB");
});

test("reorders Sequence participants and messages from the dedicated drag tray", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram" })
    .click();

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Participant…" }).click();
  const addParticipant = page.getByRole("dialog", { name: "Add participant" });
  await addParticipant.getByLabel("Name").fill("Orders");
  await addParticipant.getByRole("button", { name: "Add participant" }).click();
  await page.getByRole("button", { name: "Reorder" }).click();

  const participantOrder = page.getByRole("region", { name: "Participants order" });
  const participantRow = (name: string) => participantOrder.locator(".sequence-order-item").filter({ hasText: name });
  await participantRow("Orders").dragTo(participantRow("User"), { targetPosition: { x: 20, y: 2 } });
  await expect
    .poll(async () => {
      const text = await page.locator(".cm-content").innerText();
      return text.indexOf("participant Orders") < text.indexOf("participant User");
    })
    .toBe(true);

  const systemBounds = await participantRow("System").boundingBox();
  expect(systemBounds).not.toBeNull();
  await participantRow("Orders").dragTo(participantRow("System"), {
    targetPosition: { x: 20, y: systemBounds!.height - 2 },
  });
  await expect
    .poll(async () => {
      const text = await page.locator(".cm-content").innerText();
      return text.indexOf("participant Orders") > text.indexOf("participant System");
    })
    .toBe(true);

  const messageOrder = page.getByRole("region", { name: "Messages order" });
  await messageOrder.getByText("Response", { exact: true }).dragTo(messageOrder.getByText("Request", { exact: true }));
  await expect
    .poll(async () => {
      const text = await page.locator(".cm-content").innerText();
      return text.indexOf("System --> User: Response") < text.indexOf("User -> System: Request");
    })
    .toBe(true);
});

test("drags Sequence structures and reconnects their participant attachments", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram" })
    .click();
  await setSource(
    page,
    "@startuml\nparticipant User\nparticipant System\nparticipant Orders\nUser -> System: Request\nnote over User, System: Important\nref over User, System: External flow\nactivate System\n== Later ==\n@enduml",
  );

  await expect(page.locator(".sequence-structure-grip")).toHaveCount(4);
  const importantNote = page.locator('[data-sequence-drag-hit][aria-label="Drag Note: Important"]');
  await importantNote.focus();
  await importantNote.press("Enter");
  await expect(page.locator(".sequence-structure-endpoint")).toHaveCount(2);
  const endpoint = await page
    .locator('.sequence-structure-endpoint[data-sequence-structure-endpoint="1"]')
    .boundingBox();
  const ordersAnchor = await page
    .locator('.sequence-participant-anchor[data-sequence-participant-id="orders"]')
    .boundingBox();
  expect(endpoint).not.toBeNull();
  expect(ordersAnchor).not.toBeNull();
  await page.mouse.move(endpoint!.x + endpoint!.width / 2, endpoint!.y + endpoint!.height / 2);
  await page.mouse.down();
  await page.mouse.move(ordersAnchor!.x + ordersAnchor!.width / 2, ordersAnchor!.y + ordersAnchor!.height / 2, {
    steps: 5,
  });
  await expect(page.locator(".interaction-feedback")).toContainText("attachment handle on Orders");
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("note over User, Orders: Important");
  await expect(page.locator(".sequence-diagram").locator("..")).not.toHaveClass(/stale-preview/);

  const noteGrip = page.locator('.sequence-structure-grip[data-sequence-structure-id="note-0"]');
  const messageTarget = page.locator('[data-sequence-drag-hit][data-sequence-message-id="message-0"]').first();
  const gripBox = await noteGrip.boundingBox();
  const targetBox = await messageTarget.boundingBox();
  expect(gripBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(gripBox!.x + gripBox!.width / 2, gripBox!.y + gripBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(gripBox!.x + gripBox!.width / 2, targetBox!.y + 2, { steps: 5 });
  await expect(page.locator(".interaction-feedback")).toContainText("timeline element");
  await expect(page.locator(".sequence-structure-move-preview")).toBeVisible();
  await expect(page.locator(".sequence-structure-move-preview path")).toHaveCount(2);
  await expect(page.locator(".sequence-structure-move-preview")).toHaveAttribute("transform", /translate\([^)]*[1-9]/);
  await page.mouse.up();
  await expect(page.locator(".sequence-structure-move-preview")).toHaveCount(0);
  await expect
    .poll(async () => {
      const text = await page.locator(".cm-content").innerText();
      return text.indexOf("note over User, Orders") < text.indexOf("User -> System: Request");
    })
    .toBe(true);
});

test("opens creation dialogs with keyboard shortcuts", async ({ page }) => {
  await page.getByRole("button", { name: "Add", exact: true }).focus();
  await page.keyboard.press("Alt+t");
  await expect(page.getByRole("dialog", { name: "Add task" })).toBeVisible();
  await page.keyboard.press("Alt+m");
  await expect(page.getByRole("dialog", { name: "Add milestone" })).toBeHidden();
  await page.keyboard.press("Escape");

  await page.keyboard.press("Alt+m");
  await expect(page.getByRole("dialog", { name: "Add milestone" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.keyboard.press("Alt+d");
  await expect(page.getByRole("dialog", { name: "Add separator" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.locator(".cm-content").click();
  await page.keyboard.press("Alt+t");
  await expect(page.getByRole("dialog", { name: "Add task" })).toBeVisible();
});

test("creates standalone tasks with a movable project-start date", async ({ page }) => {
  await setSource(page, source("[Existing] starts 2026-09-01 and lasts 2 days"));
  await openAddDialog(page, "Task…");
  const dialog = page.getByRole("dialog", { name: "Add task" });
  await dialog.getByLabel("Name").fill("New task");
  await expect(dialog.getByLabel("Start date")).toHaveValue("2026-09-01");
  await dialog.getByRole("button", { name: "Add task" }).click();
  await expect(page.locator(".cm-content")).toContainText("[New task] starts 2026-09-01");

  const task = page.locator('[data-task-id="new task"]');
  await expect(task).toHaveAttribute("data-draggable", "true");
  const bar = await task.locator(".bar").boundingBox();
  expect(bar).not.toBeNull();
  await page.mouse.move(bar!.x + bar!.width / 2, bar!.y + bar!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar!.x + bar!.width / 2 + 80, bar!.y + bar!.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator(".cm-content")).not.toContainText("[New task] starts 2026-09-01");
});

test("suggests inline task continuations after a fixed start date", async ({ page }) => {
  await setSource(page, source("[New task] starts 2026-09-01"));
  const taskLine = page.locator(".cm-line").filter({ hasText: "[New task] starts 2026-09-01" });
  await taskLine.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" ");
  const completions = page.locator(".cm-tooltip-autocomplete");
  await expect(completions).toBeVisible();
  await expect(completions).toContainText("and ends");
  await expect(completions).toContainText("and lasts");
  await expect(completions).toContainText("and is colored in");
});

test("copies the current source from the code editor", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Clipboard permissions are only consistently exposed by Chromium");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const value = source("[Copy me] lasts 2 days");
  await setSource(page, value);
  await page.getByRole("button", { name: "Copy code" }).click();
  await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(value);
});

test("backs up and restores all open documents", async ({ page }) => {
  const original = source("[Backup target] lasts 2 days");
  await setSource(page, original);
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  const history = page.getByRole("dialog", { name: "Version history" });
  await history.getByLabel("New version name").fill("Backup checkpoint");
  await history.getByRole("button", { name: "Create version" }).click();
  await history.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "New document tab" }).click();
  await page.getByRole("button", { name: "Gantt diagram" }).click();
  await setSource(page, source("[Second tab] lasts 3 days"));
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Backup workspace…" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const backup = readFileSync(downloadPath!, "utf8");
  expect(JSON.parse(backup).session.documents).toHaveLength(2);

  await page.locator(".cm-content").fill(source("[Replaced] lasts 1 day"));
  await page.evaluate((contents) => {
    Object.defineProperty(window, "showOpenFilePicker", {
      configurable: true,
      value: async () => [{ name: "backup.json", getFile: async () => ({ text: async () => contents }) }],
    });
  }, backup);
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Restore workspace…" }).click();
  await expect(page.locator(".cm-content")).toContainText("[Second tab] lasts 3 days");
  await expect(page.locator(".document-tabs > button:not(.new-tab)")).toHaveCount(2);
  await page.locator(".document-tabs > button:not(.new-tab)").first().click();
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  await expect(history.getByRole("button", { name: "Select version Backup checkpoint" })).toBeVisible();
});

test("protects dirty tabs from browser unload", async ({ page }) => {
  await page.locator(".cm-content").fill(source("[Unsaved] lasts 2 days"));
  await expect
    .poll(() =>
      page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    )
    .toBe(true);
});

test("rebuilds the renderer iframe once and explains a repeated bootstrap failure", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Direct srcdoc frame failure injection is Chromium-specific");
  const iframe = page.locator('iframe[title="Local PlantUML renderer"]');
  await expect(iframe).toHaveCount(1);
  const failCurrentFrame = async () => {
    const sourceDocument = await iframe.getAttribute("srcdoc");
    const channel = sourceDocument?.match(/const channel = ("[^"]+")/)?.[1];
    expect(channel).toBeTruthy();
    const frame = await (await iframe.elementHandle())!.contentFrame();
    await frame!.evaluate(
      (value) =>
        parent.postMessage(
          { channel: JSON.parse(value), type: "bootstrap-error", error: "Injected startup failure" },
          "*",
        ),
      channel!,
    );
  };
  await iframe.evaluate((element) => element.setAttribute("data-test-original-frame", "true"));
  await failCurrentFrame();
  await expect(iframe).toHaveCount(1);
  await expect(iframe).not.toHaveAttribute("data-test-original-frame", "true");
  await failCurrentFrame();
  await expect(page.getByRole("alert")).toContainText("could not start after an automatic retry");
  await expect(page.getByRole("alert")).toContainText("Browser security settings");
});

test("edits the diagram title from project settings", async ({ page }) => {
  await setSource(page, source("[Build] lasts 2 days"));
  await page.getByRole("button", { name: "Project" }).click();
  await expect(page.getByRole("group", { name: "Closed weekdays" }).locator("label")).toHaveText([
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
    "Sun",
  ]);
  await page.getByLabel("Diagram title").fill("Release roadmap — 2026");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("title Release roadmap — 2026");
  await expect(page.locator(".diagram svg")).toContainText("Release roadmap — 2026", { timeout: 20_000 });
});

test("adds a colored critical date from project settings", async ({ page }) => {
  await setSource(page, source("[Build] lasts 2 days"));
  await page.getByRole("button", { name: "Project" }).click();
  const highlights = page.getByRole("group", { name: "Highlighted dates" });
  await highlights.getByRole("button", { name: "Add highlighted date" }).click();
  await highlights.getByLabel("Highlight date").fill("2026-09-18");
  await highlights.getByLabel("Highlight through date").fill("2026-09-18");
  await highlights.getByLabel("Highlight color").fill("#ef4444");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("2026-09-18 is colored in #ef4444");
});

test("starts a highlighted date by clicking the timeline header", async ({ page }) => {
  await setSource(page, source("[Build] lasts 25 days"));
  const dateHeader = page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-18"]');
  await dateHeader.focus();
  await dateHeader.press("Enter");
  const menu = page.getByRole("dialog", { name: "2026-09-18" });
  await expect(menu).toBeVisible();
  await expect(menu).toContainText("No date setting");
  await menu.getByRole("button", { name: "Highlight date" }).click();

  const dialog = page.getByRole("dialog", { name: "Highlight 2026-09-18" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Color").fill("#ffd700");
  await dialog.getByRole("button", { name: "Highlight" }).click();
  await expect(page.locator(".cm-content")).toContainText("2026-09-18 is colored in #ffd700");

  await dateHeader.focus();
  await dateHeader.press("Enter");
  const reopenedMenu = page.getByRole("dialog", { name: "2026-09-18" });
  await expect(reopenedMenu).toContainText("Currently highlighted");
  await reopenedMenu.getByRole("button", { name: "Clear date setting" }).click();
  await expect(page.locator(".cm-content")).not.toContainText("2026-09-18 is colored in");
});

test("opens the date action menu when a task inspector is already open", async ({ page }) => {
  await setSource(page, source("[Build] lasts 25 days"));
  await page.locator('[data-task-id="build"] .bar').click();
  await expect(page.getByRole("complementary", { name: "Task inspector" })).toBeVisible();
  const dateHeader = page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-18"]');
  await dateHeader.focus();
  await dateHeader.press("Enter");
  await expect(page.getByRole("complementary", { name: "Task inspector" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "2026-09-18" })).toBeVisible();
});

test("opens the date action menu from both timeline header rows", async ({ page }) => {
  await setSource(page, source("[Build] lasts 25 days"));
  const top = page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-18"]');
  const bottom = page.locator('[data-timeline-header="bottom"][data-timeline-date="2026-09-18"]');
  await expect(top).toHaveCount(1);
  await expect(bottom).toHaveCount(1);
  await top.focus();
  await top.press("Enter");
  await expect(page.getByRole("dialog", { name: "2026-09-18" })).toBeVisible();
  await page.getByRole("dialog", { name: "2026-09-18" }).getByRole("button", { name: "Close", exact: true }).click();
  await bottom.focus();
  await bottom.press("Enter");
  await expect(page.getByRole("dialog", { name: "2026-09-18" })).toBeVisible();
});

test("marks and clears a closed day by clicking the timeline header", async ({ page }) => {
  await setSource(page, source("[Build] lasts 25 days"));
  const dateHeader = page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-18"]');
  await dateHeader.focus();
  await dateHeader.press("Enter");
  const menu = page.getByRole("dialog", { name: "2026-09-18" });
  await menu.getByRole("button", { name: "Mark as closed day" }).click();
  await expect(page.locator(".cm-content")).toContainText("2026-09-18 is closed");

  await dateHeader.focus();
  await dateHeader.press("Enter");
  const reopenedMenu = page.getByRole("dialog", { name: "2026-09-18" });
  await expect(reopenedMenu).toContainText("Currently marked as a closed day");
  await expect(reopenedMenu.getByRole("button", { name: "Already a closed day" })).toBeDisabled();
  await reopenedMenu.getByRole("button", { name: "Clear date setting" }).click();
  await expect(page.locator(".cm-content")).not.toContainText("2026-09-18 is closed");
});

test("closed-day hatching aligns with real timeline grid boundaries across resize, zoom, and scroll", async ({
  page,
}) => {
  await setSource(page, source("saturday are closed\nsunday are closed\n[Build] starts 2026-09-01 and lasts 45 days"));
  const measure = async () =>
    page.locator(".diagram svg").evaluate((svg) => {
      const number = (element: Element, name: string) => Number(element.getAttribute(name));
      const labels = [...svg.querySelectorAll<SVGTextElement>('[data-timeline-header="top"]')].map((text) => {
        const box = text.getBBox();
        return { closed: text.getAttribute("data-closed-date") === "true", center: box.x + box.width / 2 };
      });
      const gaps = labels
        .slice(1)
        .map((label, index) => label.center - labels[index]!.center)
        .filter((gap) => gap > 0.5)
        .sort((a, b) => a - b);
      const width = gaps[Math.floor(gaps.length / 2)]!;
      const closedLabels = labels.filter((label) => label.closed);
      const lowerWeekdayTop = [...svg.querySelectorAll<SVGTextElement>("text")]
        .filter((text) => /^(?:Mo|Tu|We|Th|Fr|Sa|Su)$/i.test(text.textContent?.trim() ?? ""))
        .map((text) => text.getBBox().y)
        .sort((a, b) => b - a)[0]!;
      const lowerWeekdayBaseline = [...svg.querySelectorAll<SVGTextElement>("text")]
        .filter((text) => /^(?:Mo|Tu|We|Th|Fr|Sa|Su)$/i.test(text.textContent?.trim() ?? ""))
        .map((text) => number(text, "y"))
        .sort((a, b) => b - a)[0]!;
      return [...svg.querySelectorAll<SVGRectElement>(".closed-day-hatching rect")].map((rect, index) => {
        const left = number(rect, "x");
        const right = left + number(rect, "width");
        const bottom = number(rect, "y") + number(rect, "height");
        const center = closedLabels[index]!.center;
        return {
          left,
          right,
          expectedLeft: center - width / 2,
          expectedRight: center + width / 2,
          bottom,
          expectedBottom: lowerWeekdayTop,
          lowerWeekdayBaseline,
        };
      });
    });
  const assertAligned = (items: Awaited<ReturnType<typeof measure>>) => {
    expect(items.length).toBeGreaterThan(4);
    for (const item of items) {
      expect(Math.abs(item.left - item.expectedLeft), JSON.stringify(item)).toBeLessThan(0.05);
      expect(Math.abs(item.right - item.expectedRight), JSON.stringify(item)).toBeLessThan(0.05);
      // SVG font metrics can settle a fraction of a unit after the overlay effect runs.
      // The important invariant is that hatching ends at the top of the lower header
      // and never extends through its date labels.
      expect(Math.abs(item.bottom - item.expectedBottom), JSON.stringify(item)).toBeLessThan(2);
      expect(item.bottom, JSON.stringify(item)).toBeLessThan(item.lowerWeekdayBaseline);
    }
  };
  assertAligned(await measure());
  await page.setViewportSize({ width: 820, height: 720 });
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.locator(".preview-viewport").evaluate((element) => {
    element.scrollLeft = 300;
  });
  assertAligned(await measure());
});

test("edits pauses and links with structured inspector rows", async ({ page }) => {
  await setSource(
    page,
    source(
      "[Build] starts 2026-09-01 and lasts 5 days\n[Build] pauses on monday\n[Build] links to [[https://example.com Existing]]",
    ),
  );
  await page.locator('[data-task-id="build"]').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector.getByLabel("Pause date or weekday")).toHaveValue("monday");
  await inspector.getByRole("button", { name: "Add pause" }).click();
  await inspector.getByLabel("Pause date or weekday").nth(1).fill("2026-09-04");
  await expect(inspector.getByLabel("Link URL")).toHaveValue("https://example.com");
  await inspector.getByRole("button", { name: "Add link" }).click();
  await inspector.getByLabel("Link URL").nth(1).fill("https://plantuml.com/gantt-diagram");
  await inspector.getByLabel("Link label").nth(1).fill("PlantUML reference");
  await inspector.getByLabel("Link label").nth(1).blur();
  await expect(page.locator(".cm-content")).toContainText("[Build] pauses on 2026-09-04");
  await expect(page.locator(".cm-content")).toContainText("[[https://plantuml.com/gantt-diagram PlantUML reference]]");
});

test("drags a vertical separator and closes its inspector on an outside click", async ({ page }) => {
  await setSource(page, source("[Build] starts 2026-09-01 and lasts 8 days\nSeparator just at [Build]'s end"));
  const separator = page.locator('[data-vertical-separator-index="0"]');
  const box = await separator.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 34, box!.y + box!.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("Separator just 1 day after [Build]'s end");
  await separator.dispatchEvent("click");
  await expect(page.getByRole("complementary", { name: "Vertical separator inspector" })).toBeVisible();
  await page.getByRole("button", { name: "File" }).click();
  await expect(page.getByRole("complementary", { name: "Vertical separator inspector" })).toBeHidden();
});

test("highlights a horizontal separator in the source editor when selected", async ({ page }) => {
  await setSource(page, source("[Planning] lasts 2 days\n-- Delivery --\n[Build] lasts 3 days"));
  const separator = page.getByRole("button", { name: "Move divider Delivery" });
  await expect(separator).toBeVisible();
  await separator.dispatchEvent("click");
  await expect(page.getByRole("complementary", { name: "Divider inspector" })).toBeVisible();
  await expect(page.locator(".cm-selectionBackground")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() ?? "")).toContain("-- Delivery --");
});

test("previews and uses every horizontal separator insertion boundary", async ({ page }) => {
  await setSource(page, source("[Planning] lasts 2 days\n[Build] lasts 3 days\n[Review] lasts 1 day\n-- Delivery --"));
  const separator = page.getByRole("button", { name: "Move divider Delivery" });
  const planning = await page.locator('[data-task-id="planning"] .bar').boundingBox();
  const build = await page.locator('[data-task-id="build"] .bar').boundingBox();
  const separatorBox = await separator.boundingBox();
  expect(planning).not.toBeNull();
  expect(build).not.toBeNull();
  expect(separatorBox).not.toBeNull();
  const targetY = (planning!.y + planning!.height + build!.y) / 2;
  const pointerX = separatorBox!.x + separatorBox!.width / 2;
  const pointerY = separatorBox!.y + separatorBox!.height / 2;
  await separator.dispatchEvent("pointerdown", {
    pointerId: 7,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    clientX: pointerX,
    clientY: pointerY,
  });
  await page.evaluate(
    ({ clientX, clientY }) =>
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 7,
          pointerType: "mouse",
          buttons: 1,
          clientX,
          clientY,
        }),
      ),
    { clientX: pointerX, clientY: targetY },
  );
  await expect(page.locator(".divider-drop-indicator")).toHaveCount(1);
  await expect(page.locator(".interaction-feedback")).toContainText("between Planning and Build");
  await page.evaluate(
    ({ clientX, clientY }) =>
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 7,
          pointerType: "mouse",
          button: 0,
          clientX,
          clientY,
        }),
      ),
    { clientX: pointerX, clientY: targetY },
  );
  await expect(page.locator(".divider-drop-indicator")).toHaveCount(0);
  await expect
    .poll(() => page.locator(".cm-content").innerText())
    .toMatch(/\[Planning][\s\S]*-- Delivery --[\s\S]*\[Build]/);
});

test("moves the Automated Web Testing separator below Unified End To End Testing", async ({ page }) => {
  await setSource(
    page,
    source(
      "-- Automated Web Testing --\n" +
        "[Unified UnMasked Messaging Download Report Testing] is colored in Orange\n" +
        "[Unified UnMasked Messaging Download Report Testing] lasts 10 days\n" +
        "[Unified End To End Testing] lasts 10 days\n" +
        "[Unified End To End Testing] is colored in Orange\n" +
        "[Automated Rating Data Web Test Plan] starts 2026-08-25 and lasts 7 days\n" +
        "[Automated Rating Data Web Test Plan] is colored in lightOrange\n" +
        "[Automated Unmasked Data Web Test Plan] starts 2026-08-25 and lasts 7 days\n" +
        "[Unified End To End Testing] starts at [Unified UnMasked Messaging Download Report Testing]'s end",
    ),
  );
  const separator = page.getByRole("button", { name: "Move divider Automated Web Testing" });
  const unified = await page.locator('[data-task-id="unified end to end testing"] .bar').boundingBox();
  const automated = await page.locator('[data-task-id="automated rating data web test plan"] .bar').boundingBox();
  const separatorBox = await separator.boundingBox();
  expect(unified).not.toBeNull();
  expect(automated).not.toBeNull();
  expect(separatorBox).not.toBeNull();
  const targetY = (unified!.y + unified!.height + automated!.y) / 2;
  const pointerX = separatorBox!.x + separatorBox!.width / 2;
  await separator.dispatchEvent("pointerdown", {
    pointerId: 8,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    clientX: pointerX,
    clientY: separatorBox!.y + separatorBox!.height / 2,
  });
  await page.evaluate(
    ({ clientX, clientY }) =>
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 8,
          pointerType: "mouse",
          buttons: 1,
          clientX,
          clientY,
        }),
      ),
    { clientX: pointerX, clientY: targetY },
  );
  await expect(page.locator(".interaction-feedback")).toContainText(
    "between Unified End To End Testing and Automated Rating Data Web Test Plan",
  );
  await page.evaluate(
    ({ clientX, clientY }) =>
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 8,
          pointerType: "mouse",
          clientX,
          clientY,
        }),
      ),
    { clientX: pointerX, clientY: targetY },
  );
  await expect
    .poll(() => page.locator(".cm-content").innerText())
    .toMatch(
      /\[Unified End To End Testing] is colored in Orange[\s\S]*-- Automated Web Testing --[\s\S]*\[Automated Rating Data Web Test Plan]/,
    );
});

test("lists and reveals syntax that is preserved but not visually editable", async ({ page }) => {
  await setSource(page, source("skinparam handwritten true\n[A] starts 2026-09-01\n[A] lasts 2 days"));
  const count = page.getByRole("button", { name: "1 preserved line" });
  await expect(count).toBeVisible();
  await count.click();
  const panel = page.getByRole("complementary", { name: "Unsupported syntax" });
  await expect(panel).toContainText("skinparam handwritten true");
  await panel.getByRole("button", { name: /skinparam handwritten true/ }).click();
  await expect(panel).toBeHidden();
  await expect(page.locator(".cm-content")).toContainText("skinparam handwritten true");
});

test("keeps source fixes available outside the lint tooltip", async ({ page }) => {
  const value = source("[Build] [Build] starts 2026-09-01");
  await page.locator(".cm-content").fill(value);
  const fix = page.getByRole("button", { name: "Fix nearest source issue" });
  await expect(fix).toBeVisible();
  await expect(fix).toHaveText("Fix issue");
  await fix.click();
  await expect(page.locator(".cm-content")).toContainText("[Build] starts 2026-09-01");
  await expect(page.locator(".cm-content")).not.toContainText("[Build] [Build]");
  await expect(fix).toBeHidden();
});

test("renders a pasted document containing block and shorthand task notes", async ({ page }) => {
  const value = `@startgantt
title Project Gantt Chart — Weekend-Aware (Business Day) Logic
Project starts 2026-08-13
saturday are closed
sunday are closed
[Development] starts 2026-09-02 and lasts 7 days and is colored in Red
note right
  Source date was invalid in the original spreadsheet.
end note
[Open Risk ?] happens 2026-09-03
note right: Days needed = "?" — unscheduled until estimated
@endgantt`;
  await page.locator(".cm-content").fill(value);
  await expect(page.locator(".diagram svg")).toContainText("Development", { timeout: 20_000 });
  await expect(page.locator(".diagram svg")).toContainText("Open Risk ?");
  await expect(page.locator(".fallback-note")).toHaveCount(2);
  await expect(page.locator(".statusbar")).not.toContainText("Rendering timed out");
});

test("replaces the preview after pasting the large weekend-aware project", async ({ page }) => {
  const value = readFileSync("tests/fixtures/weekend-aware-large.puml", "utf8");
  await page.locator(".cm-content").fill(value);
  await expect(page.locator(".render-notice.rendering")).toContainText("Rendering updated preview");
  await expect(page.locator(".diagram svg")).toContainText("Unified End To End Testing", { timeout: 20_000 });
  await expect(page.locator(".diagram svg")).not.toContainText("Architecture");
  await expect(page.locator(".fallback-note")).toHaveCount(4);
  await expect(page.locator(".render-notice")).toBeHidden();
  await expect(page.getByLabel("Development performance metrics")).toContainText("tasks");
  await expect(page.getByLabel("Development performance metrics")).toContainText("Parse");
  await expect(page.getByLabel("Development performance metrics")).toContainText("Overlay");
});

test("makes a failed update explicit instead of silently showing the old preview", async ({ page }) => {
  await setSource(page, source("[Previous diagram] lasts 2 days"));
  await page.locator(".cm-content").fill("@startgantt\n[Broken] starts nope\n@endgantt");
  const error = page.getByRole("alert");
  await expect(error).toContainText("Preview could not be updated", { timeout: 20_000 });
  await expect(page.locator(".preview-viewport")).toHaveClass(/stale-preview/);
  await expect(page.getByRole("button", { name: "Retry rendering" })).toBeVisible();
});

test("shows a persistent live preview while moving a task horizontally", async ({ page }) => {
  await setSource(page, source("[A] starts 2026-09-01\n[A] lasts 3 days\n[B] starts 2026-09-05\n[B] lasts 2 days"));
  const bar = page.locator("[data-task-id=a] .bar");
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 120, box!.y + box!.height / 2, { steps: 4 });
  await expect(page.locator(".task-drag-ghost")).toHaveCount(1);
  await expect(page.locator("[data-task-id=a]")).toHaveAttribute("transform", /translate\([1-9]/);
  await page.mouse.up();
  await expect(page.locator(".cm-content")).not.toContainText("[A] starts 2026-09-01");
});

test("snaps a Monday task to the previous Friday using dated timeline columns", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit automation does not preserve SVG pointer coordinates for task drags");
  await setSource(page, source("saturday are closed\nsunday are closed\n[A] starts 2026-09-07\n[A] lasts 3 days"));
  const friday = await page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-04"]').boundingBox();
  const monday = await page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-07"]').boundingBox();
  const bar = await page.locator("[data-task-id=a] .bar").boundingBox();
  expect(friday).not.toBeNull();
  expect(monday).not.toBeNull();
  expect(bar).not.toBeNull();
  const delta = friday!.x + friday!.width / 2 - (monday!.x + monday!.width / 2);
  const startX = bar!.x + bar!.width / 2;
  const startY = bar!.y + bar!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + delta, startY, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("[A] starts 2026-09-04");
  await expect(page.locator(".cm-content")).not.toContainText("[A] starts 2026-09-02");
});

test("moves the default Backend task from Monday to the preceding Friday", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit automation does not preserve SVG pointer coordinates for task drags");
  const friday = await page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-04"]').boundingBox();
  const monday = await page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-07"]').boundingBox();
  const bar = await page.locator("[data-task-id=backend] .bar").boundingBox();
  expect(friday).not.toBeNull();
  expect(monday).not.toBeNull();
  expect(bar).not.toBeNull();
  const delta = friday!.x + friday!.width / 2 - (monday!.x + monday!.width / 2);
  const startX = bar!.x + bar!.width / 2;
  const startY = bar!.y + bar!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + delta, startY, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("[Backend] starts 2026-09-04");
  await expect(page.locator(".cm-content")).not.toContainText("[Backend] starts 2026-09-02");
});

test("keeps the last valid drag position when pointer capture is lost", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit automation does not preserve SVG pointer coordinates for task drags");
  await setSource(page, source("saturday are closed\nsunday are closed\n[A] starts 2026-09-07\n[A] lasts 3 days"));
  const friday = await page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-04"]').boundingBox();
  const monday = await page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-07"]').boundingBox();
  const task = page.locator("[data-task-id=a]");
  const bar = await task.locator(".bar").boundingBox();
  expect(friday).not.toBeNull();
  expect(monday).not.toBeNull();
  expect(bar).not.toBeNull();
  const delta = friday!.x + friday!.width / 2 - (monday!.x + monday!.width / 2);
  const startX = bar!.x + bar!.width / 2;
  const startY = bar!.y + bar!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + delta, startY, { steps: 4 });
  await task.dispatchEvent("lostpointercapture", { clientX: 0, clientY: 0 });
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("[A] starts 2026-09-04");
  await expect(page.locator(".cm-content")).not.toContainText("[A] starts 2026-09-02");
});

test("moves, resizes, and reorders focused tasks from the keyboard", async ({ page }) => {
  await setSource(
    page,
    source(
      "[A] starts 2026-09-01\n[A] lasts 2 days\n[B] starts 2026-09-05\n[B] lasts 2 days\n[C] starts 2026-09-09\n[C] lasts 2 days",
    ),
  );
  await page.locator("[data-task-id=a]").focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.locator(".cm-content")).toContainText("[A] starts 2026-09-02");
  await page.locator("[data-task-id=a]").focus();
  await page.keyboard.press("Alt+Shift+ArrowRight");
  await expect(page.locator(".cm-content")).toContainText("[A] lasts 3 days");
  await page.locator("[data-task-id=a]").focus();
  await page.keyboard.press("Control+ArrowDown");
  await expect
    .poll(async () => {
      const text = (await page.locator(".cm-content").textContent()) ?? "";
      return text.indexOf("[A] lasts") > text.indexOf("[B] lasts");
    })
    .toBe(true);
});

test("traps modal focus, closes with Escape, and restores the trigger", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Add", exact: true });
  await trigger.focus();
  await openAddDialog(page, "Task…");
  const dialog = page.getByRole("dialog", { name: "Add task" });
  await expect(dialog.getByLabel("Name")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Add task" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("adds fixed and relative milestones", async ({ page }) => {
  await setSource(page, source("[Build] starts 2026-09-01\n[Build] lasts 3 days"));

  await openAddDialog(page, "Milestone…");
  let dialog = page.getByRole("dialog", { name: "Add milestone" });
  await dialog.getByLabel("Name").fill("Code freeze");
  await dialog.getByRole("textbox", { name: "Date", exact: true }).fill("2026-09-08");
  await dialog.getByRole("button", { name: "Add milestone" }).click();
  await expect(page.locator(".cm-content")).toContainText("[Code freeze] happens 2026-09-08");

  await openAddDialog(page, "Milestone…");
  dialog = page.getByRole("dialog", { name: "Add milestone" });
  await dialog.getByLabel("Name").fill("Build complete");
  await dialog.locator("select").nth(0).selectOption("relative");
  await dialog.locator("select").nth(1).selectOption("Build");
  await dialog.locator("select").nth(2).selectOption("end");
  await dialog.getByRole("button", { name: "Add milestone" }).click();
  await expect(page.locator(".cm-content")).toContainText("[Build complete] happens at [Build]'s end");
  await expect(page.locator(".diagram svg")).toContainText("Build complete", { timeout: 20_000 });
});

test("inspects and drags milestones according to their date mode", async ({ page }) => {
  await setSource(
    page,
    source(
      "[Build] starts 2026-09-01\n[Build] lasts 3 days\n[Release] happens 2026-09-08\n[Follow up] happens at [Build]'s end",
    ),
  );
  const release = page.locator('[data-task-id="release"]');
  const relative = page.locator('[data-task-id="follow up"]');
  await expect(release).toHaveCount(1);
  await expect(relative).toHaveCount(1);

  await release.locator(".bar").click();
  const inspector = page.getByRole("complementary", { name: "Milestone inspector" });
  await expect(inspector).toBeVisible();
  await inspector.getByRole("textbox", { name: "Date", exact: true }).fill("2026-09-09");
  await inspector.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("[Release] happens 2026-09-09");
  await release.locator(".bar").click();
  await expect(page.getByRole("complementary", { name: "Milestone inspector" })).toBeVisible();
  await page.getByRole("button", { name: "Close milestone inspector" }).click();

  await expect(release).toHaveAttribute("data-draggable", "true");
  await release.focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.locator(".cm-content")).toContainText("[Release] happens 2026-09-10");

  await expect(relative).toHaveAttribute("data-draggable", "false");
  const beforeHorizontal = await page.locator(".cm-content").textContent();
  await relative.focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.locator(".cm-content")).toHaveText(beforeHorizontal!);

  await relative.focus();
  await page.keyboard.press("Control+ArrowUp");
  await expect
    .poll(async () => {
      const text = (await page.locator(".cm-content").textContent()) ?? "";
      return text.indexOf("[Follow up]") < text.indexOf("[Release]");
    })
    .toBe(true);
});

test("drags a fixed milestone directly by its enlarged diamond hit area", async ({ page, browserName }) => {
  test.skip(
    browserName === "firefox",
    "Firefox Playwright maps this offscreen SVG hit-area fixture differently; milestone dragging is covered above",
  );
  await setSource(
    page,
    source(
      "[Range] starts 2026-09-01 and ends 2026-09-20\n[Release] happens 2026-09-08\n[Follow up] happens at [Range]'s end",
    ),
  );
  const milestone = page.locator('[data-task-id="release"]');
  await expect(milestone).toHaveAttribute("data-draggable", "true");
  const initialTransform = await milestone.getAttribute("transform");
  const hit = await milestone.locator(".bar").boundingBox();
  expect(hit).not.toBeNull();
  expect(hit!.width).toBeGreaterThanOrEqual(20);
  expect(hit!.height).toBeGreaterThanOrEqual(20);
  await page.mouse.move(hit!.x + hit!.width / 2, hit!.y + hit!.height / 2);
  await page.mouse.down();
  await page.mouse.move(hit!.x + hit!.width / 2 + 160, hit!.y + hit!.height / 2, { steps: 5 });
  await expect.poll(() => milestone.getAttribute("transform")).not.toBe(initialTransform);
  await page.mouse.up();
  await expect(page.locator(".cm-content")).not.toContainText("[Release] happens 2026-09-08");
});

test("keeps dense charts selectable through the semantic overlay", async ({ page }) => {
  const tasks = Array.from(
    { length: 80 },
    (_, index) => `[Dense ${index}] starts 2026-09-${String((index % 27) + 1).padStart(2, "0")} and lasts 2 days`,
  );
  await setSource(
    page,
    source(
      [...tasks.slice(0, 40), "-- Midpoint --", ...tasks.slice(40), "[Dense release] happens 2026-09-28"].join("\n"),
    ),
  );
  await expect(page.locator('[data-task-id="dense 79"]')).toHaveCount(1, { timeout: 20_000 });
  await page.locator('[data-task-id="dense 79"] .bar').click();
  await expect(page.getByRole("complementary", { name: "Task inspector" })).toBeVisible();
  await page.getByRole("button", { name: "Close task inspector" }).click();
  await page.locator('[data-task-id="dense release"] .bar').click();
  await expect(page.getByRole("complementary", { name: "Milestone inspector" })).toBeVisible();
});

test("unloads the heavy renderer in code-only view and reloads it for preview", async ({ page }) => {
  const renderer = page.locator('iframe[title="Local PlantUML renderer"]');
  await expect(renderer).toHaveCount(1);
  await expect(renderer).not.toHaveAttribute("srcdoc", /viz-global/);
  await page.getByRole("button", { name: "1 · code" }).click();
  await expect(page.locator('iframe[title="Local PlantUML renderer"]')).toHaveCount(0);
  await expect(page.locator(".statusbar")).toContainText("Preview paused");
  await page.getByRole("button", { name: "2 · split" }).click();
  await expect(page.locator('iframe[title="Local PlantUML renderer"]')).toHaveCount(1);
  await expect(page.locator(".diagram svg")).toBeVisible({ timeout: 20_000 });
});

test("grows during resize and undo restores the duration", async ({ page }) => {
  await setSource(page, source("[A] starts 2026-09-01\n[A] lasts 3 days"));
  await page.locator("[data-task-id=a] .bar").click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector).toBeVisible();
  const handle = page.locator("[data-task-id=a] [data-resize-handle]");
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const initialWidth = Number(await page.locator("[data-task-id=a] .bar").getAttribute("width"));
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 120, box!.y + box!.height / 2, { steps: 4 });
  await expect
    .poll(async () => Number(await page.locator(".task-drag-ghost").getAttribute("width")))
    .toBeGreaterThan(initialWidth);
  await page.mouse.up();
  await expect(page.locator(".cm-content")).not.toContainText("[A] lasts 3 days");
  await expect(inspector.locator("label").filter({ hasText: "Duration" }).locator("input")).not.toHaveValue("3");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".cm-content")).toContainText("[A] lasts 3 days");
});

test("shortens a weekend-starting task through every working endpoint", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit automation does not preserve SVG pointer coordinates for task drags");
  await setSource(page, source("saturday are closed\nsunday are closed\n[A] starts 2026-09-05\n[A] lasts 6 days"));
  await page.getByLabel("Schedule").selectOption("single");
  await page.locator("[data-task-id=a] .bar").click();
  await expect(page.locator("[data-task-id=a]")).toHaveAttribute("data-selected", "true");
  const handle = page.locator("[data-task-id=a] [data-resize-handle]");
  const box = await handle.boundingBox();
  const firstDate = await page.locator('[data-timeline-header="top"]').nth(0).boundingBox();
  const secondDate = await page.locator('[data-timeline-header="top"]').nth(1).boundingBox();
  expect(box).not.toBeNull();
  expect(firstDate).not.toBeNull();
  expect(secondDate).not.toBeNull();
  const dayPixels = Math.abs(secondDate!.x - firstDate!.x);
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 - dayPixels, box!.y + box!.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("[A] lasts 5 days");
  await expect(page.locator(".cm-content")).toContainText("[A] starts 2026-09-05");
});

test("shows a live vertical preview and reorders task source", async ({ page }) => {
  await setSource(
    page,
    source(
      "[A] starts 2026-09-01\n[A] lasts 2 days\n[B] starts 2026-09-04\n[B] lasts 2 days\n[C] starts 2026-09-07\n[C] lasts 2 days",
    ),
  );
  const a = await page.locator("[data-task-id=a] .bar").boundingBox();
  const c = await page.locator("[data-task-id=c] .bar").boundingBox();
  expect(a).not.toBeNull();
  expect(c).not.toBeNull();
  await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
  await page.mouse.down();
  await page.mouse.move(a!.x + a!.width / 2, c!.y + c!.height / 2, { steps: 5 });
  await expect(page.locator(".task-drag-ghost")).toHaveCount(1);
  await expect(page.locator("[data-task-id=c]")).toHaveClass(/reorder-target/);
  await page.mouse.up();
  await expect
    .poll(async () => {
      const text = (await page.locator(".cm-content").textContent()) ?? "";
      return text.indexOf("[A] lasts") > text.indexOf("[B] lasts");
    })
    .toBe(true);
});

test("creates a dependency visually and undo removes it", async ({ page }) => {
  await setSource(
    page,
    source(
      "[A] starts 2026-09-01\n[A] lasts 2 days\n[B] on {Kalle:100%} starts 2026-09-05\n[B] lasts 4 days and is colored in LightBlue",
    ),
  );
  await page.locator("[data-task-id=a] .bar").click();
  const handle = await page.locator('[data-task-id=a] [data-dependency-handle="end"]').boundingBox();
  const target = await page.locator("[data-task-id=b] .bar").boundingBox();
  expect(handle).not.toBeNull();
  expect(target).not.toBeNull();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 5 });
  await expect(page.locator("[data-task-id=b]")).toHaveClass(/connection-target/);
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("[B] on {Kalle:100%} starts at [A]'s end");
  await expect(page.locator(".cm-content")).toContainText("[B] lasts 4 days and is colored in LightBlue");
  await expect(page.locator(".cm-content")).not.toContainText("[B] [B]");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".cm-content")).toContainText("[B] on {Kalle:100%} starts 2026-09-05");
});

test("connects task end anchors to create an end-to-end dependency", async ({ page }) => {
  await setSource(page, source("[A] lasts 2 days\n[B] lasts 4 days"));
  await page.locator('[data-task-id="a"] .bar').click();
  await expect(page.locator('[data-task-id="a"] [data-dependency-handle]')).toHaveCount(2);
  const sourceHandle = await page.locator('[data-task-id="a"] [data-dependency-handle="end"]').boundingBox();
  const targetHandle = await page.locator('[data-task-id="b"] [data-dependency-target-handle="end"]').boundingBox();
  expect(sourceHandle).not.toBeNull();
  expect(targetHandle).not.toBeNull();

  await page.mouse.move(sourceHandle!.x + sourceHandle!.width / 2, sourceHandle!.y + sourceHandle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetHandle!.x + targetHandle!.width / 2, targetHandle!.y + targetHandle!.height / 2, {
    steps: 5,
  });
  await expect(page.locator('[data-task-id="b"] [data-dependency-target-handle="end"]')).toHaveClass(
    /connection-target/,
  );
  await page.mouse.up();

  await expect(page.locator(".cm-content")).toContainText("[B] ends at [A]'s end");
});

test("connects a later default task to an earlier task without breaking PlantUML rendering", async ({ page }) => {
  await page.locator("[data-task-id=testing] .bar").click();
  const handle = await page.locator('[data-task-id=testing] [data-dependency-handle="end"]').boundingBox();
  const target = await page.locator("[data-task-id=frontend] .bar").boundingBox();
  expect(handle).not.toBeNull();
  expect(target).not.toBeNull();

  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 5 });
  await expect(page.locator("[data-task-id=frontend]")).toHaveClass(/connection-target/);
  await page.mouse.up();

  await expect
    .poll(async () => {
      const text = (await page.locator(".cm-content").innerText()) ?? "";
      return text.indexOf("[Frontend] starts at [Testing]'s end") > text.indexOf("[Testing] lasts 5 days");
    })
    .toBe(true);
  await expect(page.locator(".diagram svg")).not.toContainText("Syntax Error");
  await expect(page.locator(".render-notice")).toBeHidden();
});

test("migrates dependencies in every persisted open Gantt tab on reload", async ({ page }) => {
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const request = indexedDB.open("plantuml-studio", 2);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("workspace", "readwrite");
    transaction.objectStore("workspace").put(
      {
        version: 4,
        activeDocumentId: "first",
        viewMode: "split",
        splitPercent: 50,
        theme: "system",
        documents: [
          {
            id: "first",
            historyId: "history-first",
            diagramKind: "gantt",
            source:
              "@startgantt\n[Frontend] starts at [Testing]'s end\n[Frontend] lasts 3 days\n[Testing] lasts 2 days\n@endgantt",
            fileName: "first.puml",
            dirty: false,
            zoom: 1,
            cursor: { line: 1, column: 1 },
          },
          {
            id: "second",
            historyId: "history-second",
            diagramKind: "gantt",
            source: "@startgantt\n[B] starts at [A]'s end\n[B] lasts 2 days\n[A] lasts 1 day\n@endgantt",
            fileName: "second.puml",
            dirty: false,
            zoom: 1,
            cursor: { line: 1, column: 1 },
          },
        ],
      },
      "current",
    );
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });

  await page.reload();
  await expect(page.locator('.document-tabs > button[title="first.puml — unsaved changes"]')).toBeVisible();
  await expect(page.locator('.document-tabs > button[title="second.puml — unsaved changes"]')).toBeVisible();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  if (await chooser.isVisible()) await chooser.getByRole("button", { name: "Cancel" }).click();
  await expect
    .poll(async () => {
      const text = await page.locator(".cm-content").innerText();
      return text.indexOf("[Frontend] starts at [Testing]'s end") > text.indexOf("[Testing] lasts 2 days");
    })
    .toBe(true);
  await page.locator('.document-tabs > button[title="second.puml — unsaved changes"]').click();
  await expect
    .poll(async () => {
      const text = await page.locator(".cm-content").innerText();
      return text.indexOf("[B] starts at [A]'s end") > text.indexOf("[A] lasts 1 day");
    })
    .toBe(true);
});

test("removes one person from a task with multiple assignments", async ({ page }) => {
  await setSource(page, source("[A] on {Kalle:100%} {Lisa:50%} starts 2026-09-01\n[A] lasts 4 days"));
  await page.locator('[data-task-id="a"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector.getByLabel("Person name")).toHaveCount(2);
  await inspector.getByRole("button", { name: "Remove Kalle" }).click();

  await expect(inspector.getByLabel("Person name")).toHaveCount(1);
  await expect(inspector.getByLabel("Person name")).toHaveValue("Lisa");
  await expect(page.locator(".cm-content")).toContainText("[A] on {Lisa:50%} starts 2026-09-01");
  await expect(page.locator(".cm-content")).not.toContainText("{Kalle:100%}");
});

test("edits an end-to-end task relationship from the task inspector", async ({ page }) => {
  await setSource(page, source("[A] starts 2026-09-01\n[A] lasts 5 days\n[B] lasts 3 days\n[B] starts at [A]'s end"));
  await page.locator('[data-task-id="b"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector.getByLabel("Linked task")).toHaveValue("a");
  await inspector.getByLabel("Relationship").selectOption("end-after-end");
  await expect(page.locator(".cm-content")).toContainText("[B] ends at [A]'s end");
  await expect(page.locator(".cm-content")).not.toContainText("[B] starts at [A]'s end");

  await page.locator('[data-task-id="b"] .bar').click();
  await expect(page.getByRole("complementary", { name: "Task inspector" }).getByLabel("Relationship")).toHaveValue(
    "end-after-end",
  );
});

test("shows an existing end-linked relationship in the task inspector", async ({ page }) => {
  await setSource(
    page,
    source(
      "[Prototype design] lasts 13 days and is colored in Lavender/LightBlue\n[Write tests] lasts 5 days and ends at [Prototype design]'s end\n[Hire tests writers] lasts 6 days and ends at [Write tests]'s start",
    ),
  );
  await page.locator('[data-task-id="write tests"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector.getByLabel("Linked task")).toHaveValue("prototype design");
  await expect(inspector.getByLabel("Relationship")).toBeEnabled();
  await expect(inspector.getByLabel("Relationship")).toHaveValue("end-after-end");
});

test("keeps the relationship choice available before selecting a linked task", async ({ page }) => {
  await setSource(page, source("[A] lasts 2 days\n[B] lasts 2 days"));
  await page.locator('[data-task-id="b"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector.getByLabel("Linked task")).toHaveValue("");
  await expect(inspector.getByLabel("Relationship")).toBeEnabled();
  await inspector.getByLabel("Relationship").selectOption("end-after-end");
  await inspector.getByLabel("Linked task").selectOption("a");
  await expect(page.locator(".cm-content")).toContainText("[B] ends at [A]'s end");
});

test("keeps resource capacities isolated between document tabs", async ({ page }) => {
  const firstSource = source("[A] on {Kalle:100%} starts 2026-09-01\n[A] lasts 2 days");
  await setSource(page, firstSource);
  await page.getByRole("button", { name: "Resources" }).click();
  await page.getByRole("spinbutton", { name: "Capacity for Kalle" }).fill("50");
  await expect(page.locator(".resource-card details")).toHaveCount(1);
  await page.getByRole("button", { name: "Close resource workload" }).click();
  await page.getByRole("button", { name: "New document tab" }).click();
  await page.getByRole("button", { name: "Gantt diagram" }).click();
  await setSource(page, firstSource.replaceAll("[A]", "[B]"));
  await page.getByRole("button", { name: "Resources" }).click();
  await expect(page.getByRole("spinbutton", { name: "Capacity for Kalle" })).toHaveValue("100");
  await expect(page.locator(".resource-card details")).toHaveCount(0);
});

test("shows resource over-allocation directly below the diagram", async ({ page }) => {
  await setSource(page, source("[A] on {Kalle:100%} starts 2026-09-01\n[A] lasts 2 days"));
  await page.getByRole("button", { name: "Resources" }).click();
  await page.getByRole("spinbutton", { name: "Capacity for Kalle" }).fill("50");
  await page.getByRole("button", { name: "Close resource workload" }).click();

  const warning = page.getByRole("alert", { name: "Resource over-allocation" });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("Kalle: 100% assigned / 50% capacity across 2 days (A)");
  await warning.getByRole("button", { name: "Review workload" }).click();
  await expect(page.getByRole("complementary", { name: "Resource workload" })).toBeVisible();
});

test("does not over-allocate a person when multiple people shorten a task", async ({ page }) => {
  await setSource(
    page,
    source(
      "saturday are closed\nsunday are closed\n[Backend] on {Kalle:100%} {Tyra:100%} starts 2026-09-07\n[Backend] lasts 8 days\n[Testing] on {Tyra:100%} starts 2026-09-14\n[Testing] lasts 5 days",
    ),
  );

  await expect(page.getByRole("alert", { name: "Resource over-allocation" })).toHaveCount(0);
  await page.getByRole("button", { name: "Resources" }).click();
  const tyra = page.locator(".resource-card").filter({ has: page.getByRole("button", { name: "Tyra" }) });
  await expect(tyra).toContainText("Peak 100%");
});

test("shows resource over-allocation after dragging assigned tasks into overlap", async ({ page }) => {
  await setSource(page, source("[A] starts 2026-09-01\n[A] lasts 3 days\n[B] starts 2026-09-08\n[B] lasts 3 days"));
  for (const taskId of ["a", "b"]) {
    await page.locator(`[data-task-id="${taskId}"] .bar`).click();
    const inspector = page.getByRole("complementary", { name: "Task inspector" });
    await inspector.getByRole("button", { name: "+ Add person" }).click();
    await inspector.getByLabel("Person name").fill("Kalle");
    await inspector.getByLabel("Person name").blur();
    await expect(page.locator(".cm-content")).toContainText(
      taskId === "a" ? "[A] on {Kalle:100%} starts 2026-09-01" : "[B] on {Kalle:100%} starts 2026-09-08",
    );
  }
  const warning = page.getByRole("alert", { name: "Resource over-allocation" });
  await expect(warning).toHaveCount(0);
  const first = await page.locator('[data-task-id="a"] .bar').boundingBox();
  const second = await page.locator('[data-task-id="b"] .bar').boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();

  await page.mouse.move(second!.x + second!.width / 2, second!.y + second!.height / 2);
  await page.mouse.down();
  await page.mouse.move(first!.x + first!.width / 2, second!.y + second!.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect(page.locator(".cm-content")).toContainText("[B] on {Kalle:100%} starts 2026-09-01");
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("Kalle: 200% assigned / 100% capacity");

  await expect
    .poll(async () => {
      const a = await page.locator('[data-task-id="a"] .bar').boundingBox();
      const b = await page.locator('[data-task-id="b"] .bar').boundingBox();
      return a && b ? Math.abs(a.x - b.x) : Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(10);

  await page.locator('[data-task-id="a"] .bar').click();
  const handle = await page.locator('[data-task-id="a"] [data-dependency-handle="end"]').boundingBox();
  const target = await page.locator('[data-task-id="b"] .bar').boundingBox();
  expect(handle).not.toBeNull();
  expect(target).not.toBeNull();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 6 });
  await page.mouse.up();

  await expect(page.locator(".cm-content")).toContainText("[B] on {Kalle:100%} starts at [A]'s end");
  await expect(warning).toHaveCount(0);
});

test("keeps duplicate displayed task names distinct through aliases", async ({ page }) => {
  await setSource(
    page,
    source("[Testing] as [BackendTest] requires 3 days\n[Testing] as [FrontendTest] requires 4 days"),
  );
  const backend = page.locator('[data-task-id="backendtest"]');
  const frontend = page.locator('[data-task-id="frontendtest"]');
  await expect(backend).toHaveCount(1);
  await expect(frontend).toHaveCount(1);
  const backendBox = await backend.boundingBox();
  const frontendBox = await frontend.boundingBox();
  expect(backendBox?.y).not.toBe(frontendBox?.y);
  await frontend.locator(".bar").click();
  await expect(page.getByRole("complementary", { name: "Task inspector" }).getByLabel("Name")).toHaveValue("Testing");
});

test("shows allocation-adjusted dates in the task hover card", async ({ page }) => {
  await setSource(page, source("[More tasks] on {Kalle:75%} starts 2026-09-01\n[More tasks] lasts 20 days"));
  await page.locator('[data-task-id="more tasks"] .bar').hover();
  const card = page.getByLabel("Task details for More tasks");
  await expect(card).toBeVisible();
  await expect(card).toContainText("2026-09-01 → 2026-09-27");
  await expect(card).toContainText("Kalle 75%");
});

test("saves task inspector text fields on blur instead of while typing", async ({ page }) => {
  await setSource(page, source("[Build] lasts 2 days"));
  await page.locator('[data-task-id="build"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector.getByRole("button", { name: "Apply" })).toHaveCount(0);
  await inspector.getByLabel("Color").fill("Orange");
  await expect(page.locator(".cm-content")).not.toContainText("[Build] is colored in Orange");
  await inspector.getByLabel("Color").blur();
  await expect(page.locator(".cm-content")).toContainText("[Build] is colored in Orange");
  await expect(inspector).toBeVisible();
  await inspector.getByLabel("Name").fill("Compile");
  await expect(page.locator(".cm-content")).not.toContainText("[Compile]");
  await inspector.getByLabel("Name").blur();
  await expect(page.locator(".cm-content")).toContainText("[Compile] is colored in Orange");
});

test("closes inspectors on any outside click and switches directly to another task", async ({ page }) => {
  await setSource(page, source("[A] lasts 2 days\n[B] lasts 2 days"));
  await page.locator('[data-task-id="a"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector.getByLabel("Name")).toHaveValue("A");
  await page.getByRole("button", { name: "Help" }).click();
  await expect(inspector).toHaveCount(0);
  await page.getByRole("button", { name: "Close help" }).click();

  await page.locator('[data-task-id="a"] .bar').click();
  await page.locator('[data-task-id="b"] .bar').click();
  await expect(page.getByRole("complementary", { name: "Task inspector" }).getByLabel("Name")).toHaveValue("B");
});

test("navigates between task inspectors with the preview arrows", async ({ page }) => {
  await page.locator('[data-task-id="architecture"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  await expect(inspector.getByLabel("Name")).toHaveValue("Architecture");

  await page.getByRole("button", { name: "Next task" }).click();
  await expect(inspector.getByLabel("Name")).toHaveValue("Backend");
  await expect(inspector).toBeVisible();

  await page.getByRole("button", { name: "Previous task" }).click();
  await expect(inspector.getByLabel("Name")).toHaveValue("Architecture");
  await expect(inspector).toBeVisible();
});

test("renders task and dependency notes at the same time", async ({ page }) => {
  await setSource(
    page,
    source(
      "[A] starts 2026-09-01\n[A] lasts 2 days\n[B] starts at [A]'s end\nnote bottom\nArrow explanation\nend note\n[B] lasts 1 day\nnote bottom\nTask explanation\nend note",
    ),
  );
  await expect(page.locator(".fallback-note")).toHaveCount(2);
  await expect(page.locator('[data-note-owner="dependency:0"]')).toContainText("Arrow explanation");
  await expect(page.locator('[data-note-owner="task:b"]')).toContainText("Task explanation");
  const connectorDistance = await page.evaluate(() => {
    const dependency = document.querySelector<SVGPathElement>('[data-dependency-index="0"].interaction-dependency');
    const connector = document.querySelector<SVGPathElement>('[data-note-owner="dependency:0"] .note-connector');
    if (!dependency || !connector) return Number.POSITIVE_INFINITY;
    const midpoint = dependency.getPointAtLength(dependency.getTotalLength() / 2);
    const start = connector
      .getAttribute("d")
      ?.match(/^M\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/)
      ?.slice(1)
      .map(Number);
    return start ? Math.hypot(midpoint.x - start[0]!, midpoint.y - start[1]!) : Number.POSITIVE_INFINITY;
  });
  expect(connectorDistance).toBeLessThan(1);
});

test("converts task end dates and durations in both directions", async ({ page }) => {
  await setSource(page, source("saturday are closed\nsunday are closed\n[A] starts 2026-09-04 and ends 2026-09-08"));
  await page.locator("[data-task-id=a] .bar").click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  const end = inspector.getByRole("textbox", { name: "End", exact: true });
  const duration = inspector.locator("label").filter({ hasText: "Duration" }).locator('input[type="number"]');

  await expect(duration).toHaveValue("3");
  await expect(duration).toHaveAttribute("readonly", "");
  await end.fill("2026-09-09");
  await expect(duration).toHaveValue("4");
  await end.blur();

  await inspector.getByRole("button", { name: "Switch to duration ⇄" }).click();
  await expect(end).toHaveValue("2026-09-09");
  await expect(end).toHaveAttribute("readonly", "");
  await expect(duration).toHaveValue("4");
  await expect(duration).not.toHaveAttribute("readonly", "");
  await expect(page.locator(".cm-content")).toContainText("[A] lasts 4 days");
  await expect(page.locator(".cm-content")).not.toContainText("ends 2026-09-09");

  await duration.fill("3");
  await expect(end).toHaveValue("2026-09-08");

  await inspector.getByRole("button", { name: "Switch to end date ⇄" }).click();
  await expect(end).toHaveValue("2026-09-08");
  await expect(end).not.toHaveAttribute("readonly", "");
  await expect(duration).toHaveValue("3");
  await expect(duration).toHaveAttribute("readonly", "");
  await expect(page.locator(".cm-content")).toContainText("[A] ends 2026-09-08");
  await expect(page.locator(".cm-content")).not.toContainText("lasts 3 days");
});

test("converts a dependent task from duration to an editable explicit end", async ({ page }) => {
  await setSource(page, source("[A] starts 2026-09-01 and lasts 2 days\n[B] starts at [A]'s end and lasts 3 days"));
  await page.locator('[data-task-id="b"] .bar').click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  const end = inspector.getByRole("textbox", { name: "End", exact: true });
  const duration = inspector.locator("label").filter({ hasText: "Duration" }).locator('input[type="number"]');
  const derivedEnd = await end.inputValue();
  expect(derivedEnd).not.toBe("");

  await inspector.getByRole("button", { name: "Switch to end date ⇄" }).click();

  await expect(end).toHaveValue(derivedEnd);
  await expect(end).not.toHaveAttribute("readonly", "");
  await expect(duration).toHaveValue("3");
  await expect(duration).toHaveAttribute("readonly", "");
  await expect(page.locator(".cm-content")).toContainText(`[B] ends ${derivedEnd}`);
  await expect(page.locator(".cm-content")).not.toContainText("[B] lasts 3 days");
});

test("suggests PlantUML color names in the task inspector", async ({ page }) => {
  await setSource(page, source("[A] starts 2026-09-01 and lasts 3 days"));
  await page.locator("[data-task-id=a] .bar").click();
  const inspector = page.getByRole("complementary", { name: "Task inspector" });
  const color = inspector.getByRole("combobox", { name: "Color" });
  const listId = await color.getAttribute("list");
  expect(listId).toBeTruthy();
  for (const name of ["AliceBlue", "DarkOrange", "LightGreen", "OrangeRed", "YellowGreen"])
    await expect(inspector.locator(`datalist[id="${listId}"] option[value="${name}"]`)).toHaveCount(1);
  await color.fill("Ora");
  await expect(color).toHaveValue("Ora");
});
