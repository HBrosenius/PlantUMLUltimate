import { describe, expect, it } from "vitest";
import { settleMirroredMarkerFamilies } from "./families";
import { insertMindmapNode, moveMindmapSubtree, setMindmapNodeSide } from "./operations";
import { parseMindmap } from "./parser";

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

  it("is applied by the operations themselves, so a move under a + node never mixes families", () => {
    const source = RTL("* Root\n** A\n*** A1\n++ B\n-- C");
    const document = parseMindmap(source);
    const label = (doc: ReturnType<typeof parseMindmap>, name: string) => doc.nodes.find((n) => n.label === name)!;
    const moved = parseMindmap(moveMindmapSubtree(source, document, label(document, "A"), label(document, "B")));
    expect(label(moved, "A").marker[0]).toBe(label(moved, "B").marker[0]);
    expect(label(moved, "A1").marker[0]).toBe(label(moved, "B").marker[0]);
    expect(moved.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
  });

  it("is applied when a node is inserted below a + node or pushed to the other side", () => {
    const source = RTL("* Root\n++ B\n+++ B1\n-- C\n--- C1");
    const document = parseMindmap(source);
    const find = (doc: ReturnType<typeof parseMindmap>, name: string) => doc.nodes.find((n) => n.label === name)!;
    const inserted = parseMindmap(insertMindmapNode(source, document, { label: "New" }, find(document, "B1")));
    expect(find(inserted, "New").marker[0]).toBe("+");
    const flipped = parseMindmap(setMindmapNodeSide(source, document, find(document, "C"), "right"));
    expect(find(flipped, "C").marker[0]).toBe(find(flipped, "C1").marker[0]);
    expect(flipped.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
  });
});
