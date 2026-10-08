import { expect, test } from "@playwright/test";
import { prepareEditor, setSource } from "./editor-helpers";

test("adds a Gantt chart to the WBS's existing project", async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      showSaveFilePicker: async () => ({
        name: "website-project.pumlu",
        createWritable: async () => ({ write: async () => undefined, close: async () => undefined }),
      }),
    });
  });
  await prepareEditor(page);
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "New", exact: true }).click();
  await page.getByRole("menu", { name: "New" }).getByRole("menuitem", { name: "Document…" }).click();
  const projectDialog = page.getByRole("dialog", { name: "New document" });
  await projectDialog.getByRole("textbox", { name: "Name" }).fill("Website project");
  await projectDialog.getByRole("button", { name: "Create document" }).click();
  const navigator = page.getByRole("complementary", { name: "Document navigator" });

  for (const name of ["Other WBS", "Website WBS"]) {
    await navigator.getByRole("button", { name: "Add diagram" }).click();
    await navigator.getByRole("combobox", { name: "Diagram type" }).selectOption("wbs");
    await navigator.getByRole("textbox", { name: "Diagram name" }).fill(name);
    await navigator.getByRole("button", { name: "Add to document" }).click();
    await setSource(page, `@startwbs\n*(root) ${name}\n**(child) Child\n@endwbs`);
  }

  await page.getByRole("button", { name: "Linked diagrams" }).click();

  await page.getByRole("menuitem", { name: "Create Gantt chart from WBS" }).click();
  const conversion = page.getByRole("dialog", { name: "Create Gantt chart from WBS" });
  await expect(conversion.getByRole("textbox", { name: "Name" })).toHaveCount(0);
  await conversion.getByLabel("Project start date").fill("2026-10-05");
  await conversion.getByRole("button", { name: "Create Gantt chart" }).click();

  await expect(navigator).toContainText("Website project");
  await expect(navigator).toContainText("3 diagrams");
  await expect(navigator).toContainText("Other WBS");
  await expect(navigator).toContainText("Website WBS");
  await expect(navigator).toContainText("Website WBS schedule");
  await expect(page.locator(".document-tabs")).toContainText("Website WBS schedule");
  await navigator.getByRole("button", { name: /Website WBS wbs · 2 links/ }).click();
  await page.getByRole("button", { name: "Linked diagrams" }).click();
  await expect(page.getByRole("menuitem", { name: /Add missing WBS tasks to Gantt \(0\)/ })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await expect(navigator.locator(".project-save-status")).toHaveText("Saved");
});
