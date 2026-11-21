import type { Page } from "@playwright/test";
import { expect, test } from "./coverage";
import { readEditorSource, setSource } from "./editor-helpers";

/** A fake file picker that keeps the saved bytes in memory and hands them back on open. */
async function installFilePicker(page: Page) {
  await page.addInitScript(() => {
    let bytes = new Uint8Array();
    const handle = {
      name: "round-trip.pumlu",
      getFile: async () => new File([bytes], "round-trip.pumlu", { type: "application/octet-stream" }),
      createWritable: async () => ({
        write: async (data: string | Uint8Array | Blob) => {
          bytes =
            typeof data === "string"
              ? new TextEncoder().encode(data)
              : data instanceof Blob
                ? new Uint8Array(await data.arrayBuffer())
                : Uint8Array.from(data);
          (window as Window & { portableBytes?: Uint8Array }).portableBytes = bytes;
        },
        close: async () => undefined,
      }),
    };
    Object.assign(window, {
      showSaveFilePicker: async () => handle,
      showOpenFilePicker: async () => [handle],
    });
  });
}

async function openChooser(page: Page) {
  await page.goto("/");
  const welcome = page.getByRole("dialog", { name: "Welcome to PlantUML Ultimate" });
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await Promise.race([welcome.waitFor({ state: "visible" }), chooser.waitFor({ state: "visible" })]);
  if (await welcome.isVisible()) await welcome.getByRole("button", { name: "Get started" }).click();
  return chooser;
}

test("saves and reopens a portable document with retained history", async ({ page }) => {
  await installFilePicker(page);
  const chooser = await openChooser(page);
  await chooser.getByRole("button", { name: "Gantt diagram" }).click();
  await chooser.getByRole("button", { name: "Create diagram", exact: true }).click();

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        new TextDecoder().decode((window as Window & { portableBytes?: Uint8Array }).portableBytes?.slice(0, 8)),
      ),
    )
    .toBe("PUMLUDOC");

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open", exact: true }).click();
  await page.getByRole("menu", { name: "Open" }).getByRole("menuitem", { name: "Diagram…" }).click();
  await expect(page.locator('.document-tab > button[title*="File: round-trip.pumlu"]')).toHaveCount(2);
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  await expect(page.getByRole("dialog", { name: "Version history" })).toContainText("Saved portable document");
});

test("saves and reopens a mindmap with its kind, sides and direction", async ({ page }) => {
  test.setTimeout(90_000);
  await installFilePicker(page);
  const chooser = await openChooser(page);
  await chooser.getByRole("button", { name: "Mindmap", exact: true }).click();
  await chooser.getByRole("button", { name: "Create diagram", exact: true }).click();
  const source = [
    "@startmindmap",
    "top to bottom direction",
    "* Root",
    "** One",
    "++ Right",
    "-- Left",
    "**_ Boxless",
    "@endmindmap",
  ].join("\n");
  await setSource(page, source);
  await expect(page.locator(".mindmap-diagram svg")).toBeVisible({ timeout: 45_000 });

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        new TextDecoder().decode((window as Window & { portableBytes?: Uint8Array }).portableBytes?.slice(0, 8)),
      ),
    )
    .toBe("PUMLUDOC");

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open", exact: true }).click();
  await page.getByRole("menu", { name: "Open" }).getByRole("menuitem", { name: "Diagram…" }).click();
  await expect(page.locator('.document-tab > button[title*="File: round-trip.pumlu"]')).toHaveCount(2);
  // The reopened tab is still a mindmap: it is drawn as one and keeps every line of its source.
  await expect.poll(() => readEditorSource(page)).toBe(source);
  await expect(page.locator(".mindmap-diagram svg")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("text[data-mindmap-node-id]")).toHaveCount(5, { timeout: 45_000 });
});
