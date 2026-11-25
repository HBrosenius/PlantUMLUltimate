import { expect, test, type Page } from "./coverage";
import { fillSource, openRibbonGroup, prepareEditor, readEditorSource } from "./editor-helpers";

const chooser = (page: Page) => page.getByRole("dialog", { name: "Choose a diagram type" });

async function createC4(page: Page, level: string) {
  await page.getByRole("button", { name: "New diagram tab", exact: true }).click();
  const dialog = chooser(page);
  await dialog.getByRole("button", { name: "C4 diagram", exact: true }).click();
  await dialog.getByLabel("C4 diagram type").selectOption(level);
  await dialog.getByRole("button", { name: "Create diagram", exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function selectedLine(page: Page) {
  return page.evaluate(async () => {
    const modulePath = "/node_modules/.vite/deps/@codemirror_view.js";
    const { EditorView } = await import(modulePath);
    const state = EditorView.findFromDOM(document.querySelector(".cm-editor"))?.state;
    return state?.doc.lineAt(state.selection.main.from).text ?? "";
  });
}

test("the chooser creates a C4 Container diagram that renders with its element labels", async ({ page }) => {
  await prepareEditor(page);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) requests.push(new URL(request.url()).hostname);
  });
  await createC4(page, "container");
  const source = await readEditorSource(page);
  expect(source).toContain("!include <C4/C4_Container>");
  expect(source).toContain("ContainerDb(db");
  await expect(page.locator(".statusbar")).toContainText("C4");
  const svg = page.locator(".diagram svg");
  for (const label of ["Customer", "Web app", "API", "Database", "PostgreSQL", "Uses"])
    await expect(svg).toContainText(label, { timeout: 45_000 });
  await expect(page.locator(".render-notice.error")).toHaveCount(0);
  await expect(page.locator(".statusbar")).toContainText("No issues");
  // The library is bundled: nothing but the app's own origin was contacted.
  expect(requests.filter((host) => host !== "127.0.0.1")).toEqual([]);
});

test("every C4 starter renders its own diagram type", async ({ page }) => {
  test.setTimeout(90_000);
  await prepareEditor(page);
  const expected: Record<string, string[]> = {
    context: ["Payment provider", "Web shop", "Customer"],
    container: ["Web app", "Database"],
    component: ["Order controller", "Order repository"],
    dynamic: ["Sends the order", "Confirms"],
    deployment: ["Cloud region", "App server", "Database server"],
  };
  for (const [level, labels] of Object.entries(expected)) {
    await createC4(page, level);
    expect(await readEditorSource(page)).toContain(`!include <C4/C4_${level[0]!.toUpperCase()}${level.slice(1)}>`);
    for (const label of labels) await expect(page.locator(".diagram svg")).toContainText(label, { timeout: 45_000 });
    await expect(page.locator(".render-notice.error")).toHaveCount(0);
  }
});

test("C4 examples are offered in the chooser", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab", exact: true }).click();
  const dialog = chooser(page);
  await dialog.getByRole("button", { name: "Examples", exact: true }).click();
  await dialog.getByLabel("Example diagram type").selectOption("c4");
  for (const title of ["C4 System context", "C4 Container", "C4 Component", "C4 Dynamic", "C4 Deployment"])
    await expect(dialog.getByRole("button", { name: new RegExp(title) })).toBeVisible();
  await dialog.getByRole("button", { name: /C4 Deployment/ }).click();
  await dialog.getByRole("button", { name: "Create diagram", exact: true }).click();
  expect(await readEditorSource(page)).toContain("Deployment_Node(cloud");
  await expect(page.locator(".diagram svg")).toContainText("Cloud region", { timeout: 45_000 });
});

test("the outline lists people, systems, containers, boundaries and relationships and reveals their source line", async ({
  page,
}) => {
  await prepareEditor(page);
  await createC4(page, "container");
  await expect(page.locator(".diagram svg")).toContainText("Web app", { timeout: 45_000 });
  await openRibbonGroup(page, "View", "Navigation and panels");
  await page.getByRole("button", { name: "Outline", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Diagram outline", exact: true });
  const results = modal.getByRole("list", { name: "Diagram elements" });
  await expect(results.getByRole("button", { name: /^Customer Person/ })).toBeVisible();
  await expect(results.getByRole("button", { name: /^Web shop Boundary/ })).toBeVisible();
  await expect(results.getByRole("button", { name: /^API Container/ })).toBeVisible();
  await expect(results.getByRole("button", { name: /^Payment provider External system/ })).toBeVisible();
  await expect(results.getByRole("button", { name: /^Reads and writes Relationship/ })).toBeVisible();
  // A container shows the boundary it sits in.
  await expect(results.getByRole("button", { name: /^Database Container/ })).toContainText("Web shop");
  await results.getByRole("button", { name: /^Database Container/ }).click();
  await expect.poll(() => selectedLine(page)).toContain('ContainerDb(db, "Database"');
  const source = await readEditorSource(page);
  await fillSource(page, source);
});

test("macro completion offers C4 macros with their parameters as tab stops", async ({ page }) => {
  await prepareEditor(page);
  await createC4(page, "container");
  await expect(page.locator(".diagram svg")).toContainText("Web app", { timeout: 45_000 });
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("ContainerQ");
  const tooltip = page.locator(".cm-tooltip-autocomplete");
  await expect(tooltip).toContainText("ContainerQueue");
  await expect(tooltip).toContainText("alias, label, techn?, descr?");
  await tooltip.locator(".cm-completionLabel", { hasText: /^ContainerQueue$/ }).click();
  await expect.poll(() => readEditorSource(page)).toContain('ContainerQueue(alias, "label", "techn", "descr")');
});

test("a C4 macro without the include gets a quick fix that adds it", async ({ page }) => {
  await prepareEditor(page);
  await createC4(page, "container");
  await expect(page.locator(".diagram svg")).toContainText("Web app", { timeout: 45_000 });
  await fillSource(page, '@startuml\nContainer(web, "Web app", "React")\n@enduml');
  await expect(page.locator(".statusbar")).toContainText("1 issue", { timeout: 15_000 });
  await page.getByLabel("Show source fix suggestions").click();
  await page
    .getByRole("list", { name: "Source fix suggestions", exact: true })
    .getByRole("button", { name: /Apply fix/ })
    .click();
  await expect.poll(() => readEditorSource(page)).toContain("!include <C4/C4_Container>");
});
