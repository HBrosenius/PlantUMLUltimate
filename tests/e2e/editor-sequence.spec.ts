import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

import { pointInText, prepareEditor, setSource } from "./editor-helpers";

test.beforeEach(async ({ page }) => {
  await prepareEditor(page);
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

test("keeps inspector focus, zoom, and split position after applying a source edit", async ({ page, browserName }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram" })
    .click();
  await setSource(page, "@startuml\nparticipant API\nparticipant Store\nAPI -> Store: Save\n@enduml");

  const divider = page.getByRole("separator");
  const expectedDividerX = await page.evaluate(() => window.innerWidth / 2);
  await expect.poll(async () => (await divider.boundingBox())!.x).toBeCloseTo(expectedDividerX, 0);
  const initialDividerX = (await divider.boundingBox())!.x;
  await page.getByRole("button", { name: "Zoom in" }).click();
  const resetZoom = page.getByRole("button", { name: /Reset zoom/ });
  const zoomLabel = await resetZoom.textContent();
  expect(zoomLabel).not.toBe("100%");

  const participant = page.locator('[data-sequence-drag-hit][aria-label="Drag participant API"]').first();
  await participant.click();
  const inspector = page.getByRole("complementary", { name: "Participant inspector" });
  await inspector.getByLabel("Name").fill("");
  await expect(inspector.getByRole("alert")).toHaveText("Enter a participant name.");
  await expect(inspector.getByRole("button", { name: "Apply" })).toBeDisabled();
  await inspector.getByLabel("Name").fill("API");
  await inspector.getByLabel("Color", { exact: true }).fill("LightBlue");
  const apply = inspector.getByRole("button", { name: "Apply" });
  await apply.click();

  await expect(page.locator(".cm-content")).toContainText("participant API LightBlue");
  if (browserName !== "webkit") await expect(inspector.getByRole("button", { name: "Apply" })).toBeFocused();
  await expect(resetZoom).toHaveText(zoomLabel!);
  await expect.poll(async () => (await divider.boundingBox())!.x).toBeCloseTo(initialDividerX, 0);
});

test("renames created Sequence lifelines and suggests duration anchors", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram" })
    .click();
  await setSource(
    page,
    "@startuml\n!pragma teoz true\nparticipant API\ncreate database Store\n{start} API -> Store: Save\n{finish} Store --> API: Saved\nnote right of Store: Ready\n{start} <-> {finish}: elapsed\n@enduml",
  );

  const createdReference = await pointInText(page, 4, "Store");
  await page.mouse.click(createdReference.x, createdReference.y);
  await expect(page.locator(".cm-symbol-reference")).toHaveCount(4);
  await page.keyboard.press("F2");
  const rename = page.getByRole("dialog", { name: "Rename participant" });
  await expect(rename).toContainText("4 semantic occurrences");
  await rename.getByLabel("New name").fill("Orders");
  await rename.getByRole("button", { name: "Rename" }).click();
  await expect(page.locator(".cm-content")).toContainText("create database Orders");
  await expect(page.locator(".cm-content")).toContainText("API -> Orders: Save");
  await expect(page.locator(".cm-content")).toContainText("Orders --> API: Saved");
  await expect(page.locator(".cm-content")).toContainText("note right of Orders: Ready");

  await page.getByRole("button", { name: "Drag Duration: elapsed vertically", exact: true }).click();
  const inspector = page.getByRole("complementary", { name: "Sequence structure inspector" });
  await expect(inspector.getByLabel("Start anchor")).toHaveAttribute("list", "sequence-anchor-options");
  await expect(inspector.locator("#sequence-anchor-options option")).toHaveCount(2);
  await expect(inspector.locator('#sequence-anchor-options option[value="start"]')).toHaveCount(1);
  await expect(inspector.locator('#sequence-anchor-options option[value="finish"]')).toHaveCount(1);

  const anchorReference = await pointInText(page, 7, "finish");
  await page.mouse.click(anchorReference.x, anchorReference.y);
  await expect(page.locator(".cm-symbol-reference")).toHaveCount(2);
  await page.keyboard.press("F2");
  const anchorRename = page.getByRole("dialog", { name: "Rename sequence anchor" });
  await anchorRename.getByLabel("New name").fill("done");
  await anchorRename.getByRole("button", { name: "Rename" }).click();
  await expect(page.locator(".cm-content")).toContainText("{done} Orders --> API: Saved");
  await expect(page.locator(".cm-content")).toContainText("{start} <-> {done}: elapsed");
  await expect(page.locator(".sequence-diagram").locator("..")).not.toHaveClass(/stale-preview/);
});

test("reviews and applies a confirmed Sequence change group", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram" })
    .click();
  await expect(page.locator(".cm-content")).toContainText("@startuml");
  const before = '@startuml\nparticipant "Payment API" as Pay\nhide footbox\nPay -> Store: Authorize\n@enduml';
  const proposed = '@startuml\nparticipant "Billing API" as Pay\nhide footbox\nPay -> Store: Capture\n@enduml';
  await setSource(page, before);
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  const dialog = page.getByRole("dialog", { name: "Version history" });
  await dialog.getByLabel("New version name").fill("Before review");
  await dialog.getByRole("button", { name: "Create version" }).click();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  await setSource(page, proposed);
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  await expect(dialog.getByLabel("Semantic changes")).toContainText("Rename participant Payment API to Billing API");
  await expect(dialog.getByLabel("Semantic changes")).toContainText("Change message Pay → Store");
  await dialog
    .getByRole("button", { name: "Show Rename participant Payment API to Billing API in rendered diagrams" })
    .click();
  await expect(dialog.getByRole("button", { name: "Rendered", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByLabel("Change highlight legend")).toContainText("Removed");
  await expect(dialog.getByLabel("Change highlight legend")).toContainText("Modified");
  await expect(dialog.getByLabel("Change highlight legend")).toContainText("Added");
  await expect(dialog.getByLabel("Before review rendered diagram").locator(".semantic-render-highlight")).toHaveCount(
    1,
    { timeout: 20_000 },
  );
  await expect(
    dialog.getByLabel("Current working copy rendered diagram").locator(".semantic-render-highlight"),
  ).toHaveCount(1);
  await expect(
    dialog.getByLabel("Before review rendered diagram").locator(".semantic-render-highlight-modified"),
  ).toHaveCount(1);
  await expect(
    dialog.getByLabel("Current working copy rendered diagram").locator(".semantic-render-highlight-modified"),
  ).toHaveCount(1);
  await dialog.getByRole("button", { name: "Review", exact: true }).click();
  await dialog.getByRole("button", { name: "Show Rename participant Payment API to Billing API in source" }).click();
  await expect(dialog.getByRole("button", { name: "Source", exact: true })).toHaveAttribute("aria-pressed", "true");
  const highlightedSource = dialog.locator(".version-diff-line.active-review-group");
  await expect(highlightedSource).toHaveCount(2);
  await expect(highlightedSource.filter({ hasText: 'participant "Payment API" as Pay' })).toHaveCount(1);
  await expect(highlightedSource.filter({ hasText: 'participant "Billing API" as Pay' })).toHaveCount(1);
  await dialog.getByRole("button", { name: "Next group" }).click();
  await expect(dialog.locator(".version-active-review-group")).toContainText("Change message Pay → Store");
  await expect(highlightedSource.filter({ hasText: "Authorize" })).toHaveCount(1);
  await expect(highlightedSource.filter({ hasText: "Capture" })).toHaveCount(1);
  await dialog.getByRole("button", { name: "Review", exact: true }).click();
  await dialog.getByRole("button", { name: "Add Change message Pay → Store to rendered diagrams" }).click();
  await expect(
    dialog
      .getByLabel("Before review rendered diagram")
      .locator("text.semantic-render-highlight")
      .filter({ hasText: "Authorize" }),
  ).toHaveCount(1);
  await expect(
    dialog
      .getByLabel("Current working copy rendered diagram")
      .locator("text.semantic-render-highlight")
      .filter({ hasText: "Capture" }),
  ).toHaveCount(1);
  await expect(dialog.getByLabel("Before review rendered diagram").locator(".semantic-render-highlight")).toHaveCount(
    2,
  );
  await expect(dialog.getByText("2 changes highlighted", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Clear highlights" }).click();
  await expect(dialog.getByLabel("Before review rendered diagram").locator(".semantic-render-highlight")).toHaveCount(
    0,
  );
  await dialog.getByRole("button", { name: "Show highlights" }).click();
  await expect(dialog.getByLabel("Before review rendered diagram").locator(".semantic-render-highlight")).toHaveCount(
    2,
  );
  await dialog.getByRole("button", { name: "Review", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Show only Rename participant Payment API to Billing API in rendered diagrams" })
    .click();
  await expect(dialog.getByLabel("Before review rendered diagram").locator(".semantic-render-highlight")).toHaveCount(
    1,
  );
  await expect(dialog.getByText("1 change highlighted", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Review", exact: true }).click();
  await dialog
    .locator(".semantic-review-group")
    .filter({ hasText: "Rename participant Payment API to Billing API" })
    .getByRole("checkbox")
    .check();
  const patchDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export selected patch" }).click();
  const patch = await patchDownload;
  expect(patch.suggestedFilename()).toBe("untitled.puml.patch");
  expect(readFileSync((await patch.path())!, "utf8")).toContain(
    '-participant "Payment API" as Pay\n+participant "Billing API" as Pay',
  );
  const reportDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export review report" }).click();
  const report = await reportDownload;
  expect(report.suggestedFilename()).toBe("untitled.puml-review.html");
  expect(readFileSync((await report.path())!, "utf8")).toContain("Rename participant Payment API to Billing API");
  await dialog.getByRole("button", { name: "Apply selected (1)" }).click();

  await expect(page.locator(".cm-content")).toContainText('participant "Billing API" as Pay');
  await expect(page.locator(".cm-content")).toContainText("Pay -> Store: Authorize");
  await expect(page.locator(".cm-content")).not.toContainText("Capture");
});

test("applies adjacent Sequence edits as one confirmed transaction", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram" })
    .click();
  const before = '@startuml\nparticipant "Payment API" as Pay\nPay -> Store: Authorize\n@enduml';
  const after = '@startuml\nparticipant "Billing API" as Pay\nPay -> Store: Capture\n@enduml';
  await setSource(page, before);
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  const dialog = page.getByRole("dialog", { name: "Version history" });
  await dialog.getByLabel("New version name").fill("Before compound edit");
  await dialog.getByRole("button", { name: "Create version" }).click();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  await setSource(page, after);
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  await expect(dialog.getByLabel("Semantic changes")).toContainText("Update 1 participant and 1 message");
  await expect(dialog.locator(".semantic-review-group")).toHaveCount(1);
  await dialog.getByRole("checkbox", { name: "Select Update 1 participant and 1 message" }).check();
  await dialog.getByRole("button", { name: "Apply selected (1)" }).click();

  await expect(page.locator(".cm-content")).toContainText('participant "Billing API" as Pay');
  await expect(page.locator(".cm-content")).toContainText("Pay -> Store: Capture");
  await expect(page.locator(".cm-content")).not.toContainText("Authorize");
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
  await expect(participant.getByLabel("Spot color", { exact: true })).toHaveAttribute("list", /.+/);
  await participant.getByRole("combobox", { name: "Participant kind" }).click();
  await participant.getByRole("option", { name: /Database/ }).click();
  await participant.getByLabel("Name").fill("Orders");
  await participant.getByLabel("Stereotype").fill("Store");
  await participant.getByLabel("Spot character").fill("D");
  await participant.getByLabel("Spot color", { exact: true }).fill("#FDE68A");
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
  await expect(requestText).toBeVisible();
  await expect(ordersParticipant).toBeVisible();
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
  await expect(senderHandle).toBeVisible();
  await expect(systemAnchor).toBeVisible();
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
  const sequenceSvgBeforeParticipantReorder = await page.locator(".sequence-diagram svg").innerHTML();
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
  await expect
    .poll(() => page.locator(".sequence-diagram svg").innerHTML())
    .not.toBe(sequenceSvgBeforeParticipantReorder);

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
    firstMessageBox!.y + firstMessageBox!.height / 4,
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
  await fragmentDialog.getByLabel("Header color", { exact: true }).fill("#Gold");
  await fragmentDialog.getByLabel("Background color", { exact: true }).fill("#LightBlue");
  await fragmentDialog.getByLabel("Second branch color", { exact: true }).fill("#Pink");
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
  await structureInspector.getByLabel("Branch 2 color", { exact: true }).fill("#Red");
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
  await settings.getByLabel("Arrow color", { exact: true }).fill("#2563EB");
  await settings.getByLabel("Participant fill", { exact: true }).fill("#EFF6FF");
  await settings.getByLabel("Note fill", { exact: true }).fill("#FEF3C7");
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

test("selects and edits Sequence notes and references from the diagram", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram" })
    .click();
  await setSource(
    page,
    "@startuml\nparticipant User\nparticipant System\nparticipant Orders\nnote over User, System: Important note\nref#LightBlue over User, System: External flow\n@enduml",
  );

  await page.getByRole("button", { name: "Drag Note: Important note", exact: true }).click();
  const inspector = page.getByRole("complementary", { name: "Sequence structure inspector" });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByLabel("Placement")).toHaveValue("over");
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toContain("note over User, System: Important note");
  await inspector.getByLabel("Shape").selectOption("rnote");
  await inspector.getByLabel("Placement").selectOption("right of");
  await inspector.getByLabel("Participant").selectOption("Orders");
  await inspector.getByLabel("Text").fill("Review order");
  await inspector.getByLabel("Color", { exact: true }).fill("#Yellow");
  await inspector.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("rnote right of Orders #Yellow: Review order");

  await page.getByRole("button", { name: "Drag Reference: External flow", exact: true }).click();
  await expect(inspector.getByLabel("First participant")).toHaveValue("User");
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toContain("ref#LightBlue over User, System: External flow");
  await inspector.getByLabel("First participant").selectOption("System");
  await inspector.getByLabel("Second participant").selectOption("Orders");
  await inspector.getByLabel("Text").fill("Updated external flow");
  await inspector.getByLabel("Color", { exact: true }).fill("#Lavender");
  await inspector.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("ref#Lavender over System, Orders: Updated external flow");
  await expect(page.locator(".sequence-diagram").locator("..")).not.toHaveClass(/stale-preview/);
});

test("selects and edits the remaining Sequence timeline structures", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram" })
    .click();
  await setSource(
    page,
    '@startuml\n!pragma teoz true\nactor User\nbox "Backend" #LightBlue\nparticipant API\nend box\nparticipant Orders\nautonumber 10 5 "000"\n{begin} User -> API: Start\nactivate API #Yellow\ncreate database Store\n{finish} API -> Store: Save\ndeactivate API\n{begin} <-> {finish}: elapsed\n== Later ==\n...wait...\n||20||\nreturn Done\nnewpage Next\n@enduml',
  );

  const inspector = page.getByRole("complementary", { name: "Sequence structure inspector" });
  await page.getByRole("button", { name: "Drag Participant box: Backend", exact: true }).click();
  await expect(inspector.getByLabel("Label")).toHaveValue("Backend");
  await inspector.getByLabel("User").check();
  await inspector.getByLabel("Orders").check();
  await inspector.getByLabel("API").uncheck();
  await inspector.getByLabel("Label").fill("Services");
  await inspector.getByLabel("Color", { exact: true }).fill("#Lavender");
  await inspector.getByRole("button", { name: "Apply" }).click();
  await expect
    .poll(() => page.locator(".cm-content").innerText())
    .toContain("participant API\nbox Services #Lavender\nactor User\nparticipant Orders\nend box");

  await page.getByRole("button", { name: "Drag Autonumber vertically", exact: true }).click();
  await expect(inspector.getByLabel("Parameters")).toHaveValue('10 5 "000"');
  await inspector.getByLabel("Parameters").fill('20 10 "0000"');
  await inspector.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText('autonumber 20 10 "0000"');

  await page.getByRole("button", { name: "Drag Activation: API vertically", exact: true }).first().click();
  await inspector.getByLabel("Action").selectOption("destroy");
  await inspector.getByLabel("Participant").selectOption("Orders");
  await expect(inspector.getByLabel("Color", { exact: true })).toHaveCount(0);
  await inspector.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("destroy Orders");

  await page.getByRole("button", { name: "Drag Duration: elapsed vertically", exact: true }).click();
  await inspector.getByLabel("Arrow").fill("<->");
  await inspector.getByLabel("Label").fill("total time");
  await inspector.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("{begin} <-> {finish}: total time");
  await expect(page.getByRole("button", { name: "Drag Create Store vertically", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Drag separator: Later vertically", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Drag delay: wait vertically", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Drag space: 20 vertically", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Drag return: Done vertically", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Drag newpage: Next vertically", exact: true })).toBeVisible();
  await expect(page.locator(".sequence-diagram").locator("..")).not.toHaveClass(/stale-preview/);
});

test("reorders Sequence fragment branches without detaching nested bodies", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram" })
    .click();
  await setSource(
    page,
    "@startuml\nparticipant A\nparticipant B\nalt#Gold #LightBlue Primary\nA -> B: Main\nelse #Pink Failure\nloop Retry\nB -> A: Nested failure\nend\nelse #Orange Timeout\nA -> B: Final attempt\nend\nA -> B: After fragment\n@enduml",
  );

  await page.getByRole("button", { name: "Drag Fragment: Primary vertically", exact: true }).click();
  const inspector = page.getByRole("complementary", { name: "Sequence structure inspector" });
  await expect(inspector.getByLabel("Branch 2 label")).toHaveValue("Failure");
  await expect(inspector.getByLabel("Branch 3 label")).toHaveValue("Timeout");
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toContain("alt#Gold #LightBlue Primary\nA -> B: Main\nelse #Pink Failure\nloop Retry");

  await inspector.getByRole("button", { name: "Move branch 3 up" }).click();
  await expect(inspector.getByLabel("Branch 2 label")).toHaveValue("Timeout");
  await expect(inspector.getByLabel("Branch 3 label")).toHaveValue("Failure");
  await inspector.getByRole("button", { name: "Apply" }).click();
  await expect
    .poll(async () => {
      const text = await page.locator(".cm-content").innerText();
      return (
        text.indexOf("else #Orange Timeout") < text.indexOf("A -> B: Final attempt") &&
        text.indexOf("A -> B: Final attempt") < text.indexOf("else #Pink Failure") &&
        text.indexOf("else #Pink Failure") < text.indexOf("loop Retry") &&
        text.indexOf("loop Retry") < text.indexOf("B -> A: Nested failure")
      );
    })
    .toBe(true);
  await expect(page.locator(".sequence-diagram").locator("..")).not.toHaveClass(/stale-preview/);
});
