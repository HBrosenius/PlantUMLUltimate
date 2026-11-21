import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAuditInventory, hashSource, officialMindmapExamples, type AuditCase } from "./audit-inventory";
import { parseMindmap } from "./parser";

// To refresh the recorded engine results after changing an operation or the corpus:
//   MINDMAP_AUDIT_INVENTORY=<file> npx vitest run packages/diagram-mindmap/src/renderer-conformance.test.ts
//   node scripts/audit-mindmap-renderer.mjs <file> tests/fixtures/official-plantuml/mindmap-renderer-observations.json
const OBSERVATIONS = new URL(
  "../../../tests/fixtures/official-plantuml/mindmap-renderer-observations.json",
  import.meta.url,
);

const inventory = buildAuditInventory();
const lines = (source: string) => source.split(/\r?\n/);
const errorCount = (source: string) =>
  parseMindmap(source).diagnostics.filter((item) => item.severity === "error").length;
const nodeTexts = (source: string) => {
  const document = parseMindmap(source);
  return document.nodes.map((node) => source.slice(node.sourceRange.from, node.sourceRange.to));
};
const differingLines = (before: string, after: string) => {
  const left = lines(before);
  const right = lines(after);
  return left.length === right.length ? left.filter((line, index) => line !== right[index]).length : Infinity;
};

const subtreeHasMultiline = (
  source: string,
  document: ReturnType<typeof parseMindmap>,
  node: { sourceRange: { from: number }; subtreeRange: { to: number } },
) =>
  document.nodes.some(
    (item) =>
      item.sourceRange.from >= node.sourceRange.from &&
      item.sourceRange.from <= node.subtreeRange.to &&
      source.slice(item.sourceRange.from, item.sourceRange.to).includes("\n"),
  );

describe("mindmap renderer conformance: the inventory", () => {
  it("writes the inventory when asked to", () => {
    if (process.env.MINDMAP_AUDIT_INVENTORY)
      writeFileSync(process.env.MINDMAP_AUDIT_INVENTORY, JSON.stringify(inventory) + "\n");
    expect(inventory.cases.length).toBeGreaterThan(500);
  });

  it("covers the whole official corpus and every kind of operation", () => {
    expect(officialMindmapExamples()).toHaveLength(27);
    const kinds = new Set(inventory.cases.map((item) => item.operation.split(":")[0]));
    for (const kind of [
      "insert-child",
      "insert-multiline-child",
      "insert-sibling",
      "rename",
      "rename-multiline",
      "colour",
      "boxless",
      "delete",
      "side-left",
      "side-right",
      "move-to-root-natural",
      "move-to-root-left",
      "move-to-root-right",
      "reorder-first",
      "title",
      "caption",
      "header",
      "footer",
      "legend",
      "direction-top-to-bottom",
      "convert-to-orgmode",
    ])
      expect(kinds, kind).toContain(kind);
  });

  it("never introduces a diagnostic the original did not have", () => {
    for (const item of inventory.cases)
      expect(errorCount(item.source), item.id).toBeLessThanOrEqual(errorCount(item.original));
  });

  it("keeps CRLF documents CRLF", () => {
    for (const item of inventory.cases.filter((candidate) => candidate.original.includes("\r\n")))
      expect(item.source.replace(/\r\n/g, ""), item.id).not.toMatch(/\n/);
  });

  it("changes only the intended region", () => {
    const sourceNodeOf = (item: AuditCase) => {
      const nodeId = /:\d+\.(mindmap-\d+)$/.exec(item.operation)?.[1];
      return nodeId ? parseMindmap(item.original).nodes.find((node) => node.id === nodeId) : undefined;
    };
    for (const item of inventory.cases) {
      const kind = item.operation.split(":")[0]!;
      const before = parseMindmap(item.original);
      const after = parseMindmap(item.source);
      const node = sourceNodeOf(item);
      const multiline = node ? item.original.slice(node.sourceRange.from, node.sourceRange.to).includes("\n") : false;
      if (kind === "boxless" || (kind === "colour" && !multiline) || (kind === "rename" && !multiline))
        expect(differingLines(item.original, item.source), item.id).toBe(1);
      if (kind.startsWith("side-") && node && !subtreeHasMultiline(item.original, before, node)) {
        // Only marker characters inside the node's own subtree change; nothing around it is touched.
        expect(item.source.startsWith(item.original.slice(0, node.sourceRange.from)), item.id).toBe(true);
        expect(item.source.endsWith(item.original.slice(node.subtreeRange.to)), item.id).toBe(true);
        const subtreeSize = before.nodes.filter(
          (candidate) =>
            candidate.sourceRange.from >= node.sourceRange.from && candidate.sourceRange.from <= node.subtreeRange.to,
        ).length;
        expect(differingLines(item.original, item.source), item.id).toBeLessThanOrEqual(subtreeSize);
      }
      if (
        [
          "title",
          "title-multiline",
          "title-remove",
          "caption",
          "header",
          "header-multiline",
          "footer",
          "legend",
        ].includes(kind) ||
        kind.startsWith("direction-")
      )
        expect(nodeTexts(item.source), item.id).toEqual(nodeTexts(item.original));
      if (kind.startsWith("insert-")) expect(after.nodes.length, item.id).toBe(before.nodes.length + 1);
      if (kind === "delete" && node) {
        const removed = before.nodes.filter(
          (candidate) =>
            candidate.sourceRange.from >= node.sourceRange.from && candidate.sourceRange.from <= node.subtreeRange.to,
        ).length;
        expect(after.nodes.length, item.id).toBe(before.nodes.length - removed);
      }
      if (
        ["rename", "rename-multiline", "colour", "boxless"].includes(kind) ||
        kind.startsWith("side-") ||
        kind.startsWith("move-") ||
        kind.startsWith("reorder-")
      )
        expect(after.nodes.length, item.id).toBe(before.nodes.length);
      if (kind.startsWith("side-") && node) {
        const wanted = kind === "side-left" ? "left" : "right";
        expect(
          after.nodes.find((candidate) => candidate.label === node.label && candidate.depth === 2)?.side,
          item.id,
        ).toBe(wanted);
      }
      if (kind.startsWith("move-to-root-") && node && kind !== "move-to-root-natural" && node.depth >= 2) {
        const wanted = kind === "move-to-root-left" ? "left" : "right";
        const moved = after.nodes.filter((candidate) => candidate.label === node.label && candidate.depth === 2);
        expect(
          moved.map((candidate) => candidate.side),
          item.id,
        ).toContain(wanted);
      }
    }
  });
});

describe("mindmap renderer conformance: the pinned engine", () => {
  const recorded = JSON.parse(readFileSync(OBSERVATIONS, "utf8")) as {
    engine: string;
    version: string;
    results: Array<{ id: string; hash: string; status: string; textsMatch?: boolean }>;
  };
  const byId = new Map(recorded.results.map((item) => [item.id, item]));

  it("was recorded with the engine this repository pins", () => {
    const pinned = JSON.parse(
      readFileSync(new URL("../../../node_modules/@plantuml/core/package.json", import.meta.url), "utf8"),
    ) as {
      version: string;
    };
    expect(recorded.version).toBe(pinned.version);
  });

  it("has an observation for every source in the inventory", () => {
    for (const item of [...inventory.baselines, ...inventory.controls, ...inventory.cases])
      expect(byId.get(item.id)?.hash, item.id).toBe(hashSource(item.source));
    expect(recorded.results).toHaveLength(
      inventory.baselines.length + inventory.controls.length + inventory.cases.length,
    );
  });

  it("rejects the control sources, so a rejection is visible", () => {
    for (const item of inventory.controls) expect(byId.get(item.id)?.status, item.id).toBe("rejected");
  });

  it("accepts every original document", () => {
    for (const item of inventory.baselines) expect(byId.get(item.id)?.status, item.id).toBe("accepted");
  });

  it("accepts the result of every visual operation and draws the expected node texts", () => {
    const rejected = inventory.cases.filter((item) => byId.get(item.id)?.status !== "accepted").map((item) => item.id);
    expect(rejected).toEqual([]);
    const mismatched = [...inventory.baselines, ...inventory.cases]
      .filter((item) => byId.get(item.id)?.textsMatch === false)
      .map((item) => item.id);
    expect(mismatched).toEqual([]);
  });
});
