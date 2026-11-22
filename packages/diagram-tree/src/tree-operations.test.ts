import { describe, expect, it } from "vitest";
import { parseTree } from "./parse-tree";
import { replacementEdit } from "./source-edit";
import { TEST_DIALECT } from "./test-dialect";
import { deleteTreeNode, insertTreeNode, moveTreeSubtree, reorderTreeNode, updateTreeNode } from "./tree-operations";

const parse = (source: string) => parseTree(source, TEST_DIALECT);
const byLabel = (source: string, label: string) => parse(source).nodes.find((node) => node.label === label)!;
const noLoneLineFeed = (value: string) => expect(value.replace(/\r\n/g, "")).not.toMatch(/\n/);

describe("tree operations", () => {
  const lf = "@starttree\n* Root\n** A\n*** A1\n** B\n@endtree";
  const crlf = lf.replace(/\n/g, "\r\n");

  it("inserts before the dialect's end tag and under a parent", () => {
    const document = parse(lf);
    expect(insertTreeNode(TEST_DIALECT, lf, document, { label: "Z" })).toBe(
      "@starttree\n* Root\n** A\n*** A1\n** B\n* Z\n@endtree",
    );
    expect(insertTreeNode(TEST_DIALECT, lf, document, { label: "A2" }, document.nodes[1])).toContain("*** A2\n** B");
    expect(() => insertTreeNode(TEST_DIALECT, " ".repeat(100_001), document, { label: "x" })).toThrow(
      /Tree source exceeds/,
    );
  });

  it("keeps CRLF line endings on insert, move, reorder and delete", () => {
    const document = parse(crlf);
    const [, a, a1, b] = document.nodes;
    noLoneLineFeed(insertTreeNode(TEST_DIALECT, crlf, document, { label: "New" }, a));
    noLoneLineFeed(insertTreeNode(TEST_DIALECT, crlf, document, { label: "New" }, undefined, b));
    noLoneLineFeed(insertTreeNode(TEST_DIALECT, crlf, document, { label: "New" }));
    noLoneLineFeed(moveTreeSubtree(TEST_DIALECT, crlf, document, a1!, b));
    noLoneLineFeed(moveTreeSubtree(TEST_DIALECT, crlf, document, a!, undefined, undefined));
    noLoneLineFeed(reorderTreeNode(TEST_DIALECT, crlf, document, b!, a));
    noLoneLineFeed(deleteTreeNode(crlf, a!));
    expect(deleteTreeNode(crlf, a!)).toBe("@starttree\r\n* Root\r\n** B\r\n@endtree");
  });

  it("moves a subtree to a new depth and re-sizes only the node lines", () => {
    const source = "@starttree\n* Root\n** A\n** B\n***:multi\n- minus\n+ plus\n* star\n# hash;\n@endtree";
    const document = parse(source);
    const multi = document.nodes.find((node) => node.label.startsWith("multi"))!;
    const a = document.nodes.find((node) => node.label === "A")!;
    const moved = moveTreeSubtree(TEST_DIALECT, source, document, multi, a);
    expect(moved).toBe("@starttree\n* Root\n** A\n***:multi\n- minus\n+ plus\n* star\n# hash;\n** B\n@endtree");
    const reparsed = parse(moved);
    expect(reparsed.diagnostics).toEqual([]);
    expect(reparsed.nodes.find((node) => node.label.startsWith("multi"))?.label).toBe(multi.label);
    // To another depth: only the first line of the label has a marker to adjust.
    const shallow = moveTreeSubtree(TEST_DIALECT, source, document, multi, document.nodes[0]);
    expect(shallow).toContain("**:multi\n- minus\n+ plus\n* star\n# hash;");
    expect(parse(shallow).nodes.find((node) => node.label.startsWith("multi"))?.label).toBe(multi.label);
  });

  it("refuses to move a node into its own subtree", () => {
    const document = parse(lf);
    expect(moveTreeSubtree(TEST_DIALECT, lf, document, document.nodes[1]!, document.nodes[2])).toBe(lf);
  });

  it("keeps the boxless underscore through update, move and reorder", () => {
    const source = "@starttree\n* Root\n**_ A\n--_ B\n** C\n@endtree";
    const document = parse(source);
    const [, a, b, c] = document.nodes;
    expect(updateTreeNode(source, a!, { label: "A2" })).toContain("**_ A2");
    expect(updateTreeNode(source, b!, { label: "B" })).toContain("--_ B");
    expect(updateTreeNode(source, b!, { label: "B", side: "right" })).toContain("++_ B");
    expect(moveTreeSubtree(TEST_DIALECT, source, document, a!, c)).toContain("***_ A");
    expect(moveTreeSubtree(TEST_DIALECT, source, document, b!, document.nodes[0], undefined, "right")).toContain(
      "++_ B",
    );
    const reordered = reorderTreeNode(TEST_DIALECT, source, document, b!, a);
    expect(reordered.indexOf("--_ B")).toBeLessThan(reordered.indexOf("**_ A"));
  });

  it("writes a multi-line label in the :...; form and keeps the alias only when given", () => {
    const document = parse(lf);
    expect(updateTreeNode(lf, document.nodes[1]!, { label: "one\ntwo" })).toContain("**: one\ntwo;");
    expect(updateTreeNode(lf, document.nodes[1]!, { label: "A" }, "alias")).toContain("**(alias) A");
    expect(byLabel(lf, "A").label).toBe("A");
  });

  it("keeps CRLF line endings when updating a node, including multi-line labels", () => {
    const crlf = "@starttree\r\n* Root\r\n** A\r\n** B\r\n@endtree\r\n";
    const document = parse(crlf);
    expect(updateTreeNode(crlf, document.nodes[1]!, { label: "A2" })).toBe(
      "@starttree\r\n* Root\r\n** A2\r\n** B\r\n@endtree\r\n",
    );
    expect(updateTreeNode(crlf, document.nodes[1]!, { label: "one\ntwo" })).toBe(
      "@starttree\r\n* Root\r\n**: one\r\ntwo;\r\n** B\r\n@endtree\r\n",
    );
    const multi = "@starttree\r\n* Root\r\n**: one\r\ntwo;\r\n** B\r\n@endtree\r\n";
    expect(updateTreeNode(multi, parse(multi).nodes[1]!, { label: "solo" })).toBe(
      "@starttree\r\n* Root\r\n** solo\r\n** B\r\n@endtree\r\n",
    );
  });

  it("removes only the node's own subtree plus any extra ranges", () => {
    const document = parse(lf);
    expect(deleteTreeNode(lf, document.nodes[1]!)).toBe("@starttree\n* Root\n** B\n@endtree");
    expect(deleteTreeNode(lf, document.nodes[1]!, [{ from: 0, to: "@starttree\n".length }])).toBe(
      "* Root\n** B\n@endtree",
    );
  });
});

describe("replacementEdit", () => {
  it("returns the smallest single replacement", () => {
    expect(replacementEdit("a b c", "a X c")).toEqual({ range: { from: 2, to: 3 }, text: "X" });
    expect(replacementEdit("same", "same")).toEqual({ range: { from: 4, to: 4 }, text: "" });
    expect(replacementEdit("", "new")).toEqual({ range: { from: 0, to: 0 }, text: "new" });
  });
});
