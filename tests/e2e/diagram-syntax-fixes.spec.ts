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
