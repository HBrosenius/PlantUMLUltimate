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
  // Cloudflare's header only stops other sites from framing the app; the page's own meta policy
  // governs scripts. The renderer runs its engine from blob: URLs, so no data: or inline scripts.
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'self'");
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  const directive = (name: string) => policy?.split(";").find((part) => part.trim().startsWith(`${name} `)) ?? "";
  for (const name of ["script-src", "worker-src"]) {
    expect(directive(name)).toContain("blob:");
    expect(directive(name)).not.toContain("data:");
  }
  expect(directive("script-src")).not.toContain("'unsafe-inline'");
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
