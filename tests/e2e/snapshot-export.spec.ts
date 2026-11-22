import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { expect, test } from "./coverage";
import { prepareEditor, setSource, source } from "./editor-helpers";

const percent = async (zoom: import("@playwright/test").Locator) => Number.parseInt((await zoom.textContent())!, 10);

test("exports a self-contained snapshot that opens offline with pan and zoom", async ({
  page,
  context,
  browser,
}, testInfo) => {
  await prepareEditor(page);
  await setSource(page, source("[Design] requires 5 days\n[Build] requires 8 days\n[Build] starts at [Design]'s end"));

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menu", { name: "Export" }).getByRole("menuitem", { name: "Snapshot (HTML)" }).click();
  await page.getByRole("dialog", { name: "Snapshot (HTML)" }).getByRole("button", { name: "Create snapshot" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.snapshot\.html$/);
  // Playwright stores downloads under a GUID without an extension, which browsers would show as plain text.
  const path = testInfo.outputPath(file.suggestedFilename());
  await file.saveAs(path);
  const html = readFileSync(path, "utf8");
  expect(html).toContain("Content-Security-Policy");
  expect(html).not.toContain("@startgantt");

  const viewer = await context.newPage();
  const fileUrl = pathToFileURL(path).href;
  const requests: string[] = [];
  viewer.on("request", (request) => requests.push(request.url()));
  const pageErrors: string[] = [];
  viewer.on("pageerror", (error) => pageErrors.push(error.message));
  await viewer.goto(fileUrl);

  await expect(viewer.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(viewer.getByText("Source SHA-256")).toBeVisible();
  await expect(viewer.getByText("Made with PlantUML Ultimate")).toBeVisible();
  const svg = viewer.locator("#snapshot-stage-1 svg");
  await expect(svg).toBeVisible();
  await expect(svg.locator("text").first()).toBeAttached();

  const zoom = viewer.locator("#snapshot-zoom-1");
  await expect(viewer.getByRole("button", { name: "Zoom in" })).toBeVisible();
  const fitted = (await zoom.textContent())!;
  await viewer.getByRole("button", { name: "Zoom in" }).click();
  await expect(zoom).not.toHaveText(fitted);
  const zoomedIn = await percent(zoom);
  expect(zoomedIn).toBeGreaterThan(Number.parseInt(fitted, 10));
  await viewer.getByRole("button", { name: "Zoom out" }).click();
  await viewer.getByRole("button", { name: "Zoom out" }).click();
  expect(await percent(zoom)).toBeLessThan(zoomedIn);
  await viewer.keyboard.press("0");
  await expect(zoom).toHaveText(fitted);
  await viewer.keyboard.press("-");
  expect(await percent(zoom)).toBeLessThan(Number.parseInt(fitted, 10));
  await viewer.getByRole("button", { name: "Fit to view" }).click();
  await expect(zoom).toHaveText(fitted);

  const box = (await viewer.locator("#snapshot-stage-1").boundingBox())!;
  const before = (await svg.boundingBox())!;
  await viewer.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await viewer.mouse.down();
  await viewer.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 4 });
  await viewer.mouse.up();
  const after = (await svg.boundingBox())!;
  expect(Math.round(after.x - before.x)).toBe(40);

  expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(requests.filter((url) => url !== fileUrl)).toEqual([]);

  const phone = await context.newPage();
  await phone.setViewportSize({ width: 375, height: 700 });
  await phone.goto(fileUrl);
  await expect(phone.locator("#snapshot-stage-1 svg")).toBeVisible();
  expect(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await phone.close();

  const plain = await browser.newContext({ javaScriptEnabled: false });
  const noScript = await plain.newPage();
  await noScript.goto(fileUrl);
  await expect(noScript.locator("#snapshot-stage-1 svg")).toBeVisible();
  await expect(noScript.getByRole("heading", { level: 1 })).toBeVisible();
  await plain.close();
});

test("exports a whole document with contents, in-page links and one stage per diagram", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90_000);
  await prepareEditor(page);
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "New", exact: true }).click();
  await page.getByRole("menu", { name: "New" }).getByRole("menuitem", { name: "Document…" }).click();
  const create = page.getByRole("dialog", { name: "New document" });
  await create.getByLabel("Name").fill("Release plan");
  await create.getByRole("button", { name: "Create document" }).click();
  const navigator = page.getByRole("complementary", { name: "Document navigator" });
  async function addDiagram(kind: string, title: string, text: string) {
    await navigator.getByRole("button", { name: "Add diagram", exact: true }).click();
    await navigator.getByLabel("Diagram type").selectOption(kind);
    await navigator.getByLabel("Diagram name").fill(title);
    await navigator.getByRole("button", { name: "Add to document" }).click();
    await setSource(page, text);
  }
  await addDiagram("gantt", "Schedule", "@startgantt\nProject starts 2026-09-01\n[Build] lasts 3 days\n@endgantt");
  await addDiagram("wbs", "Scope", "@startwbs\n* Scope\n** Build\n@endwbs");
  await addDiagram(
    "sequence",
    "Handover",
    "@startuml\nactor Customer\nparticipant API\nCustomer -> API: [[#Scope Open the scope]]\nAPI -> Customer: [[https://example.com/docs Read the docs]]\n@enduml",
  );
  await navigator.getByRole("button", { name: "Close document navigator" }).click();

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export" }).click();
  await page.getByRole("menu", { name: "Export" }).getByRole("menuitem", { name: "Snapshot (HTML)" }).click();
  const dialog = page.getByRole("dialog", { name: "Snapshot (HTML)" });
  await expect(dialog.getByRole("radio", { name: /Whole document \(\d+ diagrams\)/ })).toBeChecked();
  const count = Number.parseInt(/\((\d+) diagrams\)/.exec((await dialog.textContent()) ?? "")![1]!, 10);
  expect(count).toBe(3);
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Create snapshot" }).click();
  const file = await download;
  await expect(dialog).toBeHidden();
  const path = testInfo.outputPath(file.suggestedFilename());
  await file.saveAs(path);
  const html = readFileSync(path, "utf8");
  // One CSP, one inline script, and none of the diagram source text.
  expect(html.match(/<script\b[^>]*>/gi)).toHaveLength(1);
  expect(html).not.toContain("@startuml");
  expect(html).not.toContain("@startwbs");

  const viewer = await context.newPage();
  const fileUrl = pathToFileURL(path).href;
  const requests: string[] = [];
  viewer.on("request", (request) => requests.push(request.url()));
  const pageErrors: string[] = [];
  viewer.on("pageerror", (error) => pageErrors.push(error.message));
  await viewer.setViewportSize({ width: 1100, height: 800 });
  await viewer.goto(fileUrl);

  await expect(viewer.getByRole("heading", { level: 1 })).toHaveText("Release plan");
  const contents = viewer.getByRole("navigation", { name: "Contents" });
  await expect(contents.getByRole("link")).toHaveCount(count);
  await expect(contents.getByRole("link", { name: "Scope" })).toBeVisible();
  await expect(contents.getByRole("link", { name: "Handover" })).toBeVisible();
  await expect(viewer.locator("section.diagram")).toHaveCount(count);
  await expect(viewer.locator(".stage svg")).toHaveCount(count);
  await expect(viewer.locator(".tools:not([hidden])")).toHaveCount(count);

  // Zooming one diagram leaves the others alone.
  const zoomLabels = viewer.locator(".tools output");
  const before = await zoomLabels.allTextContents();
  await viewer.locator("#diagram-2 .tools").getByRole("button", { name: "Zoom in" }).click();
  const after = await zoomLabels.allTextContents();
  expect(after[1]).not.toBe(before[1]);
  expect(after.filter((_, index) => index !== 1)).toEqual(before.filter((_, index) => index !== 1));

  // The link inside the Handover diagram jumps to the Scope section.
  const scope = viewer.locator("section.diagram", { has: viewer.getByRole("heading", { name: "Scope" }) });
  const scopeId = await scope.getAttribute("id");
  const handover = viewer.locator("section.diagram", { has: viewer.getByRole("heading", { name: "Handover" }) });
  const jump = handover.locator(".stage a[href^='#diagram-']");
  await expect(jump).toHaveCount(1);
  expect(await jump.getAttribute("href")).toBe(`#${scopeId}`);
  // Playwright's WebKit reports an SVG element's box without the stage's zoom, so a locator click lands
  // on another shape; aim with the browser's own rectangle instead.
  const label = jump.locator("text").first();
  await label.scrollIntoViewIfNeeded();
  const point = await label.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  await viewer.mouse.click(point.x, point.y);
  await expect(viewer).toHaveURL(new RegExp(`#${scopeId}$`));
  // External links keep the S1 rules.
  const external = handover.locator(".stage a[href^='https://']");
  await expect(external).toHaveAttribute("rel", "noopener noreferrer");
  await expect(external).toHaveAttribute("target", "_blank");
  await contents.getByRole("link", { name: "Handover" }).click();
  await expect(viewer).toHaveURL(/#diagram-\d+$/);

  expect(pageErrors).toEqual([]);
  expect(requests.filter((url) => !url.startsWith(fileUrl))).toEqual([]);

  const phone = await context.newPage();
  await phone.setViewportSize({ width: 375, height: 700 });
  await phone.goto(fileUrl);
  await expect(phone.locator(".stage svg").first()).toBeVisible();
  const menu = phone.locator(".toc-menu");
  await expect(menu).toBeVisible();
  await expect(phone.locator(".toc-list")).toBeHidden();
  await menu.locator("summary").click();
  await expect(menu.getByRole("link", { name: "Handover" })).toBeVisible();
  expect(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await phone.close();
});

test("shows Gantt task details on hover, keyboard focus and tap, and lists them in a table", async ({
  page,
  context,
}, testInfo) => {
  await prepareEditor(page);
  await setSource(
    page,
    source("[Design] requires 5 days\n[Build] requires 8 days and is 40% completed\n[Build] starts at [Design]'s end"),
  );
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menu", { name: "Export" }).getByRole("menuitem", { name: "Snapshot (HTML)" }).click();
  await page.getByRole("dialog", { name: "Snapshot (HTML)" }).getByRole("button", { name: "Create snapshot" }).click();
  const file = await download;
  const path = testInfo.outputPath(file.suggestedFilename());
  await file.saveAs(path);

  const viewer = await context.newPage();
  const fileUrl = pathToFileURL(path).href;
  const requests: string[] = [];
  viewer.on("request", (request) => requests.push(request.url()));
  const pageErrors: string[] = [];
  viewer.on("pageerror", (error) => pageErrors.push(error.message));
  await viewer.goto(fileUrl);

  // The table carries every task's details, and reads without the card.
  const table = viewer.locator(".task-details");
  await table.locator("summary").click();
  const buildRow = table.locator("tr[data-task]").filter({ has: viewer.getByRole("rowheader", { name: "Build" }) });
  await expect(buildRow).toContainText("40%");
  await expect(buildRow).toContainText("Design");

  const card = viewer.locator("#snapshot-card-1");
  await expect(card).toBeHidden();
  const build = viewer.locator("#snapshot-stage-1 [data-task-id][role='button'][aria-label='Build']");
  await expect(build).toBeAttached();
  // Aim with the browser's own rectangle: Playwright's WebKit reports SVG boxes without the stage's zoom.
  const centre = () =>
    build.evaluate((element) => {
      const box = (element.querySelector(".bar") ?? element).getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    });

  let point = await centre();
  await viewer.mouse.move(point.x, point.y);
  await expect(card).toBeVisible();
  await expect(card).toContainText("Build");
  await expect(card).toContainText("Progress");
  await expect(card).toContainText("40%");
  await viewer.mouse.move(2, 2);
  await expect(card).toBeHidden();

  // Keyboard: the task takes focus and describes itself with the card; Escape closes it.
  await build.focus();
  await expect(card).toBeVisible();
  await expect(build).toHaveAttribute("aria-describedby", "snapshot-card-1");
  await viewer.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await viewer.locator("h1").click();

  // A tap (press and release without moving) pins the card; a tap elsewhere closes it.
  point = await centre();
  await viewer.mouse.move(point.x, point.y);
  await viewer.mouse.down();
  await viewer.mouse.up();
  await viewer.mouse.move(2, 2);
  await expect(card).toBeVisible();
  await expect(card).toContainText("40%");
  const stage = (await viewer.locator("#snapshot-stage-1").boundingBox())!;
  await viewer.mouse.click(stage.x + stage.width - 6, stage.y + stage.height - 6);
  await expect(card).toBeHidden();

  await viewer.setViewportSize({ width: 375, height: 740 });
  expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(requests.filter((url) => !url.startsWith(fileUrl))).toEqual([]);
});

test("includes the PlantUML source only when asked, as a copy and a .puml download", async ({
  page,
  context,
}, testInfo) => {
  await prepareEditor(page);
  await setSource(page, source("[Design] requires 5 days\n[Build] requires 8 days"));
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export" }).click();
  await page.getByRole("menu", { name: "Export" }).getByRole("menuitem", { name: "Snapshot (HTML)" }).click();
  const dialog = page.getByRole("dialog", { name: "Snapshot (HTML)" });
  const option = dialog.getByRole("checkbox", { name: "Include PlantUML source" });
  await expect(option).not.toBeChecked();
  await option.check();
  await expect(dialog).toContainText("including notes and comments");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Create snapshot" }).click();
  const file = await download;
  const path = testInfo.outputPath(file.suggestedFilename());
  await file.saveAs(path);
  expect(readFileSync(path, "utf8")).toContain("[Build] requires 8 days");

  const viewer = await context.newPage();
  const fileUrl = pathToFileURL(path).href;
  const requests: string[] = [];
  viewer.on("request", (request) => requests.push(request.url()));
  await viewer.goto(fileUrl);
  await expect(viewer.getByText("Includes PlantUML source")).toBeVisible();
  const block = viewer.locator("details.source");
  await block.locator("summary").click();
  await expect(block.locator("pre")).toContainText("@startgantt");
  await expect(block.locator("pre")).toContainText("[Build] requires 8 days");
  const saved = viewer.waitForEvent("download");
  await block.getByRole("link", { name: "Download source (.puml)" }).click();
  const puml = await saved;
  expect(puml.suggestedFilename()).toMatch(/\.puml$/);
  const pumlPath = testInfo.outputPath(puml.suggestedFilename());
  await puml.saveAs(pumlPath);
  expect(readFileSync(pumlPath, "utf8")).toContain("[Build] requires 8 days");
  // The download is a data: link, so nothing leaves the machine.
  expect(requests.filter((url) => !url.startsWith(fileUrl) && !url.startsWith("data:"))).toEqual([]);
});
