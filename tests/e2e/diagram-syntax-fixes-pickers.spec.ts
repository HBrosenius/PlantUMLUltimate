import { expect, test } from "@playwright/test";
import { fillSource, prepareEditor } from "./editor-helpers";

test("compares alternative task repairs and applies only the chosen reference", async ({ page }) => {
  await prepareEditor(page);
  const lines = [
    "@startgantt",
    "[Build] lasts 2 days",
    "[Built] lasts 3 days",
    "[Release] lasts 1 day",
    "[Release] starts 5 days after [Buil]'s end",
    "@endgantt",
  ];
  await fillSource(page, lines.join("\n"));
  await page.getByLabel("Show source fix suggestions").click();
  const suggestions = page.getByRole("list", { name: "Source fix suggestions", exact: true });
  await expect(suggestions.getByRole("note")).toContainText("Choose one of 2 alternatives");
  const choice = suggestions.getByRole("button", { name: /Use task Built/ });
  await expect(choice.locator("..")).toContainText("Before:");
  await expect(choice.locator("..").locator("del")).toContainText("[Buil]'s end");
  await expect(choice.locator("..").locator("code")).toHaveText("[Release] starts 5 days after [Built]'s end");
  await choice.click();
  await expect(page.locator(".cm-content .cm-line")).toHaveText(lines.map((line) => line.replace("[Buil]", "[Built]")));
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".cm-content .cm-line")).toHaveText(lines);
});

test("keeps ambiguous class closures as manual errors without changing source", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Class diagram" })
    .click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Create diagram", exact: true })
    .click();
  const lines = ["@startuml", "class Order {", "  +id: UUID", "class Customer", "@enduml"];
  await fillSource(page, lines.join("\n"));
  await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
  const problems = page.getByRole("complementary", { name: "Issues" });
  await expect(problems).toContainText("Order is missing }");
  await expect(page.getByLabel("Show source fix suggestions")).toHaveCount(0);
  await expect(problems.getByRole("list", { name: "Source fix suggestions", exact: true })).toHaveCount(0);
  const editor = page.locator(".cm-content");
  await editor.press("ControlOrMeta+Home");
  await editor.press("ControlOrMeta+Shift+m");
  const explanation = page.getByRole("region", { name: "Error explanation" });
  await expect(explanation).toContainText("Order is missing }");
  await expect(explanation.getByRole("button", { name: "Open suggested fixes" })).toHaveCount(0);
  await expect(editor.locator(".cm-line")).toHaveText(lines);
});

for (const width of [390, 800]) {
  test(`compacts and expands a multiline fix at ${width}px without applying it`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await prepareEditor(page);
    const body = Array.from({ length: 30 }, (_, index) => `[Task ${index + 1}] lasts 1 day`);
    const lines = ["@endgantt", ...body, "@startgantt"];
    const expected = ["@startgantt", ...body, "@endgantt"];
    await fillSource(page, lines.join("\n"));
    await page.getByLabel("Show source fix suggestions").click();
    const suggestions = page.getByRole("list", { name: "Source fix suggestions", exact: true });
    const apply = suggestions.getByRole("button", { name: /Move opening tag before closing tag/ });
    await expect(apply.locator("..").locator("code")).toContainText("lines omitted");
    await expect(apply.locator("..").locator("code")).not.toContainText("[Task 15]");
    const full = suggestions.locator(".source-fix-full-preview");
    await full.getByText("Show full change", { exact: true }).click();
    await expect(full.locator("pre").nth(0)).toHaveText(lines.join("\n"));
    await expect(full.locator("pre").nth(1)).toHaveText(expected.join("\n"));
    await expect(page.locator(".cm-content .cm-line")).toHaveText(lines);
    const box = await suggestions.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(700);
    await page.screenshot({ path: test.info().outputPath("expanded-preview.png") });
    await apply.click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText(expected);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.locator(".cm-content .cm-line")).toHaveText(lines);
  });
}

test("keyboard fix picker navigates, advances after Apply, and restores focus on Undo", async ({ page }) => {
  await prepareEditor(page);
  const lines = ["@startgant", "[Build] lasts 2 days", "@endgant"];
  await fillSource(page, lines.join("\n"));
  const editor = page.locator(".cm-content");
  await editor.press("ControlOrMeta+Home");
  await editor.press("ControlOrMeta+.");
  const choices = page.getByRole("list", { name: "Source fix suggestions", exact: true });
  const buttons = choices.getByRole("button");
  await expect(choices).toBeVisible();
  await expect(buttons.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(buttons.nth(1)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(buttons.first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(buttons.last()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(choices).not.toBeVisible();
  await expect(editor).toBeFocused();
  await expect(editor.locator(".cm-line")).toHaveText(lines);
  await editor.press("ControlOrMeta+.");
  await page.keyboard.press("Enter");
  await expect(choices.getByRole("button", { name: /Apply fix.*Use @endgantt/ })).toBeFocused();
  await expect(editor.locator(".cm-line")).toHaveText(["@startgantt", lines[1]!, lines[2]!]);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor.locator(".cm-line")).toHaveText(lines);
  await expect(editor).toBeFocused();
});

test("keyboard expands a full fix preview without applying it", async ({ page }) => {
  await prepareEditor(page);
  const lines = ["@endgantt", ...Array.from({ length: 30 }, (_, i) => `[Task${i}] lasts 1 day`), "@startgantt"];
  await fillSource(page, lines.join("\n"));
  const editor = page.locator(".cm-content");
  await editor.press("ControlOrMeta+.");
  await page.keyboard.press("Tab");
  const summary = page.locator(".source-fix-full-preview summary");
  await expect(summary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".source-fix-full-preview pre").first()).toBeVisible();
  await expect(editor.locator(".cm-line")).toHaveText(lines);
  await page.keyboard.press("Escape");
  await expect(editor).toBeFocused();
  await expect(page.getByRole("list", { name: "Source fix suggestions", exact: true })).not.toBeVisible();
});

test("fix picker prioritizes the cursor line and previews ranges without changing selection", async ({ page }) => {
  await prepareEditor(page);
  const lines = ["@startgant", "[Build] lasts 2 days", "@endgant"];
  await fillSource(page, lines.join("\n"));
  const editor = page.locator(".cm-content");
  await editor.press("ControlOrMeta+End");
  await editor.press("ControlOrMeta+.");
  const choices = page.getByRole("list", { name: "Source fix suggestions", exact: true });
  const buttons = choices.getByRole("button");
  await expect(buttons.first()).toContainText("Use @endgantt");
  await expect(buttons.first()).toContainText("current line");
  await expect(page.locator(".cm-fix-target")).toHaveText("@endgant");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".cm-fix-target")).toHaveText("@startgant");
  await expect(editor.locator(".cm-line")).toHaveText(lines);
  await page.keyboard.press("Escape");
  await expect(page.locator(".cm-fix-target")).toHaveCount(0);
  await expect(editor).toBeFocused();
  // Closing the picker preserves the original cursor at the final line.
  await editor.press("ControlOrMeta+.");
  await expect(buttons.first()).toContainText("Use @endgantt");
  await page.keyboard.press("Enter");
  await expect(editor.locator(".cm-line")).toHaveText([lines[0]!, lines[1]!, "@endgantt"]);
  await expect(page.locator(".cm-fix-target")).toHaveText("@startgant");
});

test("fix insertion preview marks its target line and clears when editing resumes", async ({ page }) => {
  await prepareEditor(page);
  await fillSource(page, "@startgantt\n[Build] lasts 2 days");
  const editor = page.locator(".cm-content");
  await editor.press("ControlOrMeta+.");
  await expect(page.locator(".cm-fix-insertion-target")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".cm-fix-insertion-target")).toHaveCount(0);
  await expect(editor.locator(".cm-line")).toHaveText(["@startgantt", "[Build] lasts 2 days"]);
});

test("source error navigation wraps and refreshes after repair and undo", async ({ page }) => {
  await prepareEditor(page);
  const lines = ["@startgant", "[Build] lasts 2 days", "@endgant"];
  await fillSource(page, lines.join("\n"));
  const editor = page.locator(".cm-content");
  const announcement = page.locator(".source-error-announcement");
  await editor.press("ControlOrMeta+Home");
  await editor.press("F8");
  await expect(announcement).toContainText("Error 2 of 2, line 3");
  await editor.press("F8");
  await expect(announcement).toContainText("Error 1 of 2, line 1");
  await editor.press("Shift+F8");
  await expect(announcement).toContainText("Error 2 of 2, line 3");
  await page.getByRole("button", { name: "Previous error", exact: true }).click();
  await expect(announcement).toContainText("Error 1 of 2, line 1");
  await expect(editor).toBeFocused();
  await expect(editor.locator(".cm-line")).toHaveText(lines);
  await editor.press("ControlOrMeta+.");
  await page.keyboard.press("Enter");
  await editor.press("F8");
  await expect(announcement).toContainText("Error 1 of 1, line 3");
  await editor.press("ControlOrMeta+.");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Next error", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Previous error", exact: true })).toBeDisabled();
  await editor.press("ControlOrMeta+z");
  await expect(editor.locator(".cm-line")).toHaveText(["@startgantt", lines[1]!, lines[2]!]);
  await editor.press("ControlOrMeta+z");
  await expect(editor.locator(".cm-line")).toHaveText(lines);
  await expect(page.getByRole("button", { name: "Next error", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Next error", exact: true }).click();
  await expect(announcement).toContainText("Error 1 of 2, line 1");
});

test("open fixes close and refresh after typing and undo/redo", async ({ page }) => {
  await prepareEditor(page);
  const original = ["@startgant", "[Build] lasts 2 days", "@endgantt"];
  await fillSource(page, original.join("\n"));
  const editor = page.locator(".cm-content");
  await editor.press("ControlOrMeta+.");
  const suggestions = page.getByRole("list", { name: "Source fix suggestions", exact: true });
  await expect(page.locator(".cm-fix-target")).toHaveText("@startgant");
  await editor.focus();
  await editor.press("ControlOrMeta+Home");
  await page.keyboard.insertText("' comment\n");
  await expect(suggestions).not.toBeVisible();
  await expect(page.locator(".cm-fix-target")).toHaveCount(0);
  await editor.press("ControlOrMeta+.");
  await expect(suggestions.getByRole("button").first()).toContainText("Line 2:");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(suggestions).not.toBeVisible();
  await expect(editor.locator(".cm-line")).toHaveText(original);
  await editor.press("ControlOrMeta+.");
  await expect(suggestions.getByRole("button").first()).toContainText("Line 1:");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(suggestions).not.toBeVisible();
  await expect(editor.locator(".cm-line")).toHaveText(["' comment", ...original]);
  await editor.press("ControlOrMeta+.");
  await page.keyboard.press("Enter");
  await expect(editor.locator(".cm-line")).toHaveText(["' comment", "@startgantt", original[1]!, original[2]!]);
});

test("switching identical-source tabs dismisses focused fixes without editing either tab", async ({ page }) => {
  await prepareEditor(page);
  const lines = ["@startgant", "[Build] lasts 2 days", "@endgantt"];
  await fillSource(page, lines.join("\n"));
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Gantt diagram" })
    .click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Create diagram", exact: true })
    .click();
  await fillSource(page, lines.join("\n"));
  const editor = page.locator(".cm-content");
  await editor.press("ControlOrMeta+.");
  await expect(page.locator(".cm-fix-target")).toHaveText("@startgant");
  const tabs = page.getByRole("navigation", { name: "Open documents" }).locator("button[draggable]");
  await tabs.nth(0).click();
  await expect(page.getByRole("list", { name: "Source fix suggestions", exact: true })).not.toBeVisible();
  await expect(page.locator(".cm-fix-target")).toHaveCount(0);
  await expect(editor.locator(".cm-line")).toHaveText(lines);
  await tabs.nth(1).click();
  await expect(editor.locator(".cm-line")).toHaveText(lines);
  await editor.press("ControlOrMeta+.");
  await page.keyboard.press("Enter");
  await expect(editor.locator(".cm-line")).toHaveText(["@startgantt", lines[1]!, lines[2]!]);
  await tabs.nth(0).click();
  await expect(editor.locator(".cm-line")).toHaveText(lines);
});

test("rapid edit, reopen, apply, and history bursts preserve exact source", async ({ page }) => {
  await prepareEditor(page);
  const lines = ["@startgant", "[Build] lasts 2 days", "@endgantt"];
  await fillSource(page, lines.join("\n"));
  const editor = page.locator(".cm-content");
  const suggestions = page.getByRole("list", { name: "Source fix suggestions", exact: true });
  // Deliberately avoid assertions or delays between events in each burst.
  for (const text of ["' first\n", "' second\n", "' third\n"]) {
    await editor.press("ControlOrMeta+.");
    await editor.focus();
    await editor.press("ControlOrMeta+Home");
    await page.keyboard.insertText(text);
    await editor.press("ControlOrMeta+.");
    await page.keyboard.press("Escape");
  }
  const prefix = ["' third", "' second", "' first"];
  await expect(editor.locator(".cm-line")).toHaveText([...prefix, ...lines]);
  await expect(suggestions).not.toBeVisible();
  await expect(page.locator(".cm-fix-target")).toHaveCount(0);
  await editor.press("ControlOrMeta+.");
  await expect(suggestions.getByRole("button").first()).toContainText("Line 4:");
  await expect(page.locator(".cm-fix-target")).toHaveText("@startgant");
  await page.keyboard.press("Enter");
  for (let cycle = 0; cycle < 3; cycle++) {
    await editor.press("ControlOrMeta+z");
    await editor.press("ControlOrMeta+.");
    await page.keyboard.press("ControlOrMeta+Shift+z");
  }
  await expect(editor.locator(".cm-line")).toHaveText([...prefix, "@startgantt", lines[1]!, lines[2]!]);
  await expect(suggestions).not.toBeVisible();
  await expect(page.locator(".cm-fix-target")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next error", exact: true })).toBeDisabled();
  await expect(editor).toBeFocused();
});

test("rapid tab switches and fixes keep separate documents and previews isolated", async ({ page }) => {
  await prepareEditor(page);
  const first = ["@startgant", "[First] lasts 2 days", "@endgantt"];
  const second = ["@startgantt", "[Second] lasts 3 days", "@endgant"];
  await fillSource(page, first.join("\n"));
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Gantt diagram" })
    .click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Create diagram", exact: true })
    .click();
  await fillSource(page, second.join("\n"));
  const editor = page.locator(".cm-content");
  const tabs = page.getByRole("navigation", { name: "Open documents" }).locator("button[draggable]");
  const suggestions = page.getByRole("list", { name: "Source fix suggestions", exact: true });
  for (let cycle = 0; cycle < 3; cycle++) {
    await editor.press("ControlOrMeta+.");
    await tabs.nth(0).click();
    await editor.press("ControlOrMeta+.");
    await tabs.nth(1).click();
  }
  await expect(editor.locator(".cm-line")).toHaveText(second);
  await expect(suggestions).not.toBeVisible();
  await expect(page.locator(".cm-fix-target")).toHaveCount(0);
  await editor.press("ControlOrMeta+.");
  await expect(suggestions.getByRole("button").first()).toContainText("Use @endgantt");
  await page.keyboard.press("Enter");
  await editor.press("ControlOrMeta+z");
  await tabs.nth(0).click();
  await editor.press("ControlOrMeta+.");
  await expect(suggestions.getByRole("button").first()).toContainText("Use @startgantt");
  await page.keyboard.press("Enter");
  await tabs.nth(1).click();
  await expect(editor.locator(".cm-line")).toHaveText(second);
  await editor.press("ControlOrMeta+Shift+z");
  await expect(editor.locator(".cm-line")).toHaveText([second[0]!, second[1]!, "@endgantt"]);
  await tabs.nth(0).click();
  await expect(editor.locator(".cm-line")).toHaveText(["@startgantt", first[1]!, first[2]!]);
  await expect(suggestions).not.toBeVisible();
  await expect(page.locator(".cm-fix-target")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next error", exact: true })).toBeDisabled();
});
