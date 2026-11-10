import type { Page } from "@playwright/test";

/**
 * Writes a tracked audit PNG under docs/audits/. Off by default so routine e2e runs do not dirty git;
 * set AUDIT_SCREENSHOTS=1 to refresh the committed audit images.
 */
export async function auditScreenshot(page: Page, path: string) {
  if (process.env.AUDIT_SCREENSHOTS !== "1") return;
  await page.screenshot({ path });
}
