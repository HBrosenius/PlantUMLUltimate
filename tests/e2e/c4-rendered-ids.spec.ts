import { expect, test, type Page } from "./coverage";
import { prepareEditor } from "./editor-helpers";

async function createC4(page: Page, level: string) {
  await page.getByRole("button", { name: "New diagram tab", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Choose a diagram type" });
  await dialog.getByRole("button", { name: "C4 diagram", exact: true }).click();
  await dialog.getByLabel("C4 diagram type").selectOption(level);
  await dialog.getByRole("button", { name: "Create diagram", exact: true }).click();
  await expect(dialog).toBeHidden();
}

/** Records what the C4 id resolver says about the shape under the next real click. */
async function recordNextClick(page: Page) {
  await page.evaluate(async () => {
    const modulePath = "/src/c4-rendered-ids.ts";
    const { c4RenderedTarget } = await import(modulePath);
    const slot = window as unknown as { __c4Click?: unknown };
    slot.__c4Click = undefined;
    document.addEventListener(
      "click",
      (event) => {
        slot.__c4Click = c4RenderedTarget(event.target as Element) ?? null;
      },
      { capture: true, once: true },
    );
  });
}
const recorded = (page: Page) => page.evaluate(() => (window as unknown as { __c4Click?: unknown }).__c4Click);

test("clicking a rendered C4 Container shape resolves to its source alias, boundary and relationship ends", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await prepareEditor(page);
  await createC4(page, "container");
  const svg = page.locator(".c4-preview svg").first();
  await expect(svg).toContainText("Web app", { timeout: 45_000 });

  // The engine's own markup names the alias; no label matching is involved.
  await expect(svg.locator('g.entity[data-qualified-name="shop.api"]')).toHaveCount(1);

  await recordNextClick(page);
  await svg.locator('g.entity[data-qualified-name="shop.api"]').click({ force: true });
  expect(await recorded(page)).toEqual({ kind: "element", alias: "api", path: ["shop"] });

  await recordNextClick(page);
  await svg.locator('g.entity[data-qualified-name="customer"]').click({ force: true });
  expect(await recorded(page)).toEqual({ kind: "element", alias: "customer", path: [] });

  await recordNextClick(page);
  await svg
    .locator("g.cluster")
    .first()
    .click({ position: { x: 20, y: 6 }, force: true });
  expect(await recorded(page)).toEqual({ kind: "boundary", alias: "shop", path: [] });

  // The first relationship of the starter is Rel(customer, web, ...).
  await recordNextClick(page);
  await svg.locator("g.link").first().locator("path").first().dispatchEvent("click");
  expect(await recorded(page)).toEqual({ kind: "relationship", from: "customer", to: "web", index: 0, pairIndex: 0 });
});
