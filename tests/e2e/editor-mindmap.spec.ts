import type { Page } from "@playwright/test";
import { expect, test } from "./coverage";
import { openRibbonGroup, prepareEditor, readEditorSource, setSource, waitForDiagramRender } from "./editor-helpers";

async function createMindmap(page: Page, source: string) {
  await page.getByRole("button", { name: "New diagram tab" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await chooser.getByRole("button", { name: "Mindmap" }).click();
  await chooser.getByRole("button", { name: "Create diagram", exact: true }).click();
  await setSource(page, source);
  await expect(page.locator(".mindmap-diagram svg")).toBeVisible({ timeout: 45_000 });
  await waitForDiagramRender(page);
}

/** The text the source editor has selected, and where it starts. */
async function readEditorSelection(page: Page) {
  return page.evaluate(async () => {
    const modulePath = "/node_modules/.vite/deps/@codemirror_view.js";
    const { EditorView } = await import(modulePath);
    const state = EditorView.findFromDOM(document.querySelector(".cm-editor"))?.state;
    if (!state) return { text: "", from: -1 };
    const { from, to } = state.selection.main;
    return { text: state.doc.sliceString(from, to), from };
  });
}

const node = (page: Page, label: string, index = 0) =>
  page.locator("text[data-mindmap-node-id]", { hasText: label }).nth(index);
/**
 * Clicks a node's label at the centre of its on-screen box. Playwright's WebKit reports the box of an SVG
 * element inside a CSS-scaled diagram without the scale, so `locator.click()` aims at the wrong place;
 * the browser's own `getBoundingClientRect` is right in every engine.
 */
async function clickNode(
  page: Page,
  [label, index = 0]: [string, number?],
  options: { button?: "left" | "right" } = {},
) {
  const point = await node(page, label, index).evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  await page.mouse.click(point.x, point.y, options);
}
const nodeInspector = (page: Page) => page.getByRole("complementary", { name: "Mindmap node inspector" });
const settings = (page: Page) => page.getByRole("complementary", { name: "Mindmap settings" });
const preview = (page: Page) => page.getByRole("region", { name: "Mindmap diagram preview" });

const DUPLICATES = [
  "@startmindmap",
  "* Root",
  "** Branch one",
  "*** Pros",
  "*** Cons",
  "** Branch two",
  "*** Pros",
  "*** Cons",
  "@endmindmap",
].join("\n");

test.beforeEach(async ({ page }) => {
  await prepareEditor(page);
});

test("selects a node by click, shows it in the inspector and selects its source line", async ({ page }) => {
  test.setTimeout(60_000);
  await createMindmap(page, DUPLICATES);
  await expect(page.locator("text[data-mindmap-node-id]")).toHaveCount(7);
  await clickNode(page, ["Branch two"]);
  await expect(nodeInspector(page)).toBeVisible();
  await expect(nodeInspector(page).getByLabel("Label")).toHaveValue("Branch two");
  await expect.poll(() => readEditorSelection(page).then((selection) => selection.text)).toContain("** Branch two");
  await expect(node(page, "Branch two")).toHaveClass(/mindmap-selected-node/);

  // The same label under two branches: each click selects its own line.
  const source = await readEditorSource(page);
  await clickNode(page, ["Pros", 1]);
  await expect(nodeInspector(page).getByLabel("Label")).toHaveValue("Pros");
  await expect
    .poll(() => readEditorSelection(page).then((selection) => selection.from))
    .toBe(source.lastIndexOf("*** Pros"));
  await clickNode(page, ["Cons", 0]);
  await expect
    .poll(() => readEditorSelection(page).then((selection) => selection.from))
    .toBe(source.indexOf("*** Cons"));
  await clickNode(page, ["Cons", 1]);
  await expect
    .poll(() => readEditorSelection(page).then((selection) => selection.from))
    .toBe(source.lastIndexOf("*** Cons"));

  // Clicking the background clears the selection.
  await page.locator(".mindmap-diagram").click({ position: { x: 2, y: 2 } });
  await expect(nodeInspector(page)).toHaveCount(0);
});

test("the source cursor selects the node", async ({ page }) => {
  await createMindmap(page, DUPLICATES);
  await page.locator(".cm-content").getByText("Branch two").click();
  await expect(nodeInspector(page).getByLabel("Label")).toHaveValue("Branch two");
  await expect(node(page, "Branch two")).toHaveClass(/mindmap-selected-node/);
});

test("renames, recolours and styles a node from the inspector, and undoes it", async ({ page }) => {
  test.setTimeout(60_000);
  await createMindmap(page, "@startmindmap\n* Root\n** Plan\n** Build\n@endmindmap");
  await clickNode(page, ["Build"]);
  const inspector = nodeInspector(page);
  await inspector.getByLabel("Label").fill("Ship it");
  await inspector.getByLabel("Label").blur();
  await expect.poll(() => readEditorSource(page)).toContain("** Ship it");
  await inspector.getByLabel("Background color", { exact: true }).fill("LightBlue");
  await inspector.getByLabel("Background color", { exact: true }).blur();
  await expect.poll(() => readEditorSource(page)).toContain("**[#LightBlue] Ship it");
  await inspector.getByLabel("Style class").fill("big");
  await inspector.getByLabel("Style class").blur();
  await expect.poll(() => readEditorSource(page)).toContain("**[#LightBlue] Ship it <<big>>");
  await inspector.getByLabel("Draw without a box").check();
  await expect.poll(() => readEditorSource(page)).toContain("**[#LightBlue]_ Ship it <<big>>");
  await waitForDiagramRender(page);
  await expect(page.locator(".mindmap-diagram svg")).not.toContainText("Syntax Error");
  await expect(node(page, "Ship it")).toBeVisible();

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).not.toContain("_ Ship it");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).toContain("**[#LightBlue]_ Ship it <<big>>");
});

test("moves a depth-2 node to the other side from the inspector", async ({ page }) => {
  test.setTimeout(60_000);
  await createMindmap(page, "@startmindmap\n* Root\n** Plan\n** Build\n@endmindmap");
  await clickNode(page, ["Build"]);
  await nodeInspector(page).getByLabel("Branch side").selectOption("left");
  await expect.poll(() => readEditorSource(page)).toContain("-- Build");
  await expect(node(page, "Build")).toBeVisible();
  await nodeInspector(page).getByLabel("Branch side").selectOption("right");
  await expect.poll(() => readEditorSource(page)).toContain("++ Build");
});

test("adds a child and a sibling from the inspector and the Insert menu", async ({ page }) => {
  test.setTimeout(60_000);
  await createMindmap(page, "@startmindmap\n* Root\n** Plan\n** Build\n@endmindmap");
  await clickNode(page, ["Plan"]);
  await nodeInspector(page).getByRole("button", { name: "Add child…" }).click();
  const add = page.getByRole("dialog", { name: "Add mindmap node" });
  await add.getByLabel("Label").fill("Budget");
  await expect(add.getByLabel("Position")).toHaveValue("child");
  await add.getByRole("button", { name: "Add node" }).click();
  await expect.poll(() => readEditorSource(page)).toContain("** Plan\n*** Budget\n** Build");
  // The new node is selected.
  await expect(nodeInspector(page).getByLabel("Label")).toHaveValue("Budget");

  await nodeInspector(page).getByRole("button", { name: "Add sibling…" }).click();
  const sibling = page.getByRole("dialog", { name: "Add mindmap node" });
  await expect(sibling.getByLabel("Position")).toHaveValue("sibling");
  await sibling.getByLabel("Label").fill("Schedule");
  await sibling.getByRole("button", { name: "Add node" }).click();
  await expect.poll(() => readEditorSource(page)).toContain("*** Budget\n*** Schedule\n** Build");

  await openRibbonGroup(page, "Insert", "Insert elements");
  await page.getByRole("button", { name: "Mindmap node…" }).click();
  const viaMenu = page.getByRole("dialog", { name: "Add mindmap node" });
  await viaMenu.getByLabel("Label").fill("Via menu");
  await viaMenu.getByRole("button", { name: "Add node" }).click();
  await expect.poll(() => readEditorSource(page)).toContain("Via menu");
  await waitForDiagramRender(page);
  await expect(page.locator(".mindmap-diagram svg")).not.toContainText("Syntax Error");
  await expect(page.locator("text[data-mindmap-node-id]")).toHaveCount(6);
});

test("deletes a subtree after confirming, and blocks deleting the only root", async ({ page }) => {
  test.setTimeout(60_000);
  await createMindmap(page, "@startmindmap\n* Root\n** Plan\n*** Budget\n** Build\n@endmindmap");
  await clickNode(page, ["Plan"]);
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Plan");
    void dialog.accept();
  });
  await nodeInspector(page).getByRole("button", { name: "Delete subtree" }).click();
  await expect.poll(() => readEditorSource(page)).toBe("@startmindmap\n* Root\n** Build\n@endmindmap");
  await expect(nodeInspector(page)).toHaveCount(0);
  await waitForDiagramRender(page);

  await clickNode(page, ["Root"]);
  const remove = nodeInspector(page).getByRole("button", { name: "Delete subtree" });
  await expect(remove).toBeDisabled();
  await expect(nodeInspector(page).getByTestId("mindmap-delete-blocker")).toContainText("only root");
  expect(await readEditorSource(page)).toBe("@startmindmap\n* Root\n** Build\n@endmindmap");

  // A declined confirmation changes nothing.
  await clickNode(page, ["Build"]);
  page.once("dialog", (dialog) => void dialog.dismiss());
  await nodeInspector(page).getByRole("button", { name: "Delete subtree" }).click();
  expect(await readEditorSource(page)).toBe("@startmindmap\n* Root\n** Build\n@endmindmap");
});

test("edits the diagram settings", async ({ page }) => {
  test.setTimeout(60_000);
  await createMindmap(page, "@startmindmap\n* Root\n** Plan\n** Build\n@endmindmap");
  await openRibbonGroup(page, "View", "Diagram settings");
  await page.getByRole("button", { name: "Diagram settings", exact: true }).click();
  const panel = settings(page);
  await expect(panel).toBeVisible();
  const directions = await panel.getByLabel("Direction").locator("option").allTextContents();
  expect(directions.some((text) => /bottom to top/i.test(text))).toBe(false);
  await panel.getByLabel("Direction").selectOption("top-to-bottom");
  await panel.getByLabel("Diagram title").fill("Roadmap");
  await panel.getByLabel("Caption").fill("Figure 1");
  await panel.getByLabel("Header").fill("Top");
  await panel.getByLabel("Footer").fill("Bottom");
  await panel.getByLabel("Legend").fill("Key");
  await panel.getByRole("button", { name: "Apply" }).click();
  await expect
    .poll(() => readEditorSource(page))
    .toBe(
      [
        "@startmindmap",
        "top to bottom direction",
        "title Roadmap",
        "caption Figure 1",
        "header Top",
        "footer Bottom",
        "legend",
        "Key",
        "endlegend",
        "* Root",
        "** Plan",
        "** Build",
        "@endmindmap",
      ].join("\n"),
    );
  await waitForDiagramRender(page);
  await expect(page.locator(".mindmap-diagram svg")).not.toContainText("Syntax Error");
  await expect(page.locator(".mindmap-diagram svg")).toContainText("Roadmap");

  // Clearing a setting removes its line, and undo brings the whole change back in one step.
  await page.getByRole("button", { name: "Diagram settings", exact: true }).click();
  await settings(page).getByLabel("Diagram title").fill("");
  await settings(page).getByLabel("Direction").selectOption("");
  await settings(page).getByRole("button", { name: "Apply" }).click();
  await expect.poll(() => readEditorSource(page)).not.toContain("title Roadmap");
  await expect.poll(() => readEditorSource(page)).not.toContain("top to bottom direction");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).toContain("title Roadmap");
  await expect.poll(() => readEditorSource(page)).toContain("top to bottom direction");
});

test("a Markdown-form mindmap offers the convert path instead of editing", async ({ page }) => {
  test.setTimeout(60_000);
  await createMindmap(page, "@startmindmap\n# Root\n## Child\n@endmindmap");
  await clickNode(page, ["Child"]);
  const inspector = nodeInspector(page);
  await expect(inspector).toContainText("Markdown form");
  await expect(inspector.getByLabel("Label")).toHaveCount(0);
  await expect(inspector.getByRole("button", { name: "Add child…" })).toBeDisabled();
  await inspector.getByRole("button", { name: "Convert to * markers" }).click();
  await expect.poll(() => readEditorSource(page)).toBe("@startmindmap\n* Root\n** Child\n@endmindmap");
  await waitForDiagramRender(page);
  await clickNode(page, ["Child"]);
  await expect(nodeInspector(page).getByLabel("Label")).toHaveValue("Child");
});

test("the context menu adds, moves and deletes, and renames in place with F2", async ({ page }) => {
  test.setTimeout(60_000);
  await createMindmap(page, "@startmindmap\n* Root\n** Plan\n** Build\n@endmindmap");
  await clickNode(page, ["Plan"], { button: "right" });
  await page.getByRole("menuitem", { name: "Add child…" }).click();
  const add = page.getByRole("dialog", { name: "Add mindmap node" });
  await add.getByLabel("Label").fill("Scope");
  await add.getByRole("button", { name: "Add node" }).click();
  await expect.poll(() => readEditorSource(page)).toContain("** Plan\n*** Scope\n** Build");
  await waitForDiagramRender(page);

  await clickNode(page, ["Build"], { button: "right" });
  await page.getByRole("menuitem", { name: "Move to the left side" }).click();
  await expect.poll(() => readEditorSource(page)).toContain("-- Build");
  await waitForDiagramRender(page);

  await clickNode(page, ["Root"], { button: "right" });
  await expect(page.getByRole("menuitem", { name: "Delete subtree" })).toBeDisabled();
  await page.keyboard.press("Escape");

  await node(page, "Scope").focus();
  await page.keyboard.press("F2");
  const rename = page.getByRole("textbox").last();
  await rename.fill("Scope renamed");
  await rename.press("Enter");
  await expect.poll(() => readEditorSource(page)).toContain("*** Scope renamed");
});

test("keeps clicks on the right node when the direction mirrors the diagram", async ({ page }) => {
  test.setTimeout(60_000);
  await createMindmap(
    page,
    [
      "@startmindmap",
      "right to left direction",
      "* Root",
      "** Pros",
      "++ Pros",
      "** Cons",
      "++ Cons",
      "@endmindmap",
    ].join("\n"),
  );
  await expect(page.locator("text[data-mindmap-node-id]")).toHaveCount(5);
  const source = await readEditorSource(page);
  const lines = [
    { label: "Pros", index: 0, line: "++ Pros" },
    { label: "Cons", index: 0, line: "++ Cons" },
    { label: "Pros", index: 1, line: "** Pros" },
    { label: "Cons", index: 1, line: "** Cons" },
  ];
  // The engine draws the + branches first in this direction, so the first drawn "Pros" is the ++ one.
  for (const item of lines) {
    await clickNode(page, [item.label, item.index]);
    await expect
      .poll(() => readEditorSelection(page).then((selection) => selection.from))
      .toBe(source.indexOf(item.line));
  }
  // Sides mean nothing here, so the inspector offers no side control.
  await clickNode(page, ["Pros", 0]);
  await expect(nodeInspector(page).getByLabel("Branch side")).toHaveCount(0);
  await expect(preview(page)).toHaveAttribute("data-render-status", "idle");
});

test("labels with Creole markup and icons are still clickable", async ({ page }) => {
  test.setTimeout(60_000);
  await createMindmap(
    page,
    [
      "@startmindmap",
      "* Root",
      "** //italic// and --strike--",
      "** <color:red>Red</color> text",
      "** Plain",
      "@endmindmap",
    ].join("\n"),
  );
  await expect(page.locator("text[data-mindmap-node-id]").first()).toBeVisible();
  const source = await readEditorSource(page);
  await clickNode(page, ["strike"]);
  await expect
    .poll(() => readEditorSelection(page).then((selection) => selection.from))
    .toBe(source.indexOf("** //italic//"));
  await clickNode(page, ["Plain"]);
  await expect
    .poll(() => readEditorSelection(page).then((selection) => selection.from))
    .toBe(source.indexOf("** Plain"));
});
