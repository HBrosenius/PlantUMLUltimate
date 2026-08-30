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

  it("parses aliased nodes and arrows", () => {
    const document = parseWbs("@startwbs\n*(project) Project\n**(plan) Plan\nproject ..> plan #blue\n@endwbs");
    expect(document.nodes.map((node) => node.alias)).toEqual(["project", "plan"]);
    expect(document.relationships).toMatchObject([{ from: "project", to: "plan", arrow: "..>", color: "#blue" }]);
    expect(document.unknown).toEqual([]);
  });
});
