import { expect, test, type Locator } from "@playwright/test";
import { fillSource, prepareEditor, source } from "./editor-helpers";

async function noOverflow(element: Locator) {
  expect(await element.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
}

test("Help shortcuts and command labels wrap without collisions", async ({ page }, testInfo) => {
  await prepareEditor(page);
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 375, height: 844 },
    { width: 320, height: 568 },
    // Effective layout viewport of a 1280 × 900 desktop at 200% browser zoom.
    { width: 640, height: 450 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "Help", exact: true }).click();
    const help = page.getByRole("dialog", { name: "PlantUML Ultimate Help" });
    await noOverflow(help);
    await noOverflow(help.locator(".help-content"));
    const collisions = await help.locator(".shortcut-grid > div").evaluateAll((rows) =>
      rows
        .filter((row) => {
          const keys = row.querySelector("kbd")!.getBoundingClientRect();
          const action = row.querySelector("span")!.getBoundingClientRect();
          return keys.right > action.left + 1;
        })
        .map((row) => row.textContent),
    );
    expect(collisions).toEqual([]);
    await help
      .getByRole("region", { name: "General help", exact: true })
      .getByRole("heading", { name: "Keyboard shortcuts" })
      .scrollIntoViewIfNeeded();
    if (testInfo.project.name === "chromium")
      await help.screenshot({ path: testInfo.outputPath(`help-${viewport.width}.png`) });
    await help.getByRole("button", { name: "Close Help" }).click();
    await page.keyboard.press("ControlOrMeta+Shift+p");
    const commands = page.getByRole("dialog", { name: "Command palette" });
    await expect(commands).toBeVisible();
    await noOverflow(commands);
    const overlaps = await commands.getByRole("option").evaluateAll((rows) =>
      rows
        .filter((row) => {
          const category = row.querySelector("small")!.getBoundingClientRect();
          const label = row.querySelector(".command-copy > span")!.getBoundingClientRect();
          const shortcut = row.querySelector("kbd")?.getBoundingClientRect();
          const copy = row.querySelector(".command-copy")!.getBoundingClientRect();
          return (
            category.bottom > label.top + 1 ||
            (shortcut && copy.right > shortcut.left + 1 && copy.bottom > shortcut.top + 1)
          );
        })
        .map((row) => row.textContent),
    );
    expect(overlaps).toEqual([]);
    if (testInfo.project.name === "chromium")
      await commands.screenshot({ path: testInfo.outputPath(`commands-${viewport.width}.png`) });
    await page.keyboard.press("Escape");
  }
});

test("Workload check-ins and diagram opening use the existing secondary action style", async ({ page }, testInfo) => {
  await prepareEditor(page);
  await page.evaluate(() =>
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true }),
  );
  const person = "AlexandriaLongResourceNameForPlanningReview";
  await fillSource(page, source(`[Build] on {${person}} lasts 3 days`));
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 320, height: 568 },
    { width: 640, height: 450 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "Workload", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "Resource workload" });
    const report = panel.getByRole("button", { name: "Create task check-in…", exact: true });
    await expect(report).toBeVisible();
    expect((await report.boundingBox())!.y).toBeGreaterThanOrEqual(
      (await panel.locator("header").boundingBox())!.y + (await panel.locator("header").boundingBox())!.height,
    );
    await noOverflow(panel);
    const personal = panel.getByRole("button", { name: `Create task check-in for ${person}…`, exact: true });
    await expect(personal).toBeVisible();
    await noOverflow(personal);
    await personal.scrollIntoViewIfNeeded();
    if (testInfo.project.name === "chromium")
      await panel.screenshot({ path: testInfo.outputPath(`workload-${viewport.width}.png`) });
    await personal.click();
    const reports = page.locator(".reports-dialog");
    await expect(reports).toBeVisible();
    await reports.getByRole("button", { name: "Close reports" }).click();
    await panel.getByRole("button", { name: "Close resource workload" }).click();
    await page.getByRole("button", { name: "New diagram tab" }).click();
    const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
    const open = chooser.getByRole("button", { name: "Open…", exact: true });
    const cancel = chooser.getByRole("button", { name: "Cancel", exact: true });
    const style = (node: Element) => {
      const css = getComputedStyle(node);
      return [css.backgroundColor, css.borderColor, css.borderRadius, css.padding];
    };
    expect(await open.evaluate(style)).toEqual(await cancel.evaluate(style));
    await open.scrollIntoViewIfNeeded();
    const fileChooser = page.waitForEvent("filechooser");
    await open.click();
    await (await fileChooser).setFiles([]);
    await page.keyboard.press("Escape");
  }
});
