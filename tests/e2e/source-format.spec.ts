import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fillSource, prepareEditor, readEditorSource, waitForDiagramRender } from "./editor-helpers";
const sequence = `@startuml
 participant Alice
    participant Bob
alt accepted
 Alice -> Bob: Request
loop 2
 Bob --> Alice: Response
end
else rejected
Alice -> Bob: Retry
end
@enduml`;
async function newKind(page: Parameters<typeof prepareEditor>[0], name: string) {
  await page.getByRole("button", { name: "New diagram tab", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
  const close = page.getByRole("button", { name: "Close project inspector", exact: true });
  if (await close.isVisible()) await close.click();
}
async function renderedGeometry(page: Parameters<typeof prepareEditor>[0]) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "SVG", exact: true }).click();
  const file = await downloaded;
  const source = readFileSync((await file.path())!, "utf8");
  return page.evaluate((source) => {
    const svg = new DOMParser().parseFromString(source, "image/svg+xml").documentElement;
    return {
      viewBox: svg.getAttribute("viewBox"),
      width: svg.getAttribute("width"),
      height: svg.getAttribute("height"),
      texts: Array.from(svg.querySelectorAll("text")).map((e) => [
        e.textContent,
        e.getAttribute("x"),
        e.getAttribute("y"),
        e.getAttribute("textLength"),
      ]),
      shapes: Array.from(svg.querySelectorAll("path,rect,line,polygon,ellipse")).map((e) => [
        e.tagName,
        ...["x", "y", "width", "height", "d", "points", "x1", "y1", "x2", "y2", "cx", "cy", "rx", "ry"].map((a) =>
          e.getAttribute(a),
        ),
      ]),
    };
  }, source);
}

test("reviews formatting, preserves rendered geometry, cancels and undoes as one step", async ({ page }) => {
  await prepareEditor(page);
  await newKind(page, "Sequence diagram");
  await fillSource(page, sequence);
  await waitForDiagramRender(page);
  const before = await renderedGeometry(page);
  await page.getByRole("button", { name: "Format source…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Format source preview", exact: true });
  await expect(dialog.getByRole("list", { name: "Formatting diff" })).toContainText("·participant Alice");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await readEditorSource(page)).toBe(sequence);
  await page.getByRole("button", { name: "Format source…", exact: true }).click();
  await dialog.getByRole("button", { name: "Apply formatting", exact: true }).click();
  await expect(dialog).toBeHidden();
  await waitForDiagramRender(page);
  expect(await readEditorSource(page)).toContain(
    "alt accepted\n  Alice -> Bob: Request\n  loop 2\n    Bob --> Alice: Response\n  end\nelse rejected",
  );
  expect(await renderedGeometry(page)).toEqual(before);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await readEditorSource(page)).toBe(sequence);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Format source…", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("No supported whitespace changes");
  await expect(dialog.getByRole("button", { name: "Apply formatting", exact: true })).toBeDisabled();
});
test("formats nested class blocks and keeps text geometry unchanged", async ({ page }) => {
  await prepareEditor(page);
  await newKind(page, "Class diagram");
  const source =
    '@startuml\npackage "Orders" {\nclass Order {\n-id: UUID\n+submit(): void\n}\n}\nOrder --> Item : persists\n@enduml';
  await fillSource(page, source);
  await waitForDiagramRender(page);
  const before = await renderedGeometry(page);
  await page.getByRole("button", { name: "Format source…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Format source preview", exact: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByRole("button", { name: "Apply formatting", exact: true })).toBeInViewport();
  await page.screenshot({ path: "test-results/a26-format-phone.png" });
  await dialog.getByRole("button", { name: "Apply formatting", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await waitForDiagramRender(page);
  expect(await readEditorSource(page)).toContain('package "Orders" {\n  class Order {\n    -id: UUID');
  expect(await renderedGeometry(page)).toEqual(before);
});
test("explains unsupported macros through the command palette without modifying source", async ({ page }) => {
  await prepareEditor(page);
  await newKind(page, "Class diagram");
  const source = "@startuml\n!define ENTITY(x) class x\nENTITY(Order)\n@enduml";
  await fillSource(page, source);
  await page.getByRole("button", { name: "Commands", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Command palette", exact: true });
  await palette.getByRole("combobox").fill("Format source");
  await palette.getByRole("option", { name: /Format source/ }).click();
  const dialog = page.getByRole("dialog", { name: "Format source preview", exact: true });
  await expect(dialog.getByRole("status")).toContainText("Preprocessor");
  await expect(dialog.getByRole("button", { name: "Apply formatting", exact: true })).toBeDisabled();
  await page.screenshot({ path: "test-results/a26-format-unsupported.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(await readEditorSource(page)).toBe(source);
});

test("preserves exported geometry for the other supported diagram families", async ({ page }) => {
  test.setTimeout(60000);
  await prepareEditor(page);
  const fixtures = [
    [
      "Gantt diagram",
      " @startgantt \n  Project starts 2026-10-01\n [A]      lasts 3 days\n [B] lasts 2 days\n [B] starts at [A]'s end\n @endgantt",
    ],
    [
      "Use Case diagram",
      '@startuml\nactor User\nrectangle "System" {\nusecase "Order" as Order\n}\n User --> Order\n@enduml',
    ],
    [
      "Component diagram",
      '@startuml\npackage "System" {\ncomponent Web\ncomponent API\n}\n Web --> API : HTTPS\n@enduml',
    ],
    ["WBS diagram", " @startwbs \n* Root\n** Child\n @endwbs"],
  ];
  for (const [kind, source] of fixtures) {
    await newKind(page, kind!);
    await fillSource(page, source!);
    await waitForDiagramRender(page);
    const before = await renderedGeometry(page);
    await page.getByRole("button", { name: "Format source…", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Format source preview", exact: true });
    await dialog.getByRole("button", { name: "Apply formatting", exact: true }).click();
    await expect(dialog).toBeHidden();
    await waitForDiagramRender(page);
    expect(await renderedGeometry(page), kind).toEqual(before);
  }
});
