import { expect, test } from "@playwright/test";

import { pointInText, prepareEditor, setSource } from "./editor-helpers";

test.beforeEach(async ({ page }) => {
  await prepareEditor(page);
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
  await actorDialog.getByLabel("Color", { exact: true }).fill("#LightBlue");
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
  await settings.getByLabel("Actor fill", { exact: true }).fill("#LightBlue");
  await settings.getByLabel("Actor border", { exact: true }).click();
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
  const pointerId = 17;
  const start = { x: endpointBox!.x + endpointBox!.width / 2, y: endpointBox!.y + endpointBox!.height / 2 };
  const middle = {
    x: (start.x + targetBox!.x + targetBox!.width / 2) / 2,
    y: (start.y + targetBox!.y + targetBox!.height / 2) / 2,
  };
  await endpoint.dispatchEvent("pointerdown", {
    pointerId,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
  });
  await page.locator(".usecase-diagram").dispatchEvent("pointermove", {
    pointerId,
    pointerType: "mouse",
    buttons: 1,
    clientX: middle.x,
    clientY: middle.y,
  });
  await expect(page.locator(".usecase-connection-preview")).toBeVisible();
  await expect(page.locator(".usecase-valid-drop").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".usecase-connection-preview")).toHaveCount(0);
  await page.locator(".usecase-diagram").dispatchEvent("pointerup", {
    pointerId,
    pointerType: "mouse",
    button: 0,
    clientX: middle.x,
    clientY: middle.y,
  });
  await expect(page.locator(".cm-content")).toContainText("A -[dashed]-> B : uses");

  await expect(endpoint).toBeVisible();
  let retryEndpointBox = await endpoint.boundingBox();
  await expect
    .poll(async () => {
      retryEndpointBox = await endpoint.boundingBox();
      return retryEndpointBox;
    })
    .not.toBeNull();
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
