import { expect, test } from "@playwright/test";
import { fillSource, prepareEditor } from "./editor-helpers";

test("explains an ambiguous quote error and reveals it for manual editing", async ({ page }) => {
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
  const lines = ["@startuml", 'class "Customer as Account as Other', "@enduml"];
  await fillSource(page, lines.join("\n"));
  await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
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
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: "Create diagram", exact: true })
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
    await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
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
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: "Create diagram", exact: true })
      .click();
    await fillSource(page, `@startuml\n${keyword} "Customer as Account as Other\n@enduml`);
    await page.locator(".cm-lintRange-error").first().hover();
    const guidance = page.locator(".cm-tooltip-lint .cm-manual-error-guidance");
    const example = `${keyword} "Order details" as Order`;
    await expect(guidance).toContainText(example);
    await expect(guidance).not.toContainText('class "Order details"');
    await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
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
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: "Create diagram", exact: true })
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
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Create diagram", exact: true })
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
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Create diagram", exact: true })
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
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Create diagram", exact: true })
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
