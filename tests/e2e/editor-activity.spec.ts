import { expect, test } from "@playwright/test";

import { pointInText, prepareEditor, setSource } from "./editor-helpers";

test.beforeEach(async ({ page }) => {
  await prepareEditor(page);
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
  await page.locator(".cm-content").focus();
  await page.keyboard.press("F2");
  const partitionRename = page.getByRole("dialog", { name: "Rename activity partition" });
  await partitionRename.getByLabel("New name").fill("Fulfilment");
  await partitionRename.getByRole("button", { name: "Rename" }).click();
  await expect(page.locator(".cm-content")).toContainText('partition "Fulfilment"');
});

test("reorders Activity actions with the keyboard", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: /Activity diagram/ })
    .click();
  await setSource(page, "@startuml\n:First step;\n:Second step;\n@enduml");
  const secondAction = page.getByRole("button", { name: "Select action Second step" });
  await secondAction.focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect
    .poll(async () => {
      const text = await page.locator(".cm-content").innerText();
      return text.indexOf(":Second step;") < text.indexOf(":First step;");
    })
    .toBe(true);
  await expect(page.getByRole("button", { name: "Select action Second step" })).toBeFocused();
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
  const title = settings.getByLabel("Title");
  await expect
    .poll(async () => {
      if ((await page.locator(".cm-content").innerText()).includes("title Order lifecycle")) return true;
      await title.fill("Order lifecycle");
      await title.evaluate((element) => element.blur());
      return false;
    })
    .toBe(true);

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Partition…" }).click();
  const partition = page.getByRole("dialog", { name: "Add Activity partition" });
  await partition.getByLabel("Name").fill("Operations");
  await partition.getByLabel("Color", { exact: true }).fill("Lavender");
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
  await action.getByLabel("Color", { exact: true }).fill("PaleGreen");
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
  await flowArrow.getByLabel("Color", { exact: true }).fill("Blue");
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
