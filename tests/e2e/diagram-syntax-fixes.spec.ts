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
    const choice = page
      .getByRole("button", { name: /Add missing closing bracket/ })
      .filter({ has: page.locator("code", { hasText: repaired }) });
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
  test(`keeps start-tag fix suggestions inside the editor at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await prepareEditor(page);
    await fillSource(page, "@startgant\nProject starts 2026-09-21\n[A] lasts 1 day\n@endgantt");
    await page.getByLabel("Show source fix suggestions").click();
    const choices = page.getByRole("list", { name: "Source fix suggestions" });
    await expect(choices).toBeVisible();
    const bounds = await choices.boundingBox();
    const editor = await page.getByRole("region", { name: "Code editor section" }).boundingBox();
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
    await expect(choice.locator("code")).toHaveText(repaired);
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
    await expect(choice.locator("code")).toHaveText(repaired);
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
  const suggestions = page.getByLabel("Source fix suggestions");
  await expect(suggestions.getByRole("note")).toContainText("Choose one of 2 alternatives");
  const choice = suggestions.getByRole("button", { name: /Use task Built/ });
  await expect(choice).toContainText("Before:");
  await expect(choice.locator("del")).toContainText("[Buil]'s end");
  await expect(choice.locator("code")).toHaveText("[Release] starts 5 days after [Built]'s end");
  await choice.click();
  await expect(page.locator(".cm-content .cm-line")).toHaveText(lines.map((line) => line.replace("[Buil]", "[Built]")));
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".cm-content .cm-line")).toHaveText(lines);
});

test("compares class closing positions before applying the selected alternative", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Class diagram" })
    .click();
  const lines = ["@startuml", "class Order {", "  +id: UUID", "class Customer", "@enduml"];
  await fillSource(page, lines.join("\n"));
  await page.getByLabel("Show source fix suggestions").click();
  const suggestions = page.getByLabel("Source fix suggestions");
  await expect(suggestions.getByRole("note")).toContainText("Choose one of 2 alternatives");
  await expect(suggestions.getByRole("button", { name: /Close class at diagram end/ })).toBeVisible();
  const choice = suggestions.getByRole("button", { name: /Close class before line 4/ });
  await expect(choice.locator("del")).toHaveText("class Customer");
  await expect(choice.locator("code")).toHaveText("}\nclass Customer");
  await choice.click();
  await expect(page.locator(".cm-content .cm-line")).toHaveText([
    "@startuml",
    "class Order {",
    "  +id: UUID",
    "}",
    "class Customer",
    "@enduml",
  ]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".cm-content .cm-line")).toHaveText(lines);
});
