import { expect, test } from "@playwright/test";
import { prepareEditor, setSource, source } from "./editor-helpers";

test("reviews project changes against the last successful save and exports a report", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    let bytes = new Uint8Array();
    const handle = {
      name: "review-project.pumlu",
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
      getFile: async () => new File([bytes], "review-project.pumlu", { type: "application/octet-stream" }),
    };
    Object.assign(window, { showSaveFilePicker: async () => handle });
  });
  await prepareEditor(page);

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "New", exact: true }).click();
  await page.getByRole("menu", { name: "New" }).getByRole("menuitem", { name: "Project…" }).click();
  const projectDialog = page.getByRole("dialog", { name: "New project" });
  await projectDialog.getByRole("textbox", { name: "Name" }).fill("Review project");
  await projectDialog.getByRole("button", { name: "Create project" }).click();

  const navigator = page.getByRole("complementary", { name: "Project navigator" });
  await expect(navigator.getByText("Save this project once to create a review baseline.")).toBeVisible();
  await navigator.getByRole("button", { name: "Add diagram" }).click();
  await navigator.getByRole("textbox", { name: "Diagram name" }).fill("Delivery");
  await navigator.getByRole("button", { name: "Add to project" }).click();

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await page.getByRole("menu", { name: "Save" }).getByRole("menuitem", { name: "Save project", exact: true }).click();
  // The project save round-trip (mocked File System Access write + IndexedDB persistence) can
  // run well past the default expect timeout on a loaded CI runner — this shard's other tests
  // were all running 2-3x slower than their local baseline when this was observed failing, not
  // just this assertion — so give it more room rather than the default.
  await expect(navigator.getByText("Saved", { exact: true })).toBeVisible({ timeout: 60_000 });

  await setSource(page, source("[Backend] lasts 2 days"));
  await navigator.getByRole("button", { name: "Review", exact: true }).click();
  await expect(navigator.getByText("source", { exact: true })).toBeVisible();
  await expect(navigator.getByText(/Semantic review/)).toBeVisible();

  const download = page.waitForEvent("download");
  await navigator.getByRole("button", { name: "Export review report" }).click();
  await expect((await download).suggestedFilename()).toBe("Review-project-review.html");
});
