import { describe, expect, it } from "vitest";
import { parseTree } from "./parse-tree";
import type { TreeDialect } from "./model";
import { TEST_DIALECT, WBS_LIKE_DIALECT } from "./test-dialect";

describe("parseTree", () => {
  it("rejects oversized input before applying grammar expressions", () => {
    expect(() => parseTree(" ".repeat(100_001), TEST_DIALECT)).toThrow(/Tree source exceeds the 100,000 character/);
  });

  it("uses the dialect's tags, id prefix and messages", () => {
    const document = parseTree("* Root\n*** Orphan\n", TEST_DIALECT);
    expect(document.nodes.map((node) => node.id)).toEqual(["tree-0", "tree-1"]);
    expect(document.diagnostics.map(({ code, message }) => ({ code, message }))).toEqual([
      { code: "missing-parent", message: "Tree node at level 3 has no parent" },
      { code: "missing-start", message: "Tree diagram is missing @starttree" },
      { code: "missing-end", message: "Tree diagram is missing @endtree" },
    ]);
    expect(parseTree("@starttree\n* Root\n@endtree", TEST_DIALECT).diagnostics).toEqual([]);
  });

  it("leaves aliases and arrows alone when the dialect does not allow them", () => {
    const source = "@starttree\n* Root\n**(a) A\n** B\na -> b\n@endtree";
    const plain = parseTree(source, TEST_DIALECT);
    expect(plain.relationships).toEqual([]);
    expect(plain.nodes[1]).not.toHaveProperty("alias");
    expect(plain.unknown.map((item) => item.text)).toEqual(["a -> b"]);
    const wbs = parseTree(source.replaceAll("tree", "wbs"), WBS_LIKE_DIALECT);
    expect(wbs.nodes[1]).toMatchObject({ alias: "a" });
    expect(wbs.relationships).toHaveLength(1);
  });

  it("does not turn <style> body lines that start with *, + or - into nodes", () => {
    const source = [
      "@starttree",
      "<style>",
      "treeDiagram {",
      "  * {",
      "    FontSize 12",
      "  }",
      "* {",
      "+ {",
      "- {",
      "-- {",
      "  .myStyle * {",
      "  :depth(1) {",
      "}",
      "</style>",
      "* Root",
      "** After style",
      "@endtree",
    ].join("\n");
    const document = parseTree(source, TEST_DIALECT);
    expect(document.diagnostics).toEqual([]);
    expect(document.nodes.map((node) => node.label)).toEqual(["Root", "After style"]);
    expect(document.unknown.map((item) => item.text.trim())).toContain("* {");
    expect(document.unknown.map((item) => item.text.trim())).toContain("- {");
  });

  it("keeps parsing nodes after a style block on the same line count, and ends an unclosed block at the end tag", () => {
    const inline = parseTree("@starttree\n<style> * { } </style>\n* Root\n@endtree", TEST_DIALECT);
    expect(inline.nodes.map((node) => node.label)).toEqual(["Root"]);
    const unclosed = parseTree("@starttree\n<style>\n* Hidden\n@endtree\n* Later", TEST_DIALECT);
    expect(unclosed.nodes.map((node) => node.label)).toEqual(["Later"]);
  });

  it("parses nodes inside a style block when the dialect does not skip them", () => {
    const document = parseTree("@starttree\n<style>\n* Root\n</style>\n@endtree", {
      ...TEST_DIALECT,
      skipStyleBlocks: false,
    });
    expect(document.nodes.map((node) => node.label)).toEqual(["Root"]);
  });

  it("joins a multi-line label and keeps inner -, +, * and # lines as label text", () => {
    const source = "@starttree\n* Root\n**:line one\n- minus\n+ plus\n* star\n# hash;\n** Next\n@endtree";
    const document = parseTree(source, TEST_DIALECT);
    expect(document.diagnostics).toEqual([]);
    expect(document.nodes.map((node) => node.label)).toEqual([
      "Root",
      "line one\n- minus\n+ plus\n* star\n# hash",
      "Next",
    ]);
  });

  describe("dialect options for sides, markers, directions and furniture", () => {
    const FULL: TreeDialect = {
      ...TEST_DIALECT,
      markers: { hash: true, indentedList: true },
      sideKeyword: "side",
      directionKeywords: ["top to bottom direction"],
      furniture: true,
      boxlessFollowsColor: true,
    };
    const wrap = (body: string) => `@starttree\n${body}\n@endtree`;

    it("leaves a dialect without the options exactly as it was", () => {
      const source = wrap(
        "title T\nleft side\ntop to bottom direction\n# Hash\n  * Item\n* Root\n+ Alt\n++ Plus\n*** Deep",
      );
      const plain = parseTree(source, TEST_DIALECT);
      expect(plain.controls).toEqual({ sideSwitches: [] });
      expect(plain.unknown.map((item) => item.text)).toEqual(["left side", "top to bottom direction", "# Hash"]);
      // Without sideKeyword a `+` marker even marks a depth-1 node as right, and depth 3 keeps its own marker.
      expect(plain.nodes.map((node) => [node.depth, node.side, node.markdown])).toEqual([
        [1, "root", undefined],
        [1, "root", undefined],
        [1, "right", undefined],
        [2, "right", undefined],
        [3, "right", undefined],
      ]);
    });

    it("records controls and switches, and sides follow the switch in document order", () => {
      const document = parseTree(
        wrap("top to bottom direction\ntitle T\n* R\n** a\nleft side\n** b\n*** c\n++ d\nright side\n** e"),
        FULL,
      );
      expect(document.controls.direction?.value).toBe("top to bottom direction");
      expect(document.controls.title).toMatchObject({ text: "T", block: false });
      expect(document.controls.sideSwitches.map((item) => item.side)).toEqual(["left", "right"]);
      expect(document.nodes.map((node) => [node.label, node.side])).toEqual([
        ["R", "root"],
        ["a", "right"],
        ["b", "left"],
        ["c", "left"],
        ["d", "right"],
        ["e", "right"],
      ]);
      expect(document.unknown).toEqual([]);
    });

    it("reads Markdown headers and indented bullets and reports what the engine rejects", () => {
      const ok = parseTree(wrap("* Root\n  * a\n    * b\n  * c"), FULL);
      expect(ok.nodes.map((node) => [node.label, node.depth, node.markdown])).toEqual([
        ["Root", 1, undefined],
        ["a", 2, "list"],
        ["b", 3, "list"],
        ["c", 2, "list"],
      ]);
      expect(parseTree(wrap("* Root\n    * a\n  * b"), FULL).diagnostics.map((item) => item.code)).toContain(
        "bad-indentation",
      );
      expect(parseTree(wrap("# Root\n  * a"), FULL).diagnostics.map((item) => item.code)).toContain("markdown-mixed");
      expect(parseTree(wrap("* Root\n - a"), FULL).diagnostics.map((item) => item.code)).toContain("dash-list");
    });

    it("reads a boxless coloured node written with the underscore after the colour", () => {
      const document = parseTree(wrap("* Root\n**[#red]_ Label\n**_[#red] Other"), FULL);
      expect(document.nodes.map(({ label, boxless, color }) => ({ label, boxless, color }))).toEqual([
        { label: "Root", boxless: undefined, color: undefined },
        { label: "Label", boxless: true, color: "#red" },
        { label: "Other", boxless: true, color: "#red" },
      ]);
    });

    it("keeps block bodies and an unclosed block out of the nodes", () => {
      const document = parseTree(wrap("legend right\n* not a node\nendlegend\n* Root"), FULL);
      expect(document.nodes.map((node) => node.label)).toEqual(["Root"]);
      expect(document.controls.legend).toMatchObject({ text: "* not a node", placement: "right", block: true });
      const unclosed = parseTree(wrap("header\n* swallowed"), FULL);
      expect(unclosed.diagnostics.map((item) => item.code)).toEqual(["unclosed-block"]);
    });
  });

  it("recognises the boxless marker and keeps the underscore out of the label", () => {
    const document = parseTree("@starttree\n* Root\n**_ Boxless\n--_ Left boxless\n@endtree", TEST_DIALECT);
    expect(document.nodes.map(({ label, boxless, side }) => ({ label, boxless, side }))).toEqual([
      { label: "Root", boxless: undefined, side: "root" },
      { label: "Boxless", boxless: true, side: "right" },
      { label: "Left boxless", boxless: true, side: "left" },
    ]);
  });
});
