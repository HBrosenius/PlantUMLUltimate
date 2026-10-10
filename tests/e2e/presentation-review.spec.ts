import { expect, test } from "@playwright/test";
import { fillSource, prepareEditor, readEditorSource } from "./editor-helpers";
const source =
  "@startgantt\nProject starts 2026-10-02\n[Build] as [b] lasts 2 days\n[Test] as [t] lasts 1 day\n@endgantt";
async function openPresentation(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Presentation & local review…" }).click();
  return page.getByRole("dialog", { name: "Presentation and local review" });
}
test("presents named highlights, isolates editing and persists personal notes through alias edits", async ({
  page,
}, info) => {
  await prepareEditor(page);
  await fillSource(page, source);
  let dialog = await openPresentation(page);
  await expect(dialog.locator("svg")).toBeVisible();
  await expect(dialog.locator("svg")).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "Add", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Views & local review" }).click();
  await dialog.getByLabel("Diagram object").selectOption("task:b");
  await dialog.getByRole("button", { name: "Add highlight step" }).click();
  await expect(dialog.locator(".presentation-highlight")).toHaveCount(1);
  await dialog.getByLabel("Diagram object").selectOption("task:t");
  await dialog.getByRole("button", { name: "Add highlight step" }).click();
  await dialog.getByLabel("View name").fill("Delivery walkthrough");
  await dialog.getByRole("button", { name: "Save named view" }).click();
  await dialog.getByLabel("Diagram object").selectOption("task:b");
  await dialog.getByLabel("Review note", { exact: true }).fill("Confirm estimate with team");
  await dialog.getByRole("button", { name: "Add anchored note" }).click();
  await expect(dialog).toContainText("Build · Current");
  await dialog.getByRole("button", { name: "Views & local review" }).click();
  await dialog.getByRole("button", { name: "Previous highlight" }).click();
  await expect(dialog.locator("footer").getByRole("status")).toContainText("1 / 2");
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("ControlOrMeta+n");
  await expect(dialog).toBeVisible();
  if (info.project.name === "chromium") await page.screenshot({ path: "docs/audits/2026-10-10-a32/desktop.png" });
  await dialog.getByRole("button", { name: "Exit presentation" }).click();
  await expect(page.getByRole("button", { name: "More", exact: true })).toBeFocused();
  expect(await readEditorSource(page)).toBe(source);
  const changed = source.replace("[Build]", "[Compile]").replace("2 days", "3 days");
  await fillSource(page, changed);
  dialog = await openPresentation(page);
  await dialog.getByRole("button", { name: "Views & local review" }).click();
  await expect(dialog).toContainText("Build · Updated");
  await dialog.getByText("Original revision context", { exact: true }).click();
  await expect(dialog.locator("pre").first()).toContainText("[Build]");
  await dialog.getByLabel("Named view").selectOption({ label: "Delivery walkthrough" });
  await expect(dialog.locator("footer").getByRole("status")).toContainText("Compile");
  if (info.project.name === "chromium") {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(dialog.locator("svg")).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: "docs/audits/2026-10-10-a32/phone.png" });
    await page.setViewportSize({ width: 1280, height: 720 });
  }
  await dialog.getByRole("button", { name: "Exit presentation" }).click();
  await page.reload();
  await expect(page.locator(".cm-content")).toBeVisible();
  await fillSource(page, changed.replace("[Compile] as [b] lasts 3 days\n", ""));
  dialog = await openPresentation(page);
  await dialog.getByRole("button", { name: "Views & local review" }).click();
  await expect(dialog).toContainText("Build · Missing");
  await dialog.getByRole("button", { name: "Show note anchor" }).click();
  await expect(dialog.locator("footer").getByRole("status")).toContainText("Missing anchor");
});

test("navigates connected WBS and Gantt diagrams without changing sources", async ({ page }) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "WBS diagram" })
    .click();
  await fillSource(page, "@startwbs\n*(project) Project\n**(build) Build\n@endwbs");
  await page.getByRole("button", { name: "Linked diagrams", exact: true }).click();
  await page.getByRole("menuitem", { name: "Create Gantt chart from WBS" }).click();
  const create = page.getByRole("dialog", { name: "Create document from WBS" });
  await create.getByLabel("Name", { exact: true }).fill("Delivery");
  await create.getByRole("button", { name: "Create Gantt chart", exact: true }).click();
  const dialog = await openPresentation(page);
  await expect(dialog.getByLabel("Connected diagrams")).toBeVisible();
  const options = dialog.getByLabel("Connected diagrams").locator("option");
  const target = await options.nth(1).getAttribute("value");
  await dialog.getByLabel("Connected diagrams").selectOption(target!);
  await expect(dialog.locator("svg")).toBeVisible();
  await expect(dialog.getByLabel("Connected diagrams")).toContainText("Delivery schedule");
});

test("presents the other diagram families without exposing source editing", async ({ page }) => {
  await prepareEditor(page);
  for (const family of [
    "Sequence diagram",
    "Class diagram",
    "Component diagram",
    "Activity diagram",
    "Use Case diagram",
  ]) {
    await page.getByRole("button", { name: "New diagram tab" }).click();
    await page
      .getByRole("dialog", { name: "Choose a diagram type" })
      .getByRole("button", { name: family, exact: true })
      .click();
    const before = await readEditorSource(page);
    const dialog = await openPresentation(page);
    await expect(dialog.locator("svg")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add", exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Views & local review" }).click();
    await expect(dialog.getByLabel("Diagram object").locator("option").nth(1)).toBeAttached();
    await page.keyboard.press("Escape");
    await expect(dialog.getByRole("complementary")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(await readEditorSource(page)).toBe(before);
  }
});
