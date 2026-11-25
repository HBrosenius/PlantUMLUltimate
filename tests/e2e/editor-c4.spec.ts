import {
  fillSource,
  fitDiagram,
  openRibbonGroup,
  prepareEditor,
  readEditorSource,
  setSource,
  waitForDiagramRender,
} from "./editor-helpers";
import { expect, test, type Page } from "./coverage";

const INCLUDE_ONLY = "@startuml\n!include <C4/C4_Container>\n@enduml";

/** The Container starter without its title: what the gate rebuilds from the ribbon, dialogs and canvas only. */
const CONTAINER = `@startuml
!include <C4/C4_Container>
Person(customer, "Customer", "Buys products online")
System_Boundary(shop, "Web shop") {
  Container(web, "Web app", "React", "Shows the catalogue and the basket")
  Container(api, "API", "Java, Spring Boot", "Orders, payments and stock")
  ContainerDb(db, "Database", "PostgreSQL", "Orders and customers")
}
System_Ext(payments, "Payment provider", "Takes card payments")
Rel(customer, web, "Uses", "HTTPS")
Rel(web, api, "Calls", "JSON/HTTPS")
Rel(api, db, "Reads and writes", "SQL")
Rel(api, payments, "Takes payments", "HTTPS")
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

const expectSource = (page: Page, expected: string) =>
  expect.poll(() => readEditorSource(page), { timeout: 20_000 }).toBe(expected);

/** Waits until the picture shows the latest source again, then fits it so every target is in view. */
async function settle(page: Page) {
  await waitForDiagramRender(page);
  await expect(page.locator(".c4-semantic-hit").first()).toBeAttached();
  await fitDiagram(page);
}

const hit = (page: Page, key: string) => page.locator(`.c4-semantic-hit[data-c4-object-id="${key}"]`);

async function insert(page: Page, name: string) {
  await openRibbonGroup(page, "Insert", "Insert elements");
  await page.getByRole("button", { name, exact: true }).click();
}

/** A point on a drawn relationship, since the middle of its box can be off the line. */
async function pointOnLink(page: Page, key: string) {
  return page.evaluate((id) => {
    const path = document.querySelector<SVGPathElement>(`path.c4-relationship-hit[data-c4-object-id="${id}"]`)!;
    const middle = path.getPointAtLength(path.getTotalLength() / 2);
    const matrix = path.getScreenCTM()!;
    const point = new DOMPoint(middle.x, middle.y).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  }, key);
}

async function dragBetween(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

async function center(locator: ReturnType<typeof hit>) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const elementDialog = (page: Page) => page.getByRole("dialog", { name: "Add C4 element" });

test("builds the Container starter's diagram without typing in the source editor", async ({ page }) => {
  test.setTimeout(240_000);
  await openC4(page, INCLUDE_ONLY, false);

  await insert(page, "Person…");
  const person = elementDialog(page);
  await person.getByLabel("Label").fill("Customer");
  await expect(person.getByLabel("Alias")).toHaveValue("customer");
  await person.getByLabel("Description").fill("Buys products online");
  await person.getByRole("button", { name: "Add person" }).click();
  await expectSource(
    page,
    INCLUDE_ONLY.replace("@enduml", 'Person(customer, "Customer", "Buys products online")\n@enduml'),
  );

  await insert(page, "Boundary…");
  const boundary = page.getByRole("dialog", { name: "Add C4 boundary" });
  await boundary.getByLabel("Label").fill("Web shop");
  await boundary.getByLabel("Alias").fill("shop");
  await boundary.getByRole("button", { name: "Add system boundary" }).click();

  const containers: Array<[string, string, string, string, string?]> = [
    ["Web app", "web", "React", "Shows the catalogue and the basket"],
    ["API", "api", "Java, Spring Boot", "Orders, payments and stock"],
    ["Database", "db", "PostgreSQL", "Orders and customers", "database"],
  ];
  for (const [label, alias, technology, description, storage] of containers) {
    await insert(page, "Container…");
    const dialogBox = elementDialog(page);
    await dialogBox.getByLabel("Label").fill(label);
    await dialogBox.getByLabel("Alias").fill(alias);
    await dialogBox.getByLabel("Technology").fill(technology);
    await dialogBox.getByLabel("Description").fill(description);
    if (storage) await dialogBox.getByLabel("Storage").selectOption(storage);
    await dialogBox.getByLabel("Place in").selectOption("shop");
    await dialogBox.getByRole("button", { name: "Add container" }).click();
  }

  await insert(page, "Software system…");
  const system = elementDialog(page);
  await system.getByLabel("Label").fill("Payment provider");
  await system.getByLabel("Alias").fill("payments");
  await system.getByLabel("Description").fill("Takes card payments");
  await system.getByLabel("External").check();
  await system.getByRole("button", { name: "Add software system" }).click();

  await insert(page, "Relationship…");
  const relationship = page.getByRole("dialog", { name: "Add C4 relationship" });
  await relationship.getByLabel("From", { exact: true }).selectOption("customer");
  await relationship.getByLabel("To", { exact: true }).selectOption("web");
  await relationship.getByLabel("Label").fill("Uses");
  await relationship.getByLabel("Technology").fill("HTTPS");
  await relationship.getByRole("button", { name: "Add relationship" }).click();

  // The canvas takes over: drag between the drawn elements, then fill the new relationship in the panel.
  await settle(page);
  const connect = async (from: string, to: string, label: string, technology: string) => {
    await dragBetween(page, await center(hit(page, from)), await center(hit(page, to)));
    const panel = page.getByRole("complementary", { name: "C4 relationship inspector" });
    await expect(panel).toBeVisible();
    await panel.getByLabel("Label").fill(label);
    await panel.getByLabel("Technology").fill(technology);
    await panel.getByLabel("Technology").press("Tab");
    await settle(page);
  };
  await connect("web", "api", "Calls", "JSON/HTTPS");
  await connect("api", "db", "Reads and writes", "SQL");
  await connect("api", "payments", "Takes payments", "HTTPS");

  await expectSource(page, CONTAINER);
  await waitForDiagramRender(page);
  await expect(page.locator(".diagram svg")).not.toContainText("Syntax Error");
});

test("each inspector field edits only its own argument", async ({ page }) => {
  test.setTimeout(120_000);
  await openC4(page, CONTAINER);
  await fitDiagram(page);
  await hit(page, "web").click();
  const panel = page.getByRole("complementary", { name: "C4 element inspector" });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Alias")).toHaveAttribute("readonly", "");

  let expected = CONTAINER;
  const edit = async (label: string, value: string, before: string, after: string) => {
    const field = panel.getByLabel(label, { exact: true });
    await field.fill(value);
    await field.press("Tab");
    expected = expected.replace(before, after);
    await expectSource(page, expected);
  };
  await edit("Technology", "Vue", '"React"', '"Vue"');
  await edit("Description", "Shows pages", '"Shows the catalogue and the basket")', '"Shows pages")');
  await edit("Label", "Storefront", '"Web app"', '"Storefront"');
  await edit("Tags", "primary", '"Shows pages")', '"Shows pages", $tags="primary")');
  await edit("Link", "https://example.com", '$tags="primary")', '$tags="primary", $link="https://example.com")');
  // An empty field removes the optional argument again, and nothing else changes.
  await edit("Tags", "", ', $tags="primary"', "");
  await edit("Technology", "", '"Vue", "Shows pages"', '"", "Shows pages"');
  await edit("Sprite", "person", '$link="https://example.com")', '$link="https://example.com", $sprite="person")');

  // A refused edit is explained next to the field and leaves the source alone.
  const label = panel.getByLabel("Label", { exact: true });
  await label.fill('Say "hi"');
  await label.press("Tab");
  await expect(panel.getByRole("alert")).toContainText("double quote");
  await expectSource(page, expected);
});

test("changes an element's macro, and a relationship's direction and ends", async ({ page }) => {
  test.setTimeout(120_000);
  await openC4(page, CONTAINER);
  await fitDiagram(page);
  await hit(page, "web").click();
  const element = page.getByRole("complementary", { name: "C4 element inspector" });
  await element.getByLabel("Type", { exact: true }).selectOption("ContainerQueue");
  let expected = CONTAINER.replace("  Container(web,", "  ContainerQueue(web,");
  await expectSource(page, expected);
  await element.getByLabel("Type", { exact: true }).selectOption("Container_Ext");
  expected = CONTAINER.replace("  Container(web,", "  Container_Ext(web,");
  await expectSource(page, expected);
  // One macro can't become another that reads its arguments differently: the reason is shown.
  await element.getByLabel("Type", { exact: true }).selectOption("Person");
  await expect(element.getByRole("alert")).toContainText("reads its arguments differently");
  await expectSource(page, expected);

  await settle(page);
  const link = await pointOnLink(page, "rel:1");
  await page.mouse.click(link.x, link.y);
  const panel = page.getByRole("complementary", { name: "C4 relationship inspector" });
  await expect(panel).toBeVisible();
  await panel.getByLabel("Direction").selectOption("right");
  expected = expected.replace('Rel(web, api, "Calls"', 'Rel_R(web, api, "Calls"');
  await expectSource(page, expected);
  await panel.getByRole("button", { name: "Reverse" }).click();
  expected = expected.replace('Rel_R(web, api, "Calls"', 'Rel_R(api, web, "Calls"');
  await expectSource(page, expected);
  await panel.getByLabel("Direction").selectOption("auto");
  expected = expected.replace('Rel_R(api, web, "Calls"', 'Rel(api, web, "Calls"');
  await expectSource(page, expected);
  await panel.getByLabel("To", { exact: true }).selectOption("db");
  expected = expected.replace('Rel(api, web, "Calls"', 'Rel(api, db, "Calls"');
  await expectSource(page, expected);
  await panel.getByLabel("Technology").fill("gRPC");
  await panel.getByLabel("Technology").press("Tab");
  expected = expected.replace('"Calls", "JSON/HTTPS"', '"Calls", "gRPC"');
  await expectSource(page, expected);
});

test("settings: layout and legend are written once and can be removed", async ({ page }) => {
  test.setTimeout(90_000);
  await openC4(page, CONTAINER, false);
  await openRibbonGroup(page, "View", "Diagram settings");
  await page.getByRole("button", { name: "Diagram settings" }).click();
  const panel = page.getByRole("complementary", { name: "C4 diagram settings" });
  const withLayout = CONTAINER.replace(
    "!include <C4/C4_Container>\n",
    "!include <C4/C4_Container>\nLAYOUT_LEFT_RIGHT()\n",
  );
  await panel.getByLabel("Layout").selectOption("left-right");
  await expectSource(page, withLayout);
  await panel.getByLabel("Legend").selectOption("show");
  await expectSource(page, withLayout.replace("\n@enduml", "\nSHOW_LEGEND()\n@enduml"));
  await panel.getByLabel("Layout").selectOption("");
  await panel.getByLabel("Legend").selectOption("none");
  await expectSource(page, CONTAINER);
});

test("drags to connect and reconnect, moves into and out of a boundary, deletes and renames on the canvas", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openC4(page, CONTAINER);
  await fitDiagram(page);

  // Connect: dragging from one element to another adds a relationship and selects it.
  await dragBetween(page, await center(hit(page, "customer")), await center(hit(page, "db")));
  const withDrawn = CONTAINER.replace("@enduml", 'Rel(customer, db, "Uses")\n@enduml');
  await expectSource(page, withDrawn);
  await expect(page.getByRole("complementary", { name: "C4 relationship inspector" })).toBeVisible();
  // Undo restores the exact source, in one step.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expectSource(page, CONTAINER);
  await settle(page);

  // Reconnect: drag the end of a selected relationship onto another element.
  const link = await pointOnLink(page, "rel:1");
  await page.mouse.click(link.x, link.y);
  const handle = page.locator('.c4-relationship-endpoint[data-c4-relationship-endpoint="to"]');
  await expect(handle).toBeVisible();
  await dragBetween(page, await center(handle), await center(hit(page, "db")));
  const reconnected = CONTAINER.replace('Rel(web, api, "Calls"', 'Rel(web, db, "Calls"');
  await expectSource(page, reconnected);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expectSource(page, CONTAINER);
  await settle(page);

  // Move into a boundary with the square handle, and the relationships that mention it stay valid.
  const handleOf = (key: string) => page.locator(`.c4-move-handle[data-c4-move-id="${key}"]`);
  await dragBetween(page, await center(handleOf("payments")), await center(hit(page, "api")));
  const moved = CONTAINER.replace('System_Ext(payments, "Payment provider", "Takes card payments")\n', "").replace(
    '  ContainerDb(db, "Database", "PostgreSQL", "Orders and customers")\n',
    '  ContainerDb(db, "Database", "PostgreSQL", "Orders and customers")\n  System_Ext(payments, "Payment provider", "Takes card payments")\n',
  );
  await expectSource(page, moved);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expectSource(page, CONTAINER);
  await settle(page);

  // Out of a boundary: drop on empty canvas.
  await dragBetween(page, await center(handleOf("web")), await emptyPoint(page));
  const out = CONTAINER.replace(
    '  Container(web, "Web app", "React", "Shows the catalogue and the basket")\n',
    "",
  ).replace(
    'System_Ext(payments, "Payment provider", "Takes card payments")\n',
    'System_Ext(payments, "Payment provider", "Takes card payments")\nContainer(web, "Web app", "React", "Shows the catalogue and the basket")\n',
  );
  await expectSource(page, out);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expectSource(page, CONTAINER);
  await settle(page);

  // Rename on the canvas with F2.
  await hit(page, "api").click();
  await hit(page, "api").press("F2");
  const editor = page.getByRole("dialog", { name: "Edit diagram label" });
  await editor.getByLabel("Label").fill("Orders API");
  await editor.getByLabel("Label").press("Enter");
  await expectSource(page, CONTAINER.replace('"API"', '"Orders API"'));
  await settle(page);

  // Delete with the key, after the same confirmation the other types ask for.
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.accept();
  });
  await hit(page, "db").focus();
  await page.keyboard.press("Delete");
  await expectSource(
    page,
    CONTAINER.replace('"API"', '"Orders API"')
      .replace('  ContainerDb(db, "Database", "PostgreSQL", "Orders and customers")\n', "")
      .replace('Rel(api, db, "Reads and writes", "SQL")\n', ""),
  );
  expect(dialogs).toEqual(["Delete “Database” and 1 connected relationship?"]);
  await expect(page.getByRole("complementary", { name: "C4 element inspector" })).toHaveCount(0);
});

test("connects two elements with the keyboard", async ({ page }) => {
  test.setTimeout(90_000);
  await openC4(page, CONTAINER);
  await fitDiagram(page);
  await hit(page, "customer").focus();
  await page.keyboard.press("c");
  await expect(page.locator(".c4-keyboard-help")).toContainText("Choose a target");
  await expect(hit(page, "db")).toHaveClass(/c4-valid-drop/);
  await hit(page, "db").focus();
  await page.keyboard.press("Enter");
  await expectSource(page, CONTAINER.replace("@enduml", 'Rel(customer, db, "Uses")\n@enduml'));
});

test("the outline, the canvas, the panel and the source stay in step", async ({ page }) => {
  test.setTimeout(120_000);
  await openC4(page, CONTAINER);
  await fitDiagram(page);
  await openRibbonGroup(page, "View", "Navigation and panels");
  await page.getByRole("button", { name: "Outline", exact: true }).click();
  const outline = page.getByRole("dialog", { name: "Diagram outline", exact: true });
  await outline.getByRole("button", { name: /^Payment provider/ }).click();
  // The shape is highlighted on the canvas, the panel is open, and the editor is on its line.
  await expect(hit(page, "payments")).toHaveClass(/c4-selected-object/);
  await expect(page.getByRole("complementary", { name: "C4 element inspector" }).getByLabel("Alias")).toHaveValue(
    "payments",
  );
  await expect(page.locator(".cm-activeLine")).toContainText("System_Ext(payments");

  // The other way: a click on the canvas moves the panel and the editor.
  await hit(page, "web").click();
  await expect(page.getByRole("complementary", { name: "C4 element inspector" }).getByLabel("Alias")).toHaveValue(
    "web",
  );
  await expect(hit(page, "web")).toHaveClass(/c4-selected-object/);
  await expect(hit(page, "payments")).not.toHaveClass(/c4-selected-object/);
  await expect(page.locator(".cm-activeLine")).toContainText("Container(web");
});

test("a shape from a procedure can be selected, but its form is read-only", async ({ page }) => {
  test.setTimeout(120_000);
  const procedure = `@startuml
!include <C4/C4_Container>
!procedure Svc($alias, $label)
Container($alias, $label)
!endprocedure
Person(user, "User")
Svc(procA, "Procedure app")
Rel(user, procA, "Uses")
@enduml`;
  await openC4(page, procedure);
  await fitDiagram(page);
  await expect(hit(page, "procA")).toHaveAttribute("data-c4-editable", "false");
  await expect(page.locator('.c4-connection-handle[data-c4-connect-from="procA"]')).toHaveCount(0);
  await hit(page, "procA").click();
  const panel = page.getByRole("complementary", { name: "C4 shape inspector" });
  await expect(panel).toContainText("can't be edited in forms");
  await expect(panel.getByRole("textbox")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: /Delete/ })).toHaveCount(0);
  // The editor shows where it is declared.
  await expect(page.locator(".cm-activeLine")).toContainText("Svc(procA");
  // Its neighbour is an ordinary element, and its form is editable.
  await hit(page, "user").click();
  const form = page.getByRole("complementary", { name: "C4 element inspector" });
  await expect(form.getByLabel("Label", { exact: true })).toBeEditable();
  // Dragging from the plain element to the procedure's shape is refused: it has no declaration to point to.
  await expect(hit(page, "user")).toHaveAttribute("data-c4-editable", "true");
  const source = await readEditorSource(page);
  await dragBetween(page, await center(hit(page, "user")), await center(hit(page, "procA")));
  expect(await readEditorSource(page)).toBe(source);
});

test("offers the include a macro from another C4 level needs", async ({ page }) => {
  test.setTimeout(120_000);
  const context = '@startuml\n!include <C4/C4_Context>\nPerson(user, "User")\n@enduml';
  await openC4(page, context, false);
  await insert(page, "Person…");
  // The macro is available from the included library, so there is nothing to offer.
  await expect(elementDialog(page).locator(".c4-include-offer")).toHaveCount(0);
  await page.keyboard.press("Escape");

  await insert(page, "Container…");
  const dialog = elementDialog(page);
  const offer = dialog.getByLabel(/Add !include <C4\/C4_Container>/);
  await expect(offer).toBeChecked();
  await dialog.getByLabel("Label").fill("Web app");
  await dialog.getByRole("button", { name: "Add container" }).click();
  await expectSource(
    page,
    '@startuml\n!include <C4/C4_Context>\n!include <C4/C4_Container>\nPerson(user, "User")\nContainer(webApp, "Web app")\n@enduml',
  );
  await waitForDiagramRender(page);
  await expect(page.locator(".diagram svg")).not.toContainText("Syntax Error");

  // Declined: the element is added and the source is otherwise untouched.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expectSource(page, context);
  await insert(page, "Component…");
  const second = elementDialog(page);
  await second.getByLabel(/Add !include <C4\/C4_Component>/).uncheck();
  await second.getByLabel("Label").fill("Checkout");
  await second.getByRole("button", { name: "Add component" }).click();
  await expectSource(
    page,
    '@startuml\n!include <C4/C4_Context>\nPerson(user, "User")\nComponent(checkout, "Checkout")\n@enduml',
  );
});

test("Stage view shows a C4 diagram with a dock for the selected shape", async ({ page }) => {
  test.setTimeout(120_000);
  await openC4(page, CONTAINER);
  await page.getByRole("navigation", { name: "View mode" }).getByRole("button", { name: "Stage", exact: true }).click();
  await expect(page.locator(".workspace.mode-stage")).toBeVisible();
  await expect(page.locator(".diagram svg")).toBeVisible();
  await hit(page, "web").click();
  const dock = page.getByRole("toolbar", { name: "Actions for Web app" });
  await expect(dock).toBeVisible();
  await expect(dock.getByRole("button", { name: "Relate…" })).toBeVisible();
  await expect(dock.getByRole("button", { name: "Delete" })).toBeVisible();
  const lens = page.getByTestId("source-lens");
  await expect(lens.locator(".cm-content")).toContainText('Container(web, "Web app"');
  await expect(lens.locator(".cm-content")).not.toContainText("ContainerDb(db");
  await dock.getByRole("button", { name: "Relate…" }).click();
  const relationship = page.getByRole("dialog", { name: "Add C4 relationship" });
  await expect(relationship).toBeVisible();
  await relationship.getByRole("button", { name: "Cancel" }).click();

  // Delete from the dock asks first, then takes the element and its relationships out of the source.
  page.once("dialog", (dialog) => void dialog.accept());
  await hit(page, "web").click();
  await dock.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Exit Stage" }).click();
  await expectSource(
    page,
    CONTAINER.split("\n")
      .filter((line) => !/Container\(web,|Rel\(customer, web|Rel\(web, api/.test(line))
      .join("\n"),
  );
});

/** A point of the picture that no shape covers. */
async function emptyPoint(page: Page) {
  const point = await page.evaluate(() => {
    const svg = document.querySelector(".c4-diagram svg")!;
    const box = svg.getBoundingClientRect();
    const covered = [
      ...svg.querySelectorAll(".c4-semantic-hit, .c4-boundary-frame, .c4-move-handle, .c4-connection-handle"),
    ].map((item) => item.getBoundingClientRect());
    for (let y = box.top + 6; y < box.bottom - 4; y += 10)
      for (let x = box.left + 6; x < box.right - 4; x += 10)
        if (!covered.some((r) => x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4))
          return { x, y };
    return undefined;
  });
  if (!point) throw new Error("The picture has no empty point");
  return point;
}
