import { expect, test } from "@playwright/test";
import { readEditorSource } from "./editor-helpers";

test("starts with actions, exposes examples and keeps learning optional", async ({ page }) => {
  await page.goto("/");
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await expect(chooser).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Welcome to PlantUML Ultimate" })).toHaveCount(0);
  await expect(chooser.getByRole("button", { name: "Open…", exact: true })).toBeVisible();
  await chooser.getByRole("button", { name: "Try an example", exact: true }).click();
  await chooser.getByLabel("Example diagram type").selectOption("sequence");
  await expect(chooser.getByRole("button", { name: /Login with OAuth/ })).toBeInViewport();
  await chooser.locator("#start-learning > summary").click();
  await expect(chooser.getByText(/For planning, Plan contains Reports/)).toBeVisible();
  await chooser.getByRole("button", { name: "Create", exact: true }).click();
  await chooser.evaluate((element) => {
    element.scrollTop = 0;
  });
  await chooser.screenshot({ path: "test-results/a17-start-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await chooser.screenshot({ path: "test-results/a17-start-phone.png" });
  expect(await chooser.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await chooser.getByRole("button", { name: "WBS diagram", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).toBe("@startwbs\n* Project\n** Deliverable\n@endwbs");
  await page.getByRole("button", { name: "Help", exact: true }).click();
  const help = page.getByRole("dialog", { name: "PlantUML Ultimate Help" });
  await help.getByText("Quick tour", { exact: true }).click();
  await expect(help.getByText(/Outline helps navigate/)).toBeVisible();
});

test("blank diagrams start with minimal content and an Add route", async ({ page }) => {
  await page.goto("/");
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  for (const kind of ["WBS", "Gantt", "Sequence", "Use Case", "Class", "Component", "Activity"]) {
    await expect(chooser).toBeVisible();
    await chooser.getByLabel("Start with").selectOption("blank");
    await chooser.getByRole("button", { name: `${kind} diagram`, exact: true }).click();
    await expect(chooser).toBeHidden();
    const source = await readEditorSource(page);
    expect(source).not.toContain("Website redesign");
    expect(source.split("\n").length).toBeLessThanOrEqual(4);
    await expect(page.getByRole("tab", { name: "Insert", exact: true })).toBeVisible();
    await page.keyboard.press("ControlOrMeta+n");
  }
});
