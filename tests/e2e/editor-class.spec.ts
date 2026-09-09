import { expect, test } from "@playwright/test";

import { pointInText, prepareEditor, setSource } from "./editor-helpers";

test.beforeEach(async ({ page }) => {
  await prepareEditor(page);
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
  await expect(page.locator(".cm-symbol-reference")).toHaveCount(5);
  await expect(page.getByRole("complementary", { name: "Class object inspector" })).toHaveCount(0);

  await page.mouse.click(entityReference.x, entityReference.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Find references" }).click();
  const references = page.getByRole("complementary", { name: "References for Account" });
  await expect(references).toContainText("5 occurrences");
  await references.getByRole("button", { name: "Close references" }).click();

  await page.mouse.click(entityReference.x, entityReference.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Rename…" }).click();
  const rename = page.getByRole("dialog", { name: "Rename class entity alias" });
  await expect(rename).toContainText("4 semantic occurrences");
  await rename.getByLabel("New name").fill("Profile");
  await rename.getByRole("button", { name: "Rename" }).click();
  await expect(page.locator(".cm-content")).toContainText('class "Customer account" as Profile');
  await expect(page.locator(".cm-content")).toContainText("+owner: Profile");
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

  let methodMember = inspector.getByRole("listitem").nth(1);
  await expect(methodMember.getByLabel("Parameter 1 name")).toHaveValue("owner");
  await expect(methodMember.getByLabel("Parameter 1 type")).toHaveValue("User");
  await methodMember.getByRole("button", { name: "Add parameter" }).click();
  await methodMember.getByLabel("Parameter 2 name").fill("options");
  await methodMember.getByLabel("Parameter 2 type").fill("Map<String, Account>");
  await methodMember.getByLabel("Parameter 2 type").blur();
  await expect(page.locator(".cm-content")).toContainText("open(owner: User, options: Map<String, Account>): Account");

  methodMember = inspector.getByRole("listitem").nth(1);
  await methodMember.getByRole("button", { name: "Move parameter 2 up" }).click();
  await expect(page.locator(".cm-content")).toContainText("open(options: Map<String, Account>, owner: User): Account");
  methodMember = inspector.getByRole("listitem").nth(1);
  await methodMember.getByRole("button", { name: "Edit as raw text" }).click();
  await methodMember.getByLabel("Raw parameters").fill("Account account, User owner");
  await methodMember.getByLabel("Raw parameters").blur();
  await expect(page.locator(".cm-content")).toContainText("open(Account account, User owner): Account");
  methodMember = inspector.getByRole("listitem").nth(1);
  await expect(methodMember.getByRole("button", { name: "Use structured fields" })).toBeDisabled();

  await inspector.getByLabel("New member kind").selectOption("method");
  await inspector.getByLabel("New member name").fill("close");
  await inspector.getByLabel("New member type").fill("void");
  await inspector.getByRole("button", { name: "Add member" }).click();
  await expect(page.locator(".cm-content")).toContainText("close(): void");
});

test("completes Class aliases in member type signatures", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: /Class diagram/ })
    .click();
  await setSource(
    page,
    '@startuml\nclass "Customer account" as Customer\nclass Service {\n  +owner: Cus\n  +load(customer: Customer): Customer\n}\n@enduml',
  );

  const memberLine = page.locator(".cm-line").filter({ hasText: "+owner: Cus" });
  await memberLine.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Control+Space");
  const completions = page.locator(".cm-tooltip-autocomplete");
  await expect(completions).toContainText("Customer account");
  await expect(completions).toContainText("alias Customer");
  await completions.locator(".cm-completionLabel", { hasText: "Customer account" }).click();
  await expect(page.locator(".cm-content")).toContainText("+owner: Customer");

  await page.locator('[data-class-object-id="service"]').first().click();
  const inspector = page.getByRole("complementary", { name: "Class object inspector" });
  const memberType = inspector.getByLabel("Member type").first();
  const typeListId = await memberType.getAttribute("list");
  expect(typeListId).toBeTruthy();
  await expect(inspector.getByLabel("Generic type")).toHaveAttribute("list", typeListId!);
  await expect(inspector.getByLabel("New member type")).toHaveAttribute("list", typeListId!);
  await expect(
    inspector.locator(`datalist[id="${typeListId}"] option[value="Customer"][label="Customer account"]`),
  ).toHaveCount(1);

  await expect(inspector.getByLabel("Parameter 1 type")).toHaveAttribute("list", typeListId!);
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

test("creates and edits Class diagram objects, members, relationships, packages, and settings", async ({
  page,
  browserName,
}) => {
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
  await rel.getByLabel("Color", { exact: true }).fill("DarkGreen");
  await rel.getByRole("button", { name: "Add relationship" }).click();
  await expect(page.locator(".cm-content")).toContainText('Order "1" *-[#DarkGreen]-> "many" Status : state');

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Package or namespace…" }).click();
  const classPackage = page.getByRole("dialog", { name: "Add Class package" });
  await classPackage.getByLabel("Package name").fill("Reporting");
  await classPackage.getByLabel("Package alias").fill("Reports");
  await classPackage.getByLabel("Color", { exact: true }).fill("Lavender");
  await classPackage.getByLabel("Parent container").selectOption("ordering");
  await classPackage.getByRole("button", { name: "Add package" }).click();
  await expect(page.locator(".cm-content")).toContainText('package "Reporting" as Reports #Lavender');

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Note…" }).click();
  const classNote = page.getByRole("dialog", { name: "Add Class note" });
  await classNote.getByLabel("Attached to").selectOption("status");
  await classNote.getByLabel("Position").selectOption("left");
  await classNote.getByLabel("Text").fill("Lifecycle state");
  await classNote.getByLabel("Color", { exact: true }).fill("Wheat");
  await classNote.getByRole("button", { name: "Add note" }).click();
  await expect(page.locator(".cm-content")).toContainText("note left of Status #Wheat : Lifecycle state");

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Note…" }).click();
  const relationshipNote = page.getByRole("dialog", { name: "Add Class note" });
  await relationshipNote.getByLabel("Attached to").selectOption("relationship-2");
  await expect(relationshipNote.getByLabel("Position")).toHaveCount(0);
  await relationshipNote.getByLabel("Text").fill("State ownership");
  await relationshipNote.getByLabel("Color", { exact: true }).fill("LightYellow");
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

  if (browserName !== "webkit") {
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
  }

  const orderLineHit = page.locator('[data-class-object-type="entity"][data-class-object-id="orderline"]');
  await orderLineHit.press("Alt+ArrowUp");
  await expect.poll(() => page.locator(".cm-content").innerText()).toMatch(/class OrderLine[\s\S]*class Order/);
  await orderLineHit.press("c");
  await expect(page.getByText("Choose another class and press Enter · Esc cancels")).toBeVisible();
  const statusHit = page.locator('[data-class-object-type="entity"][data-class-object-id="status"]');
  await statusHit.press("Enter");
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
