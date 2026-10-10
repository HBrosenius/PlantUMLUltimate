import { expect, test } from "@playwright/test";
import { fillSource, prepareEditor, source } from "./editor-helpers";

test("new, saving, written, changed and recovered documents show the correct Save state", async ({
  page,
}, testInfo) => {
  await prepareEditor(page);
  const status = page.locator(".file-save-indicator");
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(status).toHaveText("Not saved to a file");
  await expect(save).toHaveClass(/save-needed/);
  await page.evaluate(() => {
    let bytes = new Uint8Array();
    const state = window as Window & { finishSave?: () => void };
    const handle = {
      name: "written.pumlu",
      getFile: async () => new File([bytes], "written.pumlu"),
      createWritable: async () => ({
        write: async (data: Uint8Array) => {
          bytes = Uint8Array.from(data);
        },
        close: () =>
          new Promise<void>((resolve) => {
            state.finishSave = resolve;
          }),
      }),
    };
    Object.assign(window, { showSaveFilePicker: async () => handle });
  });
  await save.click();
  await expect(status).toHaveText("Saving…");
  await expect(save).toBeDisabled();
  await expect
    .poll(() => page.evaluate(() => Boolean((window as Window & { finishSave?: () => void }).finishSave)))
    .toBe(true);
  await page.evaluate(() => (window as Window & { finishSave?: () => void }).finishSave!());
  await expect(status).toHaveText("Saved to file");
  await expect(save).not.toHaveClass(/save-needed/);
  if (testInfo.project.name === "chromium") await page.screenshot({ path: testInfo.outputPath("saved.png") });
  await fillSource(page, source("[Changed] lasts 4 days"));
  await expect(status).toHaveText("Unsaved changes");
  await expect(save).toHaveClass(/save-needed/);
  await page.reload();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  if (await chooser.isVisible()) await chooser.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(status).toHaveText("Unsaved changes");
  await expect(save).toHaveClass(/save-needed/);
});

test("download provenance survives recovery and failures remain actionable", async ({ page }) => {
  await prepareEditor(page);
  const status = page.locator(".file-save-indicator");
  const save = page.getByRole("button", { name: "Save", exact: true });
  await page.evaluate(() => Object.assign(window, { showSaveFilePicker: undefined }));
  const download = page.waitForEvent("download");
  await save.click();
  await download;
  await expect(status).toHaveText("Download requested");
  await expect(save).not.toHaveClass(/save-needed/);
  await page.reload();
  await expect(status).toHaveText("Download requested");
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  if (await chooser.isVisible()) await chooser.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(() =>
    Object.assign(window, {
      showSaveFilePicker: async () => {
        throw new DOMException("Cancelled", "AbortError");
      },
    }),
  );
  await save.click();
  await expect(status).toHaveText("Save cancelled");
  await page.evaluate(() =>
    Object.assign(window, {
      showSaveFilePicker: async () => {
        throw new Error("Disk is unavailable");
      },
    }),
  );
  await save.click();
  await expect(status).toContainText("Save failed");
  await expect(status.getByRole("button", { name: "Retry save" })).toBeVisible();
  await expect(save).toHaveClass(/save-needed/);
  await expect(page.locator(".statusbar")).toContainText("Disk is unavailable");
});

test("routine creation status expires and source problems take priority", async ({ page }) => {
  await prepareEditor(page);
  await expect(page.locator(".statusbar")).toContainText("Created a new Gantt diagram");
  await expect(page.locator(".statusbar")).not.toContainText("Created a new Gantt diagram", { timeout: 8000 });
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Gantt diagram" })
    .click();
  await fillSource(page, source("[Invalid] lasts -2 days"));
  await expect(page.locator(".statusbar")).not.toContainText("Created a new Gantt diagram");
  await expect(page.getByRole("button", { name: /^Issues \(/ })).toBeVisible();
});
