import { expect, test, type Page } from "./coverage";
import { fillSource, prepareEditor, readEditorSource } from "./editor-helpers";

const chooser = (page: Page) => page.getByRole("dialog", { name: "Choose a diagram type" });
const tabs = (page: Page) => page.locator(".document-tab > button:first-child");
const includesSummary = (page: Page) => page.locator(".includes-details > summary");

async function newDiagram(page: Page, kindButton: string, name?: string) {
  await page.getByRole("button", { name: "New diagram tab", exact: true }).click();
  const dialog = chooser(page);
  await dialog.getByRole("button", { name: kindButton, exact: true }).click();
  if (name) await dialog.getByRole("textbox", { name: "Diagram name", exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Create diagram", exact: true }).click();
  await expect(dialog).toBeHidden();
}

/** A new `.pumlu` document; diagrams created afterwards are added to it. */
async function newDocument(page: Page, name: string) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "New", exact: true }).click();
  await page.getByRole("menu", { name: "New", exact: true }).getByRole("menuitem", { name: "Document…" }).click();
  const create = page.getByRole("dialog", { name: "New document", exact: true });
  await create.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await create.getByRole("button", { name: "Create document", exact: true }).click();
  await page
    .getByRole("complementary", { name: "Document navigator" })
    .getByRole("button", { name: "Close document navigator" })
    .click();
}

async function openTab(page: Page, name: string) {
  await tabs(page).filter({ hasText: name }).click();
  await expect(tabs(page).filter({ hasText: name })).toHaveClass(/active/);
}

async function documentWithStyle(page: Page) {
  await prepareEditor(page);
  await newDocument(page, "Shared styles");
  await newDiagram(page, "Class diagram", "Style");
  await fillSource(page, "@startuml\nclass SharedPart\n@enduml");
  await newDiagram(page, "Class diagram", "Main");
  await fillSource(page, "@startuml\n!include Style\nclass Local\nSharedPart --> Local\n@enduml");
}

test("a URL include is blocked with a clear message and nothing is fetched", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) requested.push(new URL(request.url()).hostname);
  });
  await prepareEditor(page);
  await newDiagram(page, "Sequence diagram");
  await fillSource(page, "@startuml\n!include https://example.test/style.puml\nAlice -> Bob : hi\n@enduml");
  await expect(page.locator(".diagram svg")).toContainText("Alice", { timeout: 45_000 });
  await expect(includesSummary(page)).toContainText("1 not loaded");
  await includesSummary(page).click();
  const list = page.getByRole("list", { name: "Includes" });
  await expect(list).toContainText("This include reads from the internet, which PlantUML Ultimate never does");
  await expect(list).toContainText("Blocked");
  // The include line carries the same message as an editor diagnostic.
  await expect(page.locator(".cm-lintRange-warning").first()).toBeVisible();
  expect(requested).not.toContain("example.test");
  expect(requested.filter((host) => host !== "127.0.0.1")).toEqual([]);
});

test("well-known C4-PlantUML links render from the bundled library without any request", async ({ page }) => {
  const reached: string[] = [];
  await page.route(/raw\.githubusercontent\.com/, (route) => {
    reached.push(route.request().url());
    return route.abort();
  });
  await prepareEditor(page);
  await newDiagram(page, "C4 diagram");
  await fillSource(
    page,
    [
      "@startuml",
      "!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml",
      'Person(user, "Linked customer")',
      'Container(web, "Linked web app", "React")',
      'Rel(user, web, "Uses")',
      "@enduml",
    ].join("\n"),
  );
  await expect(page.locator(".diagram svg")).toContainText("Linked web app", { timeout: 45_000 });
  await expect(page.locator(".render-notice.error")).toHaveCount(0);
  expect(reached).toEqual([]);
  await includesSummary(page).click();
  const list = page.getByRole("list", { name: "Includes" });
  await expect(list).toContainText("Bundled library");
  await expect(list).toContainText("Loaded");
});

test("a diagram includes another diagram of the same document by name, and follows its edits", async ({ page }) => {
  test.setTimeout(90_000);
  await documentWithStyle(page);
  await expect(page.locator(".diagram svg")).toContainText("SharedPart", { timeout: 45_000 });
  await expect(page.locator(".diagram svg")).toContainText("Local");
  await includesSummary(page).click();
  const list = page.getByRole("list", { name: "Includes" });
  await expect(list).toContainText("Style");
  await expect(list).toContainText("This document");
  await expect(list).toContainText("Loaded");
  await includesSummary(page).click();

  // Changing the included diagram changes the diagram that includes it.
  await openTab(page, "Style");
  await fillSource(page, "@startuml\nclass SharedPart\nclass AddedLater\n@enduml");
  await openTab(page, "Main");
  await expect(page.locator(".diagram svg")).toContainText("SharedPart", { timeout: 45_000 });
  await expect(page.locator(".diagram svg")).toContainText("AddedLater", { timeout: 45_000 });
  // Main itself was not edited.
  expect(await readEditorSource(page)).toBe("@startuml\n!include Style\nclass Local\nSharedPart --> Local\n@enduml");
});

test("an error inside an included diagram names that diagram and its line", async ({ page }) => {
  test.setTimeout(90_000);
  await documentWithStyle(page);
  await expect(page.locator(".diagram svg")).toContainText("SharedPart", { timeout: 45_000 });
  await openTab(page, "Style");
  await fillSource(page, "@startuml\nclass SharedPart\nthis line is wrong\n@enduml");
  await openTab(page, "Main");
  const notice = page.locator(".render-notice.syntax");
  await expect(notice).toContainText("Line 3 of Style can't be drawn", { timeout: 45_000 });
  await expect(notice).toContainText("this line is wrong");
  await expect(page.locator(".statusbar")).toContainText("line 3 in Style");
  // The error is in Style, so Main's own lines are not blamed.
  await expect(notice.getByRole("button", { name: /Go to line/ })).toHaveCount(0);
});

test("a missing include is marked, offers to add the diagram, and Ctrl/Cmd-click opens an include", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await documentWithStyle(page);
  await expect(page.locator(".diagram svg")).toContainText("SharedPart", { timeout: 45_000 });

  // Ctrl/Cmd-click on the include line opens the diagram it includes.
  await page
    .locator(".cm-line")
    .filter({ hasText: "!include Style" })
    .click({ modifiers: ["ControlOrMeta"] });
  await expect(tabs(page).filter({ hasText: "Style" })).toHaveClass(/active/);
  expect(await readEditorSource(page)).toBe("@startuml\nclass SharedPart\n@enduml");

  await openTab(page, "Main");
  await fillSource(page, "@startuml\n!include Palette\nclass Local\n@enduml");
  await expect(includesSummary(page)).toContainText("1 not loaded", { timeout: 45_000 });
  await page.locator(".cm-lintRange-error").first().hover();
  const tooltip = page.locator(".cm-tooltip-lint");
  await expect(tooltip).toContainText("Palette isn't in this document.");
  await tooltip.getByRole("button", { name: "Add as a new diagram" }).click();
  await expect(tabs(page).filter({ hasText: "Palette" })).toBeVisible();
  // The new diagram starts with a shared-style body and the include now resolves.
  await openTab(page, "Main");
  await expect(includesSummary(page)).not.toContainText("not loaded", { timeout: 45_000 });
  await expect(includesSummary(page)).toContainText("1 include");
});
