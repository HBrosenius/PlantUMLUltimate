import { expect, test } from "@playwright/test";
import { prepareEditor, fillSource, readEditorSource } from "./editor-helpers";

test("default Diagram mode exposes source without Settings", async ({ page }, testInfo) => {
  await page.goto("/");
  const welcome = page.getByRole("dialog", { name: "Welcome to PlantUML Ultimate" });
  await expect(welcome.getByRole("radio", { name: "Diagram only", exact: true })).toBeChecked();
  await welcome.getByRole("button", { name: "Get started" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Sequence diagram" })
    .click();
  const modes = page.getByRole("navigation", { name: "View mode" });
  await expect(modes.getByRole("button")).toHaveText(["Code", "Split", "Diagram"]);
  await expect(modes.getByRole("button", { name: "Diagram", exact: true })).toHaveAttribute("aria-pressed", "true");
  await modes.getByRole("button", { name: "Code", exact: true }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
  const original = await readEditorSource(page);
  await modes.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(page.locator(".diagram svg")).toBeVisible();
  expect(await readEditorSource(page)).toBe(original);
  await page.reload();
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(modes.getByRole("button", { name: "Split", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Settings…", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Settings", exact: true })
    .getByRole("button", { name: "Apply", exact: true })
    .click();
  await expect(modes.getByRole("button", { name: "Split", exact: true })).toHaveAttribute("aria-pressed", "true");
  if (testInfo.project.name === "chromium") {
    await modes.getByRole("button", { name: "Diagram", exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath("default-source-access.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(modes.getByRole("button")).toHaveText(["Code", "Diagram"]);
    await modes.getByRole("button", { name: "Code", exact: true }).click();
    await expect(page.locator(".cm-content")).toBeVisible();
  }
});

test("long Sequence starts readably and manual per-tab zoom survives edits, properties and recovery", async ({
  page,
}, testInfo) => {
  await prepareEditor(page);
  const sequence = `@startuml\nparticipant Alice\nparticipant Bob\n${Array.from({ length: 60 }, (_, i) => `Alice -> Bob: Message ${i + 1}`).join("\n")}\n@enduml`;
  await page.evaluate(() =>
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true }),
  );
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open", exact: true }).click();
  const upload = page.waitForEvent("filechooser");
  await page
    .getByRole("menu", { name: "Open", exact: true })
    .getByRole("menuitem", { name: "Diagram…", exact: true })
    .click();
  await (await upload).setFiles({ name: "long-sequence.puml", mimeType: "text/plain", buffer: Buffer.from(sequence) });
  await expect(page.locator(".diagram svg")).toContainText("Message 60");
  const hint = page.getByRole("button", { name: "Dismiss editing hint" });
  if (await hint.isVisible()) await hint.click();
  await expect(page.locator(".diagram svg")).toBeVisible();
  const reset = page.getByRole("button", { name: /Reset zoom/ });
  const label = page
    .locator(".diagram svg text")
    .filter({ hasText: /^Alice$/ })
    .first();
  const labelBounds = await label.boundingBox();
  expect(labelBounds!.height).toBeGreaterThanOrEqual(12);
  expect(labelBounds!.height).toBeLessThanOrEqual(32);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const chosenZoom = await reset.textContent();
  if (testInfo.project.name === "chromium")
    await page.screenshot({ path: testInfo.outputPath("long-sequence-readable.png") });
  await fillSource(page, sequence.replace("Message 60", "Final response"));
  await expect(page.locator(".diagram svg")).toContainText("Final response");
  await expect(reset).toHaveText(chosenZoom!);
  await page.getByRole("button", { name: "Diagram settings", exact: true }).click();
  await page.getByRole("button", { name: /Close.*settings/i }).click();
  await expect(reset).toHaveText(chosenZoom!);
  const tabs = page.locator(".document-tabs > button:not(.new-tab)");
  await tabs.first().click();
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  const ganttZoom = await reset.textContent();
  await tabs.nth(1).click();
  await expect(reset).toHaveText(chosenZoom!);
  await page.reload();
  await expect(reset).toHaveText(chosenZoom!);
  await tabs.first().click();
  await expect(reset).toHaveText(ganttZoom!);
  await tabs.nth(1).click();
  await expect(page.locator(".diagram svg")).toContainText("Final response");
  await page.getByRole("button", { name: "Fit diagram", exact: true }).click();
  await expect(reset).not.toHaveText(chosenZoom!);
  await expect(page.locator(".cm-content")).toContainText("Final response");
  if (testInfo.project.name === "chromium") await page.screenshot({ path: testInfo.outputPath("explicit-fit.png") });
});

test("initial fitting completes for every preview family", async ({ page }) => {
  await prepareEditor(page);
  for (const kind of ["Gantt", "WBS", "Sequence", "Use Case", "Class", "Component", "Activity"]) {
    if (kind !== "Gantt") {
      await page.getByRole("button", { name: "New diagram tab" }).click();
      await page
        .getByRole("dialog", { name: "Choose a diagram type" })
        .getByRole("button", { name: `${kind} diagram` })
        .click();
    }
    await expect(page.locator(".diagram svg")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const modulePath = "/src/workspace-storage.ts";
          const storage = await import(modulePath);
          const workspace = await storage.loadWorkspace();
          return workspace.documents.find((document: { id: string }) => document.id === workspace.activeDocumentId)
            ?.zoomInitialized;
        }),
      )
      .toBe(true);
  }
});
