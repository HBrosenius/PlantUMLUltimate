import type { Page } from "@playwright/test";
import { expect, test } from "./coverage";
import { fillSource, prepareEditor, readEditorSource, setSource, waitForDiagramRender } from "./editor-helpers";

async function createMindmap(page: Page) {
  await page.getByRole("button", { name: "New diagram tab" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await chooser.getByRole("button", { name: "Mindmap" }).click();
  await chooser.getByRole("button", { name: "Create diagram", exact: true }).click();
}

async function applyFix(page: Page, name: RegExp) {
  const list = page.getByRole("list", { name: "Source fix suggestions", exact: true });
  const choice = list.getByRole("button", { name });
  if (!(await choice.isVisible())) await page.getByLabel("Show source fix suggestions").click();
  await choice.click();
}

test("creates a mindmap from the chooser and renders it", async ({ page }) => {
  await prepareEditor(page);
  await createMindmap(page);
  await expect(page.locator(".cm-content")).toContainText("@startmindmap");
  await expect(page.locator(".cm-content")).toContainText("* Product launch");
  await expect(page.getByRole("region", { name: "Mindmap diagram preview" })).toBeVisible();
  await expect(page.locator(".mindmap-diagram svg")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".mindmap-diagram svg")).not.toContainText("Syntax Error");
  await expect(page.locator(".mindmap-diagram svg")).toContainText("Product launch");
  await expect(page.locator(".mindmap-diagram svg")).toContainText("Marketing");
  await expect(page.locator(".statusbar")).toContainText("Mindmap");
  // The editing hint, insert menu and diagram settings of other kinds must not leak in.
  await expect(page.getByRole("button", { name: "Add WBS node…" })).toHaveCount(0);

  await setSource(
    page,
    [
      "@startmindmap",
      "title Study plan",
      "* Exam preparation",
      "++[#lightgreen] Topics",
      "+++ Theory",
      "++_ Boxless note",
      "left side",
      "** Materials",
      "-- Support",
      "@endmindmap",
    ].join("\n"),
  );
  await expect(page.locator(".mindmap-diagram svg")).toContainText("Exam preparation");
  await expect(page.locator(".mindmap-diagram svg")).toContainText("Boxless note");
  await expect(page.locator(".mindmap-diagram svg")).toContainText("Support");
});

test("reports a mindmap error and applies the quick fixes", async ({ page }) => {
  await prepareEditor(page);
  await createMindmap(page);
  await setSource(page, "@startmindmap\n* Root\n** Child\n@endmindmap");
  await expect(page.locator(".statusbar")).toContainText("No issues");

  // An orphaned deep node is an error, with a mindmap message rather than a WBS one.
  await fillSource(page, "@startmindmap\n* Root\n*** Orphan\n@endmindmap");
  await expect(page.locator(".cm-lintRange-error").first()).toBeVisible();
  await page
    .locator(".statusbar")
    .getByRole("button", { name: /\d+ issues?/ })
    .click();
  const issues = page.getByRole("complementary", { name: "Issues" });
  await expect(issues).toContainText("no parent");
  await expect(issues).not.toContainText("WBS");
  await page.getByRole("button", { name: "Close issues" }).click();

  // A missing closing tag offers a mindmap-specific fix.
  await fillSource(page, "@startmindmap\n* Root\n** Child");
  await applyFix(page, /@endmindmap/);
  await expect.poll(() => readEditorSource(page)).toBe("@startmindmap\n* Root\n** Child\n@endmindmap");
  await expect(page.locator(".statusbar")).toContainText("No issues");

  // Markdown form is source-only: an info message with a convert fix.
  await fillSource(page, "@startmindmap\n# Root\n## Child\n### Leaf\n@endmindmap");
  await expect(page.locator(".cm-lintRange-info").first()).toBeVisible();
  await applyFix(page, /Convert to \* markers/);
  await expect.poll(() => readEditorSource(page)).toBe("@startmindmap\n* Root\n** Child\n*** Leaf\n@endmindmap");
  await expect(page.locator(".cm-lintRange-info")).toHaveCount(0);
  await waitForRenderedText(page, "Leaf");

  // A left-over arrow line is not mindmap syntax; the fix removes it.
  await fillSource(page, "@startmindmap\n* A\n** B\nA -> B\n@endmindmap");
  await applyFix(page, /Remove the arrow line/);
  await expect.poll(() => readEditorSource(page)).toBe("@startmindmap\n* A\n** B\n@endmindmap");
});

async function waitForRenderedText(page: Page, text: string) {
  await expect(page.locator(".mindmap-diagram svg")).toContainText(text, { timeout: 45_000 });
}

test("renames a mindmap node from the editor", async ({ page }) => {
  await prepareEditor(page);
  await createMindmap(page);
  await setSource(page, "@startmindmap\n* Root\n** Child\n@endmindmap");
  const line = page.locator(".cm-line").filter({ hasText: "** Child" });
  const box = await line.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width - 4, box!.y + box!.height / 2, { button: "right" });
  await page.getByRole("menuitem", { name: "Rename…" }).click();
  const rename = page.getByRole("dialog", { name: "Rename Mindmap node" });
  await rename.getByLabel("New name").fill("Renamed child");
  await rename.getByRole("button", { name: "Rename" }).click();
  await expect.poll(() => readEditorSource(page)).toBe("@startmindmap\n* Root\n** Renamed child\n@endmindmap");
});

test("formats a mindmap without disturbing its markers", async ({ page }) => {
  await prepareEditor(page);
  await createMindmap(page);
  await setSource(page, "  @startmindmap\n  left to right direction\n* Root\n--[#lightblue]_ Left\n  @endmindmap");
  await page.getByRole("button", { name: "Format source…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Format source preview", exact: true });
  await dialog.getByRole("button", { name: "Apply formatting", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => readEditorSource(page))
    .toBe("@startmindmap\nleft to right direction\n* Root\n--[#lightblue]_ Left\n@endmindmap");
});

const SAVE_HANDLE = () => {
  let bytes = new Uint8Array();
  const handle = {
    name: "ideas.pumlu",
    getFile: async () => new File([bytes], "ideas.pumlu", { type: "application/octet-stream" }),
    createWritable: async () => {
      let staged = bytes;
      return {
        write: async (data: string | Uint8Array | Blob) => {
          staged =
            typeof data === "string"
              ? new TextEncoder().encode(data)
              : data instanceof Blob
                ? new Uint8Array(await data.arrayBuffer())
                : Uint8Array.from(data);
        },
        close: async () => {
          bytes = staged;
          (window as Window & { savedBytes?: Uint8Array }).savedBytes = bytes;
        },
        abort: async () => undefined,
      };
    },
  };
  Object.assign(window, {
    showSaveFilePicker: async () => handle,
    showOpenFilePicker: async () => [handle],
  });
};

test("saves a mindmap as .pumlu and reopens it", async ({ page }) => {
  await page.addInitScript(SAVE_HANDLE);
  await prepareEditor(page);
  await createMindmap(page);
  const source = "@startmindmap\ntop to bottom direction\n* Saved root\nleft side\n** Left idea\n-- Other\n@endmindmap";
  await setSource(page, source);
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        new TextDecoder().decode((window as Window & { savedBytes?: Uint8Array }).savedBytes?.slice(0, 8)),
      ),
    )
    .toBe("PUMLUDOC");

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open", exact: true }).click();
  await page.getByRole("menu", { name: "Open" }).getByRole("menuitem", { name: "Diagram…" }).click();
  await expect(page.locator('.document-tab > button[title*="File: ideas.pumlu"]')).toHaveCount(2);
  await expect.poll(() => readEditorSource(page)).toBe(source);
  await expect(page.locator(".statusbar")).toContainText("Mindmap");
  await expect(page.locator(".mindmap-diagram svg")).toContainText("Saved root", { timeout: 45_000 });
  await expect(page.locator(".cm-lintRange-error")).toHaveCount(0);
});

test("adds, renames, saves and reopens a mindmap inside a multi-diagram document", async ({ page }) => {
  await page.addInitScript(SAVE_HANDLE);
  await prepareEditor(page);
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "New", exact: true }).click();
  await page.getByRole("menu", { name: "New" }).getByRole("menuitem", { name: "Document…" }).click();
  const dialog = page.getByRole("dialog", { name: "New document" });
  await dialog.getByRole("textbox", { name: "Name" }).fill("Workshop");
  await dialog.getByRole("button", { name: "Create document" }).click();

  const navigator = page.getByRole("complementary", { name: "Document navigator" });
  await navigator.getByRole("button", { name: "Add diagram" }).click();
  await navigator.getByRole("combobox", { name: "Diagram type" }).selectOption("mindmap");
  await expect(navigator.getByRole("textbox", { name: "Diagram name" })).toHaveValue("Mindmap diagram");
  await navigator.getByRole("textbox", { name: "Diagram name" }).fill("Ideas");
  await navigator.getByRole("button", { name: "Add to document" }).click();
  await expect(page.locator(".cm-content")).toContainText("@startmindmap");
  await expect(page.locator(".mindmap-diagram svg")).toBeVisible({ timeout: 45_000 });
  await setSource(page, "@startmindmap\n* Workshop goals\n** Agenda\n-- Risks\n@endmindmap");

  await navigator.getByRole("button", { name: "Rename Ideas", exact: true }).click();
  const rename = page.getByRole("dialog", { name: "Rename diagram" });
  await rename.getByRole("textbox", { name: "Name" }).fill("Brainstorm");
  await rename.getByRole("button", { name: "Rename", exact: true }).click();
  // No Gantt link actions exist for a mindmap.
  await expect(navigator.getByText("Create Gantt chart from WBS")).toHaveCount(0);
  await expect(navigator.getByRole("button", { name: "Inspect diagram Brainstorm", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await expect(navigator.locator(".project-save-status")).toHaveText("Saved");

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Close Brainstorm in Workshop", exact: true }).click();
  await navigator.getByRole("button", { name: "Close document", exact: true }).click();
  await expect(navigator).toHaveCount(0);
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open", exact: true }).click();
  await page.getByRole("menu", { name: "Open" }).getByRole("menuitem", { name: "Document…" }).click();
  await expect(navigator).toBeVisible();
  await navigator.getByRole("button", { name: /^Brainstorm mindmap/ }).click();
  await expect
    .poll(() => readEditorSource(page))
    .toBe("@startmindmap\n* Workshop goals\n** Agenda\n-- Risks\n@endmindmap");
  await expect(page.locator(".mindmap-diagram svg")).toContainText("Workshop goals", { timeout: 45_000 });
});

test("the style snippets render, and a * { } style rule gets a warning and a fix", async ({ page }) => {
  test.setTimeout(90_000);
  await prepareEditor(page);
  await createMindmap(page);
  const style = (rule: string) => `<style>\nmindmapDiagram {\n  ${rule}\n}\n</style>`;
  const snippets = [
    style("node {\n    BackgroundColor lightyellow\n  }"),
    style(".green {\n    BackgroundColor lightgreen\n  }"),
    style(":depth(1) {\n    BackgroundColor lightblue\n  }"),
    style("node {\n    MaximumWidth 150\n  }"),
  ];
  for (const snippet of snippets) {
    await setSource(page, `@startmindmap\n${snippet}\n* Root\n** Child <<green>>\n@endmindmap`);
    await expect(page.locator(".mindmap-diagram svg")).toContainText("Child", { timeout: 45_000 });
    await expect(page.locator(".mindmap-diagram svg")).not.toContainText("Syntax Error");
    await expect(page.locator(".cm-lintRange-warning")).toHaveCount(0);
  }

  const broken =
    "@startmindmap\n<style>\nmindmapDiagram {\n  * {\n    FontSize 12\n  }\n}\n</style>\n* Root\n@endmindmap";
  await fillSource(page, broken);
  await applyFix(page, /Replace the \* \{\} rule with node/);
  await expect.poll(() => readEditorSource(page)).toBe(broken.replace("  * {", "  node {"));
  await expect(page.locator(".cm-lintRange-warning")).toHaveCount(0);
  await expect(page.locator(".mindmap-diagram svg")).toContainText("Root", { timeout: 45_000 });
});

test("moves several selected mindmap branches to the other side in one undo step", async ({ page, browserName }) => {
  test.setTimeout(browserName === "webkit" ? 180_000 : 90_000);
  await prepareEditor(page);
  await createMindmap(page);
  const wrap = (body: string[]) => ["@startmindmap", ...body, "@endmindmap"].join("\n");
  const original = wrap(["* Root", "** One", "*** One A", "** Two", "** Three"]);
  await setSource(page, original);
  await expect(page.locator(".mindmap-diagram svg")).toBeVisible({ timeout: 45_000 });
  await waitForDiagramRender(page);
  const click = async (text: string, shift = false) => {
    await waitForDiagramRender(page);
    // Aim with the browser's own rectangle: WebKit reports an SVG box in a scaled diagram without the scale.
    const point = await page
      .locator("text[data-mindmap-node-id]", { hasText: text })
      .first()
      .evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      });
    if (shift) await page.keyboard.down("Shift");
    try {
      await page.mouse.click(point.x, point.y);
    } finally {
      if (shift) await page.keyboard.up("Shift");
    }
  };
  const inspector = page.getByRole("complementary", { name: "Selected elements inspector" });
  const press = (button: ReturnType<Page["getByRole"]>) =>
    browserName === "webkit" ? button.press("Enter") : button.click();

  // A deeper node owns no side: it is counted out, and its selected parent moves once with it.
  await click("One");
  await click("One A", true);
  await click("Two", true);
  await expect(inspector.getByText("3 elements selected")).toBeVisible();
  await expect(inspector.getByText("2 of 3 nodes have a side")).toBeVisible();
  await press(inspector.getByRole("button", { name: "Move to left side", exact: true }));
  await expect.poll(() => readEditorSource(page)).toBe(wrap(["* Root", "-- One", "--- One A", "-- Two", "** Three"]));
  await expect(page.locator(".statusbar")).toContainText("Moved 2 branches to the left");
  await expect(inspector.getByText("3 elements selected")).toBeVisible();
  await press(inspector.getByRole("button", { name: "Move to right side", exact: true }));
  await expect.poll(() => readEditorSource(page)).toBe(wrap(["* Root", "++ One", "+++ One A", "++ Two", "** Three"]));

  // Each side change is one undo step.
  await press(page.getByRole("button", { name: "Undo", exact: true }));
  await expect.poll(() => readEditorSource(page)).toBe(wrap(["* Root", "-- One", "--- One A", "-- Two", "** Three"]));
  await press(page.getByRole("button", { name: "Undo", exact: true }));
  await expect.poll(() => readEditorSource(page)).toBe(original);
});
