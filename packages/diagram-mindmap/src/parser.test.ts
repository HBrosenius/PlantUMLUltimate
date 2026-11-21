import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findMindmapNodeAt, mindmapEmissionOrder, parseMindmap } from "./parser";

const wrap = (body: string) => `@startmindmap\n${body}\n@endmindmap`;
const summary = (source: string) =>
  parseMindmap(source).nodes.map(({ label, depth, side, parentId }) => ({ label, depth, side, parentId }));
const codes = (source: string) => parseMindmap(source).diagnostics.map((item) => item.code);

describe("mindmap parser", () => {
  it("rejects oversized input before applying grammar expressions", () => {
    expect(() => parseMindmap(" ".repeat(100_001))).toThrow(/100,000 character limit/);
  });

  it("caches the last parse", () => {
    const source = wrap("* A\n** B");
    expect(parseMindmap(source)).toBe(parseMindmap(source));
    expect(parseMindmap(`${source}\n`)).not.toBe(parseMindmap(source));
  });

  it("parses OrgMode markers, several roots and node details", () => {
    const document = parseMindmap(
      wrap(
        "*[#Orange] Root\n**[#lightgreen] <&flag> Green <<green>>\n***_ Boxless\n* Second root\n** [[https://x.y Link]]",
      ),
    );
    expect(document.diagnostics).toEqual([]);
    expect(document.roots.map((node) => node.label)).toEqual(["Root", "Second root"]);
    expect(document.nodes[0]).toMatchObject({ color: "#Orange", side: "root", id: "mindmap-0" });
    expect(document.nodes[1]).toMatchObject({
      color: "#lightgreen",
      icon: "&flag",
      label: "Green",
      stereotype: "green",
    });
    expect(document.nodes[2]).toMatchObject({ boxless: true, label: "Boxless", parentId: "mindmap-1" });
    expect(document.nodes[4]).toMatchObject({ link: "https://x.y", label: "Link" });
  });

  it("parses arithmetic markers: + is always right, - always left, a root is always the root", () => {
    expect(summary(wrap("+ OS\n++ Ubuntu\n+++ Mint\n-- Windows\n--- Eight"))).toEqual([
      { label: "OS", depth: 1, side: "root", parentId: undefined },
      { label: "Ubuntu", depth: 2, side: "right", parentId: "mindmap-0" },
      { label: "Mint", depth: 3, side: "right", parentId: "mindmap-1" },
      { label: "Windows", depth: 2, side: "left", parentId: "mindmap-0" },
      { label: "Eight", depth: 3, side: "left", parentId: "mindmap-3" },
    ]);
  });

  it("makes deeper nodes follow their depth-2 ancestor whatever their own marker", () => {
    expect(summary(wrap("* R\n-- L\n*** under left\n++ P\n--- under right")).map((n) => n.side)).toEqual([
      "root",
      "left",
      "left",
      "right",
      "right",
    ]);
  });

  describe("left side and right side", () => {
    it("is a document-order switch for depth-2 * nodes only", () => {
      const source = wrap("* R\n** before\nleft side\n** after\n*** deep\n++ plus\n-- minus\nright side\n** back");
      const document = parseMindmap(source);
      expect(document.nodes.map((node) => [node.label, node.side])).toEqual([
        ["R", "root"],
        ["before", "right"],
        ["after", "left"],
        ["deep", "left"],
        ["plus", "right"],
        ["minus", "left"],
        ["back", "right"],
      ]);
      expect(document.sideSwitches.map((item) => item.side)).toEqual(["left", "right"]);
      expect(source.slice(document.sideSwitches[0]!.range.from, document.sideSwitches[0]!.range.to)).toBe("left side");
    });

    it("is not scoped per root", () => {
      expect(summary(wrap("* R1\n** a\nleft side\n** b\n* R2\n** c\n** d")).map((n) => [n.label, n.side])).toEqual([
        ["R1", "root"],
        ["a", "right"],
        ["b", "left"],
        ["R2", "root"],
        ["c", "left"],
        ["d", "left"],
      ]);
    });

    it("applies a switch written before the root", () => {
      expect(summary(wrap("left side\n* 1\n** 2\n*** 4")).map((n) => n.side)).toEqual(["root", "left", "left"]);
    });
  });

  it("parses #-header and indented list forms as source-only nodes", () => {
    const headers = parseMindmap(wrap("# root\n## first\n### second\n### another\n## next"));
    expect(headers.nodes.map((node) => [node.label, node.depth, node.markdown])).toEqual([
      ["root", 1, "header"],
      ["first", 2, "header"],
      ["second", 3, "header"],
      ["another", 3, "header"],
      ["next", 2, "header"],
    ]);
    expect(headers.diagnostics.map((item) => [item.severity, item.code])).toEqual([["info", "markdown-form"]]);
    const tabs = parseMindmap(wrap("* root\n\t* first\n\t\t* second\n\t\t* another\n\t* next"));
    expect(tabs.nodes.map((node) => [node.label, node.depth, node.markdown])).toEqual([
      ["root", 1, undefined],
      ["first", 2, "list"],
      ["second", 3, "list"],
      ["another", 3, "list"],
      ["next", 2, "list"],
    ]);
    expect(tabs.nodes[3]).toMatchObject({ parentId: "mindmap-1" });
  });

  it("nests list items by relative indentation and keeps colours", () => {
    for (const unit of [" ", "  ", "    "]) {
      const source = wrap(`*[#Orange] root\n${unit}*[#lightgreen] a\n${unit.repeat(2)}* b\n${unit}* c`);
      const document = parseMindmap(source);
      expect(document.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
      expect(document.nodes.map((node) => [node.label, node.depth, node.color])).toEqual([
        ["root", 1, "#Orange"],
        ["a", 2, "#lightgreen"],
        ["b", 3, undefined],
        ["c", 2, undefined],
      ]);
    }
    // A jump of several spaces is a single level.
    expect(summary(wrap("* Root\n    * Deep at once\n* Second root")).map((n) => n.depth)).toEqual([1, 2, 1]);
    // A list under a ** node is a child of it.
    expect(summary(wrap("* Root\n** Level 2\n  * Indented\n** Again")).map((n) => n.depth)).toEqual([1, 2, 3, 2]);
  });

  it("diagnoses the Markdown combinations the engine rejects", () => {
    expect(codes(wrap("* Root\n    * Four\n  * Two\n        * Eight"))).toContain("bad-indentation");
    expect(codes(wrap("# Root\n## Child\n  * Under child by indent"))).toContain("markdown-mixed");
    expect(codes(wrap("* Root\n ** Level 2\n  * x\n    * y".replace(" ** Level 2", "** Level 2")))).toContain(
      "markdown-list-nesting",
    );
    expect(codes(wrap("* Root\n - Child 1\n   - Grand 1"))).toEqual(["dash-list", "dash-list"]);
    // A column-0 # root followed by * lines at column 0 is just two roots.
    expect(codes(wrap("# Root\n* Child by star"))).toEqual(["markdown-form"]);
  });

  it("skips the body of a <style> block, so selectors never become nodes", () => {
    const document = parseMindmap(
      wrap(
        "<style>\nmindmapDiagram {\n  .myStyle * {\n    LineColor red\n  }\n  :depth(1) {\n    BackgroundColor yellow\n  }\n  - {\n    LineThickness 1\n  }\n}\n</style>\n* Root\n** A <<myStyle>>",
      ),
    );
    expect(document.nodes.map((node) => node.label)).toEqual(["Root", "A"]);
    expect(document.diagnostics).toEqual([]);
  });

  it("flags a * rule inside <style>, which crashes the engine", () => {
    const document = parseMindmap(wrap("<style>\nmindmapDiagram {\n  * {\n    FontSize 12\n  }\n}\n</style>\n* Root"));
    expect(document.nodes.map((node) => node.label)).toEqual(["Root"]);
    expect(document.diagnostics).toHaveLength(1);
    expect(document.diagnostics[0]).toMatchObject({ severity: "error", code: "style-star-rule" });
  });

  describe("direction", () => {
    it.each([
      ["left to right direction", "left-to-right"],
      ["top to bottom direction", "top-to-bottom"],
      ["right to left direction", "right-to-left"],
      ["bottom to top direction", "bottom-to-top"],
    ])("parses %s with no diagnostic", (line, direction) => {
      const source = wrap(`${line}\n* Root`);
      const document = parseMindmap(source);
      expect(document.direction?.value).toBe(direction);
      expect(source.slice(document.direction!.range.from, document.direction!.range.to)).toBe(line);
      expect(document.diagnostics).toEqual([]);
      expect(document.nodes).toHaveLength(1);
    });

    it("is undefined when no line is written", () => {
      expect(parseMindmap(wrap("* Root")).direction).toBeUndefined();
    });
  });

  it("recognises title, caption, header, footer and legend without creating nodes", () => {
    const source = wrap(
      "caption figure 1\ntitle My title\nheader\nMy header\n* star line in the header\nendheader\ncenter footer My footer\nlegend right\n  Short\n  legend\nendlegend\n* Root\n** A",
    );
    const document = parseMindmap(source);
    expect(document.diagnostics).toEqual([]);
    expect(document.nodes.map((node) => node.label)).toEqual(["Root", "A"]);
    expect(document.caption).toMatchObject({ text: "figure 1", block: false });
    expect(document.title).toMatchObject({ text: "My title", block: false });
    expect(document.header).toMatchObject({ text: "My header\n* star line in the header", block: true });
    expect(document.footer).toMatchObject({ text: "My footer", placement: "center", block: false });
    expect(document.legend).toMatchObject({ text: "  Short\n  legend", placement: "right", block: true });
    expect(source.slice(document.title!.range.from, document.title!.range.to)).toBe("title My title");
    expect(source.slice(document.legend!.range.from, document.legend!.range.to)).toBe(
      "legend right\n  Short\n  legend\nendlegend",
    );
    expect(parseMindmap(wrap("title\nA\nB\nend title\n* R")).title).toMatchObject({ text: "A\nB", block: true });
  });

  it("reports an unclosed block instead of swallowing the diagram", () => {
    const document = parseMindmap(wrap("legend\nnever closed\n* Root"));
    expect(document.diagnostics.map((item) => item.code)).toEqual(["unclosed-block"]);
  });

  it("keeps multi-line labels together, including lines that start with a marker", () => {
    const document = parseMindmap(wrap("* Root\n**:line one\n- minus\n+ plus\n* star\n# hash;\n** next"));
    expect(document.diagnostics).toEqual([]);
    expect(document.nodes.map((node) => node.label)).toEqual([
      "Root",
      "line one\n- minus\n+ plus\n* star\n# hash",
      "next",
    ]);
  });

  it("reports arrow lines as unsupported and keeps them as unknown text", () => {
    const document = parseMindmap(wrap("* Root\n** A (a)\n** B (b)\na -> b"));
    expect(document.diagnostics).toMatchObject([{ severity: "warning", code: "unsupported-arrow" }]);
    expect(document.unknown.map((item) => item.text)).toEqual(["a -> b"]);
    expect(document.nodes.map((node) => node.label)).toEqual(["Root", "A (a)", "B (b)"]);
    expect(document.nodes[1]).not.toHaveProperty("alias");
  });

  it("reports mixed markers, missing parents, empty nodes and missing tags", () => {
    expect(codes("* Root\n+- Bad\n*** Orphan\n**")).toEqual([
      "mixed-marker",
      "missing-parent",
      "empty-node",
      "missing-start",
      "missing-end",
    ]);
  });

  it("handles CRLF source", () => {
    const document = parseMindmap("@startmindmap\r\ntitle T\r\n* Root\r\nleft side\r\n** A\r\n@endmindmap");
    expect(document.diagnostics).toEqual([]);
    expect(document.title?.text).toBe("T");
    expect(document.nodes.map((node) => [node.label, node.side])).toEqual([
      ["Root", "root"],
      ["A", "left"],
    ]);
  });

  it("finds the node at a position", () => {
    const document = parseMindmap(wrap("* A\n** B"));
    expect(findMindmapNodeAt(document, document.nodes[1]!.sourceRange.from + 1)?.label).toBe("B");
    expect(findMindmapNodeAt(document, 0)).toBeUndefined();
  });

  describe("emission order", () => {
    it("walks each root as the root, its right nodes, then its left nodes", () => {
      const document = parseMindmap(wrap("* R1\n-- L\n--- L1\n** R\n*** R1a\n* R2\n++ x\n-- y"));
      expect(mindmapEmissionOrder(document).map((node) => node.label)).toEqual([
        "R1",
        "R",
        "R1a",
        "L",
        "L1",
        "R2",
        "x",
        "y",
      ]);
    });

    it("matches the order of the texts the engine draws (S0 fixtures)", () => {
      const structure = JSON.parse(readFileSync("tests/fixtures/mindmap-svg/structure.json", "utf8")) as {
        fixtures: Record<string, { status: string; texts: Array<{ text: string; parents: string[] }> }>;
      };
      let compared = 0;
      for (const [name, fixture] of Object.entries(structure.fixtures)) {
        if (fixture.status !== "ok") continue;
        const source = readFileSync(`tests/fixtures/mindmap-svg/${name}.puml`, "utf8");
        const document = parseMindmap(source);
        // Only fixtures whose labels are plain single-line words give one drawn text per node.
        if (document.nodes.length === 0 || document.nodes.some((node) => !/^[\w .'-]+$/.test(node.label))) continue;
        if (document.diagnostics.some((item) => item.severity === "error")) continue;
        const drawn = fixture.texts
          .filter((item) => item.parents.join() === "g")
          .map((item) => item.text.trim())
          .filter(Boolean);
        const expected = mindmapEmissionOrder(document).map((node) => node.label.replace(/\s+/g, " "));
        if (drawn.join("|").replace(/\s+/g, " ") !== expected.join("|")) {
          // Labels with spaces can be drawn as several runs; compare after joining runs.
          expect(drawn.join(" ").replace(/\s+/g, " "), name).toBe(expected.join(" ").replace(/\s+/g, " "));
        }
        compared += 1;
      }
      expect(compared).toBeGreaterThan(15);
    });
  });
});
