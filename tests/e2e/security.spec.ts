import { expect, test } from "@playwright/test";

test("sanitizes active SVG content before DOM insertion", async ({ page }) => {
  await page.goto("/");
  const sanitized = await page.evaluate(async () => {
    const modulePath = "/src/render/sanitize-svg.ts";
    const sanitizer = (await import(modulePath)) as { sanitizeSvg(svg: string): string };
    return sanitizer.sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <script>alert(1)</script>
        <foreignObject><iframe srcdoc="bad"></iframe></foreignObject>
        <a href="javascript:alert(2)"><text onload="alert(3)">Unsafe</text></a>
        <rect id="safe" width="10" height="10" />
      </svg>
    `);
  });

  expect(sanitized).not.toContain("<script");
  expect(sanitized).not.toContain("foreignObject");
  expect(sanitized).not.toContain("javascript:");
  expect(sanitized).not.toContain("onload");
  expect(sanitized).toContain('id="safe"');
});

test("declares the application content security policy", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
    "content",
    /object-src 'none'/,
  );
});
