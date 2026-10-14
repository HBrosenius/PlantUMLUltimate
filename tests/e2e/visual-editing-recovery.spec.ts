import { expect, test, type Locator, type Page } from "@playwright/test";
import { prepareEditor, readEditorSource, setSource, waitForDiagramRender } from "./editor-helpers";

const fillers = Array.from({ length: 24 }, (_, index) => `Filler${index}`);
const gantt = `@startgantt\nProject starts 2026-09-01\n[Origin] starts 2026-09-01 and lasts 2 days\n[Destination] starts 2026-09-05 and lasts 4 days\n${fillers.map((name) => `[${name}] starts 2026-09-01 and lasts 1 day`).join("\n")}\n@endgantt`;
const sequence = `@startuml\nparticipant User\nparticipant System\nparticipant Orders\nUser -> System: Request\nnote over User, System: Important\n${fillers.map((name) => `User -> System: ${name}`).join("\n")}\n@enduml`;
const hiddenChain = (kind: "class" | "component" | "usecase") => {
  const names = ["Origin", "Destination", ...fillers];
  return `@startuml\n${names.map((name) => `${kind} ${name}`).join("\n")}\n${names
    .slice(1)
    .map((name, index) => `${names[index]} -[hidden]down- ${name}`)
    .join("\n")}\n@enduml`;
};

async function center(locator: Locator) {
  let previous: string | undefined;
  await expect
    .poll(async () => {
      const current = JSON.stringify(await locator.boundingBox());
      const stable = current !== "null" && current === previous;
      previous = current;
      return stable;
    })
    .toBe(true);
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

async function beginDrag(page: Page, from: Locator, to: Locator) {
  const start = await center(from);
  const end = await center(to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
}

async function selectByKeyboard(locator: Locator) {
  await locator.focus();
  await locator.press("Enter");
}

/** Keep the pointer down until an actual changed scroll offset has reached recovery storage. */
async function recoverDuringDrag(page: Page, overlay: Locator, before: string) {
  await expect(overlay).toBeAttached();
  // Horizontal SVG strokes have zero-height bounding boxes despite being painted.
  await expect
    .poll(() =>
      overlay.evaluate((element) => {
        const box = (element as SVGGraphicsElement).getBBox();
        return box.width + box.height;
      }),
    )
    .toBeGreaterThan(1);
  const activeOverlay = await overlay.elementHandle();
  const viewport = page.locator(".workspace .preview-viewport");
  const position = await viewport.evaluate((element) => {
    if (element.scrollHeight > element.clientHeight + 2) element.scrollTop += 2;
    else if (element.scrollWidth > element.clientWidth + 2) element.scrollLeft += 2;
    else throw new Error("Fixture must allow real scrolling");
    return { left: element.scrollLeft, top: element.scrollTop };
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const key = Object.keys(localStorage).find((key) => key.startsWith("plantuml-studio.workspace.navigation.v1:"));
        const session = JSON.parse(key ? (localStorage.getItem(key) ?? "{}") : "{}");
        return session.documents?.find((item: { id: string }) => item.id === session.activeDocumentId)?.diagramScroll;
      }),
    )
    .toEqual(position);
  expect(await activeOverlay!.evaluate((element) => element.isConnected)).toBe(true);
  await expect(overlay).toBeAttached();
  expect(await readEditorSource(page)).toBe(before);
}

async function checkUndoRedo(page: Page, before: string, changed: RegExp) {
  await expect.poll(() => readEditorSource(page)).toMatch(changed);
  const after = await readEditorSource(page);
  expect(after).not.toBe(before);
  await waitForDiagramRender(page);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).toBe(before);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).toBe(after);
  await waitForDiagramRender(page);
  await expect(page.locator(".diagram svg")).not.toContainText("Syntax Error");
}

async function openFixture(page: Page, kind: string, source: string) {
  await prepareEditor(page);
  if (kind !== "Gantt") {
    await page.getByRole("button", { name: "New diagram tab" }).click();
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: `${kind} diagram`, exact: true })
      .click();
  }
  await setSource(page, source);
  await waitForDiagramRender(page);
  await page.getByRole("button", { name: /^Reset zoom,/ }).click();
  await waitForDiagramRender(page);
}

for (const kind of ["Class", "Component", "Use Case", "Activity", "WBS"] as const) {
  test(`${kind} connection survives a recovery save and remains one undo step`, async ({ page, browserName }) => {
    test.skip(
      kind === "WBS" && browserName === "webkit",
      "WebKit automation misidentifies SVG WBS drop targets, as in editor-wbs.spec.ts",
    );
    const source =
      kind === "Activity"
        ? `@startuml\n:Origin;\n:Destination;\n${fillers.map((name) => `:${name};`).join("\n")}\n@enduml`
        : kind === "WBS"
          ? `@startwbs\n* Project\n**(origin) Origin\n**(destination) Destination\n${fillers.map((name, index) => `${"*".repeat(index + 3)} ${name}`).join("\n")}\n@endwbs`
          : hiddenChain(kind === "Class" ? "class" : kind === "Component" ? "component" : "usecase");
    await openFixture(page, kind, source);
    // Firefox sizes these tall SVGs to the column width; keep both drag targets on screen.
    if (browserName === "firefox" && kind !== "WBS")
      for (let step = 0; step < 8; step++) await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    let from: Locator, to: Locator, overlay: Locator;
    if (kind === "Activity") {
      from = page.getByRole("button", { name: "Drag to connect Origin", exact: true });
      to = page.getByRole("button", { name: "Select action Destination", exact: true });
      overlay = page.locator(".activity-connection-preview");
    } else if (kind === "WBS") {
      await selectByKeyboard(page.getByRole("button", { name: "Select WBS node Origin", exact: true }));
      // WBS SVGs shrink to the inspector's narrow column; zoom in to exercise scrolling.
      for (let step = 0; step < 10; step++) await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      from = page.getByRole("button", { name: "Drag to connect Origin", exact: true });
      to = page.getByRole("button", { name: "Select WBS node Destination", exact: true });
      overlay = page.locator(".wbs-connection-preview");
    } else if (kind === "Use Case") {
      from = page.locator('[data-usecase-connect-from="origin"]').first();
      to = page.locator('.usecase-semantic-hit[data-usecase-object-id="destination"]').first();
      overlay = page.locator(".usecase-connection-preview");
    } else {
      from = page.locator('[data-class-connect-from="origin"]');
      to = page.locator('[data-class-object-type="entity"][data-class-object-id="destination"]');
      overlay = page.locator(".class-connection-preview");
    }
    await beginDrag(page, from, to);
    await recoverDuringDrag(page, overlay, source);
    const destination = await center(to);
    await page.mouse.move(destination.x, destination.y);
    await page.mouse.up();
    await checkUndoRedo(
      page,
      source,
      kind === "Activity"
        ? /:Origin;\s*-->\s*:Destination;/
        : kind === "WBS"
          ? /origin -> destination/
          : /Origin --> Destination/,
    );
  });
}

test("Gantt resize survives a recovery save without committing until release", async ({ page }) => {
  await openFixture(page, "Gantt", gantt);
  await page.locator('[data-task-id="origin"] .bar').click();
  const handle = page.locator('[data-task-id="origin"] [data-resize-handle]');
  const start = await center(handle);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 80, start.y, { steps: 8 });
  await recoverDuringDrag(page, page.locator(".task-drag-ghost"), gantt);
  await page.mouse.up();
  await checkUndoRedo(page, gantt, /\[Origin\].*lasts (?!2 days)\d+ days/);
});

for (const operation of ["reconnect", "move"] as const) {
  test(`Sequence ${operation} survives recovery and remains one undo step`, async ({ page }) => {
    await openFixture(page, "Sequence", sequence);
    if (operation === "reconnect")
      await selectByKeyboard(page.locator('[data-sequence-drag-hit][data-sequence-message-id="message-0"]').first());
    const from =
      operation === "reconnect"
        ? page.locator('[data-sequence-message-endpoint="to"][data-sequence-message-id="message-0"]')
        : page.locator('.sequence-structure-grip[data-sequence-structure-id="note-0"]');
    const to =
      operation === "reconnect"
        ? page.locator('.sequence-participant-anchor[data-sequence-participant-id="orders"]')
        : page.locator('[data-sequence-drag-hit][data-sequence-message-id="message-0"]').first();
    if (operation === "move") {
      const start = await center(from);
      const target = await to.boundingBox();
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x, target!.y + 2, { steps: 8 });
    } else await beginDrag(page, from, to);
    await recoverDuringDrag(
      page,
      page.locator(operation === "reconnect" ? ".sequence-reconnect-preview" : ".sequence-structure-move-preview"),
      sequence,
    );
    await page.mouse.up();
    await checkUndoRedo(
      page,
      sequence,
      operation === "reconnect"
        ? /User -> Orders: Request/
        : /note over User, System: Important\nUser -> System: Request/,
    );
  });
}
