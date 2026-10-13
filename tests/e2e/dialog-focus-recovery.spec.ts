import { expect, test } from "@playwright/test";
import { prepareEditor, readEditorSource, waitForDiagramRender } from "./editor-helpers";

for (const kind of ["Gantt", "Sequence", "Activity"]) {
  test(`${kind} returns keyboard focus to its SVG object after Help closes`, async ({ page }) => {
    test.setTimeout(90_000);
    await prepareEditor(page);
    if (kind !== "Gantt") {
      await page.getByRole("button", { name: "New diagram tab" }).click();
      await page
        .getByRole("dialog", { name: "Choose a diagram type" })
        .getByRole("button", { name: `${kind} diagram`, exact: true })
        .click();
    }
    await waitForDiagramRender(page);
    const source = await readEditorSource(page);
    const object = page.locator('.diagram svg [tabindex="0"]').first();
    await object.focus();
    await expect(object).toBeFocused();
    await page.keyboard.press("?");
    const help = page.getByRole("dialog", { name: /Help/ });
    await expect(help).toBeVisible();
    await expect.poll(() => help.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(help).toBeHidden();
    await expect(object).toBeFocused();
    await page.keyboard.press("?");
    await expect(help).toBeVisible();
    await help.getByRole("button", { name: "Close Help", exact: true }).click();
    await expect(object).toBeFocused();
    expect(await readEditorSource(page)).toBe(source);
  });
}
