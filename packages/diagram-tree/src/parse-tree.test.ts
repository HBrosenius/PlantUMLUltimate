import { describe, expect, it } from "vitest";
import { parseTree } from "./parse-tree";
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

  it("recognises the boxless marker and keeps the underscore out of the label", () => {
    const document = parseTree("@starttree\n* Root\n**_ Boxless\n--_ Left boxless\n@endtree", TEST_DIALECT);
    expect(document.nodes.map(({ label, boxless, side }) => ({ label, boxless, side }))).toEqual([
      { label: "Root", boxless: undefined, side: "root" },
      { label: "Boxless", boxless: true, side: "right" },
      { label: "Left boxless", boxless: true, side: "left" },
    ]);
  });
});
