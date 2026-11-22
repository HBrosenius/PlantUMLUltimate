import type { TextRange } from "@plantuml-studio/language-core";
import type { TreeDialect, TreeDocument, TreeNode, TreeNodeInput, TreeSide } from "./model";
import { MAX_TREE_SOURCE_LENGTH } from "./parse-tree";

export const lineEnd = (source: string, to: number) => (source[to] === "\n" ? to + 1 : to);
// New lines follow the document's own line endings so a CRLF file stays CRLF.
const eol = (source: string) => (source.includes("\r\n") ? "\r\n" : "\n");
const markerFor = (depth: number, side: TreeSide) =>
  (side === "left" ? "-" : side === "right" ? "+" : "*").repeat(depth);
export const plantUmlColor = (value: string) => (value.startsWith("#") ? value : `#${value}`);

const statement = (marker: string, value: TreeNodeInput, alias?: string) => {
  const iconPrefix = value.icon?.trim() ? `<${value.icon.trim()}> ` : "";
  const styledLabel = value.textColor?.trim()
    ? `<color:${plantUmlColor(value.textColor.trim())}>${value.label.trim()}</color>`
    : value.label.trim();
  const label = `${iconPrefix}${styledLabel}`;
  const linked = value.link?.trim() ? `[[${value.link.trim()} ${label}]]` : label;
  const stereotype = value.stereotype?.trim() ? ` <<${value.stereotype.trim()}>>` : "";
  const prefix = `${marker}${alias ? `(${alias})` : ""}${value.color?.trim() ? `[${plantUmlColor(value.color.trim())}]` : ""}`;
  // A label containing newlines can't fit PlantUML's single-line `marker label` form, so it is
  // written using the `marker: text;` multiline form instead, closing with a trailing `;`.
  return linked.includes("\n") ? `${prefix}: ${linked};${stereotype}` : `${prefix} ${linked}${stereotype}`;
};

/** Where a new top-level line goes: just before the closing tag, or at the end without one. */
export const insertionPoint = (dialect: TreeDialect, source: string) => {
  if (source.length > MAX_TREE_SOURCE_LENGTH)
    throw new RangeError(`${dialect.label} source exceeds the 100,000 character limit`);
  const match = new RegExp(`(?:^|\\n)\\s*${dialect.end}\\b`, "i").exec(source);
  return match ? match.index + (match[0].startsWith("\n") ? 1 : 0) : source.length;
};

/** The result of an operation that adds a line, with where the new node's line starts. */
export interface TreeEditResult {
  source: string;
  /** Offset of the new node's line in `source`. Undefined when nothing changed. */
  nodeStart?: number;
}

export function insertTreeNode(
  dialect: TreeDialect,
  source: string,
  document: Pick<TreeDocument, "nodes">,
  value: TreeNodeInput,
  parent?: TreeNode,
  after?: TreeNode,
): string {
  return insertTreeNodeAt(dialect, source, document, value, parent, after).source;
}

export function insertTreeNodeAt(
  dialect: TreeDialect,
  source: string,
  document: Pick<TreeDocument, "nodes">,
  value: TreeNodeInput,
  parent?: TreeNode,
  after?: TreeNode,
): TreeEditResult {
  const depth = parent ? parent.depth + 1 : after ? after.depth : 1;
  // Every non-root node picks its own side independently: it only steers where that node sits
  // relative to its own parent, so it doesn't need to match any ancestor's family. When no side
  // is requested, default to the reference node's exact marker character (cosmetic only).
  const side = depth === 1 ? "root" : (value.side ?? parent?.side ?? after?.side ?? "right");
  const inheritedMarker = value.side ? undefined : (parent?.marker[0] ?? after?.marker[0]);
  const marker = depth === 1 ? "*" : inheritedMarker ? inheritedMarker.repeat(depth) : markerFor(depth, side);
  const at = after
    ? lineEnd(source, after.subtreeRange.to)
    : parent
      ? lineEnd(source, parent.subtreeRange.to)
      : insertionPoint(dialect, source);
  const newline = eol(source);
  const prefix = at > 0 && source[at - 1] !== "\n" ? newline : "";
  return {
    source: `${source.slice(0, at)}${prefix}${statement(marker, value)}${newline}${source.slice(at)}`,
    nodeStart: at + prefix.length,
  };
}

/** `alias` is written back after the marker for dialects that have aliases; others omit it. */
export function updateTreeNode(source: string, node: TreeNode, value: TreeNodeInput, alias?: string): string {
  // A node's side only steers its position relative to its own parent, so changing it only ever
  // rewrites this node's own marker — descendants keep whichever side they were each given.
  const side = node.depth === 1 ? "root" : (value.side ?? node.side);
  const marker = (side === node.side ? node.marker : markerFor(node.depth, side)) + (node.boxless ? "_" : "");
  // In a CRLF file the node's range ends with the line's `\r`; keep it, and write a multi-line
  // label's own breaks in the file's line ending too, so the file stays CRLF.
  const newline = eol(source);
  const keptCr = source[node.sourceRange.to - 1] === "\r" ? "\r" : "";
  const written = statement(marker, value, alias).replace(/\r?\n/g, newline);
  return `${source.slice(0, node.sourceRange.from)}${written}${keptCr}${source.slice(node.sourceRange.to)}`;
}

/**
 * Removes a node with its whole subtree. `extraRanges` are further source ranges, already
 * extended to whole lines, that go with it (the WBS relationships that touch the subtree).
 */
export function deleteTreeNode(source: string, node: TreeNode, extraRanges: TextRange[] = []): string {
  const removedNodeTo = lineEnd(source, node.subtreeRange.to);
  const ranges = [{ from: node.subtreeRange.from, to: removedNodeTo }, ...extraRanges].sort(
    (left, right) => right.from - left.from,
  );
  let updated = source;
  for (const range of ranges) updated = `${updated.slice(0, range.from)}${updated.slice(range.to)}`;
  return updated;
}

export function moveTreeSubtree(
  dialect: TreeDialect,
  source: string,
  document: Pick<TreeDocument, "nodes">,
  node: TreeNode,
  parent?: TreeNode,
  before?: TreeNode,
  side?: "left" | "right",
): string {
  return moveTreeSubtreeAt(dialect, source, document, node, parent, before, side).source;
}

export function moveTreeSubtreeAt(
  dialect: TreeDialect,
  source: string,
  document: Pick<TreeDocument, "nodes">,
  node: TreeNode,
  parent?: TreeNode,
  before?: TreeNode,
  side?: "left" | "right",
): TreeEditResult {
  if (
    parent &&
    (parent.id === node.id ||
      (parent.sourceRange.from > node.sourceRange.from && parent.sourceRange.from <= node.subtreeRange.to))
  )
    return { source };
  const block = source.slice(node.subtreeRange.from, lineEnd(source, node.subtreeRange.to)).replace(/\n$/, "");
  const newDepth = parent ? parent.depth + 1 : (before?.depth ?? 1);
  const inheritedFamily =
    newDepth === 1
      ? "*"
      : side === "left"
        ? "-"
        : side === "right"
          ? "+"
          : (parent?.marker[0] ?? before?.marker[0] ?? node.marker[0] ?? "*");
  const depthDelta = newDepth - node.depth;
  // Only node lines are re-marked: a multi-line `:` ... `;` label can hold lines that start with - or +.
  const nodeStarts = new Set(
    document.nodes
      .filter(
        (item) => item.sourceRange.from >= node.subtreeRange.from && item.sourceRange.from <= node.subtreeRange.to,
      )
      .map((item) => source.lastIndexOf("\n", item.sourceRange.from - 1) + 1),
  );
  // Only the moved node's own line adopts its new parent's family — each descendant keeps its
  // own side (relative to its own parent, which didn't change) and just gets re-sized for depth.
  let lineStart = node.subtreeRange.from;
  const transformed = block
    .split("\n")
    .map((line, index) => {
      const start = lineStart;
      lineStart += line.length + 1;
      if (!nodeStarts.has(start)) return line;
      const match = line.match(/^(\s*)([*+-]+)([^\n]*)$/);
      if (!match?.[2]) return line;
      const depth = Math.max(1, match[2].length + depthDelta);
      const family = index === 0 ? inheritedFamily : match[2][0]!;
      return `${match[1]}${depth === 1 ? "*" : family.repeat(depth)}${match[3]}`;
    })
    .join("\n");
  const removedTo = lineEnd(source, node.subtreeRange.to);
  const without = `${source.slice(0, node.subtreeRange.from)}${source.slice(removedTo)}`;
  const originalAt =
    before?.sourceRange.from ?? (parent ? lineEnd(source, parent.subtreeRange.to) : insertionPoint(dialect, source));
  const removedLength = removedTo - node.subtreeRange.from;
  const at = originalAt > node.subtreeRange.from ? originalAt - removedLength : originalAt;
  const newline = block.endsWith("\r") ? "\n" : eol(source);
  return { source: `${without.slice(0, at)}${transformed}${newline}${without.slice(at)}`, nodeStart: at };
}

export function reorderTreeNode(
  dialect: TreeDialect,
  source: string,
  document: Pick<TreeDocument, "nodes">,
  node: TreeNode,
  before?: TreeNode,
): string {
  const parent = node.parentId ? document.nodes.find((item) => item.id === node.parentId) : undefined;
  return moveTreeSubtree(dialect, source, document, node, parent, before);
}
