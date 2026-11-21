import { describe, expect, it } from "vitest";
import { mindmapAdapter, type MindmapVisualOperation } from "./adapter";
import {
  convertMindmapToOrgMode,
  deleteMindmapNode,
  insertMindmapNode,
  moveMindmapSubtree,
  reorderMindmapNode,
  setMindmapCaption,
  setMindmapDirection,
  setMindmapFooter,
  setMindmapHeader,
  setMindmapLegend,
  setMindmapNodeBoxless,
  setMindmapNodeSide,
  setMindmapTitle,
  updateMindmapNode,
} from "./operations";
import { mindmapSideAt, parseMindmap } from "./parser";
import { collectMindmapSymbolOccurrences } from "./symbols";

const toCrlf = (value: string) => value.replace(/\n/g, "\r\n");
const noLoneLineFeed = (value: string) => expect(value.replace(/\r\n/g, "")).not.toMatch(/\n/);
const byLabel = (source: string, label: string) => parseMindmap(source).nodes.find((node) => node.label === label)!;
const sides = (source: string) => parseMindmap(source).nodes.map((node) => `${node.label}:${node.side}`);

describe("mindmap operations", () => {
  const lf = "@startmindmap\n* Root\n** A\n*** A1\n++ B\n-- C\n@endmindmap";

  it("inserts a root, a child and a sibling before the end tag", () => {
    const document = parseMindmap(lf);
    expect(insertMindmapNode(lf, document, { label: "Z" })).toBe(
      "@startmindmap\n* Root\n** A\n*** A1\n++ B\n-- C\n* Z\n@endmindmap",
    );
    expect(insertMindmapNode(lf, document, { label: "A2" }, byLabel(lf, "A"))).toContain("*** A1\n*** A2\n++ B");
    expect(insertMindmapNode(lf, document, { label: "D" }, undefined, byLabel(lf, "C"))).toContain("-- C\n-- D\n@end");
    expect(insertMindmapNode(lf, document, { label: "E" }, undefined, byLabel(lf, "B"))).toContain("++ B\n++ E\n-- C");
  });

  it("gives a new depth-2 node the side it is asked for, with the marker family that holds", () => {
    const document = parseMindmap(lf);
    const root = byLabel(lf, "Root");
    expect(insertMindmapNode(lf, document, { label: "L", side: "left" }, root)).toContain("-- C\n-- L\n@end");
    expect(sides(insertMindmapNode(lf, document, { label: "R", side: "right" }, root))).toContain("R:right");
    // Under `left side` a plain * child is left, and a requested right side uses + markers.
    const withSwitch = "@startmindmap\n* Root\n** A\nleft side\n** B\n@endmindmap";
    const switched = parseMindmap(withSwitch);
    const natural = insertMindmapNode(withSwitch, switched, { label: "N" }, byLabel(withSwitch, "Root"));
    expect(sides(natural)).toEqual(["Root:root", "A:right", "B:left", "N:left"]);
    const forced = insertMindmapNode(withSwitch, switched, { label: "N", side: "right" }, byLabel(withSwitch, "Root"));
    expect(forced).toContain("** B\n++ N\n");
    expect(sides(forced)).toEqual(["Root:root", "A:right", "B:left", "N:right"]);
    // A sibling of a left node, placed after the last node of the left group, is left.
    expect(
      sides(insertMindmapNode(withSwitch, switched, { label: "S" }, undefined, byLabel(withSwitch, "B"))),
    ).toContain("S:left");
    expect(
      sides(insertMindmapNode(withSwitch, switched, { label: "S" }, undefined, byLabel(withSwitch, "A"))),
    ).toContain("S:right");
  });

  it("writes a multi-line label with * markers even where a + or - family would apply", () => {
    const document = parseMindmap(lf);
    const left = insertMindmapNode(lf, document, { label: "two\nlines", side: "left" }, byLabel(lf, "Root"));
    expect(left).not.toMatch(/--:/);
    expect(left).toContain("left side\n**: two\nlines;\n");
    const deep = insertMindmapNode(lf, document, { label: "p\nq" }, byLabel(lf, "B"));
    expect(deep).toContain("++ B\n**: p\nq;".replace("**:", "***:"));
    expect(parseMindmap(left).diagnostics).toEqual([]);
    expect(sides(left)).toContain("two\nlines:left");
  });

  it("updates label, colour, text colour, class, icon and link while keeping marker and boxless", () => {
    const source = "@startmindmap\n* Root\n--_ Left box\n** A\n@endmindmap";
    const node = byLabel(source, "Left box");
    const next = updateMindmapNode(source, node, {
      label: "Renamed",
      color: "#Orange",
      stereotype: "green",
      icon: "&flag",
    });
    expect(next).toBe("@startmindmap\n* Root\n--[#Orange]_ <&flag> Renamed <<green>>\n** A\n@endmindmap");
    expect(parseMindmap(next).nodes[1]).toMatchObject({ boxless: true, side: "left", label: "Renamed" });
  });

  it("keeps * markers when an update turns a + or - node into a multi-line one", () => {
    const next = updateMindmapNode(lf, byLabel(lf, "C"), { label: "c1\nc2" });
    expect(next).toContain("**: c1\nc2;");
    expect(next).not.toMatch(/--:/);
    // The node was on the left; it stays there through a `left side` line.
    expect(sides(next)).toContain("c1\nc2:left");
    expect(parseMindmap(next).diagnostics).toEqual([]);
  });

  it("changes the side while updating a node", () => {
    const next = updateMindmapNode(lf, byLabel(lf, "B"), { label: "B", side: "left" });
    expect(next).toContain("-- B");
    expect(sides(next)).toContain("B:left");
  });

  it("toggles boxless by editing only the marker", () => {
    const boxed = setMindmapNodeBoxless(lf, byLabel(lf, "A"), true);
    expect(boxed).toBe(lf.replace("** A", "**_ A"));
    expect(setMindmapNodeBoxless(boxed, byLabel(boxed, "A"), false)).toBe(lf);
    expect(setMindmapNodeBoxless(lf, byLabel(lf, "A"), false)).toBe(lf);
  });

  it("writes the boxless underscore after the colour, where the engine reads it", () => {
    const coloured = "@startmindmap\n* Root\n**[#lightgreen] A\n@endmindmap";
    const boxed = setMindmapNodeBoxless(coloured, byLabel(coloured, "A"), true);
    expect(boxed).toBe("@startmindmap\n* Root\n**[#lightgreen]_ A\n@endmindmap");
    expect(parseMindmap(boxed).nodes[1]).toMatchObject({ boxless: true, color: "#lightgreen", label: "A" });
    expect(setMindmapNodeBoxless(boxed, byLabel(boxed, "A"), false)).toBe(coloured);
    // Updating a boxless node's colour keeps the underscore behind it.
    const recoloured = updateMindmapNode(boxed, byLabel(boxed, "A"), { label: "A", color: "#FFBBCC" });
    expect(recoloured).toBe("@startmindmap\n* Root\n**[#FFBBCC]_ A\n@endmindmap");
  });

  describe("sides and families the engine accepts", () => {
    it("gives a child of a left node the - family and a child of a right node the right one", () => {
      const source = "@startmindmap\n* Root\n++ R\n-- L\n@endmindmap";
      const document = parseMindmap(source);
      expect(insertMindmapNode(source, document, { label: "c" }, byLabel(source, "L"))).toContain("-- L\n--- c");
      expect(insertMindmapNode(source, document, { label: "c" }, byLabel(source, "R"))).toContain("++ R\n+++ c");
    });

    it("rewrites a moved left subtree when it lands under a right parent, and the other way round", () => {
      const source = "@startmindmap\n* Root\n++ R\n-- L\n--- L1\n---- L2\n@endmindmap";
      const document = parseMindmap(source);
      const next = moveMindmapSubtree(source, document, byLabel(source, "L"), byLabel(source, "R"));
      expect(next).toBe("@startmindmap\n* Root\n++ R\n+++ L\n++++ L1\n+++++ L2\n@endmindmap");
      expect(parseMindmap(next).diagnostics).toEqual([]);
      const back = moveMindmapSubtree(
        next,
        parseMindmap(next),
        byLabel(next, "L1"),
        byLabel(next, "Root"),
        undefined,
        "left",
      );
      expect(parseMindmap(back).diagnostics).toEqual([]);
      expect(sides(back)).toContain("L1:left");
    });

    it("diagnoses a child on the other side than its parent, as the engine rejects it", () => {
      for (const body of ["* R\n-- L\n*** L1", "* R\n** A\n--- A1", "* R\n++ P\nleft side\n*** P1", "* R\n++:m\nx;"]) {
        const codes = parseMindmap(`@startmindmap\n${body}\n@endmindmap`).diagnostics.map((item) => item.code);
        expect(
          codes.some((code) => code === "side-mismatch" || code === "multiline-marker"),
          body,
        ).toBe(true);
      }
      // Both the parent and the child are right-hand nodes, or both are left-hand nodes.
      for (const body of ["* R\n++ P\n*** P1", "* R\n** A\n+++ A1", "* R\nleft side\n** A\n--- A1"])
        expect(parseMindmap(`@startmindmap\n${body}\n@endmindmap`).diagnostics, body).toEqual([]);
    });
  });

  it("deletes a whole subtree", () => {
    expect(deleteMindmapNode(lf, byLabel(lf, "A"))).toBe("@startmindmap\n* Root\n++ B\n-- C\n@endmindmap");
  });

  describe("moving and reordering", () => {
    it("moves a subtree to a new parent and re-sizes it", () => {
      const document = parseMindmap(lf);
      const next = moveMindmapSubtree(lf, document, byLabel(lf, "A"), byLabel(lf, "B"));
      expect(next).toBe("@startmindmap\n* Root\n++ B\n+++ A\n**** A1\n-- C\n@endmindmap");
    });

    it("keeps a depth-2 node's side when it is reordered", () => {
      const source = "@startmindmap\n* Root\n++ R1\n-- L1\n++ R2\n-- L2\n@endmindmap";
      const document = parseMindmap(source);
      const next = reorderMindmapNode(source, document, byLabel(source, "L2"), byLabel(source, "R1"));
      expect(next).toBe("@startmindmap\n* Root\n-- L2\n++ R1\n-- L1\n++ R2\n@endmindmap");
      expect(sides(next)).toContain("L2:left");
    });

    it("drags a depth-2 node across the left side line", () => {
      const source = "@startmindmap\n* Root\n** A\n** B\nleft side\n** C\n** D\n@endmindmap";
      const document = parseMindmap(source);
      const toLeft = moveMindmapSubtree(
        source,
        document,
        byLabel(source, "A"),
        byLabel(source, "Root"),
        undefined,
        "left",
      );
      expect(sides(toLeft)).toEqual(["Root:root", "B:right", "C:left", "D:left", "A:left"]);
      const toRight = moveMindmapSubtree(
        source,
        document,
        byLabel(source, "D"),
        byLabel(source, "Root"),
        byLabel(source, "B"),
        "right",
      );
      expect(sides(toRight)).toEqual(["Root:root", "A:right", "D:right", "B:right", "C:left"]);
      // Reordering under the same parent keeps the side, wherever the node is dropped.
      const same = moveMindmapSubtree(
        source,
        document,
        byLabel(source, "A"),
        byLabel(source, "Root"),
        byLabel(source, "D"),
      );
      expect(sides(same)).toContain("A:right");
      // A node that comes from deeper down lands on its new neighbour's side.
      const nested = "@startmindmap\n* Root\n** A\n*** A1\nleft side\n** D\n@endmindmap";
      const beside = moveMindmapSubtree(
        nested,
        parseMindmap(nested),
        byLabel(nested, "A1"),
        byLabel(nested, "Root"),
        byLabel(nested, "D"),
      );
      expect(sides(beside)).toEqual(["Root:root", "A:right", "A1:left", "D:left"]);
    });

    it("refuses to move a node into its own subtree", () => {
      const document = parseMindmap(lf);
      expect(moveMindmapSubtree(lf, document, byLabel(lf, "A"), byLabel(lf, "A1"))).toBe(lf);
    });

    it("keeps a multi-line node at * markers when it is dragged to the other side", () => {
      const source = "@startmindmap\n* Root\n** A\n**:m1\nm2;\n** B\nleft side\n** C\n@endmindmap";
      const document = parseMindmap(source);
      const next = moveMindmapSubtree(
        source,
        document,
        byLabel(source, "m1\nm2"),
        byLabel(source, "Root"),
        undefined,
        "left",
      );
      expect(next).not.toMatch(/[+-]{2}:/);
      expect(sides(next)).toEqual(["Root:root", "A:right", "B:right", "C:left", "m1\nm2:left"]);
      expect(parseMindmap(next).diagnostics).toEqual([]);
    });

    it("leaves lines that start with a marker inside a multi-line label alone", () => {
      const source = "@startmindmap\n* Root\n** A\n***:keep\n- minus\n+ plus\n* star\n# hash;\n** B\n@endmindmap";
      const document = parseMindmap(source);
      const next = moveMindmapSubtree(source, document, byLabel(source, "A"), byLabel(source, "B"));
      expect(next).toContain("*** A\n****:keep\n- minus\n+ plus\n* star\n# hash;");
    });
  });

  describe("setting the side", () => {
    it("rewrites only marker characters, whatever the switch says, and keeps a - subtree all -", () => {
      const source = "@startmindmap\n* Root\n** A\n*** A1\nleft side\n** B\n@endmindmap";
      const document = parseMindmap(source);
      const a = setMindmapNodeSide(source, document, byLabel(source, "A"), "left");
      // The engine rejects a * child below a - node, so the subtree follows.
      expect(a).toBe(source.replace("** A\n*** A1", "-- A\n--- A1"));
      expect(sides(a)).toEqual(["Root:root", "A:left", "A1:left", "B:left"]);
      expect(parseMindmap(a).diagnostics).toEqual([]);
      const b = setMindmapNodeSide(source, document, byLabel(source, "B"), "right");
      expect(b).toBe(source.replace("** B", "++ B"));
      expect(sides(b)).toContain("B:right");
      expect(setMindmapNodeSide(source, document, byLabel(source, "A"), "right")).toBe(source);
      // And back to the right: no - marker may stay below a node that is no longer a - node.
      const back = setMindmapNodeSide(a, parseMindmap(a), byLabel(a, "A"), "right");
      expect(back).toBe(source.replace("** A\n*** A1", "++ A\n+++ A1"));
      expect(parseMindmap(back).diagnostics).toEqual([]);
    });

    it("rewrites every node line of the subtree", () => {
      const source = "@startmindmap\n* Root\n** A\n*** A1\n**** A2\n*** A3\n@endmindmap";
      const left = setMindmapNodeSide(source, parseMindmap(source), byLabel(source, "A"), "left");
      expect(left).toBe("@startmindmap\n* Root\n-- A\n--- A1\n---- A2\n--- A3\n@endmindmap");
    });

    it("keeps * markers for a subtree that holds a multi-line label, and moves it instead", () => {
      const source = "@startmindmap\n* Root\n++ A\n+++ A1\n***:m1\nm2;\n-- L\n--- L1\n@endmindmap";
      const toLeft = setMindmapNodeSide(source, parseMindmap(source), byLabel(source, "A"), "left");
      expect(toLeft).toBe("@startmindmap\n* Root\n-- L\n--- L1\nleft side\n** A\n*** A1\n***:m1\nm2;\n@endmindmap");
      expect(parseMindmap(toLeft).diagnostics).toEqual([]);
      expect(sides(toLeft)).toEqual(["Root:root", "L:left", "L1:left", "A:left", "A1:left", "m1\nm2:left"]);
    });

    it("rewrites a left subtree that gets a multi-line child, because * below - is rejected", () => {
      const source = "@startmindmap\n* Root\n-- L\n--- L1\n++ R\n@endmindmap";
      const next = insertMindmapNode(source, parseMindmap(source), { label: "a\nb" }, byLabel(source, "L"));
      expect(parseMindmap(next).diagnostics).toEqual([]);
      expect(sides(next)).toEqual(["Root:root", "R:right", "L:left", "L1:left", "a\nb:left"]);
      expect(next).toBe("@startmindmap\n* Root\n++ R\nleft side\n** L\n--- L1\n***: a\nb;\n@endmindmap");
    });

    it("leaves a + node on the right even after left side", () => {
      const source = "@startmindmap\n+ Root\n++ R\nleft side\n++ P\n-- M\n@endmindmap";
      expect(sides(source)).toEqual(["Root:root", "R:right", "P:right", "M:left"]);
    });

    it("keeps the boxless marker", () => {
      const source = "@startmindmap\n* Root\n**_ A\n@endmindmap";
      expect(setMindmapNodeSide(source, parseMindmap(source), byLabel(source, "A"), "left")).toBe(
        source.replace("**_ A", "--_ A"),
      );
    });

    it("only changes depth-2 nodes", () => {
      const document = parseMindmap(lf);
      expect(setMindmapNodeSide(lf, document, byLabel(lf, "A1"), "left")).toBe(lf);
      expect(setMindmapNodeSide(lf, document, byLabel(lf, "Root"), "left")).toBe(lf);
    });

    describe("multi-line nodes keep * markers and move instead", () => {
      it("moves a node after the existing left side line", () => {
        const source = "@startmindmap\n* Root\n**:m1\nm2;\n** B\nleft side\n** C\n@endmindmap";
        const next = setMindmapNodeSide(source, parseMindmap(source), byLabel(source, "m1\nm2"), "left");
        expect(next).toBe("@startmindmap\n* Root\n** B\nleft side\n** C\n**:m1\nm2;\n@endmindmap");
        expect(sides(next)).toEqual(["Root:root", "B:right", "C:left", "m1\nm2:left"]);
      });

      it("moves a node before the left side line to put it on the right", () => {
        const source = "@startmindmap\n* Root\n** A\nleft side\n**:m1\nm2;\n** C\n@endmindmap";
        const next = setMindmapNodeSide(source, parseMindmap(source), byLabel(source, "m1\nm2"), "right");
        expect(next).toBe("@startmindmap\n* Root\n** A\n**:m1\nm2;\nleft side\n** C\n@endmindmap");
        expect(sides(next)).toEqual(["Root:root", "A:right", "m1\nm2:right", "C:left"]);
      });

      it("inserts a left side line, and no restore line when nothing follows", () => {
        const source = "@startmindmap\n* Root\n** A\n**:m1\nm2;\n@endmindmap";
        const next = setMindmapNodeSide(source, parseMindmap(source), byLabel(source, "m1\nm2"), "left");
        expect(next).toBe("@startmindmap\n* Root\n** A\nleft side\n**:m1\nm2;\n@endmindmap");
      });

      it("restores the previous side when a later root depends on it", () => {
        const source = "@startmindmap\n* R1\n**:m1\nm2;\n* R2\n** c\n@endmindmap";
        const next = setMindmapNodeSide(source, parseMindmap(source), byLabel(source, "m1\nm2"), "left");
        expect(next).toBe("@startmindmap\n* R1\nleft side\n**:m1\nm2;\nright side\n* R2\n** c\n@endmindmap");
        expect(sides(next)).toEqual(["R1:root", "m1\nm2:left", "R2:root", "c:right"]);
      });

      it("uses the switch of an earlier root, which is document-wide", () => {
        const source = "@startmindmap\n* R1\n** a\nleft side\n** b\n* R2\n**:m1\nm2;\n@endmindmap";
        const document = parseMindmap(source);
        expect(mindmapSideAt(document, source.indexOf("**:m1"))).toBe("left");
        const next = setMindmapNodeSide(source, document, byLabel(source, "m1\nm2"), "right");
        expect(sides(next)).toEqual(["R1:root", "a:right", "b:left", "R2:root", "m1\nm2:right"]);
        expect(next).not.toMatch(/[+-]{2}:/);
      });

      it("refuses when the node has a side line inside it", () => {
        const source = "@startmindmap\n* Root\n**:m1\nm2;\n*** deep\nleft side\n*** deeper\n@endmindmap";
        expect(setMindmapNodeSide(source, parseMindmap(source), byLabel(source, "m1\nm2"), "left")).toBe(source);
      });
    });
  });

  describe("diagram furniture", () => {
    const base = "@startmindmap\n* Root\n@endmindmap";

    it("adds, replaces and removes a title", () => {
      const added = setMindmapTitle(base, parseMindmap(base), "My title");
      expect(added).toBe("@startmindmap\ntitle My title\n* Root\n@endmindmap");
      const replaced = setMindmapTitle(added, parseMindmap(added), "Other");
      expect(replaced).toBe("@startmindmap\ntitle Other\n* Root\n@endmindmap");
      expect(setMindmapTitle(replaced, parseMindmap(replaced), undefined)).toBe(base);
      expect(setMindmapTitle(replaced, parseMindmap(replaced), "  ")).toBe(base);
      const block = setMindmapTitle(base, parseMindmap(base), "a\nb");
      expect(block).toBe("@startmindmap\ntitle\na\nb\nend title\n* Root\n@endmindmap");
      expect(parseMindmap(block).title).toMatchObject({ text: "a\nb", block: true });
      expect(setMindmapTitle(block, parseMindmap(block), undefined)).toBe(base);
    });

    it("sets a caption as one line", () => {
      const next = setMindmapCaption(base, parseMindmap(base), "figure\n1");
      expect(next).toBe("@startmindmap\ncaption figure\\n1\n* Root\n@endmindmap");
      expect(setMindmapCaption(next, parseMindmap(next), undefined)).toBe(base);
    });

    it("sets header and footer, keeping their position keyword and form", () => {
      const source = "@startmindmap\nright header\nOld\nendheader\ncenter footer Old foot\n* Root\n@endmindmap";
      const document = parseMindmap(source);
      const header = setMindmapHeader(source, document, "New head", undefined);
      expect(header).toContain("right header\nNew head\nendheader\n");
      const footer = setMindmapFooter(source, document, "New foot");
      expect(footer).toContain("center footer New foot\n* Root");
      expect(setMindmapFooter(source, document, "New foot", "left")).toContain("left footer New foot\n");
      expect(setMindmapHeader(source, document, undefined)).toBe(
        "@startmindmap\ncenter footer Old foot\n* Root\n@endmindmap",
      );
      const added = setMindmapHeader(base, parseMindmap(base), "H");
      expect(added).toBe("@startmindmap\nheader H\n* Root\n@endmindmap");
      expect(setMindmapFooter(base, parseMindmap(base), "a\nb")).toBe(
        "@startmindmap\nfooter\na\nb\nendfooter\n* Root\n@endmindmap",
      );
    });

    it("sets a legend block, keeping its placement", () => {
      const source = "@startmindmap\nlegend right\nOld\nendlegend\n* Root\n@endmindmap";
      const replaced = setMindmapLegend(source, parseMindmap(source), "New\nlines");
      expect(replaced).toBe("@startmindmap\nlegend right\nNew\nlines\nendlegend\n* Root\n@endmindmap");
      expect(setMindmapLegend(source, parseMindmap(source), "New", "left top")).toContain("legend left top\nNew\n");
      expect(setMindmapLegend(source, parseMindmap(source), undefined)).toBe(base);
      expect(setMindmapLegend(base, parseMindmap(base), "L")).toBe(
        "@startmindmap\nlegend\nL\nendlegend\n* Root\n@endmindmap",
      );
    });

    it("sets and removes the direction", () => {
      const added = setMindmapDirection(base, parseMindmap(base), "top-to-bottom");
      expect(added).toBe("@startmindmap\ntop to bottom direction\n* Root\n@endmindmap");
      const changed = setMindmapDirection(added, parseMindmap(added), "right-to-left");
      expect(changed).toBe("@startmindmap\nright to left direction\n* Root\n@endmindmap");
      expect(setMindmapDirection(changed, parseMindmap(changed), undefined)).toBe(base);
    });

    it("works without a start tag", () => {
      expect(setMindmapTitle("* Root", parseMindmap("* Root"), "T")).toBe("title T\n* Root");
    });
  });

  describe("convertMindmapToOrgMode", () => {
    it("rewrites headers", () => {
      const source = "@startmindmap\n# root\n## first <<c>>\n### second\n@endmindmap";
      expect(convertMindmapToOrgMode(source, parseMindmap(source))).toBe(
        "@startmindmap\n* root\n** first <<c>>\n*** second\n@endmindmap",
      );
    });

    it("rewrites indented bullets, keeping colours and everything else", () => {
      const source =
        "@startmindmap\ntitle T\n*[#Orange] root\n\t*[#lightgreen] some first level node <<green>>\n\t\t* second\n\t* another\n* Next root\n@endmindmap";
      const next = convertMindmapToOrgMode(source, parseMindmap(source));
      expect(next).toBe(
        "@startmindmap\ntitle T\n*[#Orange] root\n**[#lightgreen] some first level node <<green>>\n*** second\n** another\n* Next root\n@endmindmap",
      );
      const before = parseMindmap(source).nodes.map(({ label, depth, color, stereotype }) => ({
        label,
        depth,
        color,
        stereotype,
      }));
      const converted = parseMindmap(next);
      expect(
        converted.nodes.map(({ label, depth, color, stereotype }) => ({ label, depth, color, stereotype })),
      ).toEqual(before);
      expect(converted.nodes.some((node) => node.markdown)).toBe(false);
      expect(converted.diagnostics).toEqual([]);
    });

    it("fixes a header and list mix the engine rejects, and leaves OrgMode alone", () => {
      const source = "@startmindmap\n# Root\n## Child\n  * Under child\n@endmindmap";
      const next = convertMindmapToOrgMode(source, parseMindmap(source));
      expect(next).toBe("@startmindmap\n* Root\n** Child\n*** Under child\n@endmindmap");
      expect(parseMindmap(next).diagnostics).toEqual([]);
      expect(convertMindmapToOrgMode(lf, parseMindmap(lf))).toBe(lf);
    });
  });

  describe("source-only (Markdown form) nodes", () => {
    const source = "@startmindmap\n* Root\n * Child\n  * Grand\n* Other\n@endmindmap";
    const apply = (operation: MindmapVisualOperation, text = source) =>
      mindmapAdapter.applyVisualOperation(operation, parseMindmap(text), text);

    it("refuses visual edits with the convert hint", () => {
      const reason = "Convert to * markers to edit visually";
      const child = parseMindmap(source).nodes[1]!.id;
      const root = parseMindmap(source).nodes[0]!.id;
      expect(apply({ kind: "update-node", nodeId: child, value: { label: "x" } })).toEqual({
        edits: [],
        unavailableReason: reason,
      });
      expect(apply({ kind: "set-side", nodeId: child, side: "left" }).unavailableReason).toBe(reason);
      expect(apply({ kind: "toggle-boxless", nodeId: child }).unavailableReason).toBe(reason);
      expect(
        apply({ kind: "move-subtree", nodeId: child, parentId: parseMindmap(source).nodes[3]!.id }).unavailableReason,
      ).toBe(reason);
      // A parent that has list children cannot take a new child or be moved.
      expect(apply({ kind: "insert-node", parentId: root, value: { label: "x" } }).unavailableReason).toBe(reason);
      expect(apply({ kind: "move-subtree", nodeId: root }).unavailableReason).toBe(reason);
      // Deleting only removes lines, so it stays available.
      expect(apply({ kind: "delete-node", nodeId: child }).edits).toHaveLength(1);
      // A node outside the list can be edited.
      expect(
        apply({ kind: "update-node", nodeId: parseMindmap(source).nodes[3]!.id, value: { label: "Renamed" } }).edits,
      ).toHaveLength(1);
    });

    it("offers the conversion as an operation", () => {
      const result = apply({ kind: "convert-to-orgmode" });
      expect(result.edits).toHaveLength(1);
      expect(apply({ kind: "convert-to-orgmode" }, lf).unavailableReason).toBe("The mindmap already uses * markers");
    });
  });

  describe("CRLF source", () => {
    const crlf = toCrlf("@startmindmap\n* Root\n** A\n*** A1\n++ B\n-- C\n**:m1\nm2;\nleft side\n** D\n@endmindmap");
    const document = parseMindmap(crlf);
    const node = (label: string) => document.nodes.find((item) => item.label === label)!;

    it("keeps CRLF through every operation", () => {
      const results = [
        insertMindmapNode(crlf, document, { label: "N" }),
        insertMindmapNode(crlf, document, { label: "N" }, node("Root")),
        insertMindmapNode(crlf, document, { label: "N", side: "left" }, node("Root")),
        insertMindmapNode(crlf, document, { label: "N\nM", side: "left" }, node("Root")),
        insertMindmapNode(crlf, document, { label: "N" }, undefined, node("A")),
        updateMindmapNode(crlf, node("C"), { label: "C\nmore" }),
        setMindmapNodeBoxless(crlf, node("A"), true),
        deleteMindmapNode(crlf, node("A")),
        moveMindmapSubtree(crlf, document, node("A"), node("B")),
        moveMindmapSubtree(crlf, document, node("A"), node("Root"), undefined, "left"),
        moveMindmapSubtree(crlf, document, node("m1\nm2"), node("Root"), undefined, "left"),
        reorderMindmapNode(crlf, document, node("D"), node("A")),
        setMindmapNodeSide(crlf, document, node("m1\nm2"), "left"),
        setMindmapNodeSide(crlf, document, node("A"), "left"),
        setMindmapTitle(crlf, document, "T"),
        setMindmapTitle(crlf, document, "T\nU"),
        setMindmapCaption(crlf, document, "C"),
        setMindmapHeader(crlf, document, "H\nI"),
        setMindmapFooter(crlf, document, "F"),
        setMindmapLegend(crlf, document, "L\nM"),
        setMindmapDirection(crlf, document, "top-to-bottom"),
      ];
      for (const [index, result] of results.entries()) {
        expect(result, `result ${index}`).not.toBe(crlf);
        noLoneLineFeed(result);
        expect(parseMindmap(result).diagnostics.filter((item) => item.severity === "error")).toEqual([]);
      }
    });

    it("removes and replaces furniture without leaving a stray CR", () => {
      const withTitle = setMindmapTitle(crlf, document, "T");
      expect(withTitle.startsWith("@startmindmap\r\ntitle T\r\n* Root\r\n")).toBe(true);
      expect(setMindmapTitle(withTitle, parseMindmap(withTitle), undefined)).toBe(crlf);
      const replaced = setMindmapTitle(withTitle, parseMindmap(withTitle), "Other");
      expect(replaced.startsWith("@startmindmap\r\ntitle Other\r\n* Root")).toBe(true);
      const block = setMindmapHeader(withTitle, parseMindmap(withTitle), "a\nb");
      expect(setMindmapHeader(block, parseMindmap(block), undefined)).toBe(withTitle);
    });
  });

  describe("adapter", () => {
    const apply = (operation: MindmapVisualOperation, text = lf) =>
      mindmapAdapter.applyVisualOperation(operation, parseMindmap(text), text);

    it("detects mindmaps and lists interactive objects", () => {
      expect(mindmapAdapter.detect(lf)).toBe(true);
      expect(mindmapAdapter.detect("@startwbs\n* A\n@endwbs")).toBe(false);
      expect(mindmapAdapter.interactiveObjects(parseMindmap(lf)).map((item) => [item.kind, item.label])).toContainEqual(
        ["mindmap-node", "A1"],
      );
      expect(mindmapAdapter.parse(lf).diagnostics).toEqual([]);
    });

    it("turns operations into one replacement edit", () => {
      const result = apply({ kind: "set-title", text: "T" });
      expect(result.edits).toEqual([{ range: { from: 14, to: 14 }, text: "title T\n" }]);
      const rename = apply({ kind: "update-node", nodeId: "mindmap-1", value: { label: "Renamed" } });
      expect(rename.edits).toHaveLength(1);
      expect(apply({ kind: "set-side", nodeId: "mindmap-1", side: "left" }).edits).toHaveLength(1);
      expect(apply({ kind: "toggle-boxless", nodeId: "mindmap-1" }).edits).toHaveLength(1);
    });

    it("explains why an operation is unavailable", () => {
      expect(apply({ kind: "delete-node", nodeId: "nope" }).unavailableReason).toBe("Mindmap node not found");
      expect(apply({ kind: "set-side", nodeId: "mindmap-2", side: "left" }).unavailableReason).toBe(
        "Only the direct children of a root have a side",
      );
      expect(apply({ kind: "insert-node", value: { label: "x" }, parentId: "nope" }).unavailableReason).toBe(
        "Mindmap parent node not found",
      );
      expect(apply({ kind: "set-side", nodeId: "mindmap-1", side: "right" }).unavailableReason).toBe(
        "The node is already on that side",
      );
    });
  });

  it("lists one label declaration per node as symbol occurrences", () => {
    const source = "@startmindmap\n* Root\n** Same\n** Same\n@endmindmap";
    const occurrences = collectMindmapSymbolOccurrences(source, parseMindmap(source));
    expect(occurrences.map((item) => [item.key, item.value, source.slice(item.range.from, item.range.to)])).toEqual([
      ["mindmap-0", "Root", "Root"],
      ["mindmap-1", "Same", "Same"],
      ["mindmap-2", "Same", "Same"],
    ]);
    expect(occurrences[2]!.range.from).toBeGreaterThan(occurrences[1]!.range.to);
  });
});
