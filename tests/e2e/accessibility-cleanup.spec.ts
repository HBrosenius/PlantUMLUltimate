import { expect, test } from "@playwright/test";
import { fillSource, prepareEditor, source } from "./editor-helpers";

for (const kind of ["Class", "Component", "Activity"] as const) {
  test(`${kind} settings has a contextual close name and restores keyboard focus`, async ({ page }) => {
    await prepareEditor(page);
    await page.getByRole("button", { name: "New diagram tab" }).click();
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: `${kind} diagram` })
      .click();
    const trigger = page.getByRole("button", { name: "Diagram settings", exact: true });
    await trigger.click();
    const panel = page.getByRole("complementary", { name: `${kind} settings`, exact: true });
    const close = panel.getByRole("button", { name: `Close ${kind} settings`, exact: true });
    await expect(close).toBeVisible();
    await close.focus();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}

test("File submenu names and view tooltips describe their actions", async ({ page }) => {
  await prepareEditor(page);
  const file = page.getByRole("button", { name: "File", exact: true });
  await file.click();
  for (const name of ["New", "Open", "Export"]) {
    const trigger = page.getByRole("menuitem", { name, exact: true });
    await expect(trigger).toHaveAccessibleName(name);
    await trigger.click();
    await expect(page.getByRole("menu", { name, exact: true })).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(file).toBeFocused();
  const views = page.getByRole("navigation", { name: "View mode" });
  for (const [name, key] of [
    ["Code", 1],
    ["Split", 2],
    ["Diagram", 3],
  ] as const) {
    await expect(views.getByRole("button", { name, exact: true })).toHaveAttribute(
      "title",
      `${name} view (Ctrl/Cmd+${key})`,
    );
  }
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`selected syntax remains readable in the ${colorScheme} theme`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await prepareEditor(page);
    await fillSource(page, source("[Build] lasts 3 days\n[Build] is colored in Salmon\n' Keep this comment readable"));
    const editor = page.locator(".cm-content");
    await editor.focus();
    await editor.press("ControlOrMeta+a");
    await expect(page.locator(".cm-selectionBackground").first()).toBeVisible();
    if (testInfo.project.name === "chromium")
      await page.screenshot({ path: testInfo.outputPath(`selection-${colorScheme}.png`) });
    for (const focused of [true, false]) {
      if (!focused) await page.getByRole("button", { name: "File", exact: true }).focus();
      const ratios = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d")!;
        const rgb = (color: string) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        const luminance = (color: number[]) =>
          color
            .map((value) => {
              const s = value / 255;
              return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            })
            .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
        const selection = document.querySelector(".cm-selectionBackground")!;
        const background = luminance(rgb(getComputedStyle(selection).backgroundColor));
        return [...document.querySelectorAll(".cm-line span")]
          .filter((element) => element.textContent?.trim())
          .map((element) => {
            const foreground = luminance(rgb(getComputedStyle(element).color));
            return {
              text: element.textContent,
              ratio: (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05),
            };
          });
      });
      expect(ratios.length).toBeGreaterThan(5);
      expect(ratios.filter((item) => item.ratio < 4.5)).toEqual([]);
      await testInfo.attach(`contrast-${focused ? "focused" : "unfocused"}`, {
        body: JSON.stringify(ratios),
        contentType: "application/json",
      });
    }
  });
}
