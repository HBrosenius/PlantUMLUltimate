import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mindmapAdapter, type MindmapVisualOperation } from "./adapter";
import { mindmapEmissionOrder, parseMindmap } from "./parser";

/**
 * The cases of the renderer conformance audit: every visual operation applied to the official
 * examples and to curated documents (with LF and CRLF line endings). `scripts/audit-mindmap-renderer.mjs`
 * renders each source with the pinned engine, and `renderer-conformance.test.ts` checks the recorded
 * result against a fresh inventory.
 */
export interface AuditCase {
  id: string;
  document: string;
  operation: string;
  original: string;
  source: string;
  /** Visible node texts in drawing order, for documents whose labels are plain words. */
  expectedTexts?: string[];
  /**
   * In `right to left` and `bottom to top` documents the engine draws the right-side nodes in an order
   * that is not source order once marker families are mixed, so only the set of texts is compared.
   */
  unordered?: boolean;
  /** The control documents are expected to be rejected by the engine. */
  expectRejected?: boolean;
}

export const hashSource = (source: string) => createHash("sha256").update(source).digest("hex");

const toCrlf = (value: string) => value.replace(/\n/g, "\r\n");

export const CURATED_DOCUMENTS: Record<string, string> = {
  minimal: "@startmindmap\n* Root\n@endmindmap",
  sides: [
    "@startmindmap",
    "title Sides",
    "* Root",
    "** R1",
    "*** R1a",
    "** R2",
    "-- L1",
    "--- L1a",
    "++ R3",
    "left side",
    "** L2",
    "*** L2a",
    "**:L3 first",
    "L3 second;",
    "right side",
    "** R4",
    "@endmindmap",
  ].join("\n"),
  "two-roots": [
    "@startmindmap",
    "top to bottom direction",
    "* One",
    "** a",
    "left side",
    "** b",
    "* Two",
    "** c",
    "** d",
    "@endmindmap",
  ].join("\n"),
  styled: [
    "@startmindmap",
    "*[#Orange] Root",
    "**_ Boxless",
    "**[#lightgreen] Green <<green>>",
    "***_ Deep",
    "--_ Left boxless",
    "-- Left plain",
    "<style>",
    "mindmapDiagram {",
    "  .green { BackgroundColor lightgreen }",
    "}",
    "</style>",
    "@endmindmap",
  ].join("\n"),
  duplicates: [
    "@startmindmap",
    "* Root",
    "** Branch 1",
    "*** Pros",
    "*** Cons",
    "** Branch 2",
    "*** Pros",
    "*** Cons",
    "left side",
    "** Branch 3",
    "*** Pros",
    "*** Cons",
    "@endmindmap",
  ].join("\n"),
  furniture: [
    "@startmindmap",
    "caption figure 1",
    "title My title",
    "header",
    "My header",
    "endheader",
    "center footer My footer",
    "legend right",
    "Short legend",
    "endlegend",
    "right to left direction",
    "* Root",
    "** A",
    "-- B",
    "@endmindmap",
  ].join("\n"),
};
for (const name of ["sides", "two-roots", "styled"])
  CURATED_DOCUMENTS[`${name}-crlf`] = toCrlf(CURATED_DOCUMENTS[name]!);

const PLAIN_LABEL = /^[\w .'-]+(?:\n[\w .'-]+)*$/;

/** The texts the engine should draw for the nodes, or undefined when a label has markup. */
export function expectedNodeTexts(source: string): string[] | undefined {
  const document = parseMindmap(source);
  if (document.nodes.length === 0 || document.nodes.some((node) => !PLAIN_LABEL.test(node.label))) return undefined;
  return mindmapEmissionOrder(document).flatMap((node) => node.label.split("\n").map((line) => line.trim()));
}

const applyEdits = (source: string, edits: ReadonlyArray<{ range: { from: number; to: number }; text: string }>) =>
  [...edits]
    .sort((left, right) => right.range.from - left.range.from)
    .reduce(
      (current, edit) => `${current.slice(0, edit.range.from)}${edit.text}${current.slice(edit.range.to)}`,
      source,
    );

function operationsFor(source: string): Array<{ name: string; operation: MindmapVisualOperation }> {
  const document = parseMindmap(source);
  const list: Array<{ name: string; operation: MindmapVisualOperation }> = [];
  const root = document.roots[0];
  for (const node of document.nodes) {
    const at = `${node.depth}.${node.id}`;
    list.push({
      name: `insert-child:${at}`,
      operation: { kind: "insert-node", parentId: node.id, value: { label: "Audit child" } },
    });
    list.push({
      name: `insert-multiline-child:${at}`,
      operation: { kind: "insert-node", parentId: node.id, value: { label: "Audit first\nAudit second" } },
    });
    list.push({
      name: `insert-sibling:${at}`,
      operation: { kind: "insert-node", afterNodeId: node.id, value: { label: "Audit sibling" } },
    });
    list.push({
      name: `rename:${at}`,
      operation: { kind: "update-node", nodeId: node.id, value: { label: "Audit renamed" } },
    });
    list.push({
      name: `rename-multiline:${at}`,
      operation: { kind: "update-node", nodeId: node.id, value: { label: "Audit one\nAudit two" } },
    });
    list.push({
      name: `colour:${at}`,
      operation: { kind: "update-node", nodeId: node.id, value: { label: node.label, color: "#lightblue" } },
    });
    list.push({ name: `boxless:${at}`, operation: { kind: "toggle-boxless", nodeId: node.id } });
    list.push({ name: `delete:${at}`, operation: { kind: "delete-node", nodeId: node.id } });
    if (node.depth === 2) {
      list.push({ name: `side-left:${at}`, operation: { kind: "set-side", nodeId: node.id, side: "left" } });
      list.push({ name: `side-right:${at}`, operation: { kind: "set-side", nodeId: node.id, side: "right" } });
    }
    if (root && node.depth >= 2) {
      for (const side of [undefined, "left", "right"] as const)
        list.push({
          name: `move-to-root-${side ?? "natural"}:${at}`,
          operation: { kind: "move-subtree", nodeId: node.id, parentId: root.id, ...(side ? { side } : {}) },
        });
      const first = document.nodes.find((item) => item.parentId === node.parentId && item.id !== node.id);
      if (first)
        list.push({
          name: `reorder-first:${at}`,
          operation: { kind: "reorder-node", nodeId: node.id, beforeNodeId: first.id },
        });
    }
  }
  list.push({ name: "title", operation: { kind: "set-title", text: "Audit title" } });
  list.push({ name: "title-multiline", operation: { kind: "set-title", text: "Audit one\nAudit two" } });
  list.push({ name: "title-remove", operation: { kind: "set-title" } });
  list.push({ name: "caption", operation: { kind: "set-caption", text: "Audit caption" } });
  list.push({ name: "header", operation: { kind: "set-header", text: "Audit header" } });
  list.push({
    name: "header-multiline",
    operation: { kind: "set-header", text: "Audit one\nAudit two", placement: "right" },
  });
  list.push({ name: "footer", operation: { kind: "set-footer", text: "Audit footer", placement: "center" } });
  list.push({
    name: "legend",
    operation: { kind: "set-legend", text: "Audit legend\nsecond line", placement: "left" },
  });
  for (const direction of ["left-to-right", "top-to-bottom", "right-to-left", "bottom-to-top"] as const)
    list.push({ name: `direction-${direction}`, operation: { kind: "set-direction", direction } });
  list.push({ name: "direction-remove", operation: { kind: "set-direction" } });
  list.push({ name: "convert-to-orgmode", operation: { kind: "convert-to-orgmode" } });
  return list;
}

const isUnordered = (source: string) => {
  const direction = parseMindmap(source).direction?.value;
  return direction === "right-to-left" || direction === "bottom-to-top";
};

export function officialMindmapExamples(): string[] {
  const corpus = JSON.parse(
    readFileSync(new URL("../../../tests/fixtures/official-plantuml/mindmap.json", import.meta.url), "utf8"),
  ) as { examples: string[] };
  return corpus.examples;
}

/** Every case, with unavailable operations left out. Official examples use a sample of their nodes. */
export function buildAuditInventory(): { baselines: AuditCase[]; cases: AuditCase[]; controls: AuditCase[] } {
  const documents: Array<[string, string, boolean]> = [
    ...officialMindmapExamples().map((source, index): [string, string, boolean] => [
      `official-${index + 1}`,
      source,
      true,
    ]),
    ...Object.entries(CURATED_DOCUMENTS).map(([name, source]): [string, string, boolean] => [name, source, false]),
  ];
  const baselines: AuditCase[] = [];
  const cases: AuditCase[] = [];
  for (const [name, source, sampled] of documents) {
    const expectedTexts = expectedNodeTexts(source);
    baselines.push({
      id: `${name}:baseline`,
      document: name,
      operation: "baseline",
      original: source,
      source,
      ...(expectedTexts ? { expectedTexts, unordered: isUnordered(source) } : {}),
    });
    const document = parseMindmap(source);
    // Only examples the engine draws and the model reads without errors are mutated.
    if (document.diagnostics.some((item) => item.severity === "error")) continue;
    const keep = new Set(
      sampled
        ? [document.nodes.find((node) => node.depth === 2)?.id, document.nodes.at(-1)?.id].filter(Boolean)
        : document.nodes.map((node) => node.id),
    );
    for (const { name: operationName, operation } of operationsFor(source)) {
      if ("nodeId" in operation && !keep.has(operation.nodeId as string)) continue;
      if (operation.kind === "insert-node" && !keep.has((operation.parentId ?? operation.afterNodeId) as string))
        continue;
      const result = mindmapAdapter.applyVisualOperation(operation, document, source);
      if (result.unavailableReason !== undefined || result.edits.length === 0) continue;
      const next = applyEdits(source, result.edits);
      // A diagram without nodes is not a diagram: the engine rejects it or crashes on it.
      if (parseMindmap(next).nodes.length === 0) continue;
      const texts = expectedNodeTexts(next);
      cases.push({
        id: `${name}:${operationName}`,
        document: name,
        operation: operationName,
        original: source,
        source: next,
        ...(texts ? { expectedTexts: texts, unordered: isUnordered(next) } : {}),
      });
    }
  }
  // Sources the engine must reject: they prove the audit can see an engine error.
  const controls: AuditCase[] = [
    ["multiline-plus", "@startmindmap\n* Root\n++:r multi\nline;\n@endmindmap"],
    ["multiline-minus", "@startmindmap\n* Root\n--:l multi\nline;\n@endmindmap"],
    [
      "style-star-rule",
      "@startmindmap\n<style>\nmindmapDiagram {\n  * {\n    FontSize 12\n  }\n}\n</style>\n* Root\n@endmindmap",
    ],
    ["dash-list", "@startmindmap\n* Root\n - Child 1\n   - Grand 1\n@endmindmap"],
    ["arrow", "@startmindmap\n* Root\n** A (a)\n** B (b)\na -> b\n@endmindmap"],
    ["bad-indentation", "@startmindmap\n* Root\n    * Four\n  * Two\n@endmindmap"],
  ].map(([name, source]) => ({
    id: `control:${name}`,
    document: `control-${name}`,
    operation: "control",
    original: source!,
    source: source!,
    expectRejected: true,
  }));
  return { baselines, cases, controls };
}
