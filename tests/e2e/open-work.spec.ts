import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { prepareEditor, readEditorSource } from "./editor-helpers";
const tabs = (page: Page) => page.locator(".document-tabs > button:not(.new-tab)");
async function openWork(page: Page) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open", exact: true }).hover();
  await page
    .getByRole("menu", { name: "Open", exact: true })
    .getByRole("menuitem", { name: "Recent files & import…", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Open existing work" });
}
async function drop(page: Page, name: string, bytes: number[]) {
  await page.getByRole("region", { name: "Drop PlantUML files" }).evaluate(
    (element, file) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(file.bytes)], file.name));
      element.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer }));
    },
    { name, bytes },
  );
}

test("imports pasted source into a new tab and rejects invalid or cancelled work", async ({ page }) => {
  await prepareEditor(page);
  const original = await readEditorSource(page);
  const count = await tabs(page).count();
  let dialog = await openWork(page);
  await dialog.getByLabel("PlantUML source", { exact: true }).fill("not a diagram");
  await dialog.getByRole("button", { name: "Import source", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Import one PlantUML diagram");
  await expect(tabs(page)).toHaveCount(count);
  expect(await readEditorSource(page)).toBe(original);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  dialog = await openWork(page);
  const source = "@startwbs\n* Imported project\n** Delivery\n@endwbs";
  await dialog.getByLabel("PlantUML source", { exact: true }).fill(source);
  await expect(dialog.getByRole("status")).toContainText("Detected wbs diagram");
  await dialog.getByRole("button", { name: "Import source", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(tabs(page)).toHaveCount(count + 1);
  await expect.poll(() => readEditorSource(page)).toBe(source);
  await expect(page.locator(".document-tabs > button.active .dirty-dot.visible")).toBeVisible();
  dialog = await openWork(page);
  await expect(dialog.getByText("No recent files yet.", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await tabs(page).first().click();
  expect(await readEditorSource(page)).toBe(original);
});

test("shares file decoding for drop, picker, native documents and recent fallback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showOpenFilePicker", { configurable: true, value: undefined });
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined });
  });
  await prepareEditor(page);
  const original = await readEditorSource(page);
  const initialCount = await tabs(page).count();
  let dialog = await openWork(page);
  await drop(page, "bad.pumlu", Array.from(new TextEncoder().encode("PUMLUDOCbroken")));
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(tabs(page)).toHaveCount(initialCount);
  expect(await readEditorSource(page)).toBe(original);
  const source = "@startuml\nclass ImportedOrder\n@enduml";
  await drop(page, "orders.puml", Array.from(new TextEncoder().encode(source)));
  await expect(dialog).toBeHidden();
  await expect.poll(() => readEditorSource(page)).toBe(source);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save as…", exact: true }).click();
  const file = await (await downloadPromise).path();
  dialog = await openWork(page);
  await drop(page, "orders.pumlu", Array.from(readFileSync(file!)));
  await expect(dialog).toBeHidden();
  await expect.poll(() => readEditorSource(page)).toBe(source);
  await page.reload();
  dialog = await openWork(page);
  await dialog.getByRole("button", { name: "orders.puml", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("locate the file again");
  const chooser = page.waitForEvent("filechooser");
  await dialog.getByRole("button", { name: "Locate file…", exact: true }).click();
  await (await chooser).setFiles({ name: "orders.puml", mimeType: "text/plain", buffer: Buffer.from(source) });
  await expect(dialog).toBeHidden();
  await expect.poll(() => readEditorSource(page)).toBe(source);
  await page.keyboard.press("ControlOrMeta+n");
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Recent files & import…", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Open existing work" });
  await expect(dialog.getByRole("button", { name: "orders.puml", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.screenshot({ path: "test-results/a21-open-work-phone.png" });
});

test("permission denial preserves current work and offers explicit file recovery", async ({ page }) => {
  await page.addInitScript(() => {
    const source = "@startuml\nA -> B: Recent file\n@enduml";
    const handle = {
      name: "permission.puml",
      getFile: async () => new File([source], "permission.puml"),
      createWritable: async () => ({ write: async () => {}, close: async () => {} }),
      queryPermission: async () => "prompt",
      requestPermission: async () => "denied",
    };
    Object.defineProperty(window, "showOpenFilePicker", { configurable: true, value: async () => [handle] });
  });
  await prepareEditor(page);
  let dialog = await openWork(page);
  await dialog.getByRole("button", { name: "Choose file…", exact: true }).click();
  await expect(dialog).toBeHidden();
  const source = await readEditorSource(page);
  const count = await tabs(page).count();
  dialog = await openWork(page);
  await dialog.getByRole("button", { name: "permission.puml", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("access was denied");
  await expect(dialog.getByRole("alert")).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Locate file…", exact: true })).toBeVisible();
  await expect.poll(() => readEditorSource(page)).toBe(source);
  await expect(tabs(page)).toHaveCount(count);
  await dialog.screenshot({ path: "test-results/a21-permission-recovery.png" });
  await dialog.getByRole("button", { name: "Remove permission.puml from recent files", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "permission.puml", exact: true })).toHaveCount(0);
});

test("imports into an explicitly chosen document and ignores files dropped outside the import area", async ({
  page,
}) => {
  await prepareEditor(page);
  const original = await readEditorSource(page);
  const count = await tabs(page).count();
  const prevented = await page.locator(".app").evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["@startwbs\n* Outside\n@endwbs"], "outside.puml"));
    const event = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(tabs(page)).toHaveCount(count);
  expect(await readEditorSource(page)).toBe(original);
  const dialog = await openWork(page);
  await dialog.getByLabel("Open as", { exact: true }).selectOption("document");
  const source = "@startuml\nparticipant User\nUser -> App: Imported document\n@enduml";
  await dialog.getByLabel("PlantUML source", { exact: true }).fill(source);
  await dialog.getByRole("button", { name: "Import source", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await readEditorSource(page)).toBe(original);
  const navigator = page.getByRole("complementary", { name: "Document navigator", exact: true });
  await expect(navigator).toBeVisible();
  await navigator.getByRole("button", { name: "imported sequence · 0 links", exact: true }).click();
  await expect.poll(() => readEditorSource(page)).toBe(source);
});
