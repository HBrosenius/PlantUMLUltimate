import { readFile } from "node:fs/promises";
import { expect, test, type Page, type Locator } from "@playwright/test";
import { prepareEditor, fillSource, readEditorSource } from "./editor-helpers";

const cases = [
  {
    name: "Gantt task",
    kind: "Gantt",
    source: (url: string) =>
      `@startgantt\nProject starts 2026-11-02\n[Build] as [build] lasts 3 days\n[build] links to [[${url} Build reference]]\n@endgantt`,
  },
  {
    name: "Sequence participant",
    kind: "Sequence",
    source: (url: string) =>
      `@startuml\nactor Customer [[${url}]]\nparticipant API\nCustomer -> API: Submit request\n@enduml`,
  },
  {
    name: "Sequence message",
    kind: "Sequence",
    source: (url: string) =>
      `@startuml\nactor Customer\nparticipant API\nCustomer -> API: [[${url} Open requirements]]\n@enduml`,
  },
  { name: "Class entity", kind: "Class", source: (url: string) => `@startuml\nclass Portal [[${url}]]\n@enduml` },
  {
    name: "WBS node",
    kind: "WBS",
    source: (url: string) => `@startwbs\n* [[${url} Product requirements]]\n** Research\n@endwbs`,
  },
  {
    name: "Component entity",
    kind: "Component",
    source: (url: string) => `@startuml\ncomponent Portal [[${url}]]\n@enduml`,
  },
  {
    name: "Use Case actor",
    kind: "Use Case",
    source: (url: string) => `@startuml\nactor Customer [[${url}]]\nusecase Review\nCustomer --> Review\n@enduml`,
  },
  {
    name: "Activity label",
    kind: "Activity",
    source: (url: string) => `@startuml\nstart\n:[[${url} Read requirements]];\nstop\n@enduml`,
  },
];

async function openSource(page: Page, kind: string, source: string) {
  await page.addInitScript(() =>
    window.addEventListener("message", (event) => {
      if (event.data?.type === "result" && typeof event.data.svg === "string")
        (window as typeof window & { linkRendererSvg?: string }).linkRendererSvg = event.data.svg;
    }),
  );
  await prepareEditor(page);
  if (kind !== "Gantt") {
    await page.getByRole("button", { name: "New diagram tab", exact: true }).click();
    await page.getByRole("button", { name: `${kind} diagram`, exact: true }).click();
  }
  if (kind === "Class")
    await page
      .getByRole("navigation", { name: "View mode" })
      .getByRole("button", { name: "Code", exact: true })
      .click();
  await fillSource(page, source);
  if (kind === "Class")
    await page
      .getByRole("navigation", { name: "View mode" })
      .getByRole("button", { name: "Split", exact: true })
      .click();
  await expect(page.getByText("Preview current", { exact: true })).toBeVisible();
}

// WebKit can report an anchor's content quad for its child text. Use native
// SVG geometry and check the actual hit target before a real mouse click.
async function clickSvgLink(page: Page, link: Locator, button: "left" | "middle" = "left") {
  await link.scrollIntoViewIfNeeded();
  const point = await link.evaluate((element) => {
    const graphic = element as SVGGraphicsElement;
    const box = graphic.getBBox(),
      matrix = graphic.getScreenCTM();
    if (!matrix) throw new Error("SVG link is not laid out");
    const p = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(matrix);
    return {
      x: p.x,
      y: p.y,
      expected: graphic.closest("a")?.getAttribute("href"),
      hit: document.elementFromPoint(p.x, p.y)?.closest("a")?.getAttribute("href"),
    };
  });
  expect(point.hit).toBe(point.expected);
  await page.mouse.click(point.x, point.y, { button });
}

for (const [index, item] of cases.entries()) {
  test(`${item.name} offers actions for real SVG links and opens a separate unlinked tab`, async ({
    page,
    context,
  }) => {
    const href = `https://example.test/review/${index}`;
    const source = item.source(href);
    await context.route("https://example.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Linked review</title><p>Review destination</p>",
      }),
    );
    await openSource(page, item.kind, source);
    await expect
      .poll(() => page.evaluate(() => (window as typeof window & { linkRendererSvg?: string }).linkRendererSvg ?? ""))
      .toContain(`href="${href}"`);
    const link = page.locator(`svg a[href="${href}"] text`).last();
    await expect(link).toBeVisible();
    expect(await link.evaluate((element) => getComputedStyle(element).cursor)).toBe("pointer");
    const editorUrl = page.url();
    const menu = page.getByRole("menu", { name: "Linked element" });
    await clickSvgLink(page, link);
    await expect(menu).toBeVisible();
    await expect(menu).toContainText(href);
    expect(context.pages()).toHaveLength(1);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    expect(page.url()).toBe(editorUrl);
    expect(await readEditorSource(page)).toBe(source);

    await clickSvgLink(page, link);
    const opened = context.waitForEvent("page");
    await menu.getByRole("menuitem", { name: "Open URL", exact: true }).click();
    const destination = await opened;
    await expect(destination).toHaveURL(href);
    await expect(destination).toHaveTitle("Linked review");
    expect(await destination.evaluate(() => window.opener)).toBeNull();
    expect(page.url()).toBe(editorUrl);
    expect(await readEditorSource(page)).toBe(source);
    await destination.close();

    if (item.kind === "Gantt") {
      const keyboardOpened = context.waitForEvent("page");
      await page.locator(`svg a[href="${href}"]`).first().press("Enter");
      await menu.getByRole("menuitem", { name: "Open URL", exact: true }).click();
      const keyboardDestination = await keyboardOpened;
      await expect(keyboardDestination).toHaveURL(href);
      expect(await readEditorSource(page)).toBe(source);
      await keyboardDestination.close();
      const middleOpened = context.waitForEvent("page");
      await clickSvgLink(page, link, "middle");
      await menu.getByRole("menuitem", { name: "Open URL", exact: true }).click();
      const middleDestination = await middleOpened;
      await expect(middleDestination).toHaveURL(href);
      expect(await readEditorSource(page)).toBe(source);
      await middleDestination.close();
    }
    if (item.kind !== "Activity") {
      await clickSvgLink(page, link);
      await menu.getByRole("menuitem", { name: "Open settings", exact: true }).click();
      await expect(menu).toBeHidden();
      await expect(page.locator('aside[aria-label$="inspector"]')).toBeVisible();
      expect(context.pages()).toHaveLength(1);
      expect(await readEditorSource(page)).toBe(source);
    }
    if (item.kind === "Class") {
      await page.getByRole("button", { name: "File", exact: true }).click();
      await page.getByRole("menuitem", { name: "Export", exact: true }).click();
      await page.getByRole("menuitem", { name: "Preview export…", exact: true }).click();
      await page.getByLabel("Format").selectOption("svg");
      const downloaded = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download SVG", exact: true }).click();
      const download = await downloaded;
      const svg = await readFile((await download.path())!, "utf8");
      expect(svg).toContain(`href="${href}"`);
    }
  });
}

test("mailto offers its destination without handing control to the editor", async ({ page }) => {
  const href = "mailto:team@example.test";
  const source = `@startuml\nclass Portal [[${href}]]\n@enduml`;
  await openSource(page, "Class", source);
  await page.evaluate(() => {
    window.open = (url, target, features) => {
      (window as typeof window & { openedLink?: unknown }).openedLink = { url, target, features };
      return null;
    };
  });
  await clickSvgLink(page, page.locator(`svg a[href="${href}"] text`).last());
  await page.getByRole("menuitem", { name: "Open URL", exact: true }).click();
  expect(await page.evaluate(() => (window as typeof window & { openedLink?: unknown }).openedLink)).toEqual({
    url: href,
    target: "_blank",
    features: "noopener,noreferrer",
  });
  expect(await readEditorSource(page)).toBe(source);
});

test("member links keep their own target and do not leak to an unlinked class", async ({ page }) => {
  const outer = "https://example.test/portal",
    inner = "https://example.test/specification";
  const source = `@startuml\nclass Portal [[${outer}]] {\n  [[${inner} Member reference]]\n}\nclass API\nPortal --> API\n@enduml`;
  await openSource(page, "Class", source);
  await expect(page.locator(`svg a[href="${inner}"] text`).last()).toBeVisible();
  expect(await page.locator("svg a a").count()).toBe(0);
  expect(
    await page
      .locator("svg text")
      .filter({ hasText: /^API$/ })
      .evaluateAll((nodes) => nodes.every((node) => !node.closest("a"))),
  ).toBe(true);
  await page.evaluate(() => {
    window.open = (url) => {
      (window as typeof window & { memberLink?: unknown }).memberLink = url;
      return null;
    };
  });
  await clickSvgLink(page, page.locator(`svg a[href="${inner}"] text`).last());
  await page.getByRole("menuitem", { name: "Open URL", exact: true }).click();
  expect(await page.evaluate(() => (window as typeof window & { memberLink?: unknown }).memberLink)).toBe(inner);
  expect(await readEditorSource(page)).toBe(source);
  await clickSvgLink(page, page.locator(`svg a[href="${inner}"] text`).last());
  await page.getByRole("menuitem", { name: "Open settings", exact: true }).click();
  await expect(page.locator('aside[aria-label$="inspector"]')).toBeVisible();
  expect(await readEditorSource(page)).toBe(source);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`linked task chooser supports dismissal and keyboard choices in ${colorScheme} mode`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    const href = "https://example.test/task-reference";
    await openSource(page, "Gantt", cases[0]!.source(href));
    const link = page.locator(`svg a[href="${href}"] text`).last();
    const menu = page.getByRole("menu", { name: "Linked element" });
    await clickSvgLink(page, link);
    await expect(menu.getByRole("menuitem", { name: "Open settings" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Open URL" })).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath(`link-menu-${colorScheme}.png`) });
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await clickSvgLink(page, link);
    await page.getByRole("button", { name: "Copy code", exact: true }).click();
    await expect(menu).toBeHidden();
    await clickSvgLink(page, link);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("complementary", { name: "Task inspector" })).toBeVisible();
    await expect(menu).toBeHidden();
    expect(await readEditorSource(page)).toBe(cases[0]!.source(href));
  });
}
