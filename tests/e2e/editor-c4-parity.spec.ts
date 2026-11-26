import {
  fillSource,
  fitDiagram,
  openRibbonGroup,
  pointInText,
  prepareEditor,
  readEditorSource,
  setSource,
  waitForDiagramRender,
} from "./editor-helpers";
import { expect, test, type Page } from "./coverage";

const SOURCE = `@startuml
!include <C4/C4_Container>
Person(customer, "Customer")
System_Boundary(shop, "Web shop") {
  Container(web, "Web app", "React")
  Container(api, "API", "Java")
}
Rel(customer, web, "Uses", "HTTPS")
Rel(web, api, "Calls")
Lay_R(web, api)
@enduml`;

async function openC4(page: Page, source: string, rendered = true) {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Choose a diagram type" });
  await dialog.getByRole("button", { name: "C4 diagram", exact: true }).click();
  await dialog.getByRole("button", { name: "Create diagram", exact: true }).click();
  await expect(dialog).toBeHidden();
  if (rendered) {
    await setSource(page, source);
    await expect(page.locator(".c4-semantic-hit").first()).toBeAttached({ timeout: 45_000 });
  } else await fillSource(page, source);
}

const hit = (page: Page, key: string) => page.locator(`.c4-semantic-hit[data-c4-object-id="${key}"]`);

test("renames an alias from the editor so every reference follows, and undo restores the source exactly", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openC4(page, SOURCE, false);
  const reference = await pointInText(page, 7, "web");
  await page.mouse.click(reference.x, reference.y);
  // The declaration, two relationship ends and the layout hint.
  await expect(page.locator(".cm-symbol-reference")).toHaveCount(4);

  await page.mouse.click(reference.x, reference.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Find references" }).click();
  const references = page.getByRole("complementary", { name: "References for web" });
  await expect(references).toContainText("4 occurrences");
  await references.getByRole("button", { name: "Close references" }).click();

  await page.mouse.click(reference.x, reference.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Rename…" }).click();
  const rename = page.getByRole("dialog", { name: "Rename C4 alias" });
  await expect(rename).toContainText("4 semantic occurrences");
  await rename.getByLabel("New name").fill("api");
  await expect(rename.getByRole("alert")).toHaveText("Alias “api” is already used");
  await expect(rename.getByRole("button", { name: "Rename" })).toBeDisabled();
  await rename.getByLabel("New name").fill("web.app");
  await expect(rename.getByRole("alert")).toContainText("can't contain a dot");
  await expect(rename.getByRole("button", { name: "Rename" })).toBeDisabled();
  await rename.getByLabel("New name").fill("frontend");
  await expect(rename.getByRole("alert")).toHaveCount(0);
  await rename.getByRole("button", { name: "Rename" }).click();
  const renamed = SOURCE.replace("Container(web,", "Container(frontend,")
    .replace("Rel(customer, web,", "Rel(customer, frontend,")
    .replace("Rel(web, api,", "Rel(frontend, api,")
    .replace("Lay_R(web, api)", "Lay_R(frontend, api)");
  await expect.poll(() => readEditorSource(page)).toBe(renamed);

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).toBe(SOURCE);
});

test("renames, finds references and highlights from a shape on the canvas", async ({ page }) => {
  test.setTimeout(180_000);
  await openC4(page, SOURCE);
  await fitDiagram(page);
  await hit(page, "customer").click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Symbol actions" });
  await menu.getByRole("menuitem", { name: "Find references" }).click();
  await expect(page.getByRole("complementary", { name: "References for customer" })).toContainText("2 occurrences");
  await page.getByRole("button", { name: "Close references" }).click();

  await hit(page, "customer").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename…" }).click();
  const rename = page.getByRole("dialog", { name: "Rename C4 alias" });
  await rename.getByLabel("New name").fill("client");
  await rename.getByRole("button", { name: "Rename" }).click();
  await expect
    .poll(() => readEditorSource(page))
    .toBe(SOURCE.replace("Person(customer,", "Person(client,").replace("Rel(customer,", "Rel(client,"));
  await waitForDiagramRender(page);
  await expect(hit(page, "client")).toBeAttached();
  await expect(hit(page, "customer")).toHaveCount(0);
});

test("shows a malformed macro call as a problem and fixes it", async ({ page }) => {
  test.setTimeout(90_000);
  const broken = SOURCE.replace('Person(customer, "Customer")', 'Person(customer, "Customer)');
  await openC4(page, broken, false);
  await page.getByRole("button", { name: /^(?:No issues|\d+ issues?)$/ }).click();
  const problems = page.getByRole("complementary", { name: "Issues" });
  const problem = problems.locator("[data-problem-diagnostic]").filter({ hasText: "unmatched quote" });
  await expect(problem).toBeVisible();
  await problem.click();
  const fixes = page.getByRole("list", { name: "Source fix suggestions", exact: true });
  await fixes.getByRole("button", { name: /Add missing closing quote/ }).click();
  await expect.poll(() => readEditorSource(page)).toBe(SOURCE);
  await expect(page.getByRole("button", { name: /^\d+ issues?$/ })).toHaveCount(0);

  // An unknown macro is an error, with the closest macro offered.
  await fillSource(page, SOURCE.replace("Container(api,", "Contaner(api,"));
  await page.getByRole("button", { name: /^\d+ issues?$/ }).click();
  await problems.locator("[data-problem-diagnostic]").filter({ hasText: "Unknown macro Contaner" }).click();
  await page
    .getByRole("list", { name: "Source fix suggestions", exact: true })
    .getByRole("button", { name: /Change to Container/ })
    .click();
  await expect.poll(() => readEditorSource(page)).toBe(SOURCE);
});

test("selects several shapes, then sets tags, copies, duplicates and deletes them, each as one undo step", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openC4(page, SOURCE);
  await fitDiagram(page);
  const inspector = page.getByRole("complementary", { name: "Selected elements inspector" });
  const undo = () => page.getByRole("button", { name: "Undo", exact: true }).click();
  const select = async () => {
    await waitForDiagramRender(page);
    await hit(page, "web").click();
    await hit(page, "api").click({ modifiers: ["Shift"] });
    await expect(inspector.getByText("2 elements selected")).toBeVisible();
  };

  await select();
  await inspector.getByLabel("Tags", { exact: true }).fill("core");
  await inspector.getByRole("button", { name: "Set tags", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("Updated 2 elements");
  await expect
    .poll(() => readEditorSource(page))
    .toBe(
      SOURCE.replace('Container(web, "Web app", "React")', 'Container(web, "Web app", "React", $tags="core")').replace(
        'Container(api, "API", "Java")',
        'Container(api, "API", "Java", $tags="core")',
      ),
    );
  await undo();
  await expect.poll(() => readEditorSource(page)).toBe(SOURCE);

  await select();
  await inspector.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("Duplicated");
  await expect.poll(() => readEditorSource(page)).toContain('Rel(web_copy, api_copy, "Calls")');
  await undo();
  await expect.poll(() => readEditorSource(page)).toBe(SOURCE);

  await select();
  page.once("dialog", (dialog) => void dialog.accept());
  await inspector.getByRole("button", { name: "Delete selected", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).not.toContain("Container(");
  await expect.poll(() => readEditorSource(page)).not.toContain("Rel(web");
  await undo();
  await expect.poll(() => readEditorSource(page)).toBe(SOURCE);
});

test("opens the C4 Add dialogs and the diagram settings from the command palette", async ({ page }) => {
  test.setTimeout(90_000);
  await openC4(page, SOURCE, false);
  const run = async (label: string) => {
    await page.getByRole("button", { name: "Commands", exact: true }).click();
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await palette.getByRole("combobox").fill(label);
    await expect(palette.getByRole("option").filter({ hasText: label })).toHaveCount(1);
    await palette.getByRole("combobox").press("Enter");
    await expect(palette).toBeHidden();
  };
  for (const [command, dialog] of [
    ["Add person…", "Add C4 element"],
    ["Add system…", "Add C4 element"],
    ["Add container…", "Add C4 element"],
    ["Add component…", "Add C4 element"],
    ["Add boundary…", "Add C4 boundary"],
    ["Add relationship…", "Add C4 relationship"],
  ] as const) {
    await run(command);
    await expect(page.getByRole("dialog", { name: dialog })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: dialog })).toBeHidden();
  }
  await run("Diagram settings…");
  await expect(page.getByRole("complementary", { name: "C4 diagram settings" })).toBeVisible();
});

test("turns a relationship into a both-ways one from its panel", async ({ page }) => {
  test.setTimeout(180_000);
  await openC4(page, SOURCE);
  await fitDiagram(page);
  // Select through the outline: a relationship has no stable point to click.
  await openRibbonGroup(page, "View", "Navigation and panels");
  await page.getByRole("button", { name: "Outline", exact: true }).click();
  const outline = page.getByRole("dialog", { name: "Diagram outline", exact: true });
  await outline.getByRole("button", { name: /^Calls/ }).click();
  const inspector = page.getByRole("complementary", { name: "C4 relationship inspector" });
  await expect(inspector).toBeVisible();
  await inspector.getByLabel("Both ways").check();
  await expect
    .poll(() => readEditorSource(page))
    .toBe(SOURCE.replace('Rel(web, api, "Calls")', 'BiRel(web, api, "Calls")'));
  await inspector.getByLabel("Both ways").uncheck();
  await expect.poll(() => readEditorSource(page)).toBe(SOURCE);
});
