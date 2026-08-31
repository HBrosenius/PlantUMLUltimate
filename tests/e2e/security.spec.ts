import { expect, test } from "@playwright/test";
import * as Y from "yjs";

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

test("opens viewer collaboration links in enforced read-only mode", async ({ page }) => {
  const remoteDocument = new Y.Doc();
  remoteDocument.getText("source").insert(0, "@startgantt\n[Shared plan] lasts 3 days\n@endgantt");
  const remoteUpdate = [...Y.encodeStateAsUpdate(remoteDocument)];
  await page.addInitScript((update) => {
    class ViewerWebSocket {
      static readonly OPEN = 1;
      readonly OPEN = 1;
      readyState = ViewerWebSocket.OPEN;
      binaryType = "arraybuffer";
      onopen: (() => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(url: string) {
        (window as Window & { viewerSocketUrl?: string }).viewerSocketUrl = url;
        window.setTimeout(() => {
          this.onopen?.();
          this.onmessage?.(new MessageEvent("message", { data: new Uint8Array(update).buffer }));
        });
      }

      send(message: string | ArrayBuffer | ArrayBufferView) {
        const kind = typeof message === "string" ? "text" : "binary";
        ((window as Window & { viewerSentKinds?: string[] }).viewerSentKinds ??= []).push(kind);
      }

      close() {
        this.readyState = 3;
      }
    }
    Object.defineProperty(window, "WebSocket", { value: ViewerWebSocket });
  }, remoteUpdate);

  const roomId = "r".repeat(43);
  const accessToken = "v".repeat(43);
  await page.goto(
    `/#collaboration=${roomId}&server=${encodeURIComponent("http://127.0.0.1:5173")}&access=${accessToken}&mode=viewer`,
  );
  const join = page.getByRole("dialog", { name: "Collaboration" });
  await expect(join.getByText("This viewer link follows live changes without permission to edit.")).toBeVisible();
  await join.getByLabel("Your name").fill("Read-only reviewer");
  await join.getByRole("button", { name: "Join as viewer" }).click();
  await expect(join).toContainText("Viewing only");
  await expect(page.locator(".cm-content")).toContainText("Shared plan");
  await expect(page.locator(".cm-content")).toHaveAttribute("contenteditable", "false");
  await expect(page.getByRole("button", { name: "Add", exact: true })).toBeDisabled();
  await expect(page.locator(".collaboration-status")).toHaveText("Viewing only");
  const transport = await page.evaluate(() => ({
    url: (window as Window & { viewerSocketUrl?: string }).viewerSocketUrl,
    sentKinds: (window as Window & { viewerSentKinds?: string[] }).viewerSentKinds,
  }));
  expect(new URL(transport.url!).searchParams.get("access")).toBe(accessToken);
  expect(transport.sentKinds?.length).toBeGreaterThan(0);
  expect(transport.sentKinds?.every((kind) => kind === "text")).toBe(true);
});
