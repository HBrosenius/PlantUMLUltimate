import { expect, test } from "@playwright/test";
import { prepareEditor, setSource, readEditorSource, waitForDiagramRender } from "./editor-helpers";

for (const kind of ["Class", "Component", "Use Case"]) {
  test(`${kind} selection and focus follow inline rename through Undo and Redo`, async ({ page }) => {
    test.setTimeout(90_000);
    await prepareEditor(page);
    await page.getByRole("button", { name: "New diagram tab" }).click();
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: `${kind} diagram`, exact: true })
      .click();
    const original = `@startuml\n${kind === "Use Case" ? "usecase" : kind.toLowerCase()} "Order" as O\n@enduml`;
    await setSource(page, original);
    const attribute = kind === "Use Case" ? "data-usecase-object-id" : "data-class-object-id";
    const object = page.locator(`.diagram [${attribute}="o"][tabindex="0"]`).first();
    await object.click();
    const inspector = page.getByRole("complementary", { name: `${kind} object inspector` });
    await object.focus();
    await page.keyboard.press("F2");
    const label = page
      .getByRole("dialog", { name: "Edit diagram label" })
      .getByRole("textbox", { name: "Label", exact: true });
    await label.fill("Purchase");
    await label.press("Enter");
    await waitForDiagramRender(page);
    await expect(inspector.getByLabel("Name", { exact: true })).toHaveValue("Purchase");
    await expect(object).toBeFocused();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => readEditorSource(page)).toBe(original);
    await waitForDiagramRender(page);
    await expect(inspector.getByLabel("Name", { exact: true })).toHaveValue("Order");
    await expect(object).toBeFocused();
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await waitForDiagramRender(page);
    await expect(inspector.getByLabel("Name", { exact: true })).toHaveValue("Purchase");
    await expect(object).toBeFocused();
  });
}

test("Activity selection and keyboard focus follow a moved action through Undo and Redo", async ({ page }) => {
  test.setTimeout(90_000);
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Activity diagram", exact: true })
    .click();
  const original = "@startuml\n:First step;\n:Second step;\n@enduml";
  await setSource(page, original);
  const second = page.getByRole("button", { name: "Select action Second step", exact: true });
  await second.click();
  const inspector = page.getByRole("complementary", { name: "Activity action inspector" });
  await expect(inspector.getByLabel("Text", { exact: true })).toHaveValue("Second step");
  await second.focus();
  await page.keyboard.press("Alt+ArrowUp");
  await waitForDiagramRender(page);
  const moved = await readEditorSource(page);
  expect(moved.indexOf(":Second step;")).toBeLessThan(moved.indexOf(":First step;"));
  await expect(inspector.getByLabel("Text", { exact: true })).toHaveValue("Second step");
  await expect(second).toBeFocused();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => readEditorSource(page)).toBe(original);
  await waitForDiagramRender(page);
  await expect(inspector.getByLabel("Text", { exact: true })).toHaveValue("Second step");
  await expect(second).toBeFocused();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => readEditorSource(page)).toBe(moved);
  await waitForDiagramRender(page);
  await expect(inspector.getByLabel("Text", { exact: true })).toHaveValue("Second step");
  await expect(second).toBeFocused();
});
