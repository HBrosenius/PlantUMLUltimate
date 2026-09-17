import { describe, expect, it } from "vitest";
import {
  deleteWbsNode,
  deleteWbsRelationship,
  insertWbsNode,
  insertWbsRelationship,
  moveWbsSubtree,
  reconnectWbsRelationship,
  renameWbsNodeAlias,
  updateWbsNode,
  updateWbsRelationshipColor,
} from "./operations";
import { parseWbs } from "./parser";
import { collectWbsSymbolOccurrences } from "./symbols";

describe("WBS operations", () => {
  const source = "@startwbs\n* Project\n** Plan\n*** Scope\n** Deliver\n@endwbs";
  it("finds node labels, aliases, and explicit relationship references semantically", () => {
    const connected = "@startwbs\n*(project) Project\n**(plan) Plan\n**(deliver) Deliver\nplan -> deliver\n@endwbs";
    const occurrences = collectWbsSymbolOccurrences(connected, parseWbs(connected));
    expect(occurrences.filter((item) => item.key === "wbs-1").map((item) => item.value)).toEqual([
      "plan",
      "Plan",
      "plan",
    ]);
    expect(occurrences.map((item) => connected.slice(item.range.from, item.range.to))).toEqual(
      occurrences.map((item) => item.value),
    );
  });
  it("adds, updates, and removes complete subtrees", () => {
    const document = parseWbs(source);
    expect(insertWbsNode(source, document, { label: "Budget" }, document.nodes[1])).toContain("*** Budget");
    expect(
      updateWbsNode(source, document.nodes[1]!, { label: "Planning", color: "Blue", textColor: "White" }),
    ).toContain("**[#Blue] <color:#White>Planning</color>");
    expect(deleteWbsNode(source, document, document.nodes[1]!)).toBe("@startwbs\n* Project\n** Deliver\n@endwbs");
  });
  it("adds and round-trips a node link", () => {
    const document = parseWbs(source);
    const inserted = insertWbsNode(source, document, { label: "Budget", link: "https://example.com/budget" }, document.nodes[1]);
    expect(inserted).toContain("*** [[https://example.com/budget Budget]]");
    const parsed = parseWbs(inserted);
    const budget = parsed.nodes.find((node) => node.label === "Budget")!;
    expect(budget.link).toBe("https://example.com/budget");
    const relinked = updateWbsNode(inserted, budget, { label: "Budget", link: "https://example.com/budget-2" });
    expect(relinked).toContain("[[https://example.com/budget-2 Budget]]");
    const cleared = updateWbsNode(inserted, budget, { label: "Budget" });
    expect(cleared).toContain("*** Budget");
    expect(cleared).not.toContain("[[");
  });
  it("adds and round-trips a node icon", () => {
    const document = parseWbs(source);
    const inserted = insertWbsNode(source, document, { label: "Budget", icon: "&home" }, document.nodes[1]);
    expect(inserted).toContain("*** <&home> Budget");
    const parsed = parseWbs(inserted);
    const budget = parsed.nodes.find((node) => node.label === "Budget")!;
    expect(budget.icon).toBe("&home");
    const relabeled = updateWbsNode(inserted, budget, { label: "Budget", icon: "$sprite" });
    expect(relabeled).toContain("<$sprite> Budget");
    const cleared = updateWbsNode(inserted, budget, { label: "Budget" });
    expect(cleared).toContain("*** Budget");
    expect(cleared).not.toContain("<");
  });
  it("writes and round-trips a multiline node label using the `: ... ;` form", () => {
    const document = parseWbs(source);
    const inserted = insertWbsNode(source, document, { label: "Line one\nLine two" }, document.nodes[1]);
    expect(inserted).toContain("***: Line one\nLine two;");
    const parsed = parseWbs(inserted);
    const node = parsed.nodes.find((item) => item.label === "Line one\nLine two")!;
    expect(node).toBeDefined();
    const updated = updateWbsNode(inserted, node, { label: "Single line now" });
    expect(updated).toContain("*** Single line now");
    expect(updated).not.toContain(": Single line now;");
  });
  it("keeps a node's link when its label is edited into a multiline shape", () => {
    const document = parseWbs(source);
    const linked = insertWbsNode(
      source,
      document,
      { label: "Budget", link: "https://example.com/budget" },
      document.nodes[1],
    );
    const budget = parseWbs(linked).nodes.find((item) => item.label === "Budget")!;
    const multiline = updateWbsNode(linked, budget, {
      label: "Line one\nLine two",
      link: "https://example.com/budget",
    });
    expect(multiline).toContain("***: [[https://example.com/budget Line one\nLine two]];");
    const reparsed = parseWbs(multiline).nodes.find((item) => item.label === "Line one\nLine two")!;
    expect(reparsed).toMatchObject({ link: "https://example.com/budget" });
  });
  it("removes arrows attached to a deleted subtree and preserves unrelated arrows", () => {
    const connected =
      "@startwbs\n*(project) Project\n**(plan) Plan\n***(scope) Scope\n**(deliver) Deliver\nplan -> deliver\nscope -> deliver\nproject -> deliver\n@endwbs";
    const document = parseWbs(connected);
    const deleted = deleteWbsNode(connected, document, document.nodes[1]!);
    expect(deleted).toBe("@startwbs\n*(project) Project\n**(deliver) Deliver\nproject -> deliver\n@endwbs");
  });
  it("lets any non-root node change its own side without touching its descendants' sides", () => {
    const mixed = "@startwbs\n* Project\n** Plan\n+++ Task A\n--- Task B\n@endwbs";
    const document = parseWbs(mixed);
    const plan = document.nodes.find((node) => node.label === "Plan")!;
    const updated = updateWbsNode(mixed, plan, { label: "Plan", side: "left" });
    expect(updated).toContain("-- Plan");
    expect(updated).toContain("+++ Task A");
    expect(updated).toContain("--- Task B");
    expect(parseWbs(updated).diagnostics).toEqual([]);
  });
  it("resolves a deep node's parent purely by depth even when marker families mismatch", () => {
    const document = parseWbs(source);
    const plan = document.nodes.find((node) => node.label === "Plan")!;
    const inserted = insertWbsNode(source, document, { label: "Detail", side: "left" }, plan);
    expect(inserted).toContain("--- Detail");
    expect(parseWbs(inserted).diagnostics).toEqual([]);
  });
  it("moves a subtree and adjusts its depth", () => {
    const document = parseWbs(source);
    const moved = moveWbsSubtree(source, document, document.nodes[1]!, document.nodes[3]);
    expect(moved).toContain("** Deliver\n*** Plan\n**** Scope");
  });
  it("preserves each descendant's own side when moving a subtree, only resizing depth", () => {
    const mixed = "@startwbs\n* Project\n** Plan\n+++ Task A\n--- Task B\n** Deliver\n@endwbs";
    const document = parseWbs(mixed);
    const plan = document.nodes.find((node) => node.label === "Plan")!;
    const deliver = document.nodes.find((node) => node.label === "Deliver")!;
    const moved = moveWbsSubtree(mixed, document, plan, deliver);
    expect(moved).toContain("*** Plan");
    expect(moved).toContain("++++ Task A");
    expect(moved).toContain("---- Task B");
  });
  it("adds stable aliases and an arrow between nodes", () => {
    const document = parseWbs(source);
    const connected = insertWbsRelationship(source, document, document.nodes[1]!, document.nodes[3]!);
    expect(connected).toContain("**(plan) Plan");
    expect(connected).toContain("**(deliver) Deliver");
    expect(connected).toContain("plan -> deliver\n@endwbs");
    const parsed = parseWbs(connected);
    expect(parsed.relationships).toMatchObject([{ from: "plan", to: "deliver", arrow: "->" }]);
    expect(updateWbsNode(connected, parsed.nodes[1]!, { label: "Planning" })).toContain("**(plan) Planning");
    const renamedAlias = renameWbsNodeAlias(connected, parsed, parsed.nodes[1]!, "planning");
    expect(renamedAlias).toContain("**(planning) Plan");
    expect(renamedAlias).toContain("planning -> deliver");
    const blue = updateWbsRelationshipColor(connected, parsed.relationships[0]!, "blue");
    expect(blue).toContain("plan -> deliver #blue");
    expect(deleteWbsRelationship(blue, parseWbs(blue).relationships[0]!)).not.toContain("plan -> deliver");
    const blueDocument = parseWbs(blue);
    const changedFrom = reconnectWbsRelationship(
      blue,
      blueDocument,
      blueDocument.relationships[0]!,
      "from",
      blueDocument.nodes[0]!,
    );
    expect(changedFrom).toContain("*(project) Project");
    expect(changedFrom).toContain("project -> deliver #blue");
    const changedDocument = parseWbs(changedFrom);
    expect(
      reconnectWbsRelationship(
        changedFrom,
        changedDocument,
        changedDocument.relationships[0]!,
        "to",
        changedDocument.nodes[1]!,
      ),
    ).toContain("project -> plan #blue");
  });
});
