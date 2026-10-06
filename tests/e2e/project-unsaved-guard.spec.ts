import { expect, test } from "@playwright/test";
import { prepareEditor } from "./editor-helpers";

test("protects closed-diagram metadata when creating, opening, and closing projects", async ({ page }) => {
  await page.addInitScript(() => {
    let bytes = new Uint8Array();
    const state: { fail: boolean; cancel: boolean; pause: boolean; finish?: () => void } = {
      fail: false,
      cancel: false,
      pause: false,
    };
    const handle = {
      name: "plan.pumlu",
      getFile: async () => new File([bytes], "plan.pumlu"),
      createWritable: async () => {
        let staged = bytes;
        return {
          write: async (data: Uint8Array) => {
            if (state.fail) throw new Error("Disk unavailable");
            staged = Uint8Array.from(data);
          },
          close: async () => {
            if (state.pause)
              await new Promise<void>((resolve) => {
                state.finish = resolve;
              });
            bytes = staged;
          },
          abort: async () => undefined,
        };
      },
    };
    Object.assign(window, {
      __guardSave: state,
      showSaveFilePicker: async () => {
        if (state.cancel) throw new DOMException("Picker cancelled", "AbortError");
        return handle;
      },
      showOpenFilePicker: async () => [handle],
    });
  });
  await prepareEditor(page);
  const create = async (name: string) => {
    await page.getByRole("button", { name: "File", exact: true }).click();
    await page.getByRole("menuitem", { name: "New", exact: true }).click();
    await page.getByRole("menu", { name: "New" }).getByRole("menuitem", { name: "Document…" }).click();
    const dialog = page.getByRole("dialog", { name: "New document" });
    await dialog.getByRole("textbox", { name: "Name" }).fill(name);
    await dialog.getByRole("button", { name: "Create document" }).click();
  };
  const navigator = page.getByRole("complementary", { name: "Document navigator" });
  const guard = page.getByRole("dialog", { name: "Save document changes?" });
  await create("Original plan");
  await navigator.getByRole("button", { name: "Add diagram" }).click();
  await navigator.getByRole("combobox", { name: "Diagram type" }).selectOption("component");
  await navigator.getByRole("textbox", { name: "Diagram name" }).fill("Architecture");
  await navigator.getByRole("button", { name: "Add to document" }).click();
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await page.getByRole("menu", { name: "Save" }).getByRole("menuitem", { name: "Save document", exact: true }).click();
  await expect(navigator.locator(".project-save-status")).toHaveText("Saved");
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Close Architecture", exact: true }).click();
  await navigator.getByRole("button", { name: "Rename Architecture", exact: true }).click();
  const rename = page.getByRole("dialog", { name: "Rename diagram" });
  await rename.getByRole("textbox", { name: "Name" }).fill("Architecture revised");
  await rename.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(navigator.locator(".project-save-status")).toHaveText("Unsaved changes");
  expect(
    await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(true);
  await navigator.getByRole("button", { name: "Close document", exact: true }).click();
  await expect(guard).toContainText("Original plan");
  await guard.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(navigator.getByText("Architecture revised", { exact: true })).toBeVisible();
  await create("Replacement plan");
  await guard.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(navigator.getByText("Original plan", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __guardSave: { fail: boolean } }).__guardSave.fail = true;
  });
  await create("Replacement plan");
  await guard.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText(/Document save failed:.*Disk unavailable/).first()).toBeVisible();
  await expect(navigator.getByText("Original plan", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __guardSave: { fail: boolean } }).__guardSave.fail = false;
  });
  await create("Replacement plan");
  await guard.getByRole("button", { name: "Save and continue" }).click();
  await expect(navigator.getByText("Replacement plan", { exact: true })).toBeVisible();
  const open = async () => {
    await page.getByRole("button", { name: "File", exact: true }).click();
    await page.getByRole("menuitem", { name: "Open", exact: true }).click();
    await page.getByRole("menu", { name: "Open" }).getByRole("menuitem", { name: "Document…" }).click();
  };
  await open();
  await guard.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(navigator.getByText("Replacement plan", { exact: true })).toBeVisible();
  await open();
  await guard.getByRole("button", { name: "Discard changes" }).click();
  await expect(navigator.getByText("Original plan", { exact: true })).toBeVisible();
  await expect(navigator.getByText("Architecture revised", { exact: true })).toBeVisible();
  await navigator.getByRole("button", { name: "Close document", exact: true }).click();
  await expect(guard).toHaveCount(0);
  await expect(navigator).toHaveCount(0);
  await create("Unsaved without file");
  await page.evaluate(() => {
    (window as unknown as { __guardSave: { cancel: boolean } }).__guardSave.cancel = true;
  });
  await create("Should not replace");
  await guard.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Document save cancelled. Your changes remain in the workspace.").first()).toBeVisible();
  await expect(navigator.getByText("Unsaved without file", { exact: true })).toBeVisible();
  await navigator.getByRole("button", { name: "Close document", exact: true }).click();
  await guard.getByRole("button", { name: "Discard changes" }).click();
  await expect(navigator).toHaveCount(0);
  await page.evaluate(() => {
    Object.assign((window as unknown as { __guardSave: object }).__guardSave, { cancel: false, pause: true });
  });
  await create("Old save in flight");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await page.getByRole("menu", { name: "Save" }).getByRole("menuitem", { name: "Save document", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean((window as unknown as { __guardSave: { finish?: () => void } }).__guardSave.finish)),
    )
    .toBe(true);
  await create("New unsaved plan");
  await guard.getByRole("button", { name: "Discard changes" }).click();
  await expect(navigator.getByText("New unsaved plan", { exact: true })).toBeVisible();
  await page.evaluate(() => (window as unknown as { __guardSave: { finish(): void } }).__guardSave.finish());
  await expect(navigator.getByRole("button", { name: "Cancel save" })).toHaveCount(0);
  await expect(navigator.locator(".project-save-status")).toHaveText("Unsaved changes");
  await expect(navigator.getByText("Save this document once to create a review baseline.")).toBeVisible();
});
