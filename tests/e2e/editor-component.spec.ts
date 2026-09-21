import { expect, test } from "@playwright/test";

import { openAddDialog, prepareEditor } from "./editor-helpers";

test.beforeEach(async ({ page }) => {
  await prepareEditor(page);
});

test("creates and visually edits a Component diagram", async ({ page }) => {
  test.setTimeout(60_000);
  await page.getByRole("button", { name: "New document tab" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await chooser.getByRole("button", { name: /Component diagram/ }).click();

  await expect(page.getByRole("region", { name: "Component diagram preview" })).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText('component "Order service" as Orders');
  await expect(page.locator(".cm-content")).toContainText('database "Order database" as Database');

  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menu", { name: "File" }).getByRole("menuitem", { name: "Document settings…" }).click();
  const documentSettings = page.getByRole("dialog", { name: "Document settings" });
  await documentSettings.getByLabel("PlantUML theme").selectOption("blueprint");
  await expect(documentSettings.getByLabel("Theme preview").locator("svg")).toBeVisible();
  await expect
    .poll(() =>
      documentSettings
        .getByLabel("Theme preview")
        .locator("svg")
        .evaluate((element) => element.outerHTML),
    )
    .toContain("#003153");
  await documentSettings.getByRole("button", { name: "Cancel" }).click();

  await openAddDialog(page, "Component or infrastructure…");
  const dialog = page.getByRole("dialog", { name: "Add Component object" });
  await expect(dialog.getByLabel("Component object type")).toHaveValue("component");
  await dialog.getByLabel("Name").fill("Payment service");
  await dialog.getByLabel("Alias").fill("Payments");
  await dialog.getByRole("button", { name: "Add object" }).click();

  await expect(page.locator(".cm-content")).toContainText('component "Payment service" as Payments');
  await expect(
    page.getByRole("region", { name: "Component diagram preview" }).getByText("Payment service"),
  ).toBeVisible();

  const payment = page.locator('[data-class-object-type="entity"][data-class-object-id="payments"]');
  const packageTarget = page.getByRole("group", { name: "Component containers" }).getByRole("button", {
    name: "Ordering system",
  });
  const paymentBox = await payment.boundingBox();
  const packageBox = await packageTarget.boundingBox();
  expect(paymentBox).not.toBeNull();
  expect(packageBox).not.toBeNull();
  await page.mouse.move(paymentBox!.x + paymentBox!.width / 2, paymentBox!.y + paymentBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(packageBox!.x + packageBox!.width / 2, packageBox!.y + packageBox!.height / 2, { steps: 7 });
  await expect(packageTarget).toHaveClass(/class-active-drop/);
  await page.mouse.up();
  await expect
    .poll(() => page.locator(".cm-content").innerText())
    .toMatch(/package "Ordering system" \{[\s\S]*component "Payment service" as Payments[\s\S]*\}/);

  await page.locator('[data-class-object-type="entity"][data-class-object-id="payments"]').click({ force: true });
  const componentInspector = page.getByRole("complementary", { name: "Component object inspector" });
  await componentInspector.getByLabel("Package").selectOption("");
  await expect
    .poll(() => page.locator(".cm-content").innerText())
    .toMatch(/package "Ordering system" \{[\s\S]*\}[\s\S]*component "Payment service" as Payments/);

  await openAddDialog(page, "Component or infrastructure…");
  const secondDialog = page.getByRole("dialog", { name: "Add Component object" });
  await secondDialog.getByLabel("Name").fill("Inventory service");
  await secondDialog.getByLabel("Alias").fill("Inventory");
  await secondDialog.getByRole("button", { name: "Add object" }).click();

  const inventory = page.locator('[data-class-object-type="entity"][data-class-object-id="inventory"]');
  const movedPayment = page.locator('[data-class-object-type="entity"][data-class-object-id="payments"]');
  const inventoryBox = await inventory.boundingBox();
  const movedPaymentBox = await movedPayment.boundingBox();
  expect(inventoryBox).not.toBeNull();
  expect(movedPaymentBox).not.toBeNull();
  await page.mouse.move(inventoryBox!.x + inventoryBox!.width / 2, inventoryBox!.y + inventoryBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    movedPaymentBox!.x + movedPaymentBox!.width / 2,
    movedPaymentBox!.y + movedPaymentBox!.height / 2,
    {
      steps: 7,
    },
  );
  await expect(movedPayment).toHaveClass(/class-active-drop/);
  await page.mouse.up();
  await expect(page.locator(".cm-content")).toContainText("Inventory --> Payments");

  await page.locator('[data-class-object-id="relationship-3"]').click({ force: true });
  const connectionInspector = page.getByRole("complementary", { name: "Component connection inspector" });
  await expect(connectionInspector.getByLabel("Connection type")).toHaveValue("directed");
  await connectionInspector.getByLabel("Connection type").selectOption("dependency");
  await expect(page.locator(".cm-content")).toContainText("Inventory ..> Payments");
  await expect(connectionInspector.getByLabel("Connection type")).toHaveValue("dependency");
  await connectionInspector.getByLabel("Label").fill("requests stock");
  await connectionInspector.getByLabel("Label").blur();
  await expect(page.locator(".cm-content")).toContainText("Inventory ..> Payments : requests stock");
  await connectionInspector.getByLabel("Line style").selectOption("dotted");
  await expect(page.locator(".cm-content")).toContainText("Inventory .[dotted].> Payments : requests stock");
  await expect(connectionInspector.getByLabel("Connection type")).toHaveValue("dependency");
  await connectionInspector.getByRole("button", { name: "Reverse direction" }).click();
  await expect(page.locator(".cm-content")).toContainText("Payments .[dotted].> Inventory : requests stock");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".cm-content")).toContainText("Inventory .[dotted].> Payments : requests stock");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.locator(".cm-content")).toContainText("Payments .[dotted].> Inventory : requests stock");

  await page.getByRole("button", { name: "Component", exact: true }).click();
  const settings = page.getByRole("complementary", { name: "Component settings" });
  await expect(settings.getByRole("group", { name: "Members" })).toHaveCount(0);
  await expect(settings.getByLabel("Component fill", { exact: true })).toBeVisible();

  const diagram = page.locator(".class-diagram");
  await diagram.evaluate((element) => element.classList.add("class-dragging-move"));
  await expect
    .poll(() =>
      page
        .locator(".class-package-drop-hit")
        .first()
        .evaluate((element) => getComputedStyle(element).pointerEvents),
    )
    .toBe("none");
  await page.locator('[data-class-object-type="entity"][data-class-object-id="inventory"]').click({ force: true });
  await expect(page.getByRole("complementary", { name: "Component object inspector" })).toBeVisible();
  await diagram.evaluate((element) => element.classList.remove("class-dragging-move"));

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export" }).hover();
  await page.getByRole("menu", { name: "Export" }).getByRole("menuitem", { name: "SVG" }).click();
  await expect((await download).suggestedFilename()).toMatch(/\.svg$/);
});
