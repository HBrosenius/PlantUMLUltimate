// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildSnapshotHtml,
  escapeHtml,
  sanitizeSnapshotSvg,
  sha256Hex,
  snapshotCspTemplate,
  snapshotFileName,
} from "./snapshot-html";

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">${body}</svg>`;
const base = {
  source: "@startgantt\n[A] requires 1 day\n@endgantt",
  documentName: "Plan",
  diagramTitle: "Plan",
  diagramKind: "gantt",
  snapshotDate: new Date("2026-11-22T10:00:00Z"),
};

describe("snapshot file name", () => {
  it("replaces the document extension", () => {
    expect(snapshotFileName("plan.pumlu")).toBe("plan.snapshot.html");
    expect(snapshotFileName("plan")).toBe("plan.snapshot.html");
  });
});

describe("sanitizeSnapshotSvg", () => {
  it("removes scripts, foreignObject, event attributes and javascript links", () => {
    const out = sanitizeSnapshotSvg(
      svg(
        `<script>alert(1)</script><foreignObject><div onclick="x()">hi</div></foreignObject>` +
          `<rect width="5" height="5" onclick="alert(2)" onload="alert(3)"/>` +
          `<a href="javascript:alert(4)"><text>js</text></a><a xlink:href="JaVaScRiPt:alert(5)"><text>js2</text></a>`,
      ),
    );
    expect(out.svg).not.toMatch(/script|foreignObject|onclick|onload|javascript/i);
    expect(out.svg).toContain("<rect");
  });

  it("limits external links to http, https and mailto with noopener noreferrer", () => {
    const out = sanitizeSnapshotSvg(
      svg(
        `<a href="https://example.com/a"><text>a</text></a><a href="http://example.com"><text>b</text></a>` +
          `<a href="mailto:a@example.com"><text>c</text></a><a href="data:text/html,<b>x</b>"><text>d</text></a>` +
          `<a href="file:///etc/passwd"><text>e</text></a><a href="ftp://x.test"><text>f</text></a>`,
      ),
    );
    const doc = new DOMParser().parseFromString(out.svg, "image/svg+xml");
    const links = [...doc.querySelectorAll("a")];
    const kept = links.filter((a) => a.hasAttribute("href"));
    expect(kept.map((a) => a.getAttribute("href"))).toEqual([
      "https://example.com/a",
      "http://example.com",
      "mailto:a@example.com",
    ]);
    for (const a of kept) {
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
      expect(a.getAttribute("target")).toBe("_blank");
    }
    expect(out.svg).not.toMatch(/data:text|file:|ftp:/);
  });

  it("keeps only safe embedded raster images and in-page references", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    const out = sanitizeSnapshotSvg(
      svg(
        `<image href="${png}" width="1" height="1"/>` +
          `<image href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" width="1" height="1"/>` +
          `<image href="https://tracker.example/p.png" width="1" height="1"/>` +
          `<a href="#top"><text>t</text></a>`,
      ),
    );
    expect(out.svg).toContain(png);
    expect(out.svg).toContain('href="#top"');
    expect(out.svg).not.toContain("svg+xml");
    expect(out.svg).not.toContain("tracker.example");
  });

  it("reads the size and rejects non-SVG input", () => {
    expect(sanitizeSnapshotSvg(svg("<rect/>"))).toMatchObject({ width: 200, height: 100 });
    expect(sanitizeSnapshotSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"></svg>')).toMatchObject({
      width: 30,
      height: 20,
    });
    expect(() => sanitizeSnapshotSvg("<p>no</p>")).toThrow();
  });
});

describe("buildSnapshotHtml", () => {
  it("builds a self-contained page with header, svg, fingerprint and CSP", async () => {
    const html = await buildSnapshotHtml({ ...base, svg: svg("<rect/>"), versionLabel: "Approved v2" });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<h1>Plan</h1>");
    expect(html).toContain("Gantt chart");
    expect(html).toContain('<time datetime="2026-11-22">2026-11-22</time>');
    expect(html).toContain("Version: Approved v2");
    expect(html).toContain("Made with PlantUML Ultimate");
    const fingerprint = await sha256Hex(base.source);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(html).toContain(`title="${fingerprint}">${fingerprint.slice(0, 12)}</code>`);
    expect(html).toContain("<svg");
    expect(html).toContain('name="viewport"');
    expect(html).toContain("prefers-color-scheme:dark");
    expect(html).not.toContain("@startgantt");
  });

  it("omits the version line when there is no label", async () => {
    const html = await buildSnapshotHtml({ ...base, svg: svg("<rect/>") });
    expect(html).not.toContain("Version:");
  });

  it("uses a strict CSP that pins the single inline script by hash", async () => {
    const html = await buildSnapshotHtml({ ...base, svg: svg("<rect/>") });
    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)![1]!.replace(/&#39;/g, "'");
    expect(csp).toBe(snapshotCspTemplate.replace("{HASH}", /script-src 'sha256-([^']+)'/.exec(csp)![1]!));
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toMatch(/connect-src|font-src|unsafe-eval|https?:|\*/);
    expect(csp).toContain("img-src data:");
    const scripts = html.match(/<script\b[^>]*>/gi) ?? [];
    expect(scripts).toHaveLength(1);
    const body = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/i.exec(html)![1]!;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
    expect(csp).toContain(`'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`);
  });

  it("escapes metadata text", async () => {
    const html = await buildSnapshotHtml({
      ...base,
      svg: svg("<rect/>"),
      documentName: `<img src=x onerror=alert(1)> & "q"`,
      diagramTitle: `</title><script>alert(2)</script>`,
      versionLabel: `<b>v</b>`,
    });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toMatch(/<script\b[^>]*>\s*alert/i);
    expect(html).not.toContain("<b>v</b>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;");
    expect(html).toContain("Version: &lt;b&gt;v&lt;/b&gt;");
    expect(html.match(/<script\b[^>]*>/gi)).toHaveLength(1);
  });

  it("re-sanitises the embedded svg", async () => {
    const html = await buildSnapshotHtml({
      ...base,
      svg: svg(`<script>alert(1)</script><a href="javascript:alert(2)"><text onclick="x()">t</text></a>`),
    });
    expect(html).not.toMatch(/alert\(|javascript:|onclick/);
  });

  it("escapeHtml covers the HTML-significant characters", () => {
    expect(escapeHtml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&#39;");
  });
});
