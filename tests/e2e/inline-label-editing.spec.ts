import { expect, test, type Page } from "@playwright/test";
import { prepareEditor, setSource, readEditorSource, waitForDiagramRender } from "./editor-helpers";

const cases = [
  {
    type: "Class",
    label: "Order",
    selector: '[data-class-object-id="o"]:not([data-class-member-id])',
    source: '@startuml\nclass "Order" as O\nclass Customer\nO --> Customer : Order prose\n\' keep me\n@enduml',
    expected: 'class "Purchase" as O',
  },
  {
    type: "Component",
    label: "Order",
    selector: '[data-class-object-id="o"]:not([data-class-member-id])',
    source: '@startuml\ncomponent "Order" as O\ncomponent Customer\nO --> Customer : Order prose\n\' keep me\n@enduml',
    expected: 'component "Purchase" as O',
  },
  {
    type: "Use Case",
    label: "Order",
    selector: '[data-usecase-object-id="o"]',
    source: '@startuml\nusecase "Order" as O\nactor Customer\nCustomer --> O : Order prose\n\' keep me\n@enduml',
    expected: 'usecase "Purchase" as O',
  },
  {
    type: "Activity",
    label: "Order",
    selector: '[data-activity-object-type="action"][data-activity-object-id][tabindex]',
    source: "@startuml\n:Order;\n:Review;\n' keep me\n@enduml",
    expected: ":Purchase;\n:Review;",
  },
];

for (const item of cases)
  test(`${item.type} labels edit inline with cancellation, validation and undo`, async ({ page }) => {
    await prepareEditor(page);
    await page.getByRole("button", { name: "New diagram tab" }).click();
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: new RegExp(`${item.type} diagram`) })
      .click();
    await prepareDiagram(page, item.source);
    await waitForDiagramRender(page);
    const object = page.locator(`.diagram ${item.selector}`).first();
    await object.focus();
    await page.keyboard.press("F2");
    const editor = page.getByRole("dialog", { name: "Edit diagram label" });
    const label = editor.getByRole("textbox", { name: "Label", exact: true });
    await expect(label).toHaveValue(item.label);
    await label.fill("Cancelled draft");
    await page.keyboard.press("Escape");
    await expect(editor).toHaveCount(0);
    expect(await readEditorSource(page)).toBe(item.source);
    await object.click();
    await page.getByRole("button", { name: "Rename label", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.locator(".task-inspector:visible").first()).toBeVisible();
    await page.getByRole("button", { name: "Rename label", exact: true }).click();
    await label.fill("");
    await expect(editor.getByRole("button", { name: "Apply label" })).toBeDisabled();
    await label.fill("Purchase");
    await label.press("Enter");
    await expect(editor).toHaveCount(0);
    await expect.poll(() => readEditorSource(page)).toContain(item.expected);
    await expect.poll(() => readEditorSource(page)).toContain("' keep me");
    if (item.type !== "Activity") await expect.poll(() => readEditorSource(page)).toContain("Order prose");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => readEditorSource(page)).toBe(item.source);
  });

test("inline drafts stay reviewable on phones and block changed source", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: /Class diagram/ })
    .click();
  await prepareDiagram(page, cases[0]!.source);
  const object = page.locator('.diagram [data-class-object-id="o"]:not([data-class-member-id])').first();
  await object.focus();
  await page.keyboard.press("F2");
  const editor = page.getByRole("dialog", { name: "Edit diagram label" });
  await editor.getByRole("textbox", { name: "Label", exact: true }).fill("Purchase");
  await page.screenshot({ path: "docs/audits/2026-10-10-a30/desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(editor.getByRole("button", { name: "Apply label" })).toBeInViewport();
  await page.screenshot({ path: "docs/audits/2026-10-10-a30/phone.png" });
  await page.setViewportSize({ width: 1280, height: 900 });
  const changed = cases[0]!.source.replace("keep me", "external edit");
  await prepareDiagram(page, changed);
  await expect(editor.getByRole("alert")).toContainText("diagram changed");
  await expect(editor.getByRole("button", { name: "Apply label" })).toBeDisabled();
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await readEditorSource(page)).toBe(changed);
});

test("ambiguous rendered labels do not rename an inferred Activity identity", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: /Activity diagram/ })
    .click();
  const source = "@startuml\n:Review;\n:Review;\n@enduml";
  await prepareDiagram(page, source);
  await page.getByRole("button", { name: "Select action Review", exact: true }).last().focus();
  await page.keyboard.press("F2");
  await expect(page.getByRole("dialog", { name: "Edit diagram label" })).toHaveCount(0);
  await expect(page.locator(".statusbar")).toContainText("cannot be identified uniquely");
  expect(await readEditorSource(page)).toBe(source);
});

test("renames an Activity partition from its keyboard-accessible container tray", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: /Activity diagram/ })
    .click();
  await prepareDiagram(page, '@startuml\npartition "Operations" {\n:Review;\n}\n@enduml');
  await page
    .getByRole("group", { name: "Activity partitions" })
    .getByRole("button", { name: "Operations", exact: true })
    .click();
  await page.getByRole("button", { name: "Rename label", exact: true }).click();
  const label = page
    .getByRole("dialog", { name: "Edit diagram label" })
    .getByRole("textbox", { name: "Label", exact: true });
  await expect(label).toHaveValue("Operations");
  await label.fill("Fulfilment");
  await label.press("Enter");
  await expect.poll(() => readEditorSource(page)).toContain('partition "Fulfilment"');
});

async function prepareDiagram(page: Page, source: string) {
  await setSource(page, source);
  const hint = page.getByRole("button", { name: "Dismiss editing hint" });
  if (await hint.isVisible()) await hint.click();
}
