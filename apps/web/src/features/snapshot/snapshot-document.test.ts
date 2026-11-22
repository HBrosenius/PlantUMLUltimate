// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildSnapshotDocumentHtml,
  createDiagramLinkResolver,
  sanitizeSnapshotSvg,
  snapshotCspTemplate,
  type SnapshotDiagram,
} from "./snapshot-html";

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">${body}</svg>`;
const diagram = (n: number, patch: Partial<SnapshotDiagram> = {}): SnapshotDiagram => ({
  id: `id-${n}`,
  title: `Diagram ${n}`,
  kind: n === 1 ? "gantt" : "sequence",
  source: `@startuml\n${n}\n@enduml`,
  svg: svg(`<rect id="r"/>`),
  ...patch,
});
const base = { documentName: "Release plan", snapshotDate: new Date("2026-11-22T10:00:00Z") };
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("buildSnapshotDocumentHtml", () => {
  it("lists every diagram in the contents and gives each one a section with its own stage", async () => {
    const html = await buildSnapshotDocumentHtml({
      ...base,
      diagrams: [diagram(1), diagram(2), diagram(3)],
      versionLabel: "Approved v2",
    });
    const doc = parse(html);
    const toc = [...doc.querySelectorAll(".toc-list a")];
    expect(toc.map((a) => a.getAttribute("href"))).toEqual(["#diagram-1", "#diagram-2", "#diagram-3"]);
    expect(doc.querySelector(".toc-list")!.textContent).toContain("Gantt chart");
    expect(doc.querySelector(".toc-list")!.textContent).toContain("Sequence diagram");
    expect(doc.querySelector(".toc-menu summary")!.textContent).toContain("3 diagrams");
    expect([...doc.querySelectorAll("section.diagram")].map((s) => s.id)).toEqual([
      "diagram-1",
      "diagram-2",
      "diagram-3",
    ]);
    expect(doc.querySelectorAll(".stage svg")).toHaveLength(3);
    expect(doc.querySelectorAll(".tools")).toHaveLength(3);
    expect(html).toContain("Version: Approved v2");
    expect(html).toContain("3 diagrams");
    expect(doc.querySelector("h1")!.textContent).toBe("Release plan");
    expect(html).not.toContain("@startuml");
  });

  it("keeps exactly one inline script, pinned by the CSP hash", async () => {
    const html = await buildSnapshotDocumentHtml({ ...base, diagrams: [diagram(1), diagram(2)] });
    const scripts = html.match(/<script\b[^>]*>/gi) ?? [];
    expect(scripts).toHaveLength(1);
    expect(html.match(/<\/script\b[^>]*>/gi)).toHaveLength(1);
    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)![1]!.replace(/&#39;/g, "'");
    const hash = /script-src 'sha256-([^']+)'/.exec(csp)![1]!;
    expect(csp).toBe(snapshotCspTemplate.replace("{HASH}", hash));
    const body = /<script\b[^>]*>([\s\S]*?)<\/script\b[^>]*>/i.exec(html)![1]!;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
    expect(hash).toBe(btoa(String.fromCharCode(...new Uint8Array(digest))));
    expect(csp).not.toMatch(/connect-src|unsafe-eval|https?:|\*/);
  });

  it("rewrites links that target another diagram of the document to in-page anchors", async () => {
    const link = (href: string, text: string) => `<a href="${href}" xlink:href="${href}"><text>${text}</text></a>`;
    const html = await buildSnapshotDocumentHtml({
      ...base,
      diagrams: [
        diagram(1, {
          svg: svg(
            link("#Diagram 2", "by title") +
              link("diagram-3", "by number") +
              link("Diagram 3.puml", "by file name") +
              link("https://example.com/x", "external") +
              link("Unknown diagram", "unknown"),
          ),
        }),
        diagram(2),
        diagram(3),
      ],
    });
    const anchors = [...parse(html).querySelectorAll("section#diagram-1 .stage a")];
    const hrefs = anchors.map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["#diagram-2", "#diagram-3", "#diagram-3", "https://example.com/x", null]);
    expect(anchors[0]!.hasAttribute("target")).toBe(false);
    expect(anchors[3]!.getAttribute("rel")).toBe("noopener noreferrer");
    expect(anchors[3]!.getAttribute("target")).toBe("_blank");
  });

  it("adds a linked-diagrams list from project links, once per relation", async () => {
    const html = await buildSnapshotDocumentHtml({
      ...base,
      diagrams: [diagram(1), diagram(2), diagram(3)],
      relations: [
        { from: 0, to: 1, kind: "implements" },
        { from: 0, to: 1, kind: "implements" },
        { from: 2, to: 1, kind: "represents" },
        { from: 1, to: 1, kind: "relates" },
      ],
    });
    const doc = parse(html);
    const first = doc.querySelector("#diagram-1 .related")!;
    expect(first.textContent).toBe("Linked diagrams: implements Diagram 2");
    expect(first.querySelectorAll("a")).toHaveLength(1);
    expect(first.querySelector("a")!.getAttribute("href")).toBe("#diagram-2");
    const second = doc.querySelector("#diagram-2 .related")!;
    expect(second.textContent).toContain("implemented by Diagram 1");
    expect(second.textContent).toContain("represented by Diagram 3");
    expect(doc.querySelector("#diagram-3 .related")!.textContent).toContain("represents Diagram 2");
  });

  it("shows a failed diagram as an entry with its error and keeps the others", async () => {
    const html = await buildSnapshotDocumentHtml({
      ...base,
      diagrams: [
        diagram(1),
        diagram(2, { svg: undefined, error: "Syntax error <b>on</b> line 3" }),
        diagram(3, { svg: "<p>not an svg</p>" }),
      ],
    });
    const doc = parse(html);
    expect(doc.querySelectorAll(".stage svg")).toHaveLength(1);
    expect(doc.querySelector("#diagram-2 .failed")!.textContent).toContain("Syntax error <b>on</b> line 3");
    expect(doc.querySelector("#diagram-2 .failed b")).toBeNull();
    expect(doc.querySelector("#diagram-3 .failed")!.textContent).toContain("could not be rendered");
    expect(doc.querySelector(".toc-list")!.textContent).toContain("could not be rendered");
    expect(html.match(/<script\b[^>]*>/gi)).toHaveLength(1);
  });

  it("escapes titles, names and error text", async () => {
    const html = await buildSnapshotDocumentHtml({
      documentName: `</title><img src=x onerror=alert(1)>`,
      snapshotDate: base.snapshotDate,
      versionLabel: `<i>v</i>`,
      diagrams: [diagram(1, { title: `<script>alert(1)</script>` }), diagram(2, { svg: undefined, error: `<u>x</u>` })],
    });
    expect(html).not.toMatch(/<script\b[^>]*>\s*alert/i);
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<i>v</i>");
    expect(html).not.toContain("<u>x</u>");
    expect(html.match(/<script\b[^>]*>/gi)).toHaveLength(1);
  });

  it("re-sanitises every embedded svg", async () => {
    const html = await buildSnapshotDocumentHtml({
      ...base,
      diagrams: [
        diagram(1, {
          svg: svg(`<script>alert(1)</script><a href="javascript:alert(2)"><text onclick="x()">t</text></a>`),
        }),
        diagram(2),
      ],
    });
    expect(html).not.toMatch(/alert\(|javascript:|onclick/);
  });

  it("namespaces element ids so diagrams cannot reference each other's gradients", async () => {
    const gradient = svg(
      `<defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs><rect fill="url(#g)" style="fill:url(#g)"/><use href="#g"/>`,
    );
    const html = await buildSnapshotDocumentHtml({
      ...base,
      diagrams: [diagram(1, { svg: gradient }), diagram(2, { svg: gradient })],
    });
    const doc = parse(html);
    expect(doc.querySelector("#d1-g")).not.toBeNull();
    expect(doc.querySelector("#d2-g")).not.toBeNull();
    expect(html).toContain("url(#d2-g)");
    expect(html).not.toContain('id="g"');
    const ids = [...doc.querySelectorAll("[id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects an empty diagram list", async () => {
    await expect(buildSnapshotDocumentHtml({ ...base, diagrams: [] })).rejects.toThrow();
  });
});

describe("createDiagramLinkResolver", () => {
  const diagrams = [
    { id: "aaaa-1", title: "Overview" },
    { id: "aaaa-2", title: "Details" },
    { id: "aaaa-3", title: "Details" },
  ];
  it("matches titles, ids and numbers, ignoring case, a leading # and file extensions", () => {
    const resolve = createDiagramLinkResolver(diagrams);
    expect(resolve("#overview")).toBe("#diagram-1");
    expect(resolve("Overview.pumlu")).toBe("#diagram-1");
    expect(resolve("aaaa-2")).toBe("#diagram-2");
    expect(resolve("diagram-3")).toBe("#diagram-3");
    expect(resolve("%23Overview")).toBe("#diagram-1");
  });
  it("leaves unknown and ambiguous targets alone", () => {
    const resolve = createDiagramLinkResolver(diagrams);
    expect(resolve("Details")).toBeUndefined();
    expect(resolve("https://example.com")).toBeUndefined();
    expect(resolve("")).toBeUndefined();
  });
});

describe("sanitizeSnapshotSvg id prefix", () => {
  it("leaves single-diagram output unprefixed", () => {
    expect(sanitizeSnapshotSvg(svg(`<rect id="a"/><use href="#a"/>`)).svg).toContain('id="a"');
  });
});
