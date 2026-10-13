import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fillSource, prepareEditor, readEditorSource, waitForDiagramRender } from "./editor-helpers";
async function open(page: Parameters<typeof prepareEditor>[0], name: string) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
test("renders edited Code-view source before allowing an image download", async ({ page }) => {
  test.setTimeout(90_000);
  await prepareEditor(page);
  await waitForDiagramRender(page);
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await fillSource(page, "@startgantt\n[Latest export revision] lasts 3 days\n@endgantt");
  await open(page, "Preview export…");
  const dialog = page.getByRole("dialog", { name: "Export preview", exact: true });
  for (const format of ["svg", "png", "pdf"]) {
    await dialog.getByRole("combobox", { name: "Format", exact: true }).selectOption(format);
    await expect(dialog.getByRole("button", { name: `Download ${format.toUpperCase()}` })).toBeDisabled();
  }
  await dialog.getByRole("button", { name: "Render current source" }).click();
  await expect(dialog.getByText("Preview matches the current successfully rendered source.")).toBeVisible({
    timeout: 45_000,
  });
  await dialog.getByRole("combobox", { name: "Format", exact: true }).selectOption("svg");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download SVG" }).click();
  expect(readFileSync((await (await download).path())!, "utf8")).toContain("Latest export revision");
});

test("explains failed renders and disables every image format while retaining the previous preview", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await prepareEditor(page);
  await waitForDiagramRender(page);
  await fillSource(page, "@startgantt\n[Broken] starts nope\n@endgantt");
  await expect(page.locator(".preview")).toHaveAttribute("data-render-status", "error", { timeout: 45_000 });
  await open(page, "Preview export…");
  const dialog = page.getByRole("dialog", { name: "Export preview", exact: true });
  await expect(dialog).toContainText("The image below is the last successful diagram");
  await expect(dialog.getByRole("alert")).toBeVisible();
  for (const format of ["svg", "png", "pdf"]) {
    await dialog.getByRole("combobox", { name: "Format", exact: true }).selectOption(format);
    await expect(dialog.getByRole("button", { name: `Download ${format.toUpperCase()}` })).toBeDisabled();
  }
  await dialog.getByRole("button", { name: "Retry rendering" }).click();
  await expect(dialog.getByRole("button", { name: "Retry rendering" })).toBeVisible({ timeout: 45_000 });
  await expect(dialog.getByRole("button", { name: "Download PDF" })).toBeDisabled();
});
test("previews and downloads all formats, remembers preferences and preserves source", async ({ page }) => {
  await prepareEditor(page);
  await waitForDiagramRender(page);
  const source = await readEditorSource(page);
  await open(page, "Preview export…");
  const dialog = page.getByRole("dialog", { name: "Export preview", exact: true });
  await expect(dialog.getByRole("img")).toBeVisible();
  await dialog.getByRole("combobox", { name: "Margin", exact: true }).selectOption("32");
  await dialog.getByRole("combobox", { name: "Background", exact: true }).selectOption("white");
  for (const format of ["svg", "png", "pdf"]) {
    await dialog.getByRole("combobox", { name: "Format", exact: true }).selectOption(format);
    const downloaded = page.waitForEvent("download");
    await dialog.getByRole("button", { name: `Download ${format.toUpperCase()}`, exact: true }).click();
    const file = await downloaded;
    expect(file.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));
    const bytes = readFileSync((await file.path())!);
    if (format === "svg") expect(bytes.toString()).toContain('fill="#ffffff"');
    if (format === "png") expect(bytes.subarray(1, 4).toString()).toBe("PNG");
    if (format === "pdf") expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  }
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  expect(await readEditorSource(page)).toBe(source);
  await open(page, "Preview export…");
  await expect(dialog.getByRole("combobox", { name: "Margin", exact: true })).toHaveValue("32");
  await expect(dialog.getByRole("combobox", { name: "Format", exact: true })).toHaveValue("pdf");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeInViewport();
  await page.screenshot({ path: "test-results/a25-export-phone.png" });
});
test("generates disclosed source links locally without contacting renderer", async ({ page }) => {
  await prepareEditor(page);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("example.com")) requests.push(request.url());
  });
  await open(page, "Link and embed…");
  const dialog = page.getByRole("dialog", { name: "Link and embed sharing", exact: true });
  await dialog.getByLabel("Renderer base URL", { exact: true }).fill("https://example.com/plantuml");
  await expect(dialog.getByRole("button", { name: "Generate link locally" })).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Generate link locally" }).click();
  await expect(dialog.getByLabel("Encoded image URL", { exact: true })).toHaveValue(
    /^https:\/\/example.com\/plantuml\/svg\/~h/,
  );
  await expect(dialog.getByLabel("Markdown image", { exact: true })).toHaveValue(/^!\[Diagram\]\(https:/);
  expect(requests).toEqual([]);
  await page.screenshot({ path: "test-results/a25-share.png" });
  await dialog.getByLabel("Renderer base URL", { exact: true }).fill("http://example.com");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Generate link locally" }).click();
  await expect(dialog.getByRole("status")).toContainText("HTTPS");
  await expect(dialog.getByLabel("Encoded image URL", { exact: true })).toHaveCount(0);
});
