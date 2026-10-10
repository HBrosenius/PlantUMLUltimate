import { expect, test } from "@playwright/test";
import { fillSource, prepareEditor } from "./editor-helpers";

for (const [type, suffix, body] of [
  ["Gantt", "gantt", "[Build] lasts 2 days"],
  ["WBS", "wbs", "* Project"],
  ["Sequence", "uml", "Alice -> Bob: Hello"],
] as const) {
  for (const opening of [true, false]) {
    test(`repairs misspelled ${type} ${opening ? "opening" : "closing"} tag with undo`, async ({ page }) => {
      await prepareEditor(page);
      if (type !== "Gantt") {
        await page.getByRole("button", { name: "New diagram tab" }).click();
        await page
          .getByRole("dialog", { name: "Choose a diagram type" })
          .getByRole("button", { name: `${type} diagram` })
          .click();
      }
      const lines = [
        opening ? `@strat${suffix}` : `@start${suffix}`,
        body,
        opening ? `@end${suffix}` : `@end${suffix.slice(0, -1)}`,
      ];
      await fillSource(page, lines.join("\n"));
      await page.getByLabel("Show source fix suggestions").click();
      await page.getByRole("button", { name: new RegExp(`Use @${opening ? "start" : "end"}${suffix}`) }).click();
      await expect(page.locator(".cm-content .cm-line")).toHaveText([`@start${suffix}`, body, `@end${suffix}`]);
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(page.locator(".cm-content .cm-line")).toHaveText(lines);
    });
  }
}

test("repairs missing brackets on a declaration and dependency reference", async ({ page }) => {
  await prepareEditor(page);
  await fillSource(
    page,
    "@startgantt\nProject starts 2026-09-21\n[Backend lasts 2 days\n[Frontend] starts at [Backend's end\n@endgantt",
  );
  for (const repaired of ["[Backend] lasts 2 days", "[Frontend] starts at [Backend]'s end"]) {
    const suggestion = page
      .getByRole("list", { name: "Source fix suggestions", exact: true })
      .getByRole("listitem")
      .filter({ has: page.locator(".source-fix-change-preview code", { hasText: repaired }) });
    const choice = suggestion.getByRole("button", { name: /Apply fix.*Add missing closing bracket/ });
    if (!(await choice.isVisible())) await page.getByLabel("Show source fix suggestions").click();
    await choice.click();
    await expect(page.locator(".cm-content")).toContainText(repaired);
  }
});

test("source entry preserves deliberate blank lines without appending extra lines", async ({ page }) => {
  await prepareEditor(page);
  const lines = ["@startgantt", "", "[A] lasts 1 day", "", "@endgantt", "", ""];
  await fillSource(page, lines.join("\n"));
  await expect(page.locator(".cm-content .cm-line")).toHaveText(lines);
});

for (const width of [390, 800, 1440]) {
  test(`keeps start-tag fix suggestions inside Problems at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await prepareEditor(page);
    await fillSource(page, "@startgant\nProject starts 2026-09-21\n[A] lasts 1 day\n@endgantt");
    await page.getByLabel("Show source fix suggestions").click();
    const choices = page.getByRole("list", { name: "Source fix suggestions" });
    await expect(choices).toBeVisible();
    const bounds = await choices.boundingBox();
    const editor = await page.getByRole("complementary", { name: "Issues" }).boundingBox();
    expect(bounds).not.toBeNull();
    expect(editor).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(Math.max(0, editor!.x));
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(Math.min(width, editor!.x + editor!.width));
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(800);
    await choices.getByRole("button", { name: /Use @startgantt/ }).click();
    await expect(page.locator(".cm-content")).toContainText("@startgantt");
  });
}

for (const [faulty, repaired, label] of [
  ["Frontend] lasts 3 days", "[Frontend] lasts 3 days", "Add missing opening bracket"],
  ["[Frontend] starts at Backend]'s end", "[Frontend] starts at [Backend]'s end", "Add missing opening bracket"],
  ["[Frontend]] lasts 3 days", "[Frontend] lasts 3 days", "Remove stray closing bracket"],
] as const) {
  test(`repairs ${faulty} and restores the exact source on undo`, async ({ page }) => {
    await prepareEditor(page);
    const lines = ["@startgantt", "[Backend] lasts 1 day", "[Frontend] lasts 3 days", faulty, "@endgantt"];
    await fillSource(page, lines.join("\n"));
    await page.getByLabel("Show source fix suggestions").click();
    const choice = page.getByRole("button", { name: new RegExp(label) });
    await expect(choice.locator("..").locator("code")).toHaveText(repaired);
    await choice.click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText([
      lines[0]!,
      lines[1]!,
      lines[2]!,
      repaired,
      lines[4]!,
    ]);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText(lines);
  });
}

for (const [faulty, repaired] of [
  [
    "[Frontend] starts 5 days after [Backend] end and lasts 2 days",
    "[Frontend] starts 5 days after [Backend]'s end and lasts 2 days",
  ],
  ["[Frontend] ends at [Backend]s end", "[Frontend] ends at [Backend]'s end"],
  ["[Frontend] starts at [Backend]‘s start", "[Frontend] starts at [Backend]'s start"],
] as const) {
  test(`repairs possessive syntax in ${faulty} with undo`, async ({ page }) => {
    await prepareEditor(page);
    const lines = ["@startgantt", "[Backend] lasts 8 days", faulty, "@endgantt"];
    await fillSource(page, lines.join("\n"));
    await page.getByLabel("Show source fix suggestions").click();
    const choice = page.getByRole("button", {
      name: /Add missing possessive marker|Use straight apostrophe in dependency/,
    });
    await expect(choice.locator("..").locator("code")).toHaveText(repaired);
    await choice.click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText([lines[0]!, lines[1]!, repaired, lines[3]!]);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText(lines);
  });
}

for (const [type, line, expected, label] of [
  ["Sequence", 'participant "Client [end] as C', 'participant "Client [end]" as C', "Add missing closing quote"],
  ["Class", 'class ""Order" as O', 'class "Order" as O', "Remove duplicated quote"],
] as const) {
  test(`repairs quoted ${type} labels with exact undo`, async ({ page }) => {
    await prepareEditor(page);
    await page.getByRole("button", { name: "New diagram tab" }).click();
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: `${type} diagram` })
      .click();
    const lines = ["@startuml", line, "@enduml"];
    await fillSource(page, lines.join("\n"));
    await page.getByLabel("Show source fix suggestions").click();
    await page.getByRole("button", { name: new RegExp(label) }).click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText(["@startuml", expected, "@enduml"]);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText(lines);
  });
}

for (const [type, suffix, body, opening] of [
  ["Sequence", "uml", "Alice -> Bob: Hello", true],
  ["Gantt", "gantt", "[Build] lasts 2 days", false],
] as const) {
  test(`inserts missing ${type} ${opening ? "opening" : "closing"} boundary with undo`, async ({ page }) => {
    await prepareEditor(page);
    if (type !== "Gantt") {
      await page.getByRole("button", { name: "New diagram tab" }).click();
      await page
        .getByRole("dialog", { name: "Choose a diagram type" })
        .getByRole("button", { name: `${type} diagram` })
        .click();
    }
    const lines = opening ? ["' Header", "", body, `@end${suffix}`] : [`@start${suffix}`, body, "", "' Footer"];
    await fillSource(page, lines.join("\n"));
    await page.getByLabel("Show source fix suggestions").click();
    await page.getByRole("button", { name: new RegExp(`Insert @${opening ? "start" : "end"}${suffix}`) }).click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText(
      opening ? [`@start${suffix}`, ...lines] : [...lines, `@end${suffix}`],
    );
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText(lines);
  });
}

for (const [line, source, expected, label] of [
  [
    "mismatch",
    "@startgantt\n[Build] lasts 2 days\n@enduml",
    "@startgantt\n[Build] lasts 2 days\n@endgantt",
    "Use @endgantt",
  ],
  [
    "duplicate",
    "@startgantt\n@startgantt\n[Build] lasts 2 days\n@endgantt",
    "@startgantt\n[Build] lasts 2 days\n@endgantt",
    "Remove duplicated opening tag",
  ],
  [
    "reversed",
    "@endgantt\n[Build] lasts 2 days\n@startgantt",
    "@startgantt\n[Build] lasts 2 days\n@endgantt",
    "Move opening tag before closing tag",
  ],
] as const) {
  test(`repairs boundary ${line} with exact undo`, async ({ page }) => {
    await prepareEditor(page);
    await fillSource(page, source);
    await page.getByLabel("Show source fix suggestions").click();
    await page.getByRole("button", { name: new RegExp(label) }).click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText(expected.split("\n"));
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText(source.split("\n"));
  });
}

for (const [type, faulty, valid, label] of [
  ["Class", "class Order\n  +id: int\n}", "class Order {\n  +id: int\n}", "Add missing opening brace"],
  [
    "Component",
    "package Services {{\n  component API\n}",
    "package Services {\n  component API\n}",
    "Remove duplicated opening brace",
  ],
  [
    "Use Case",
    "rectangle System {\n  usecase Login\n}}",
    "rectangle System {\n  usecase Login\n}",
    "Remove duplicated closing brace",
  ],
] as const) {
  test(`repairs ${type} braces with exact undo`, async ({ page }) => {
    await prepareEditor(page);
    await page.getByRole("button", { name: "New diagram tab" }).click();
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: `${type} diagram` })
      .click();
    const source = `@startuml\n${faulty}\n@enduml`;
    await fillSource(page, source);
    await page.getByLabel("Show source fix suggestions").click();
    await page.getByRole("button", { name: new RegExp(label) }).click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText(["@startuml", ...valid.split("\n"), "@enduml"]);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText(source.split("\n"));
  });
}

for (const [type, faulty, expected, label] of [
  ["Sequence", "alt Ready\nAlice -> Bob: Hi\nendd", "alt Ready\nAlice -> Bob: Hi\nend", "Use end"],
  ["Activity", "start\nwhile (More?)\n:Work;\nendwhil", "start\nwhile (More?)\n:Work;\nendwhile", "Use endwhile"],
  ["Class", "class A\nnote left of A\nText", "class A\nnote left of A\nText\nend note", "Close unclosed blocks"],
] as const) {
  test(`repairs ${type} block terminators with exact undo`, async ({ page }) => {
    await prepareEditor(page);
    await page.getByRole("button", { name: "New diagram tab" }).click();
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: `${type} diagram` })
      .click();
    const source = `@startuml\n${faulty}\n@enduml`;
    await fillSource(page, source);
    await page.getByLabel("Show source fix suggestions").click();
    await page.getByRole("button", { name: new RegExp(label) }).click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText(["@startuml", ...expected.split("\n"), "@enduml"]);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText(source.split("\n"));
  });
}

for (const [type, faulty, expected, label] of [
  [
    "Sequence",
    "participant \"Client [end] as C <<service>> #LightBlue ' Keep comment",
    'participant "Client [end]" as C <<service>> #LightBlue \' Keep comment',
    "Add missing closing quote",
  ],
  [
    "Component",
    "component API {literal}\" as A <<service>> #LightBlue ' Keep comment",
    'component "API {literal}" as A <<service>> #LightBlue \' Keep comment',
    "Add missing opening quote",
  ],
] as const) {
  test(`preserves decorations in ${type} quote mutation repair and undo`, async ({ page }) => {
    await prepareEditor(page);
    await page.getByRole("button", { name: "New diagram tab" }).click();
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: `${type} diagram` })
      .click();
    const lines = ["@startuml output", faulty, "@enduml"];
    await fillSource(page, lines.join("\n"));
    await page.getByLabel("Show source fix suggestions").click();
    await page.getByRole("button", { name: new RegExp(label) }).click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText(["@startuml output", expected, "@enduml"]);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText(lines);
  });
}

for (const [type, body, label, expected] of [
  ["Sequence", "alt Ready\nAlice -> Bob: Hi\nendd", "Use end", "alt Ready\nAlice -> Bob: Hi\nend"],
  ["Class", "class A\nnote left of A\nText\nend not", "Use end note", "class A\nnote left of A\nText\nend note"],
] as const) {
  test(`offers a coherent ${type} terminator repair with undo`, async ({ page }) => {
    await prepareEditor(page);
    await page.getByRole("button", { name: "New diagram tab" }).click();
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: `${type} diagram` })
      .click();
    const lines = ["@startuml", ...body.split("\n"), "@enduml"];
    await fillSource(page, lines.join("\n"));
    await page.getByLabel("Show source fix suggestions").click();
    await expect(page.getByRole("button", { name: /Insert @enduml|Insert end|Close unclosed blocks/ })).toHaveCount(0);
    await page.getByRole("button", { name: new RegExp(label) }).click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText(["@startuml", ...expected.split("\n"), "@enduml"]);
    await expect(page.getByLabel("Show source fix suggestions")).toHaveCount(0);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".cm-content .cm-line")).toHaveText(lines);
    await expect(page.getByLabel("Show source fix suggestions")).toBeVisible();
  });
}

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
  const lines = ["@startuml", "class Order {", "  +id: UUID", "class Customer", "@enduml"];
  await fillSource(page, lines.join("\n"));
  await page.getByRole("button", { name: /^Issues/ }).click();
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

test("explains an ambiguous quote error and reveals it for manual editing", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Class diagram" })
    .click();
  const lines = ["@startuml", 'class "Customer as Account as Other', "@enduml"];
  await fillSource(page, lines.join("\n"));
  await page.getByRole("button", { name: /^Issues/ }).click();
  const problems = page.getByRole("complementary", { name: "Issues" });
  const quote = problems.getByRole("listitem").filter({ hasText: "Quoted label has an unmatched quote" });
  await expect(quote).toContainText("How to resolve");
  await expect(quote).toContainText("intended label boundary is ambiguous");
  await expect(problems.getByRole("button", { name: /Add missing closing quote/ })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("manual-error-guidance.png") });
  await quote.click();
  await expect(page.locator(".statusbar")).toContainText("Ln 2");
  await expect(page.locator(".cm-content .cm-line")).toHaveText(lines);
  await fillSource(page, '@startuml\nclass "Customer" as Account\n@enduml');
  await expect(problems).not.toContainText("intended label boundary is ambiguous");
});

for (const width of [390, 1280]) {
  test(`manual guidance tooltip matches Problems and fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await prepareEditor(page);
    await page.getByRole("button", { name: "New diagram tab" }).click();
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: "Class diagram" })
      .click();
    await fillSource(page, '@startuml\nclass "Customer as Account as Other\n@enduml');
    await page.locator(".cm-lintRange-error").first().hover();
    const tooltip = page.locator(".cm-tooltip-lint .cm-manual-error-guidance");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("How to resolve");
    const guidance = await tooltip.locator("div").last().textContent();
    const box = await tooltip.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(800);
    await page.screenshot({ path: test.info().outputPath("manual-guidance-tooltip.png") });
    await page.getByRole("button", { name: /^Issues/ }).click();
    const problems = page.getByRole("complementary", { name: "Issues" });
    await expect(problems.locator(".problem-guidance")).toContainText(guidance!);
    await fillSource(page, '@startuml\nclass "Customer" as Account\n@enduml');
    await expect(page.locator(".cm-lintRange-error")).toHaveCount(0);
    await expect(tooltip).not.toBeVisible();
    await expect(problems.locator(".problem-guidance")).toHaveCount(0);
  });
}

for (const [type, keyword] of [
  ["Sequence", "participant"],
  ["Component", "component"],
  ["Use case", "usecase"],
] as const) {
  test(`manual quote guidance uses a ${type} example in tooltip and Problems`, async ({ page }) => {
    await prepareEditor(page);
    await page.getByRole("button", { name: "New diagram tab" }).click();
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: `${type} diagram` })
      .click();
    await fillSource(page, `@startuml\n${keyword} "Customer as Account as Other\n@enduml`);
    await page.locator(".cm-lintRange-error").first().hover();
    const guidance = page.locator(".cm-tooltip-lint .cm-manual-error-guidance");
    const example = `${keyword} "Order details" as Order`;
    await expect(guidance).toContainText(example);
    await expect(guidance).not.toContainText('class "Order details"');
    await page.getByRole("button", { name: /^Issues/ }).click();
    const problems = page.getByRole("complementary", { name: "Issues" });
    await expect(problems.locator(".problem-guidance").filter({ hasText: "intended label boundary" })).toContainText(
      example,
    );
  });
}

for (const width of [390, 1280]) {
  test(`keyboard explains the selected error and returns focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await prepareEditor(page);
    await page.getByRole("button", { name: "New diagram tab" }).click();
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: "Class diagram" })
      .click();
    const lines = ["@startuml", 'class "Customer as Account as Other', "@enduml"];
    await fillSource(page, lines.join("\n"));
    const editor = page.locator(".cm-content");
    await editor.press("F8");
    await editor.press("ControlOrMeta+Shift+m");
    const explanation = page.getByRole("region", { name: "Error explanation" });
    await expect(explanation).toBeFocused();
    await expect(explanation).toContainText("Line 2: Quoted label has an unmatched quote");
    await expect(explanation).toContainText("intended label boundary is ambiguous");
    await expect(editor.locator(".cm-line")).toHaveText(lines);
    const bounds = await explanation.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(800);
    await page.screenshot({ path: test.info().outputPath("keyboard-error-explanation.png") });
    await page.keyboard.press("Escape");
    await expect(explanation).toHaveCount(0);
    await expect(editor).toBeFocused();
    await editor.press("ControlOrMeta+Shift+m");
    await expect(explanation).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Close error explanation" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(editor).toBeFocused();
    await editor.press("ControlOrMeta+Shift+m");
    await fillSource(page, '@startuml\nclass "Customer" as Account\n@enduml');
    await expect(explanation).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Explain error", exact: true })).toBeDisabled();
  });
}

test("open explanations follow error navigation and preserve keyboard focus", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Class diagram" })
    .click();
  const lines = ["@startuml", 'class "Customer as Account as Other', "@endum"];
  await fillSource(page, lines.join("\n"));
  const editor = page.locator(".cm-content");
  await editor.press("ControlOrMeta+Home");
  await editor.press("F8");
  await editor.press("ControlOrMeta+Shift+m");
  const explanation = page.getByRole("region", { name: "Error explanation" });
  await expect(explanation).toContainText("Line 2:");
  await expect(explanation).toContainText("intended label boundary is ambiguous");
  await page.keyboard.press("F8");
  await expect(explanation).toContainText("Line 3:");
  await expect(explanation).toContainText("Suggested corrections are shown below");
  await expect(explanation).toBeFocused();
  await page.keyboard.press("F8");
  await expect(explanation).toContainText("Line 2:");
  await expect(explanation).toContainText("intended label boundary is ambiguous");
  await page.keyboard.press("Shift+F8");
  await expect(explanation).toContainText("Line 3:");
  await page.keyboard.press("Tab");
  const close = page.getByRole("button", { name: /Apply fix.*Use @enduml/ });
  await expect(close).toBeFocused();
  await explanation.focus();
  await page.keyboard.press("F8");
  await expect(explanation).toContainText("Line 2:");
  await expect(explanation).toBeFocused();
  await editor.focus();
  await editor.press("F8");
  await expect(explanation).toContainText("Line 3:");
  await expect(editor).toBeFocused();
  await page.getByRole("button", { name: "Previous error", exact: true }).click();
  await expect(explanation).toContainText("Line 2:");
  await expect(editor).toBeFocused();
  await expect(editor.locator(".cm-line")).toHaveText(lines);
  await explanation.focus();
  await page.keyboard.press("Escape");
  await expect(explanation).toHaveCount(0);
  await expect(editor).toBeFocused();
});

test("error explanation opens the matching fixes without applying until chosen", async ({ page }) => {
  await prepareEditor(page);
  const lines = ["@startgant", "[Build] lasts 2 days", "@endgant"];
  await fillSource(page, lines.join("\n"));
  const editor = page.locator(".cm-content");
  await editor.press("ControlOrMeta+End");
  await editor.press("ControlOrMeta+Shift+m");
  const explanation = page.getByRole("region", { name: "Error explanation" });
  await expect(explanation).toContainText("Line 3:");
  await page.keyboard.press("Tab");
  await expect(explanation).toBeVisible();
  const fixes = page.getByRole("list", { name: "Source fix suggestions", exact: true });
  const choice = fixes.getByRole("button", { name: /Use @endgantt/ });
  await expect(choice).toBeFocused();
  await expect(editor.locator(".cm-line")).toHaveText(lines);
  await page.keyboard.press("Enter");
  await expect(editor.locator(".cm-line")).toHaveText([lines[0]!, lines[1]!, "@endgantt"]);
  await expect(fixes.getByRole("button", { name: /Use @startgantt/ })).toBeFocused();
  await editor.press("ControlOrMeta+z");
  await expect(editor.locator(".cm-line")).toHaveText(lines);
});

test("manual explanations do not offer a button for unrelated fixes", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Class diagram" })
    .click();
  await fillSource(page, '@startuml\nclass "Customer as Account as Other\n@endum');
  const editor = page.locator(".cm-content");
  await editor.press("ControlOrMeta+Home");
  await editor.press("ControlOrMeta+Shift+m");
  const explanation = page.getByRole("region", { name: "Error explanation" });
  await expect(explanation).toContainText("Line 2:");
  await expect(explanation.getByRole("button", { name: "Open suggested fixes" })).toHaveCount(0);
  await page.keyboard.press("F8");
  await expect(explanation).toContainText("Line 3:");
  await page.keyboard.press("Tab");
  const fixes = page.getByRole("list", { name: "Source fix suggestions", exact: true });
  await expect(fixes.getByRole("button", { name: /Use @enduml/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(editor).toBeFocused();
});

test("block explanation opens a repair inserted after the error's header", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Class diagram" })
    .click();
  await fillSource(page, "@startuml\nclass Order {\n  +id: UUID\n@enduml");
  const editor = page.locator(".cm-content");
  await editor.press("ControlOrMeta+Home");
  await editor.press("ControlOrMeta+Shift+m");
  await expect(page.getByRole("region", { name: "Error explanation" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page
      .getByRole("list", { name: "Source fix suggestions", exact: true })
      .getByRole("button", { name: /Close class member block/ }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(editor.locator(".cm-line")).toHaveText(["@startuml", "class Order {", "  +id: UUID", "}", "@enduml"]);
});

test("explained-error picker keeps alternatives together and can show all fixes", async ({ page }) => {
  await prepareEditor(page);
  const lines = [
    "@startgantt",
    "Project starts 2026-09-21",
    "[Design] lasts 2 days",
    "[Build] lasts 3 days",
    "[Build] starts at [Design]'s",
    "[Build] is 50 completed",
    "@endgantt",
  ];
  await fillSource(page, lines.join("\n"));
  const editor = page.locator(".cm-content");
  await editor.press("ControlOrMeta+Home");
  await editor.press("ControlOrMeta+Shift+m");
  await expect(page.getByRole("region", { name: "Error explanation" })).toBeFocused();
  await page.keyboard.press("Tab");
  const picker = page.getByRole("list", { name: "Source fix suggestions", exact: true });
  await expect(picker).toContainText("Fixes for line 5");
  await expect(picker.getByRole("button", { name: /Use predecessor start/ })).toBeVisible();
  await expect(picker.getByRole("button", { name: /Use predecessor end/ })).toBeVisible();
  await expect(picker.getByRole("button", { name: /Add missing %/ })).toHaveCount(0);
  await expect(picker.locator("button[data-fix-key]")).toHaveCount(2);
  await expect(picker.locator("button[data-fix-key]").first()).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(picker.locator("button[data-fix-key]").last()).toBeFocused();
  await expect(editor.locator(".cm-line")).toHaveText(lines);
  await picker.getByRole("button", { name: /Show all fixes/ }).click();
  await expect(picker.getByRole("button", { name: /Add missing %/ })).toBeVisible();
  await expect(picker.locator("button[data-fix-key]").first()).toBeFocused();
  await expect(picker.getByRole("button", { name: /Show all fixes/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await editor.press("ControlOrMeta+.");
  await expect(picker.getByRole("button", { name: /Add missing %/ })).toBeVisible();
  await expect(editor.locator(".cm-line")).toHaveText(lines);
});

test("applied fixes report remaining errors and clear feedback on undo", async ({ page }) => {
  await prepareEditor(page);
  const lines = [
    "@startgantt",
    "Project starts 2026-09-21",
    "[Build] lasts 2 days",
    "[Build] is 50 completed",
    "@endgant",
  ];
  await fillSource(page, lines.join("\n"));
  const editor = page.locator(".cm-content");
  await editor.press("ControlOrMeta+.");
  const picker = page.getByRole("list", { name: "Source fix suggestions", exact: true });
  await picker.getByRole("button", { name: /Add missing %/ }).click();
  const feedback = page.locator(".source-fix-feedback");
  await expect(feedback).toContainText("Applied “Add missing %” on line 4. 1 error remains. Undo: Ctrl/⌘ + Z.");
  await expect(page.locator(".source-error-announcement")).toHaveText(await feedback.innerText());
  await editor.press("ControlOrMeta+z");
  await expect(feedback).toHaveCount(0);
  await expect(editor.locator(".cm-line")).toHaveText(lines);
  await editor.press("ControlOrMeta+.");
  await picker.getByRole("button", { name: /Add missing %/ }).click();
  await editor.press("ControlOrMeta+.");
  await picker.getByRole("button", { name: /@endgantt/ }).click();
  await expect(feedback).toContainText("No errors remain. Undo: Ctrl/⌘ + Z.");
  await expect(editor).toBeFocused();
  await editor.press("End");
  await editor.press("Space");
  await expect(feedback).toHaveCount(0);
});

test("Problems routes errors and suggestions through explanations and previews", async ({ page }) => {
  await prepareEditor(page);
  const lines = [
    "@startgantt",
    "Project starts 2026-09-21",
    "[Build] lasts 2 days",
    "[Build] is 50 completed",
    "@endgant",
  ];
  await fillSource(page, lines.join("\n"));
  await page.getByRole("button", { name: /^Issues/ }).click();
  const problems = page.getByRole("complementary", { name: "Issues" });
  await problems.locator("[data-problem-diagnostic]").filter({ hasText: "Line 4" }).click();
  const directPicker = page.getByRole("list", { name: "Source fix suggestions", exact: true });
  await expect(directPicker.getByRole("button", { name: /Add missing %/ })).toBeVisible();
  await expect(problems.getByRole("button", { name: /Preview fixes for line/ })).toHaveCount(0);
  await expect(directPicker.locator("button[data-fix-key]")).toHaveCount(1);
  await expect(page.locator(".cm-content .cm-line")).toHaveText(lines);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Issues/ }).click();
  await problems.locator("[data-problem-diagnostic]").filter({ hasText: "Line 4" }).click();
  const explanation = page.getByRole("region", { name: "Error explanation" });
  await expect(explanation).toContainText("Line 4:");
  await page.keyboard.press("Tab");
  const picker = page.getByRole("list", { name: "Source fix suggestions", exact: true });
  await expect(picker.getByRole("button", { name: /Add missing %/ })).toBeVisible();
  await expect(picker.locator("button[data-fix-key]")).toHaveCount(1);
  const editor = page.locator(".cm-content");
  await expect(editor.locator(".cm-line")).toHaveText(lines);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Issues/ }).click();
  await problems.locator("[data-problem-diagnostic]").filter({ hasText: "Line 4" }).click();
  await expect(picker).toBeVisible();
  await expect(problems.getByRole("region", { name: "Error explanation" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(picker.getByRole("button", { name: /Add missing %/ })).toBeFocused();
  await expect(editor.locator(".cm-line")).toHaveText(lines);
  await picker.getByRole("button", { name: /Add missing %/ }).click();
  await expect(page.locator(".source-fix-feedback")).toContainText("1 error remains");
  await editor.press("ControlOrMeta+z");
  await expect(editor.locator(".cm-line")).toHaveText(lines);
  await expect(page.locator(".source-fix-feedback")).toHaveCount(0);
});

test("fix previews predict resolved and newly introduced errors without editing", async ({ page }) => {
  await prepareEditor(page);
  const source = "@startgantt\n[Build] lasts 2 days\n[Build] is 50 completed\n@endgant";
  await fillSource(page, source);
  const editor = page.locator(".cm-content");
  await editor.press("ControlOrMeta+.");
  const picker = page.getByRole("list", { name: "Source fix suggestions", exact: true });
  const completion = picker.getByRole("button", { name: /Add missing %/ });
  await expect(completion.locator("..")).toContainText("Expected result: Resolves 1 error. 1 error remains.");
  await expect(editor.locator(".cm-line")).toHaveText(source.split("\n"));
  await expect(completion).toContainText("Apply fix");
  await completion.locator("..").locator(".source-fix-change-preview code").click();
  await expect(editor.locator(".cm-line")).toHaveText(source.split("\n"));
  await completion.click();
  await expect(page.locator(".source-fix-feedback")).toContainText("1 error remains.");
  await editor.press("ControlOrMeta+z");
  const cycle =
    "@startgantt\nProject starts 2026-09-21\n[Backend] lasts 2 days\n[Frontend] lasts 2 days\n[Backend] starts at [Frontend]'s end\n[Frontend] starts at [Backned]'s end\n@endgantt";
  await fillSource(page, cycle);
  await editor.press("ControlOrMeta+.");
  const repair = picker.getByRole("button", { name: /Use task Backend/ });
  await expect(repair.locator("..")).toContainText("Introduces");
  await expect(repair.locator("..")).toContainText("review before applying");
  await expect(repair.locator("..").locator(".source-fix-outcome")).toHaveClass(/needs-review/);
  await expect(repair.locator("..").locator(".source-fix-new-diagnostic")).toHaveText([
    /New warning on line 5: Dependency cycle:/,
    /New warning on line 6: Dependency cycle:/,
  ]);
  const warnings = repair.locator("..").locator(".source-fix-new-diagnostic");
  await warnings.first().click();
  const proposed = page.getByRole("region", { name: "Proposed source for diagnostic on line 5" });
  await expect(proposed).toBeFocused();
  await expect(proposed.locator("mark")).toHaveText("5: [Backend] starts at [Frontend]'s end\n");
  await expect(editor.locator(".cm-line")).toHaveText(cycle.split("\n"));
  await warnings.last().focus();
  await page.keyboard.press("Enter");
  const nextProposed = page.getByRole("region", { name: "Proposed source for diagnostic on line 6" });
  await expect(nextProposed).toBeFocused();
  await expect(nextProposed.locator("mark")).toHaveText("6: [Frontend] starts at [Backend]'s end\n");
  await expect(editor.locator(".cm-line")).toHaveText(cycle.split("\n"));
  await page.keyboard.press("Escape");
  await expect(nextProposed).toHaveCount(0);
  await expect(editor).toBeFocused();
});

test("Ctrl Shift M opens explanations before the built-in Ctrl M command", async ({ page }) => {
  await prepareEditor(page);
  await fillSource(page, "@startgantt\n[Build] lasts 2 days\n[Build] is 50 completed\n@endgantt");
  const editor = page.locator(".cm-content");
  await editor.press("Control+Shift+m");
  const explanation = page.getByRole("region", { name: "Error explanation" });
  await expect(explanation).toBeFocused();
  await expect(explanation).toContainText("Line 3:");
  await page.keyboard.press("Escape");
  await expect(editor).toBeFocused();
});

for (const fixture of [
  {
    type: "Gantt diagram",
    source: "@startgantt\n[Build] lasts 2 days\n[Build] is 50 completed\n@endgantt",
    label: "Add missing %",
  },
  {
    type: "Class diagram",
    source: "@startuml\nclass Order {\n  +id: UUID\n@enduml",
    label: "Close class member block",
  },
]) {
  test(`tooltip previews ${fixture.type} fixes before applying`, async ({ page }) => {
    await prepareEditor(page);
    if (fixture.type === "Class diagram") {
      await page.getByRole("button", { name: "New diagram tab" }).click();
      await page
        .getByRole("dialog", { name: "Choose a diagram type" })
        .getByRole("button", { name: fixture.type })
        .click();
    }
    await fillSource(page, fixture.source);
    const tooltip = page.locator(".cm-tooltip-lint");
    await page.locator(".cm-lintRange-error").first().hover();
    // One hover must leave the action reachable, including near the top of the editor.
    await tooltip.getByRole("button", { name: /Preview fixes/ }).click();
    const picker = page.getByRole("list", { name: "Source fix suggestions", exact: true });
    const apply = picker.getByRole("button", { name: new RegExp(`Apply fix.*${fixture.label}`) });
    await expect(apply).toBeFocused();
    const editor = page.locator(".cm-content");
    await expect(editor.locator(".cm-line")).toHaveText(fixture.source.split("\n"));
    await apply.click();
    await expect(page.locator(".source-fix-feedback")).toContainText("No errors remain");
    await editor.press("ControlOrMeta+z");
    await expect(editor.locator(".cm-line")).toHaveText(fixture.source.split("\n"));
  });
}

test("Problems supports keyboard navigation, reveal, and scoped fix previews", async ({ page }) => {
  await prepareEditor(page);
  const source = "@startgantt\n[Build] lasts 2 days\n[Build] is 50 completed\n@endgant";
  await fillSource(page, source);
  await page.getByRole("button", { name: /^Issues/ }).click();
  const problems = page.getByRole("complementary", { name: "Issues" });
  const entries = problems.locator("[data-problem-diagnostic]");
  await expect(entries).toHaveCount(2);
  await entries.first().focus();
  await entries.first().press("ArrowDown");
  await expect(entries.last()).toBeFocused();
  await entries.last().press("Home");
  await expect(entries.first()).toBeFocused();
  await entries.first().press("End");
  await expect(entries.last()).toBeFocused();
  await entries.last().press("Enter");
  const explanation = page.getByRole("region", { name: "Error explanation" });
  await expect(explanation).toContainText("Line 3:");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Issues/ }).click();
  const completion = entries.filter({ hasText: "Line 3" });
  await completion.focus();
  await completion.press("Alt+Enter");
  const picker = page.getByRole("list", { name: "Source fix suggestions", exact: true });

  await expect(picker.getByRole("button", { name: /Add missing %/ })).toBeFocused();
  await expect(picker.locator("button[data-fix-key]")).toHaveCount(1);
  await expect(page.locator(".cm-content .cm-line")).toHaveText(source.split("\n"));
});

test("all repair content stays inside the Problems workspace", async ({ page, browserName }) => {
  await prepareEditor(page);
  const source = "@startgantt\n[Build] lasts 2 days\n[Build] is 50 completed\n@endgant";
  await fillSource(page, source);
  await page.getByLabel("Show source fix suggestions", { exact: true }).click();
  const problems = page.getByRole("complementary", { name: "Issues" });
  await expect(problems).toBeVisible();
  const fixes = problems.getByRole("list", { name: "Source fix suggestions", exact: true });
  await expect(fixes).toBeVisible();
  await expect(page.locator(".editor-actions .source-fixes")).toHaveCount(0);
  await expect(problems.getByRole("region", { name: "Available quick fixes" })).toHaveCount(0);
  await page.screenshot({ path: `/tmp/unified-repairs-${browserName}.png` });
  await fixes.getByRole("button", { name: /Add missing %/ }).click();
  await expect(problems.locator(".source-fix-feedback")).toContainText("1 error remains");
  await problems.locator("[data-problem-diagnostic]").filter({ hasText: "Line 4" }).click();
  await expect(problems.getByRole("region", { name: "Error explanation" })).toBeVisible();
  await problems.getByRole("button", { name: "Close issues", exact: true }).click();
  await expect(problems).toBeHidden();
  await expect(page.getByLabel("Show source fix suggestions", { exact: true })).toBeFocused();
  await page.getByLabel("Show source fix suggestions", { exact: true }).click();
  await expect(problems).toBeVisible();
  await expect(fixes).toBeVisible();
  await expect(problems.getByRole("region", { name: "Error explanation" })).toHaveCount(0);
});

test("Apply advances to the next scoped repair and finishes in Problems", async ({ page }) => {
  await prepareEditor(page);
  const source = "@startgantt\n[Build] lasts 2 days\n[Build] is 50 completed\n@endgant";
  await fillSource(page, source);
  await page.getByRole("button", { name: /^Issues/ }).click();
  const problems = page.getByRole("complementary", { name: "Issues" });
  await problems.locator("[data-problem-diagnostic]").filter({ hasText: "Line 3" }).click();
  const picker = problems.getByRole("list", { name: "Source fix suggestions", exact: true });
  await picker.getByRole("button", { name: /Add missing %/ }).click();
  const next = picker.getByRole("button", { name: /Use @endgantt/ });
  await expect(next).toBeFocused();
  await expect(picker.locator("button[data-fix-key]")).toHaveCount(1);
  await expect(problems.getByRole("region", { name: "Error explanation" })).toContainText("Line 4:");
  await next.click();
  await expect(problems.getByRole("status")).toHaveText("No errors or warnings remain.");
  await expect(problems.getByRole("region", { name: "Error explanation" })).toHaveCount(0);
  const editor = page.locator(".cm-content");
  await expect(editor).toBeFocused();
  await editor.press("ControlOrMeta+z");
  await expect(problems.getByRole("status")).toHaveCount(0);
  await expect(problems.getByRole("listitem")).toHaveCount(1);
  await expect(problems.getByRole("listitem")).toContainText("Line 4");
  await expect(editor.locator(".cm-line")).toHaveText(source.replace("50 completed", "50% completed").split("\n"));
  await expect(problems.locator(".source-fix-feedback")).toHaveCount(0);
});

test("Apply shows manual guidance when the next error has no safe fix", async ({ page }) => {
  await prepareEditor(page);
  const source = "@startgantt\n[Build] is 50 completed\n[Other] lasts -2 days\n@endgantt";
  await fillSource(page, source);
  await page.getByRole("button", { name: /^Issues/ }).click();
  const problems = page.getByRole("complementary", { name: "Issues" });
  await problems.locator("[data-problem-diagnostic]").filter({ hasText: "Line 2" }).click();
  await problems.getByRole("button", { name: /Apply fix.*Add missing %/ }).click();
  const explanation = problems.getByRole("region", { name: "Error explanation" });
  await expect(explanation).toBeFocused();
  await expect(explanation).toContainText("Line 3:");
  await expect(explanation).toContainText("intended duration");
  await expect(explanation.getByRole("button", { name: "Open suggested fixes" })).toHaveCount(0);
  await expect(problems.getByRole("status")).toHaveCount(0);
  await expect(page.locator(".cm-content .cm-line")).toHaveText(
    source.replace("50 completed", "50% completed").split("\n"),
  );
});

test("missing chained duration units use other tasks to rank alternatives", async ({ page }) => {
  await prepareEditor(page);
  const source =
    "@startgantt\n[A] lasts 2 weeks\n[B] lasts 3 weeks\n[C] lasts 2 days\n[Frontend] starts 2026-10-01 and lasts 5  and is 50% completed\n@endgantt";
  await fillSource(page, source);
  await page.getByRole("button", { name: /^Issues/ }).click();
  const problems = page.getByRole("complementary", { name: "Issues" });
  await problems.locator("[data-problem-diagnostic]").filter({ hasText: "Line 5" }).click();
  const picker = problems.getByRole("list", { name: "Source fix suggestions", exact: true });
  const alternatives = picker.locator("button[data-fix-key]");
  await expect(alternatives).toHaveCount(3);
  await expect(alternatives.first()).toContainText("Add weeks unit (used by 2 other tasks)");
  await expect(alternatives.nth(1)).toContainText("Add days unit (used by 1 other task)");
  await expect(alternatives.last()).toContainText("Add months unit");
  const editor = page.locator(".cm-content");
  await expect(editor.locator(".cm-line")).toHaveText(source.split("\n"));
  await alternatives.first().click();
  await expect(editor.locator(".cm-line")).toHaveText(source.replace("lasts 5", "lasts 5 weeks").split("\n"));
  await expect(problems.getByRole("status")).toHaveText("No errors or warnings remain.");
  await editor.press("ControlOrMeta+z");
  await expect(editor.locator(".cm-line")).toHaveText(source.split("\n"));
});

test("missing is in a chained completion clause can be previewed, applied, and undone", async ({ page }) => {
  await prepareEditor(page);
  const source = "@startgantt\n[Frontend] starts 2026-10-01 and lasts 5 days  and  50% completed\n@endgantt";
  await fillSource(page, source);
  await page.getByRole("button", { name: /^Issues/ }).click();
  const problems = page.getByRole("complementary", { name: "Issues" });
  await problems.locator("[data-problem-diagnostic]").filter({ hasText: "Line 2" }).click();
  const apply = problems.getByRole("button", { name: /Apply fix.*Add is before completion percentage/ });
  await expect(apply).toBeVisible();
  await expect(page.locator(".cm-content .cm-line")).toHaveText(source.split("\n"));
  await apply.click();
  await expect(page.locator(".cm-content .cm-line")).toHaveText(
    source.replace("50% completed", "is 50% completed").split("\n"),
  );
  await expect(problems.getByRole("status")).toHaveText("No errors or warnings remain.");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".cm-content .cm-line")).toHaveText(source.split("\n"));
});

test("Escape closes Problems from diagnostics and suggested repairs", async ({ page }) => {
  await prepareEditor(page);
  const source = "@startgantt\n[A] lasts 5 days and 50% completed\n@endgantt";
  await fillSource(page, source);
  const problems = page.getByRole("complementary", { name: "Issues" });
  for (const focus of ["diagnostic", "explanation", "fix"] as const) {
    await page.getByRole("button", { name: /^Issues/ }).click();
    const error = problems.locator("[data-problem-diagnostic]").first();
    if (focus === "diagnostic") await error.focus();
    else {
      await error.click();
      await expect(problems.getByRole("region", { name: "Error explanation" })).toBeFocused();
      if (focus === "fix") {
        await page.keyboard.press("Tab");
        await expect(problems.getByRole("button", { name: /Apply fix.*Add is/ })).toBeFocused();
      }
    }
    await page.keyboard.press("Escape");
    await expect(problems).not.toBeVisible();
    await expect(page.getByRole("button", { name: /^Issues/ })).toBeFocused();
    await expect(page.locator(".cm-content .cm-line")).toHaveText(source.split("\n"));
    await expect(page.locator(".cm-fix-target")).toHaveCount(0);
  }
});

test("safe fixes preview preserves alternatives and applies as one undo step", async ({ page, browserName }) => {
  await prepareEditor(page);
  const source = "@startgant\n[A] lasts 5\n@endgant";
  await fillSource(page, source);
  await page.getByRole("button", { name: /^Issues/ }).click();
  const problems = page.getByRole("complementary", { name: "Issues" });
  await problems.getByRole("button", { name: "Apply safe fixes (2)", exact: true }).click();
  const preview = problems.getByRole("region", { name: "Safe fixes preview" });
  await expect(preview).toBeFocused();
  await expect(preview).toContainText("@startgantt");
  if (browserName === "chromium") await page.screenshot({ path: test.info().outputPath("safe-fixes-preview.png") });
  await expect(page.locator(".cm-content .cm-line")).toHaveText(source.split("\n"));
  await preview.getByRole("button", { name: "Cancel safe fixes" }).click();
  await expect(preview).toHaveCount(0);
  await problems.getByRole("button", { name: "Apply safe fixes (2)", exact: true }).click();
  await preview.getByRole("button", { name: "Apply 2 safe fixes", exact: true }).click();
  await expect(page.locator(".cm-content .cm-line")).toHaveText(["@startgantt", "[A] lasts 5", "@endgantt"]);
  const nextError = problems.getByRole("button", { name: "Go to next error", exact: true });
  await expect(nextError).toBeVisible();
  await expect(problems.locator(".source-fix-feedback")).toContainText("1 error remains: 1 needs a choice.");
  await nextError.click();
  await expect(problems.getByRole("region", { name: "Error explanation" })).toBeFocused();
  await expect(problems.getByRole("region", { name: "Error explanation" })).toContainText("Line 2:");
  await expect(page.locator(".cm-content .cm-line")).toHaveText(["@startgantt", "[A] lasts 5", "@endgantt"]);
  await expect(
    problems.getByRole("list", { name: "Source fix suggestions", exact: true }).locator("button[data-fix-key]"),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".cm-content .cm-line")).toHaveText(source.split("\n"));
});

test("safe fixes preview closes on Escape and invalidates when source changes", async ({ page }) => {
  await prepareEditor(page);
  const source = "@startgant\n[A] lasts 2 days\n@endgant";
  await fillSource(page, source);
  await page.getByRole("button", { name: /^Issues/ }).click();
  const problems = page.getByRole("complementary", { name: "Issues" });
  await problems.getByRole("button", { name: "Apply safe fixes (2)", exact: true }).click();
  const preview = problems.getByRole("region", { name: "Safe fixes preview" });
  await expect(preview).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(problems).not.toBeVisible();
  await page.getByRole("button", { name: /^Issues/ }).click();
  await expect(preview).toHaveCount(0);
  await problems.getByRole("button", { name: "Apply safe fixes (2)", exact: true }).click();
  await fillSource(page, source.replace("@startgant", "@startgantt"));
  await expect(preview).toHaveCount(0);
  await expect(problems.getByRole("button", { name: /Apply.*safe fixes/ })).toHaveCount(0);
});

test("safe fixes resolve all independent errors without merging with later repairs", async ({ page }) => {
  await prepareEditor(page);
  const source = "@startgant\n[A] lasts 2 days and 50% completed\n@endgant";
  await fillSource(page, source);
  await page.getByRole("button", { name: /^Issues/ }).click();
  const problems = page.getByRole("complementary", { name: "Issues" });
  await problems.getByRole("button", { name: "Apply safe fixes (3)", exact: true }).click();
  await problems.getByRole("button", { name: "Apply 3 safe fixes", exact: true }).click();
  await expect(problems.getByRole("button", { name: "Go to next error", exact: true })).toHaveCount(0);
  await expect(problems.getByRole("status")).toHaveText("No errors or warnings remain.");
  await expect(page.locator(".cm-content .cm-line")).toHaveText([
    "@startgantt",
    "[A] lasts 2 days and is 50% completed",
    "@endgantt",
  ]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".cm-content .cm-line")).toHaveText(source.split("\n"));
  await problems.locator("[data-problem-diagnostic]").filter({ hasText: "Line 2" }).click();
  await problems.getByRole("button", { name: /Apply fix.*Add is/ }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".cm-content .cm-line")).toHaveText(source.split("\n"));
});

test("next error after safe fixes opens manual guidance when no safe correction exists", async ({ page }) => {
  await prepareEditor(page);
  const source = "@startgant\n[A] lasts -2 days\n@endgant";
  await fillSource(page, source);
  await page.getByRole("button", { name: /^Issues/ }).click();
  const problems = page.getByRole("complementary", { name: "Issues" });
  await problems.getByRole("button", { name: "Apply safe fixes (2)", exact: true }).click();
  await problems.getByRole("button", { name: "Apply 2 safe fixes", exact: true }).click();
  await expect(problems.locator(".source-fix-feedback")).toContainText("1 error remains: 1 needs manual editing.");
  await problems.getByRole("button", { name: "Go to next error", exact: true }).click();
  const explanation = problems.getByRole("region", { name: "Error explanation" });
  await expect(explanation).toBeFocused();
  await expect(explanation).toContainText("Line 2:");
  await expect(explanation).toContainText("intended duration");
  await expect(problems.getByRole("list", { name: "Source fix suggestions", exact: true })).toHaveCount(0);
  await expect(page.locator(".cm-content .cm-line")).toHaveText(["@startgantt", "[A] lasts -2 days", "@endgantt"]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(problems.getByRole("button", { name: "Go to next error", exact: true })).toHaveCount(0);
  await expect(page.locator(".cm-content .cm-line")).toHaveText(source.split("\n"));
});

test("remaining error counts filter choices and manual errors and reset on Undo", async ({ page }) => {
  await prepareEditor(page);
  const source = "@startgant\n[A] lasts 5\n[B] lasts 2\n[C] lasts -2 days\n@endgant";
  await fillSource(page, source);
  await page.getByRole("button", { name: /^Issues/ }).click();
  const problems = page.getByRole("complementary", { name: "Issues" });
  await problems.getByRole("button", { name: "Apply safe fixes (2)", exact: true }).click();
  await problems.getByRole("button", { name: "Apply 2 safe fixes", exact: true }).click();
  await problems.getByRole("button", { name: "2 need a choice", exact: true }).click();
  const entries = problems.locator("[data-problem-diagnostic]");
  await expect(entries).toHaveCount(2);
  await expect(entries.first()).toBeFocused();
  await expect(entries.first()).toContainText("Line 2");
  await entries.first().press("Enter");
  await expect(
    problems.getByRole("list", { name: "Source fix suggestions", exact: true }).locator("button[data-fix-key]"),
  ).toHaveCount(3);
  await problems.getByRole("button", { name: "1 needs manual editing", exact: true }).click();
  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toBeFocused();
  await expect(entries.first()).toContainText("Line 4");
  await entries.first().press("Enter");
  await expect(problems.getByRole("region", { name: "Error explanation" })).toContainText("intended duration");
  await problems.getByRole("button", { name: "Show all issues", exact: true }).click();
  await expect(entries).toHaveCount(3);
  await problems.getByRole("button", { name: "1 needs manual editing", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(entries).toHaveCount(5);
  await expect(problems.getByRole("button", { name: "Show all issues", exact: true })).toHaveCount(0);
  await expect(page.locator(".cm-content .cm-line")).toHaveText(source.split("\n"));
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(entries).toHaveCount(3);
  await expect(problems.getByRole("button", { name: "Show all issues", exact: true })).toHaveCount(0);
});

test("next error stays within a category and offers another group when finished", async ({ page }) => {
  await prepareEditor(page);
  const source = "@startgant\n[A] lasts 5\n[C] lasts -2 days\n[B] lasts 2\n@endgant";
  await fillSource(page, source);
  await page.getByRole("button", { name: /^Issues/ }).click();
  const problems = page.getByRole("complementary", { name: "Issues" });
  await problems.getByRole("button", { name: "Apply safe fixes (2)", exact: true }).click();
  await problems.getByRole("button", { name: "Apply 2 safe fixes", exact: true }).click();
  await problems.getByRole("button", { name: "2 need a choice", exact: true }).click();
  const entries = problems.locator("[data-problem-diagnostic]");
  await entries.first().click();
  const next = problems.getByRole("button", { name: "Go to next error", exact: true });
  await next.click();
  const explanation = problems.getByRole("region", { name: "Error explanation" });
  await expect(explanation).toContainText("Line 4:");
  await expect(explanation).toBeFocused();
  await next.click();
  await expect(explanation).toContainText("Line 2:");
  await problems.getByRole("button", { name: /Apply fix.*Add days unit/ }).click();
  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toContainText("Line 4");
  await expect(explanation).toContainText("Line 4:");
  await problems.getByRole("button", { name: /Apply fix.*Add days unit/ }).click();
  await expect(entries).toHaveCount(0);
  await expect(problems.getByRole("status")).toHaveText("No errors remain in this group. Choose another group above.");
  await expect(next).toHaveCount(0);
  await problems.getByRole("button", { name: "1 needs manual editing", exact: true }).click();
  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toContainText("Line 3");
  await problems.getByRole("button", { name: "Go to next error", exact: true }).click();
  await expect(explanation).toContainText("Line 3:");
  await expect(explanation).toContainText("intended duration");
});

test("safe fixes retain corrections introducing warnings for explicit review", async ({ page }) => {
  await prepareEditor(page);
  const source =
    "@startgant\nProject starts 2026-09-21\n[Backend] lasts 2 days\n[Frontend] lasts 2 days\n[Frontend] starts at [Backned]'s end\n[Backend] starts at [Frontend]'s end\n[Other] lasts 1 day\n[Other] is 50 completed\n@endgantt";
  await fillSource(page, source);
  await page.getByRole("button", { name: /^Issues/ }).click();
  const problems = page.getByRole("complementary", { name: "Issues" });
  await problems.getByRole("button", { name: "Apply safe fixes (2)", exact: true }).click();
  await problems.getByRole("button", { name: "Apply 2 safe fixes", exact: true }).click();
  await expect(page.locator(".cm-content .cm-line")).toHaveText(
    source.replace("@startgant", "@startgantt").replace("is 50 completed", "is 50% completed").split("\n"),
  );
  await problems.getByRole("button", { name: "1 needs review", exact: true }).click();
  const entries = problems.locator("[data-problem-diagnostic]");
  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toBeFocused();
  await entries.first().press("Enter");
  const repair = problems.getByRole("button", { name: /Apply fix.*Use task Backend/ });
  await expect(repair.locator("..").locator(".source-fix-outcome")).toHaveClass(/needs-review/);
  await expect(repair.locator("..")).toContainText("New warning on line 5: Dependency cycle:");
  await expect(page.locator(".cm-content")).toContainText("[Backned]");
});

test("switching identical-source tabs dismisses safe fixes previews", async ({ page }) => {
  await prepareEditor(page);
  const source = "@startgant\n[A] lasts 5\n@endgant";
  await fillSource(page, source);
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Gantt diagram" })
    .click();
  await fillSource(page, source);
  await page.getByRole("button", { name: /^Issues/ }).click();
  const problems = page.getByRole("complementary", { name: "Issues" });
  await problems.getByRole("button", { name: "Apply safe fixes (2)", exact: true }).click();
  const preview = problems.getByRole("region", { name: "Safe fixes preview" });
  await expect(preview).toBeFocused();
  const tabs = page.getByRole("navigation", { name: "Open documents" }).locator("button[draggable]");
  for (const index of [0, 1]) {
    await tabs.nth(index).click();
    await expect(preview).toHaveCount(0);
    await expect(page.locator(".cm-content .cm-line")).toHaveText(source.split("\n"));
  }
});
