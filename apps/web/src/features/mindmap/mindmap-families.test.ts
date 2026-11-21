import { describe, expect, it } from "vitest";
import { applySourceEdits } from "@plantuml-studio/diagram-gantt";
import { parseMindmap } from "@plantuml-studio/diagram-mindmap";
import { applicationMindmapAdapter } from "../../diagram-adapters";
import { settleMirroredMarkerFamilies } from "./mindmap-families";

const RTL = (body: string) => `@startmindmap\nright to left direction\n${body}\n@endmindmap`;

describe("settleMirroredMarkerFamilies", () => {
  it("gives the children of a + node the + family in a right to left mindmap", () => {
    expect(settleMirroredMarkerFamilies(RTL("* Root\n++ B\n+++ A\n**** A1\n-- C"))).toBe(
      RTL("* Root\n++ B\n+++ A\n++++ A1\n-- C"),
    );
  });

  it("gives the children of a * node the * family", () => {
    expect(settleMirroredMarkerFamilies(RTL("* Root\n** B\n+++ A\n++++ A1"))).toBe(RTL("* Root\n** B\n*** A\n**** A1"));
  });

  it("settles a whole branch below a changed node and keeps indentation and colours", () => {
    expect(settleMirroredMarkerFamilies(RTL("* Root\n++ B\n  ***[#red] A\n  **** A1\n  ***** A2"))).toBe(
      RTL("* Root\n++ B\n  +++[#red] A\n  ++++ A1\n  +++++ A2"),
    );
  });

  it("works in bottom to top documents too", () => {
    const source = "@startmindmap\nbottom to top direction\n* Root\n++ B\n*** A\n@endmindmap";
    expect(settleMirroredMarkerFamilies(source)).toBe(
      "@startmindmap\nbottom to top direction\n* Root\n++ B\n+++ A\n@endmindmap",
    );
  });

  it("leaves a consistent mirrored document, - branches and multi-line labels alone", () => {
    const fine = RTL("* Root\n++ B\n+++ A\n** C\n*** C1\n-- D\n--- D1");
    expect(settleMirroredMarkerFamilies(fine)).toBe(fine);
    const multiline = RTL("* Root\n++ B\n**:two\nlines;");
    expect(settleMirroredMarkerFamilies(multiline)).toBe(multiline);
  });

  it("never touches a left to right or top to bottom document, where the mix is valid", () => {
    const ltr = "@startmindmap\n* Root\n++ B\n+++ A\n**** A1\n@endmindmap";
    expect(settleMirroredMarkerFamilies(ltr)).toBe(ltr);
    const ttb = "@startmindmap\ntop to bottom direction\n* Root\n++ B\n*** A\n@endmindmap";
    expect(settleMirroredMarkerFamilies(ttb)).toBe(ttb);
  });

  it("repairs the result of a real move under a + node", () => {
    const source = RTL("* Root\n** A\n*** A1\n++ B\n-- C");
    const document = parseMindmap(source);
    const moved = applicationMindmapAdapter.applyVisualOperation(
      {
        kind: "move-subtree",
        nodeId: document.nodes.find((n) => n.label === "A")!.id,
        parentId: document.nodes.find((n) => n.label === "B")!.id,
      },
      document,
      source,
    );
    const raw = applySourceEdits(source, moved.edits);
    const settled = settleMirroredMarkerFamilies(raw);
    const result = parseMindmap(settled);
    const label = (name: string) => result.nodes.find((n) => n.label === name)!;
    // A and its child share one family, the one of B.
    expect(label("A").marker[0]).toBe(label("B").marker[0]);
    expect(label("A1").marker[0]).toBe(label("B").marker[0]);
    expect(result.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
  });
});
