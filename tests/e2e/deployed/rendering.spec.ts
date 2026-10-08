import { expect, test } from "@playwright/test";
import { prepareEditor } from "../editor-helpers";

test("production headers allow native and Graphviz rendering", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const documentResponse = page.waitForResponse(
    (response) => response.request().isNavigationRequest() && response.request().frame() === page.mainFrame(),
  );
  // Exercise the real HTTP policy. Do not replace headers or intercept assets.
  await prepareEditor(page);
  const response = await documentResponse;
  expect(response.ok()).toBe(true);
  const policy = response.headers()["content-security-policy"];
  expect(policy).toBeTruthy();
  for (const directive of ["script-src", "worker-src"]) {
    expect(policy?.split(";").find((part) => part.trim().startsWith(`${directive} `))).toContain("data:");
  }
  await expect(page.locator(".diagram svg")).toContainText("Architecture");
  await page.getByRole("button", { name: "New diagram tab" }).click();
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: /Component diagram/ })
    .click();
  await expect(page.getByRole("region", { name: "Component diagram preview" }).locator("svg")).toContainText(
    "Order service",
  );
  expect(errors).toEqual([]);
});
