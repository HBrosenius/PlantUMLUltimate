import { expect, test } from "@playwright/test";
import { fillSource, prepareEditor } from "./editor-helpers";

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
  await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
  const problems = page.getByRole("complementary", { name: "Issues" });
  await problems.locator("[data-problem-diagnostic]").filter({ hasText: "Line 4" }).click();
  const directPicker = page.getByRole("list", { name: "Source fix suggestions", exact: true });
  await expect(directPicker.getByRole("button", { name: /Add missing %/ })).toBeVisible();
  await expect(problems.getByRole("button", { name: /Preview fixes for line/ })).toHaveCount(0);
  await expect(directPicker.locator("button[data-fix-key]")).toHaveCount(1);
  await expect(page.locator(".cm-content .cm-line")).toHaveText(lines);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
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
  await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
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
      await page
        .getByRole("dialog", { name: "Choose a diagram type" })
        .getByRole("button", { name: "Create diagram", exact: true })
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
  await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
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
  await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
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
  await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
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
  await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
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
  await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
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
  await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
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
    await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
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
    await expect(page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ })).toBeFocused();
    await expect(page.locator(".cm-content .cm-line")).toHaveText(source.split("\n"));
    await expect(page.locator(".cm-fix-target")).toHaveCount(0);
  }
});

test("safe fixes preview preserves alternatives and applies as one undo step", async ({ page, browserName }) => {
  await prepareEditor(page);
  const source = "@startgant\n[A] lasts 5\n@endgant";
  await fillSource(page, source);
  await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
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
  await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
  const problems = page.getByRole("complementary", { name: "Issues" });
  await problems.getByRole("button", { name: "Apply safe fixes (2)", exact: true }).click();
  const preview = problems.getByRole("region", { name: "Safe fixes preview" });
  await expect(preview).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(problems).not.toBeVisible();
  await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
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
  await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
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
  await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
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
  await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
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
  await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
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
  await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
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
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Create diagram", exact: true })
    .click();
  await fillSource(page, source);
  await page.getByRole("button", { name: /^(?:No issues|\d+ issues)$/ }).click();
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
