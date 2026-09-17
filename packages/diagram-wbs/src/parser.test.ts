import { describe, expect, it } from "vitest";
import { parseWbs } from "./parser";

describe("WBS parser", () => {
  it("rejects oversized input before applying grammar expressions", () => {
    expect(() => parseWbs(" ".repeat(100_001))).toThrow(/100,000 character limit/);
  });

  it("parses hierarchy, sides, styles, and source ranges", () => {
    const document = parseWbs(
      "@startwbs\n* Project\n**[#LightBlue] <color:#DarkBlue>Planning</color> <<phase>>\n-- Risk\n@endwbs",
    );
    expect(document.diagnostics).toEqual([]);
    expect(document.nodes.map(({ label, depth, side, parentId }) => ({ label, depth, side, parentId }))).toEqual([
      { label: "Project", depth: 1, side: "root", parentId: undefined },
      { label: "Planning", depth: 2, side: "right", parentId: "wbs-0" },
      { label: "Risk", depth: 2, side: "left", parentId: "wbs-0" },
    ]);
    expect(document.nodes[1]).toMatchObject({ color: "#LightBlue", textColor: "#DarkBlue", stereotype: "phase" });
  });

  it("diagnoses missing parents and required markers", () => {
    const document = parseWbs("*** Orphan");
    expect(document.diagnostics.map((item) => item.code)).toEqual(["missing-parent", "missing-start", "missing-end"]);
  });

  it("resolves parents by depth alone, regardless of a mismatched marker family", () => {
    const document = parseWbs("@startwbs\n* Project\n-- Left branch\n+++ Odd child\n@endwbs");
    expect(document.diagnostics).toEqual([]);
    expect(document.nodes.map(({ label, depth, parentId }) => ({ label, depth, parentId }))).toEqual([
      { label: "Project", depth: 1, parentId: undefined },
      { label: "Left branch", depth: 2, parentId: "wbs-0" },
      { label: "Odd child", depth: 3, parentId: "wbs-1" },
    ]);
  });

  it("parses node links, with and without an explicit label", () => {
    const document = parseWbs(
      "@startwbs\n* [[https://example.com/project Project]]\n** [[https://example.com/plan]]\n@endwbs",
    );
    expect(document.diagnostics).toEqual([]);
    expect(document.nodes[0]).toMatchObject({ label: "Project", link: "https://example.com/project" });
    expect(document.nodes[1]).toMatchObject({ label: "https://example.com/plan", link: "https://example.com/plan" });
  });

  it("parses an OpenIconic/sprite icon out of a node label", () => {
    const document = parseWbs("@startwbs\n* <&home> Home\n** <$custom-sprite> Detail\n@endwbs");
    expect(document.diagnostics).toEqual([]);
    expect(document.nodes[0]).toMatchObject({ label: "Home", icon: "&home" });
    expect(document.nodes[1]).toMatchObject({ label: "Detail", icon: "$custom-sprite" });
  });

  it("parses a multiline node label spanning several source lines", () => {
    const document = parseWbs("@startwbs\n*: Line one\nLine two;\n** Sibling\n@endwbs");
    expect(document.diagnostics).toEqual([]);
    expect(document.nodes[0]).toMatchObject({ label: "Line one\nLine two", depth: 1 });
    expect(document.nodes[1]).toMatchObject({ label: "Sibling", depth: 2, parentId: "wbs-0" });
  });

  it("parses a multiline label combined with an inline text color and stereotype", () => {
    const document = parseWbs(
      "@startwbs\n*: <color:#Blue>Line one\nLine two</color>;\n@endwbs",
    );
    expect(document.diagnostics).toEqual([]);
    expect(document.nodes[0]).toMatchObject({ label: "Line one\nLine two", textColor: "#Blue" });
  });

  it("parses a multiline label wrapped in a link, without the URL leaking into the label", () => {
    const document = parseWbs(
      "@startwbs\n*: [[https://example.com/plan Line one\nLine two]];\n@endwbs",
    );
    expect(document.diagnostics).toEqual([]);
    expect(document.nodes[0]).toMatchObject({ label: "Line one\nLine two", link: "https://example.com/plan" });
  });

  it("parses aliased nodes and arrows", () => {
    const document = parseWbs("@startwbs\n*(project) Project\n**(plan) Plan\nproject ..> plan #blue\n@endwbs");
    expect(document.nodes.map((node) => node.alias)).toEqual(["project", "plan"]);
    expect(document.relationships).toMatchObject([{ from: "project", to: "plan", arrow: "..>", color: "#blue" }]);
    expect(document.unknown).toEqual([]);
  });
});
