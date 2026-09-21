import { expect, test } from "@playwright/test";

import { openAddDialog, prepareEditor } from "./editor-helpers";

test.beforeEach(async ({ page }) => {
  await prepareEditor(page);
});

test("creates and visually edits a Component diagram", async ({ page }) => {
  await page.getByRole("button", { name: "New document tab" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await chooser.getByRole("button", { name: /Component diagram/ }).click();

  await expect(page.getByRole("region", { name: "Component diagram preview" })).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText('component "Order service" as Orders');
  await expect(page.locator(".cm-content")).toContainText('database "Order database" as Database');
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
});
