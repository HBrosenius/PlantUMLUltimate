import { expect, test } from "@playwright/test";
import { prepareEditor } from "./editor-helpers";

type SaveHarness = { mode: string; bytes(): number[]; finish?: () => void; aborted: number };

test("failed and cancelled project saves preserve changes and allow retry", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    let committed = new Uint8Array();
    const state: SaveHarness = { mode: "ok", bytes: () => [...committed], aborted: 0 };
    const handle = {
      name: "safe-project.pumlu",
      getFile: async () => new File([committed], "safe-project.pumlu"),
      createWritable: async () => {
        if (state.mode === "permission") throw new DOMException("Write permission denied", "NotAllowedError");
        let staged = committed;
        return {
          write: async (data: Uint8Array | Blob) => {
            if (state.mode === "write") throw new Error("Disk write failed");
            staged = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : Uint8Array.from(data);
          },
          close: async () => {
            if (state.mode === "close") throw new Error("Disk commit failed");
            if (state.mode === "pending")
              await new Promise<void>((resolve) => {
                state.finish = resolve;
              });
            committed = staged;
          },
          abort: async () => {
            state.aborted++;
          },
        };
      },
    };
    Object.assign(window, {
      __saveHarness: state,
      showSaveFilePicker: async () => {
        if (state.mode === "cancel") throw new DOMException("Picker cancelled", "AbortError");
        return handle;
      },
    });
  });
  await prepareEditor(page);
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "New", exact: true }).click();
  await page.getByRole("menu", { name: "New" }).getByRole("menuitem", { name: "Document…" }).click();
  await page.getByRole("dialog", { name: "New document" }).getByRole("button", { name: "Create document" }).click();
  const navigator = page.getByRole("complementary", { name: "Document navigator" });
  const add = async (name: string) => {
    await navigator.getByRole("button", { name: "Add diagram" }).click();
    await navigator.getByRole("combobox", { name: "Diagram type" }).selectOption("component");
    await navigator.getByRole("textbox", { name: "Diagram name" }).fill(name);
    await navigator.getByRole("button", { name: "Add to document" }).click();
  };
  const save = async (saveAs = false) => {
    await page.getByRole("button", { name: "File", exact: true }).click();
    await page
      .getByRole("menuitem", {
        name: saveAs ? "Save as…" : "Save",
        exact: true,
      })
      .click();
  };
  const mode = (value: string) =>
    page.evaluate((value) => {
      (window as unknown as { __saveHarness: SaveHarness }).__saveHarness.mode = value;
    }, value);
  const bytes = () => page.evaluate(() => (window as unknown as { __saveHarness: SaveHarness }).__saveHarness.bytes());
  await add("Architecture");
  await add("Deployment");
  await save();
  await expect(navigator.locator(".project-save-status")).toHaveText("Saved");
  const previousFile = await bytes();
  await add("Operations");
  for (const failure of ["permission", "write", "close"]) {
    await mode(failure);
    await save();
    await expect(page.getByText(/Document save failed:.*Retry Save/).first()).toBeVisible();
    await expect(navigator.locator(".project-save-status")).toHaveText("Unsaved changes");
    await expect(navigator.getByText("3 diagrams · 0 connections")).toBeVisible();
    expect(await bytes()).toEqual(previousFile);
  }
  await mode("cancel");
  await save(true);
  await expect(page.getByText("Document save cancelled. Your changes remain in the workspace.").first()).toBeVisible();
  expect(await bytes()).toEqual(previousFile);
  await expect(navigator.locator(".project-save-status")).toHaveText("Unsaved changes");
  await mode("write");
  await save(true);
  await expect(page.getByText(/Document Save As failed:.*Retry Save As/).first()).toBeVisible();
  expect(await bytes()).toEqual(previousFile);
  await mode("pending");
  await save();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean((window as unknown as { __saveHarness: SaveHarness }).__saveHarness.finish)),
    )
    .toBe(true);
  await expect(navigator.locator(".project-save-status")).toHaveText("Unsaved changes");
  expect(await bytes()).toEqual(previousFile);
  await page.evaluate(() => (window as unknown as { __saveHarness: SaveHarness }).__saveHarness.finish!());
  await expect(navigator.locator(".project-save-status")).toHaveText("Saved");
  expect(await bytes()).not.toEqual(previousFile);
  expect(errors).toEqual([]);
});
