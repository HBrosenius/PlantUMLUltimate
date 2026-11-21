import { parseTree } from "@plantuml-studio/diagram-tree";
import type { LanguageDiagnostic } from "@plantuml-studio/language-core";
import { MINDMAP_DIALECT } from "./dialect";
import type { MindmapDirection, MindmapDocument, MindmapNode } from "./model";

const DIRECTIONS: Record<string, MindmapDirection> = {
  "left to right direction": "left-to-right",
  "top to bottom direction": "top-to-bottom",
  "right to left direction": "right-to-left",
  "bottom to top direction": "bottom-to-top",
};

// `a -> b`, `a --> b`, `a ..> b` and the reversed forms, as a token between two other words.
const ARROW_LINE = /^\s*\S+\s+(?:<?[-.]+>|<[-.]+)\s+\S/;
// The engine throws `IllegalStateException: STAR[*]` for a `* { ... }` style rule.
const STYLE_STAR_RULE = /^\s*\*\s*(?:\{.*)?$/;

/** The side a `*` node written at `position` gets from the document-wide `left side` switch. */
export function mindmapSideAt(document: Pick<MindmapDocument, "sideSwitches">, position: number): "left" | "right" {
  let side: "left" | "right" = "right";
  for (const item of document.sideSwitches) {
    if (item.range.from >= position) break;
    side = item.side;
  }
  return side;
}

/**
 * The side the engine draws a node on: a `+` node on the right, a `-` node on the left, and a `*` node
 * wherever the last `left side` / `right side` line before it says.
 */
export function markerDirection(
  switches: MindmapDocument["sideSwitches"],
  node: Pick<MindmapNode, "marker" | "sourceRange">,
): "left" | "right" {
  return node.marker[0] === "+"
    ? "right"
    : node.marker[0] === "-"
      ? "left"
      : mindmapSideAt({ sideSwitches: switches }, node.sourceRange.from);
}

let lastSource: string | undefined;
let lastDocument: MindmapDocument | undefined;

function parseMindmapUncached(source: string): MindmapDocument {
  const tree = parseTree<MindmapNode>(source, MINDMAP_DIALECT);
  const { controls } = tree;
  // The shared parser joins the lines of a multi-line label with a line feed but keeps each carriage return.
  for (const node of tree.nodes) node.label = node.label.replace(/\r/g, "");
  const diagnostics: LanguageDiagnostic[] = [...tree.diagnostics];
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  for (const node of tree.nodes) {
    if (node.markdown) continue;
    // `++:` and `--:` are engine errors: a multi-line label only works with `*` markers.
    if (node.label.includes("\n") && node.marker[0] !== "*")
      diagnostics.push({
        severity: "error",
        message: "A multi-line label needs * markers; + and - markers are not accepted",
        range: node.sourceRange,
        code: "multiline-marker",
      });
    // Below depth 2 the engine rejects a node that would be drawn on the other side than its parent:
    // `-- A` with a `*** B` child, `** A` with a `--- B` child, or a `*` child after a `left side`
    // line inside a right-hand branch.
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (
      parent &&
      !parent.markdown &&
      node.depth >= 3 &&
      markerDirection(controls.sideSwitches, node) !== markerDirection(controls.sideSwitches, parent)
    )
      diagnostics.push({
        severity: "error",
        message: "A node must be on the same side as its parent: + and - markers and left side lines have to agree",
        range: node.sourceRange,
        code: "side-mismatch",
      });
  }
  // Everything in `unknown` is either a line outside the node syntax or a `<style>` body line, so
  // these two checks cannot hit a real node.
  for (const item of tree.unknown) {
    if (STYLE_STAR_RULE.test(item.text))
      diagnostics.push({
        severity: "error",
        message: "A * rule inside <style> makes PlantUML fail; select nodes with a class or :depth() instead",
        range: item.range,
        code: "style-star-rule",
      });
    else if (ARROW_LINE.test(item.text))
      diagnostics.push({
        severity: "warning",
        message: "Arrows are not supported in mindmaps",
        range: item.range,
        code: "unsupported-arrow",
      });
  }
  return {
    nodes: tree.nodes,
    roots: tree.roots,
    unknown: tree.unknown,
    diagnostics,
    ...(controls.direction && DIRECTIONS[controls.direction.value]
      ? { direction: { value: DIRECTIONS[controls.direction.value]!, range: controls.direction.range } }
      : {}),
    ...(controls.title ? { title: controls.title } : {}),
    ...(controls.caption ? { caption: controls.caption } : {}),
    ...(controls.header ? { header: controls.header } : {}),
    ...(controls.footer ? { footer: controls.footer } : {}),
    ...(controls.legend ? { legend: controls.legend } : {}),
    sideSwitches: controls.sideSwitches,
  };
}

export function parseMindmap(source: string): MindmapDocument {
  if (source === lastSource && lastDocument) return lastDocument;
  const document = parseMindmapUncached(source);
  lastSource = source;
  lastDocument = document;
  return document;
}

export function findMindmapNodeAt(document: MindmapDocument, position: number): MindmapNode | undefined {
  return document.nodes.find((node) => position >= node.sourceRange.from && position <= node.sourceRange.to);
}

/**
 * The nodes in the order the engine draws them, which is not source order. Per root: the root, then
 * every right-side node in source order, then every left-side node in source order. The preview
 * must match rendered `<text>` elements against this order to tell duplicate labels apart.
 */
export function mindmapEmissionOrder(document: MindmapDocument): MindmapNode[] {
  const groups: MindmapNode[][] = [];
  for (const node of document.nodes) {
    if (node.depth === 1 || groups.length === 0) groups.push([]);
    groups[groups.length - 1]!.push(node);
  }
  return groups.flatMap((group) => {
    const root = group[0]!.depth === 1 ? [group[0]!] : [];
    const rest = group.slice(root.length);
    return [...root, ...rest.filter((node) => node.side !== "left"), ...rest.filter((node) => node.side === "left")];
  });
}
