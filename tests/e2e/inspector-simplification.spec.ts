import { expect, test } from "@playwright/test";
import { prepareEditor, fillSource, readEditorSource, waitForDiagramRender } from "./editor-helpers";

test("task basics lead, optional choices persist, and invalid drafts remain recoverable", async ({
  page,
}, testInfo) => {
  await prepareEditor(page);
  await fillSource(
    page,
    "@startgantt\nProject starts 2026-09-04\n[Design] as [a] lasts 3 days\n[Build] as [b] lasts 2 days\n@endgantt",
  );
  const bar = page.locator('[data-task-id="a"] .bar');
  await bar.click();
  const task = page.getByRole("complementary", { name: "Task inspector", exact: true });
  await expect(task.locator("summary")).toHaveText(["Basics", "Schedule", "Dependencies", "Appearance", "Resources"]);
  const resources = task.locator("details").filter({ has: page.locator("summary", { hasText: /^Resources/ }) });
  await expect(resources).not.toHaveAttribute("open");
  await task.getByText("Resources", { exact: true }).click();
  await task.getByRole("button", { name: "+ Add person" }).click();
  await task.getByLabel("Person name", { exact: true }).fill("Alice");
  await task.getByLabel("Person name", { exact: true }).press("Tab");
  await expect(page.locator(".cm-content")).toContainText("Alice");
  await expect(task.getByRole("status", { name: "Property commit status" })).toContainText("Applied");
  await page.keyboard.press("Escape");
  await bar.click();
  await expect(resources).toHaveAttribute("open", "");
  const name = task.getByRole("textbox", { name: /^Name/ });
  await name.fill("");
  await expect(task.getByRole("status", { name: "Property commit status" })).toContainText("Invalid changes");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator('[data-task-id="b"] .bar').click();
  await expect(name).toHaveValue("");
  await expect(task).toContainText("Design");
  await name.fill("Design revised");
  await expect(task.getByRole("status", { name: "Property commit status" })).toContainText("Unapplied changes");
  await name.press("Tab");
  await expect(page.locator(".cm-content")).toContainText("Design revised");
  await expect(task.getByRole("status", { name: "Property commit status" })).toContainText("Applied");
  if (testInfo.project.name === "chromium") {
    await waitForDiagramRender(page);
    await page.mouse.move(10, 10);
    await page.screenshot({ path: testInfo.outputPath("task-properties.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(name).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("task-properties-phone.png") });
  }
});

test("calendar leads with project schedule and protects staged edits", async ({ page }) => {
  await prepareEditor(page);
  const original = await readEditorSource(page);
  await page.getByRole("button", { name: "Calendar & schedule", exact: true }).click();
  const calendar = page.getByRole("complementary", { name: "Project and calendar inspector" });
  await expect(calendar.locator("form input").first()).toHaveAttribute("type", "date");
  await calendar.getByLabel("Diagram title", { exact: true }).fill("Release plan");
  await expect(calendar.getByRole("status", { name: "Property commit status" })).toContainText("Unapplied changes");
  expect(await readEditorSource(page)).toBe(original);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.keyboard.press("Escape");
  await expect(calendar).toBeVisible();
  await expect(calendar.getByLabel("Diagram title", { exact: true })).toHaveValue("Release plan");
  await calendar.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("title Release plan");
});

test("Sequence creation prioritizes endpoints and message, with keyboard pickers and advanced options", async ({
  page,
}, testInfo) => {
  await prepareEditor(page);
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram" })
    .click();
  await fillSource(page, "@startuml\nparticipant Alice\nparticipant Bob\nAlice -> Bob: Hello\n@enduml");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Message…" }).click();
  const dialog = page.getByRole("dialog", { name: "Add message", exact: true });
  await expect(dialog.getByRole("combobox", { name: "From", exact: true })).toBeFocused();
  await expect(dialog.getByLabel("Message", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Lifecycle modifiers" })).toBeHidden();
  await dialog.getByRole("button", { name: "Choose from participant" }).click();
  await expect(dialog.getByRole("listbox", { name: "From participants" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("listbox")).toHaveCount(0);
  await dialog.getByRole("combobox", { name: "To", exact: true }).fill("NewService");
  await dialog.getByLabel("Message", { exact: true }).fill("Request");
  await dialog.getByText("Advanced", { exact: true }).click();
  await expect(dialog.getByLabel("Anchor", { exact: true })).toBeVisible();
  if (testInfo.project.name === "chromium") {
    await page.screenshot({ path: testInfo.outputPath("sequence-message.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(dialog.getByRole("button", { name: "Add message", exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("sequence-message-phone.png") });
    await page.setViewportSize({ width: 1280, height: 720 });
  }
  await dialog.getByRole("button", { name: "Add message", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("Alice -> NewService: Request");
});

test("single click opens properties and double click preserves source in every family", async ({ page }) => {
  test.setTimeout(60000);
  await prepareEditor(page);
  const families = [
    ["Gantt", "[data-task-id] .bar"],
    ["WBS", "text[data-wbs-node-id]"],
    ["Sequence", "[data-sequence-drag-hit]"],
    ["Use Case", ".usecase-semantic-hit[data-usecase-object-id]"],
    ["Class", ".class-semantic-hit[data-class-object-type=entity]"],
    ["Component", ".class-semantic-hit[data-class-object-type=entity]"],
    ["Activity", ".activity-semantic-hit[data-activity-object-id]"],
  ];
  for (const [kind, selector] of families) {
    if (kind !== "Gantt") {
      await page.getByRole("button", { name: "New diagram tab" }).click();
      await page
        .getByRole("dialog", { name: "Choose a diagram type" })
        .getByRole("button", { name: `${kind} diagram` })
        .click();
    }
    const minimal: Record<string, string> = {
      WBS: "@startwbs\n* Plan\n** Design\n@endwbs",
      Sequence: "@startuml\nparticipant Alice\nparticipant Bob\nAlice -> Bob: Hello\n@enduml",
      "Use Case": "@startuml\nactor User\nusecase Order\nUser --> Order\n@enduml",
      Class: "@startuml\nclass Order\n@enduml",
      Component: "@startuml\ncomponent API\n@enduml",
      Activity: "@startuml\nstart\n:Review;\nstop\n@enduml",
    };
    if (minimal[kind!]) await fillSource(page, minimal[kind!]!);
    await waitForDiagramRender(page);
    const hint = page.getByRole("button", { name: "Dismiss editing hint" });
    if (await hint.isVisible()) await hint.click();
    const original = await readEditorSource(page);
    const object = page.locator(`.diagram ${selector}`).first();
    await expect(object).toBeVisible();
    if (kind === "WBS") {
      const bounds = await object.boundingBox();
      await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    } else await object.click();
    await expect(page.locator(".task-inspector:visible").first()).toBeVisible();
    if (kind === "WBS") {
      const bounds = await object.boundingBox();
      await page.mouse.dblclick(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    } else await object.dblclick();
    expect(await readEditorSource(page)).toBe(original);
    await page.keyboard.press("Escape");
  }
});
