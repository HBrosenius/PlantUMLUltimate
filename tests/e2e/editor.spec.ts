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

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cm-content")).toBeVisible();
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
  await expect(dialog.getByRole("table", { name: "Source differences" })).not.toContainText("Project starts 2026-09-01");
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

test("creates a Sequence tab with diagram-specific tools", async ({ page }) => {
  test.setTimeout(60_000);
  await page.getByRole("button", { name: "New document tab" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await expect(chooser).toBeVisible();
  await expect(chooser.locator(".diagram-kind-preview")).toHaveCount(2);
  await expect(chooser.locator(".diagram-kind-beta")).toHaveText("Beta");
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

  await page.locator('[data-sequence-drag-hit][aria-label="Drag participant Orders"]').first().click();
  const participantInspector = page.getByRole("complementary", { name: "Participant inspector" });
  await expect(participantInspector).toBeVisible();
  await expect(participantInspector.getByRole("combobox", { name: "Participant kind" })).toContainText("Database");
  await participantInspector.getByRole("combobox", { name: "Participant kind" }).click();
  await expect(participantInspector.getByRole("option", { name: /Actor/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await participantInspector.getByLabel("Name").fill("Order store");
  await participantInspector.getByLabel("Alias").fill("Orders");
  await participantInspector.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText('database "Order store" as Orders <<(D,#FDE68A) Store>> order 30');
  await page.getByRole("button", { name: "Copy PlantUML source" }).click();
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

  await page.locator('[data-sequence-drag-hit][aria-label="Drag message Request"]').click();
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
  const refreshedUserParticipant = page.locator('[data-sequence-drag-hit][data-sequence-participant-id="user"]').first();
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
      return text.indexOf("System --> User: Response") < text.indexOf("User -->> Orders ++: Create request");
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
  await page.getByRole("dialog", { name: "Add Sequence create" }).getByLabel("Participant type").selectOption("control");
  await page.getByRole("dialog", { name: "Add Sequence create" }).getByLabel("Name").fill("Worker");
  await page.getByRole("dialog", { name: "Add Sequence create" }).getByRole("button", { name: "Add", exact: true }).click();
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
  await page.getByRole("dialog", { name: "Choose a diagram type" }).getByRole("button", { name: "Sequence diagram" }).click();
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
  await page.getByRole("dialog", { name: "Choose a diagram type" }).getByRole("button", { name: "Sequence diagram" }).click();

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
  await page.getByRole("button", { name: "Copy PlantUML source" }).click();
  await expect(page.getByRole("button", { name: "Copy PlantUML source" })).toHaveText("Copied!");
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
  await page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-18"]').click();
  const menu = page.getByRole("dialog", { name: "2026-09-18" });
  await expect(menu).toBeVisible();
  await expect(menu).toContainText("No date setting");
  await menu.getByRole("button", { name: "Highlight date" }).click();

  const dialog = page.getByRole("dialog", { name: "Highlight 2026-09-18" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Color").fill("#ffd700");
  await dialog.getByRole("button", { name: "Highlight" }).click();
  await expect(page.locator(".cm-content")).toContainText("2026-09-18 is colored in #ffd700");

  await page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-18"]').click();
  const reopenedMenu = page.getByRole("dialog", { name: "2026-09-18" });
  await expect(reopenedMenu).toContainText("Currently highlighted");
  await reopenedMenu.getByRole("button", { name: "Clear date setting" }).click();
  await expect(page.locator(".cm-content")).not.toContainText("2026-09-18 is colored in");
});

test("opens the date action menu when a task inspector is already open", async ({ page }) => {
  await setSource(page, source("[Build] lasts 25 days"));
  await page.locator('[data-task-id="build"] .bar').click();
  await expect(page.getByRole("complementary", { name: "Task inspector" })).toBeVisible();
  await page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-18"]').click();
  await expect(page.getByRole("complementary", { name: "Task inspector" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "2026-09-18" })).toBeVisible();
});

test("opens the date action menu from both timeline header rows", async ({ page }) => {
  await setSource(page, source("[Build] lasts 25 days"));
  const top = page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-18"]');
  const bottom = page.locator('[data-timeline-header="bottom"][data-timeline-date="2026-09-18"]');
  await expect(top).toHaveCount(1);
  await expect(bottom).toHaveCount(1);
  await top.click();
  await expect(page.getByRole("dialog", { name: "2026-09-18" })).toBeVisible();
  await page
    .getByRole("dialog", { name: "2026-09-18" })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await bottom.click();
  await expect(page.getByRole("dialog", { name: "2026-09-18" })).toBeVisible();
});

test("marks and clears a closed day by clicking the timeline header", async ({ page }) => {
  await setSource(page, source("[Build] lasts 25 days"));
  await page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-18"]').click();
  const menu = page.getByRole("dialog", { name: "2026-09-18" });
  await menu.getByRole("button", { name: "Mark as closed day" }).click();
  await expect(page.locator(".cm-content")).toContainText("2026-09-18 is closed");

  await page.locator('[data-timeline-header="top"][data-timeline-date="2026-09-18"]').click();
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
  await expect(page.getByLabel("Development performance metrics")).toContainText("32 tasks");
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
  await expect(page.locator('iframe[title="Local PlantUML renderer"]')).toHaveCount(1);
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
  const handle = await page.locator("[data-task-id=a] [data-dependency-handle]").boundingBox();
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
  await expect(page.locator(".cm-content")).toContainText(
    "[B] on {Kalle:100%} starts 2026-09-05",
  );
});

test("removes one person from a task with multiple assignments", async ({ page }) => {
  await setSource(
    page,
    source("[A] on {Kalle:100%} {Lisa:50%} starts 2026-09-01\n[A] lasts 4 days"),
  );
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
  await setSource(
    page,
    source("[A] starts 2026-09-01\n[A] lasts 5 days\n[B] lasts 3 days\n[B] starts at [A]'s end"),
  );
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
  await setSource(
    page,
    source(
      "[A] starts 2026-09-01\n[A] lasts 3 days\n[B] starts 2026-09-08\n[B] lasts 3 days",
    ),
  );
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

  await expect.poll(async () => {
    const a = await page.locator('[data-task-id="a"] .bar').boundingBox();
    const b = await page.locator('[data-task-id="b"] .bar').boundingBox();
    return a && b ? Math.abs(a.x - b.x) : Number.POSITIVE_INFINITY;
  }).toBeLessThan(10);

  await page.locator('[data-task-id="a"] .bar').click();
  const handle = await page.locator('[data-task-id="a"] [data-dependency-handle]').boundingBox();
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
  await inspector.getByRole("button", { name: "End → duration" }).click();
  await expect(inspector.getByRole("textbox", { name: "End", exact: true })).toHaveValue("");
  await expect(inspector.locator("label").filter({ hasText: "Duration" }).locator("input")).toHaveValue("3");
  await expect(page.locator(".cm-content")).toContainText("[A] lasts 3 days");
  await expect(page.locator(".cm-content")).not.toContainText("ends 2026-09-08");

  await page.locator("[data-task-id=a] .bar").click();
  await inspector.getByRole("button", { name: "Duration → end" }).click();
  await expect(inspector.getByRole("textbox", { name: "End", exact: true })).toHaveValue("2026-09-08");
  await expect(inspector.locator("label").filter({ hasText: "Duration" }).locator("input")).toHaveValue("");
  await expect(page.locator(".cm-content")).toContainText("[A] ends 2026-09-08");
  await expect(page.locator(".cm-content")).not.toContainText("lasts 3 days");
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
