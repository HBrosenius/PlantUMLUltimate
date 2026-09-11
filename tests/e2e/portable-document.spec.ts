import { expect, test } from "@playwright/test";

test("saves and reopens a portable document with retained history", async ({ page }) => {
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
  await page.goto("/");
  const onboarding = page.getByRole("dialog", { name: "Choose a diagram type" });
  await onboarding
    .waitFor({ state: "visible", timeout: 2_000 })
    .then(() => onboarding.getByRole("button", { name: "Gantt diagram" }).click())
    .catch(() => undefined);

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await page.getByRole("menu", { name: "Save" }).getByRole("menuitem", { name: "Save diagram", exact: true }).click();
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
  await expect(page.locator('.document-tabs > button[title="round-trip.pumlu"]')).toHaveCount(2);
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Version history…" }).click();
  await expect(page.getByRole("dialog", { name: "Version history" })).toContainText("Saved portable document");
});
