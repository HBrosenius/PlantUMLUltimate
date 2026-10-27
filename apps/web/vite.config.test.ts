import { expect, it } from "vitest";
import { jiraDevelopmentCookieToBrowser, jiraDevelopmentCookieToWorker, jiraDevelopmentOrigin } from "./vite.config";

it("supplies the accepted upstream origin for same-origin development requests on any local port", () => {
  expect(jiraDevelopmentOrigin(undefined, "localhost:5175", "GET")).toBe("https://plantuml.brosenius.se");
  expect(jiraDevelopmentOrigin("http://localhost:5175", "localhost:5175", "POST")).toBe(
    "https://plantuml.brosenius.se",
  );
  expect(jiraDevelopmentOrigin("http://127.0.0.1:5185", "127.0.0.1:5185", "POST")).toBe(
    "https://plantuml.brosenius.se",
  );
});

it("preserves foreign origins and does not authorize originless writes", () => {
  expect(jiraDevelopmentOrigin("https://evil.example", "localhost:5175", "POST")).toBe("https://evil.example");
  expect(jiraDevelopmentOrigin("http://localhost:9999", "localhost:5175", "POST")).toBe("http://localhost:9999");
  expect(jiraDevelopmentOrigin(undefined, "localhost:5175", "POST")).toBeUndefined();
});

it("maps the Worker's __Host- session cookies to the dev proxy path and back", () => {
  expect(
    jiraDevelopmentCookieToBrowser("__Host-jira_session=abc; Path=/; HttpOnly; SameSite=Lax; Max-Age=60; Secure"),
  ).toBe("jira_session=abc; Path=/__jira/; HttpOnly; SameSite=Lax; Max-Age=60");
  expect(jiraDevelopmentCookieToWorker("theme=dark; jira_session=abc; jira_oauth_session=xyz")).toBe(
    "theme=dark; __Host-jira_session=abc; __Host-jira_oauth_session=xyz",
  );
});

it("ships a page policy without inline scripts or dev-only connections, relaxed only by the dev server", async () => {
  const { readFileSync } = await import("node:fs");
  const { devContentSecurityPolicy } = await import("./vite.config");
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const policy = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)![1]!;
  const directive = (name: string, value: string) => value.split(";").find((item) => item.trim().startsWith(name))!;
  expect(directive("script-src", policy)).not.toContain("'unsafe-inline'");
  // The renderer frame loads its engine from blob: URLs, so the page allows no data: scripts or workers.
  expect(directive("script-src", policy)).not.toContain("data:");
  expect(directive("worker-src", policy)).not.toContain("data:");
  expect(directive("connect-src", policy)).not.toMatch(/ws:(?!s)|localhost|127\.0\.0\.1/);
  expect(html).not.toMatch(/<script>(?!<\/script>)/);
  const transform = devContentSecurityPolicy().transformIndexHtml as (value: string) => string;
  const dev = transform(html).match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)![1]!;
  expect(directive("script-src", dev)).toContain("'unsafe-inline'");
  expect(directive("connect-src", dev)).toContain("ws:");
});

it("allows exactly the renderer frame's bootstrap by hash in built pages", async () => {
  const { createHash } = await import("node:crypto");
  const { readFileSync } = await import("node:fs");
  const { rendererBootstrapHash } = await import("./vite.config");
  const { rendererFrameBootstrap, rendererFrameDocument } = await import("./src/render/renderer-frame");
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const transform = rendererBootstrapHash().transformIndexHtml as (value: string) => string;
  const hash = createHash("sha256").update(rendererFrameBootstrap).digest("base64");
  expect(transform(html)).toContain(`script-src 'self' 'sha256-${hash}'`);
  // The frame document must carry the bootstrap verbatim, or the hash will not match.
  expect(rendererFrameDocument("abc")).toContain(`<script type="module">${rendererFrameBootstrap}</script>`);
});
