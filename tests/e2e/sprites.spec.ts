import { expect, test, type Page } from "./coverage";
import { fillSource, prepareEditor } from "./editor-helpers";

async function createC4(page: Page) {
  await page.getByRole("button", { name: "New diagram tab", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Choose a diagram type" });
  await dialog.getByRole("button", { name: "C4 diagram", exact: true }).click();
  await dialog.getByRole("button", { name: "Create diagram", exact: true }).click();
  await expect(dialog).toBeHidden();
}

const gray = Array.from({ length: 8 }, (_, y) =>
  Array.from({ length: 8 }, (_, x) => "048CF"[(x + y) % 5]).join(""),
).join("\n");

/** A raster sprite is drawn by the engine as an <image> holding a PNG data: URL. */
const pngImageCount = (page: Page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll(".diagram svg image")].filter((image) =>
        image.getAttribute("href")?.startsWith("data:image/png;base64,"),
      ).length,
  );

test("a C4 person keeps its default icon", async ({ page }) => {
  test.setTimeout(90_000);
  await prepareEditor(page);
  await createC4(page);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) requests.push(new URL(request.url()).hostname);
  });
  await fillSource(
    page,
    [
      "@startuml",
      "!include <C4/C4_Container>",
      'Person(user, "Customer", "Buys things")',
      'Container(web, "Web app", "TypeScript")',
      'Rel(user, web, "Uses")',
      "@enduml",
    ].join("\n"),
  );
  await expect.poll(() => pngImageCount(page), { timeout: 45_000 }).toBe(1);
  await expect(page.locator(".diagram svg")).toContainText("Customer");
  await expect(page.locator(".render-notice.error")).toHaveCount(0);
  expect(requests.filter((host) => host !== "127.0.0.1")).toEqual([]);
});

test("inline grayscale and SVG sprites render", async ({ page }) => {
  test.setTimeout(90_000);
  await prepareEditor(page);
  await createC4(page);
  await fillSource(
    page,
    [
      "@startuml",
      `sprite $gray [8x8/16] {\n${gray}\n}`,
      'sprite $dot <svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="7" fill="#d33"/></svg>',
      'rectangle "<$gray> raster" as A',
      'rectangle "<$dot> vector" as B',
      "A --> B",
      "@enduml",
    ].join("\n"),
  );
  await expect.poll(() => pngImageCount(page), { timeout: 45_000 }).toBe(1);
  // The engine draws an SVG sprite as vector shapes, not as an image; the circle may come back as a path.
  await expect.poll(() => page.locator(".diagram svg").innerHTML()).toMatch(/#(?:d33|dd3333)/i);
  await expect(page.locator(".diagram svg")).toContainText("raster");
  await expect(page.locator(".render-notice.error")).toHaveCount(0);
});
