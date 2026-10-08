import { expect, test } from "@playwright/test";
import { prepareEditor } from "./editor-helpers";

test("refuses to overwrite a project file changed elsewhere", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    let bytes = new Uint8Array();
    const handle = {
      name: "shared-project.pumlu",
      createWritable: async () => ({
        write: async (data: string | Uint8Array | Blob) => {
          bytes =
            typeof data === "string"
              ? new TextEncoder().encode(data)
              : data instanceof Blob
                ? new Uint8Array(await data.arrayBuffer())
                : Uint8Array.from(data);
        },
        close: async () => undefined,
      }),
      getFile: async () => new File([bytes], "shared-project.pumlu", { type: "application/octet-stream" }),
    };
    Object.assign(window, {
      showSaveFilePicker: async () => handle,
      // Simulates another tab or a synced folder rewriting the file.
      __changeProjectFileElsewhere: () => {
        bytes = Uint8Array.from([...bytes, 0]);
      },
      __projectFileSize: () => bytes.byteLength,
    });
  });
  await prepareEditor(page);

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "New", exact: true }).click();
  await page.getByRole("menu", { name: "New" }).getByRole("menuitem", { name: "Document…" }).click();
  const projectDialog = page.getByRole("dialog", { name: "New document" });
  await projectDialog.getByRole("textbox", { name: "Name" }).fill("Shared project");
  await projectDialog.getByRole("button", { name: "Create document" }).click();

  const navigator = page.getByRole("complementary", { name: "Document navigator" });
  const addDiagram = async (name: string) => {
    await navigator.getByRole("button", { name: "Add diagram" }).click();
    await navigator.getByRole("combobox", { name: "Diagram type" }).selectOption("component");
    await navigator.getByRole("textbox", { name: "Diagram name" }).fill(name);
    await navigator.getByRole("button", { name: "Add to document" }).click();
  };
  const saveProject = async () => {
    await page.getByRole("button", { name: "File", exact: true }).click();
    await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  };

  await addDiagram("Architecture");
  await saveProject();
  await expect(navigator.getByText("Saved", { exact: true })).toBeVisible();

  await addDiagram("Deployment");
  await saveProject();
  await expect(navigator.getByText("Saved", { exact: true })).toBeVisible();

  await page.evaluate(() =>
    (window as unknown as { __changeProjectFileElsewhere(): void }).__changeProjectFileElsewhere(),
  );
  const changedSize = await page.evaluate(() =>
    (window as unknown as { __projectFileSize(): number }).__projectFileSize(),
  );
  await addDiagram("Operations");
  await saveProject();
  await expect(page.getByText(/The document file changed on disk/).first()).toBeVisible();
  await expect(navigator.getByText("Saved", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __projectFileSize(): number }).__projectFileSize())).toBe(
    changedSize,
  );

  // Reload uses the browser recovery snapshot, which includes the unsaved third diagram.
  // Recovery must not claim these changes are already in the file that rejected our save.
  await expect(navigator.getByText("Local recovery current in this browser")).toBeVisible();
  await page.reload();
  await expect(navigator.getByText("Shared project", { exact: true })).toBeVisible();
  await expect(navigator.getByText("Unsaved changes", { exact: true })).toBeVisible();
  await expect(navigator.getByText("Saved", { exact: true })).toHaveCount(0);
  for (const name of ["Architecture", "Deployment", "Operations"]) {
    await expect(navigator.getByText(name, { exact: true })).toBeVisible();
  }
});
