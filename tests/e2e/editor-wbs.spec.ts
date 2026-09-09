import { expect, test } from "@playwright/test";
import { pointInText, prepareEditor, setSource } from "./editor-helpers";

test.beforeEach(async ({ page }) => {
  await prepareEditor(page);
});

test("highlights, finds, and renames WBS node aliases", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "WBS diagram" })
    .click();
  await setSource(
    page,
    "@startwbs\n*(project) Project\n**(plan) Plan\n**(deliver) Deliver\nplan -> deliver #Blue\n@endwbs",
  );

  const aliasReference = await pointInText(page, 4, "plan");
  await page.mouse.click(aliasReference.x, aliasReference.y);
  await expect(page.locator(".cm-symbol-reference")).toHaveCount(3);
  await expect(page.getByRole("complementary", { name: "WBS node inspector" })).toHaveCount(0);
  await page.mouse.click(aliasReference.x, aliasReference.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Find references" }).click();
  const references = page.getByRole("complementary", { name: "References for plan" });
  await expect(references).toContainText("3 occurrences");
  await references.getByRole("button", { name: "Close references" }).click();

  await page.mouse.click(aliasReference.x, aliasReference.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Rename…" }).click();
  const rename = page.getByRole("dialog", { name: "Rename WBS node alias" });
  await expect(rename).toContainText("2 semantic occurrences");
  await rename.getByLabel("New name").fill("planning");
  await rename.getByRole("button", { name: "Rename" }).click();
  await expect(page.locator(".cm-content")).toContainText("**(planning) Plan");
  await expect(page.locator(".cm-content")).toContainText("planning -> deliver #Blue");
});

test("creates and visually edits a WBS diagram", async ({ page, browserName }) => {
  test.skip(
    browserName === "webkit",
    "WebKit automation does not preserve SVG pointer identity across compound WBS drags",
  );
  test.setTimeout(60_000);
  await page.getByRole("button", { name: "New document tab" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  const choice = chooser.getByRole("button", { name: "WBS diagram" });
  await expect(choice.getByText("Beta", { exact: true })).toBeVisible();
  await choice.click();
  await expect(page.getByRole("region", { name: "WBS diagram preview" })).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText("@startwbs");
  await expect(page.locator(".wbs-diagram svg")).toBeVisible({ timeout: 20_000 });
  const design = page.locator("[data-wbs-node-id]").filter({ hasText: "Design" }).first();
  await expect(design).toBeVisible();
  await design.focus();
  await page.keyboard.press("Enter");
  const inspector = page.getByRole("complementary", { name: "WBS node inspector" });
  await inspector.getByLabel("Label").fill("Experience design");
  await inspector.getByLabel("Background color", { exact: true }).fill("LightBlue");
  await inspector.getByLabel("Text color", { exact: true }).fill("DarkBlue");
  await inspector.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("**[#LightBlue] <color:#DarkBlue>Experience design</color>");
  const movedDesign = page.locator("text[data-wbs-node-id]", { hasText: "Experience design" }).first();
  const discovery = page.locator("text[data-wbs-node-id]", { hasText: "Discovery" }).first();
  const from = await movedDesign.boundingBox();
  const to = await discovery.boundingBox();
  expect(from).not.toBeNull();
  expect(to).not.toBeNull();
  await page.keyboard.down("Shift");
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 8 });
  await expect(page.locator(".wbs-drag-preview")).toContainText("Experience design");
  await expect(page.locator(".wbs-drag-preview")).toContainText("Place before Discovery");
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect
    .poll(() => page.locator(".cm-content").innerText())
    .toMatch(/\*\*\[#LightBlue\] <color:#DarkBlue>Experience design<\/color>[\s\S]*\*\* Discovery/);
  const wbsPreview = page.getByRole("region", { name: "WBS diagram preview" });
  await expect(wbsPreview).toHaveAttribute("data-render-status", "idle");
  const delivery = page.locator("text[data-wbs-node-id]", { hasText: "Delivery" }).first();
  const newParent = page.locator("text[data-wbs-node-id]", { hasText: "Discovery" }).first();
  const deliveryBox = await delivery.boundingBox();
  const parentBox = await newParent.boundingBox();
  expect(deliveryBox).not.toBeNull();
  expect(parentBox).not.toBeNull();
  await page.mouse.move(deliveryBox!.x + deliveryBox!.width / 2, deliveryBox!.y + deliveryBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(parentBox!.x + parentBox!.width / 2, parentBox!.y + parentBox!.height / 2, { steps: 8 });
  await expect(page.locator(".wbs-drag-preview")).toContainText("Move inside Discovery");
  await page.mouse.up();
  await expect.poll(() => page.locator(".cm-content").innerText()).toMatch(/\*\* Discovery[\s\S]*\*\*\* Delivery/);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "WBS node…" }).click();
  const add = page.getByRole("dialog", { name: "Add WBS node" });
  await add.getByLabel("Label").fill("Operations");
  await add.getByLabel("Position").selectOption("child");
  await add.getByRole("button", { name: "Add node" }).click();
  await expect(page.locator(".cm-content")).toContainText("Operations");
  await expect(wbsPreview).toHaveAttribute("data-render-status", "idle");
  const connectionSource = page.locator("text[data-wbs-node-id]", { hasText: "Discovery" }).first();
  await connectionSource.focus();
  await page.keyboard.press("Enter");
  const connectHandle = page.locator('[aria-label="Drag to connect Discovery"]');
  const connectFrom = await connectHandle.boundingBox();
  const connectTo = await page
    .locator("text[data-wbs-node-id]", { hasText: "Experience design" })
    .first()
    .boundingBox();
  expect(connectFrom).not.toBeNull();
  expect(connectTo).not.toBeNull();
  await page.mouse.move(connectFrom!.x + connectFrom!.width / 2, connectFrom!.y + connectFrom!.height / 2);
  await page.mouse.down();
  await page.mouse.move(connectTo!.x + connectTo!.width / 2, connectTo!.y + connectTo!.height / 2, { steps: 8 });
  await expect(page.locator(".wbs-connection-preview")).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("discovery -> experience_design");
  await expect(wbsPreview).toHaveAttribute("data-render-status", "idle");
  await expect(page.locator(".wbs-diagram svg")).not.toContainText("Syntax Error");
  const secondSource = page.locator("text[data-wbs-node-id]", { hasText: "Delivery" }).first();
  await secondSource.focus();
  await page.keyboard.press("Enter");
  const secondHandle = page.locator('[aria-label="Drag to connect Delivery"]');
  await expect(secondHandle).toHaveCount(1);
  const secondFrom = await secondHandle.boundingBox();
  const secondTo = await page.locator("text[data-wbs-node-id]", { hasText: "Experience design" }).first().boundingBox();
  expect(secondFrom).not.toBeNull();
  expect(secondTo).not.toBeNull();
  await page.mouse.move(secondFrom!.x + secondFrom!.width / 2, secondFrom!.y + secondFrom!.height / 2);
  await page.mouse.down();
  await page.mouse.move(secondTo!.x + secondTo!.width / 2, secondTo!.y + secondTo!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("delivery -> experience_design");
  await expect(wbsPreview).toHaveAttribute("data-render-status", "idle");
  await expect(page.locator(".wbs-relationship-hit")).toHaveCount(2);
  const firstArrow = page.getByRole("button", { name: "Select WBS arrow from discovery to experience_design" });
  await firstArrow.focus();
  await page.keyboard.press("Enter");
  const arrowInspector = page.getByRole("complementary", { name: "WBS arrow inspector" });
  await expect(page.locator(".wbs-relationship-endpoint")).toHaveCount(2);
  const fromEndpoint = page.getByRole("button", { name: "Drag from end of WBS arrow" });
  const stationaryToX = await page.getByRole("button", { name: "Drag to end of WBS arrow" }).getAttribute("cx");
  const stationaryToY = await page.getByRole("button", { name: "Drag to end of WBS arrow" }).getAttribute("cy");
  const fromEndpointBox = await fromEndpoint.boundingBox();
  const operationsTarget = await page
    .locator("text[data-wbs-node-id]", { hasText: "Operations" })
    .first()
    .boundingBox();
  expect(fromEndpointBox).not.toBeNull();
  expect(operationsTarget).not.toBeNull();
  await page.mouse.move(
    fromEndpointBox!.x + fromEndpointBox!.width / 2,
    fromEndpointBox!.y + fromEndpointBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    operationsTarget!.x + operationsTarget!.width / 2,
    operationsTarget!.y + operationsTarget!.height / 2,
    { steps: 8 },
  );
  await expect(page.locator(".wbs-connection-preview")).toHaveAttribute("x1", stationaryToX!);
  await expect(page.locator(".wbs-connection-preview")).toHaveAttribute("y1", stationaryToY!);
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("operations -> experience_design");
  await expect(wbsPreview).toHaveAttribute("data-render-status", "idle");
  const toEndpoint = page.getByRole("button", { name: "Drag to end of WBS arrow" });
  const toEndpointBox = await toEndpoint.boundingBox();
  const deliveryTarget = await page.locator("text[data-wbs-node-id]", { hasText: "Delivery" }).first().boundingBox();
  expect(toEndpointBox).not.toBeNull();
  expect(deliveryTarget).not.toBeNull();
  await page.mouse.move(toEndpointBox!.x + toEndpointBox!.width / 2, toEndpointBox!.y + toEndpointBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(deliveryTarget!.x + deliveryTarget!.width / 2, deliveryTarget!.y + deliveryTarget!.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("operations -> delivery");
  await expect(wbsPreview).toHaveAttribute("data-render-status", "idle");
  await arrowInspector.getByLabel("Arrow color", { exact: true }).fill("DarkGreen");
  await arrowInspector.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("operations -> delivery #DarkGreen");
  await arrowInspector.getByRole("button", { name: "Delete arrow" }).click();
  await expect(page.locator(".cm-content")).not.toContainText("operations -> delivery");
  await expect(page.locator(".cm-content")).toContainText("delivery -> experience_design");
  await page.getByRole("button", { name: "WBS", exact: true }).click();
  const settings = page.getByRole("complementary", { name: "WBS settings" });
  await settings.getByLabel("Diagram title").fill("Delivery breakdown");
  await settings.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".cm-content")).toContainText("title Delivery breakdown");
});
