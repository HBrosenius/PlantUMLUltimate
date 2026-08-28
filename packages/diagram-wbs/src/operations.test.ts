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
    const connected =
      "@startwbs\n*(project) Project\n**(plan) Plan\n**(deliver) Deliver\nplan -> deliver\n@endwbs";
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
  it("removes arrows attached to a deleted subtree and preserves unrelated arrows", () => {
    const connected =
      "@startwbs\n*(project) Project\n**(plan) Plan\n***(scope) Scope\n**(deliver) Deliver\nplan -> deliver\nscope -> deliver\nproject -> deliver\n@endwbs";
    const document = parseWbs(connected);
    const deleted = deleteWbsNode(connected, document, document.nodes[1]!);
    expect(deleted).toBe("@startwbs\n*(project) Project\n**(deliver) Deliver\nproject -> deliver\n@endwbs");
  });
  it("moves a subtree and adjusts its depth", () => {
    const document = parseWbs(source);
    const moved = moveWbsSubtree(source, document, document.nodes[1]!, document.nodes[3]);
    expect(moved).toContain("** Deliver\n*** Plan\n**** Scope");
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
