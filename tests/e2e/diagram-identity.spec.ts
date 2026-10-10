import { expect, test } from "@playwright/test";
import { prepareEditor, readEditorSource } from "./editor-helpers";

test("three separate diagrams expose names, types and distinct close controls", async ({ page }, testInfo) => {
  await prepareEditor(page);
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  for (const kind of ["Sequence", "Gantt"]) {
    await page.getByRole("button", { name: "New diagram tab" }).click();
    await expect(chooser.getByRole("combobox", { name: "Create in", exact: true })).toHaveValue("separate");
    await chooser.getByRole("button", { name: `${kind} diagram` }).click();
  }
  const tabs = page.locator(".document-tabs > button:not(.new-tab)");
  await expect(tabs).toHaveCount(3);
  await expect(tabs.nth(0)).toContainText("Gantt diagram (1)");
  await expect(tabs.nth(1)).toContainText("Sequence diagram");
  await expect(tabs.nth(2)).toContainText("Gantt diagram (2)");
  for (const tab of await tabs.all()) {
    await expect(tab.locator(".tab-type-badge")).toBeVisible();
    await expect(tab).toHaveAttribute("title", /New separate file; not saved to a file/);
  }
  await expect(page.getByRole("button", { name: "Close Gantt diagram (1)", exact: true })).toBeVisible();
  await tabs.nth(1).click({ button: "right" });
  page.once("dialog", (dialog) => void dialog.accept("Payment flow"));
  await page.getByRole("menuitem", { name: "Rename diagram…" }).click();
  await expect(tabs.nth(1)).toContainText("Payment flow");
  await page.reload();
  await expect(tabs).toHaveCount(3);
  await expect(tabs.nth(1)).toContainText("Payment flow");
  if (testInfo.project.name === "chromium") await page.screenshot({ path: testInfo.outputPath("three-diagrams.png") });
});

test("chooser defaults to the active document, preserves example source and permits a separate file", async ({
  page,
}, testInfo) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "New", exact: true }).click();
  await page.getByRole("menu", { name: "New", exact: true }).getByRole("menuitem", { name: "Document…" }).click();
  const create = page.getByRole("dialog", { name: "New document", exact: true });
  await create.getByRole("textbox", { name: "Name", exact: true }).fill("Launch document");
  await create.getByRole("button", { name: "Create document", exact: true }).click();
  await page
    .getByRole("complementary", { name: "Document navigator" })
    .getByRole("button", { name: "Close document navigator" })
    .click();
  await page.getByRole("button", { name: "New diagram tab" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  const destination = chooser.getByRole("combobox", { name: "Create in", exact: true });
  await expect(destination).toHaveValue("document");
  await expect(destination).toContainText("Add to Launch document");
  await expect(destination).toBeVisible();
  if (testInfo.project.name === "chromium") {
    await chooser.screenshot({ path: testInfo.outputPath("destination.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(destination).toBeInViewport();
    await expect(chooser.getByRole("textbox", { name: "Diagram name", exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("destination-phone.png") });
    await page.setViewportSize({ width: 1280, height: 720 });
  }
  await chooser.getByRole("button", { name: /Product launch plan/ }).click();
  await expect(chooser).toBeHidden();
  expect(await readEditorSource(page)).toContain("title Product launch plan");
  const tabs = page.locator(".document-tabs > button:not(.new-tab)");
  const member = tabs.filter({ hasText: "Product launch plan" });
  await expect(member).toHaveAttribute("title", /Document: Launch document/);
  await expect(page.locator(".document-identity")).toContainText("Launch document");
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await expect(destination).toHaveValue("document");
  await destination.selectOption("separate");
  await chooser.getByRole("textbox", { name: "Diagram name", exact: true }).fill("Independent flow");
  await chooser.getByRole("button", { name: "Sequence diagram" }).click();
  await expect(tabs.filter({ hasText: "Independent flow" })).toHaveAttribute("title", /New separate file/);
  await expect(page.locator(".document-identity")).toContainText("New separate file");
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await expect(destination).toHaveValue("separate");
});
