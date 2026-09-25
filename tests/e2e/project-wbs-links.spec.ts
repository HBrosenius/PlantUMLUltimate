import { expect, test } from "@playwright/test";
import { prepareEditor, setSource } from "./editor-helpers";

test("links nodes in three WBS diagrams and saves the project", async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      showSaveFilePicker: async () => ({
        name: "connected-wbs.pumlu",
        createWritable: async () => ({ write: async () => undefined, close: async () => undefined }),
      }),
    });
  });
  await prepareEditor(page);
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "New", exact: true }).click();
  await page.getByRole("menu", { name: "New" }).getByRole("menuitem", { name: "Project…" }).click();
  await page.getByRole("dialog", { name: "New project" }).getByRole("button", { name: "Create project" }).click();
  const navigator = page.getByRole("complementary", { name: "Project navigator" });
  for (const [name, alias] of [
    ["Research", "research"],
    ["Design", "design"],
    ["Delivery", "delivery"],
  ]) {
    await navigator.getByRole("button", { name: "Add diagram" }).click();
    await navigator.getByRole("combobox", { name: "Diagram type" }).selectOption("wbs");
    await navigator.getByRole("textbox", { name: "Diagram name" }).fill(name);
    await navigator.getByRole("button", { name: "Add to project" }).click();
    await setSource(page, `@startwbs\n*(${alias}) ${name}\n@endwbs`);
  }

  const links = navigator.getByRole("region", { name: "Links between diagram items" });
  const from = links.getByRole("combobox", { name: "1. Link from" });
  const to = links.getByRole("combobox", { name: "2. Link to" });
  await expect(from.locator("option", { hasText: "Research: research" })).toHaveCount(1);
  await expect(from.locator("option", { hasText: "Delivery: delivery" })).toHaveCount(1);
  await from.selectOption({ label: "Research: research" });
  await expect(to.locator("option", { hasText: "Research: research" })).toHaveCount(0);
  await to.selectOption({ label: "Design: design" });
  await links.getByRole("button", { name: "Create WBS link" }).click();
  await from.selectOption({ label: "Design: design" });
  await to.selectOption({ label: "Delivery: delivery" });
  await links.getByRole("button", { name: "Create WBS link" }).click();
  await expect(links.getByRole("region", { name: "Existing links" }).locator("li")).toHaveCount(2);
  await expect(navigator).toContainText("3 diagrams · 2 connections");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await page.getByRole("menu", { name: "Save" }).getByRole("menuitem", { name: "Save project", exact: true }).click();
  await expect(navigator.locator(".project-save-status")).toHaveText("Saved");

  await page.getByRole("button", { name: "Close project navigator" }).click();
  await page.getByRole("button", { name: "Select WBS node Delivery" }).focus();
  await page.keyboard.press("Shift+F10");
  await page
    .getByRole("menu", { name: "Symbol actions" })
    .getByRole("menuitem", { name: "Open linked WBS node in Design: design" })
    .click();
  await expect(page.getByRole("complementary", { name: "WBS node inspector" })).toContainText("Design");
  await page.getByRole("button", { name: "Select WBS node Design" }).focus();
  await page.keyboard.press("Shift+F10");
  await expect(
    page
      .getByRole("menu", { name: "Symbol actions" })
      .getByRole("menuitem", { name: /Open linked WBS node in (Research|Delivery)/ }),
  ).toHaveCount(2);
  await page
    .getByRole("menu", { name: "Symbol actions" })
    .getByRole("menuitem", { name: "Open linked WBS node in Research: research" })
    .click();
  await expect(page.getByRole("complementary", { name: "WBS node inspector" })).toContainText("Research");
  const inspector = page.getByRole("complementary", { name: "WBS node inspector" });
  await inspector.getByRole("textbox", { name: "Label" }).fill("Research renamed");
  await inspector.getByRole("textbox", { name: "Label" }).blur();
  await expect(inspector.getByRole("textbox", { name: "Label" })).toHaveValue("Research renamed");
  await page.getByRole("button", { name: "Select WBS node Research renamed" }).focus();
  await page.keyboard.press("Shift+F10");
  await page
    .getByRole("menu", { name: "Symbol actions" })
    .getByRole("menuitem", { name: "Open linked WBS node in Design: design" })
    .click();
  await expect(inspector).toContainText("Design");
  await page.getByRole("button", { name: "Select WBS node Design" }).focus();
  await page.keyboard.press("Shift+F10");
  await expect(
    page
      .getByRole("menu", { name: "Symbol actions" })
      .getByRole("menuitem", { name: "Open linked WBS node in Research: research" }),
  ).toBeVisible();
  await page
    .getByRole("menu", { name: "Symbol actions" })
    .getByRole("menuitem", { name: "Open linked WBS node in Research: research" })
    .click();
  await page.getByRole("button", { name: "Select WBS node Research renamed" }).focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menu", { name: "Symbol actions" }).getByRole("menuitem", { name: "Rename…" }).click();
  const rename = page.getByRole("dialog", { name: "Rename WBS node alias" });
  await rename.getByRole("textbox", { name: "New name" }).fill("research_new");
  await rename.getByRole("button", { name: "Rename" }).click();
  await page.getByRole("button", { name: "Select WBS node Research renamed" }).focus();
  await page.keyboard.press("Shift+F10");
  await page
    .getByRole("menu", { name: "Symbol actions" })
    .getByRole("menuitem", { name: "Open linked WBS node in Design: design" })
    .click();
  await page.getByRole("button", { name: "Select WBS node Design" }).focus();
  await page.keyboard.press("Shift+F10");
  await expect(
    page
      .getByRole("menu", { name: "Symbol actions" })
      .getByRole("menuitem", { name: "Open linked WBS node in Research: research_new" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await page.getByRole("menu", { name: "Save" }).getByRole("menuitem", { name: "Save project", exact: true }).click();
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /Project: / }).click();
  await page.getByRole("menu", { name: "Project" }).getByRole("menuitem", { name: "Diagram connections" }).click();
  await expect(navigator.locator(".project-save-status")).toHaveText("Saved");
  await expect(navigator.getByRole("region", { name: "Existing links" })).not.toContainText("Unresolved path");
});
