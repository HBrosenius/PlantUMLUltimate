import {
  deleteTreeNode,
  insertionPoint as treeInsertionPoint,
  insertTreeNodeAt,
  lineEnd,
  moveTreeSubtreeAt,
  updateTreeNode,
} from "@plantuml-studio/diagram-tree";
import type { TextRange } from "@plantuml-studio/language-core";
import { MINDMAP_DIALECT } from "./dialect";
import { settleMirroredMarkerFamilies } from "./families";
import type { MindmapControl, MindmapDirection, MindmapDocument, MindmapNode, MindmapNodeInput } from "./model";
import { markerDirection, mindmapSideAt, parseMindmap } from "./parser";

export const MINDMAP_MARKDOWN_UNAVAILABLE = "Convert to * markers to edit visually";

const KEYWORDS: Record<MindmapDirection, string> = {
  "left-to-right": "left to right direction",
  "top-to-bottom": "top to bottom direction",
  "right-to-left": "right to left direction",
  "bottom-to-top": "bottom to top direction",
};

// New lines follow the document's own line endings so a CRLF file stays CRLF.
const eol = (source: string) => (source.includes("\r\n") ? "\r\n" : "\n");
// The end of a line including its `\r\n`, for ranges that stop before the `\r`.
const wholeLineEnd = (source: string, to: number) => {
  let end = to;
  if (source[end] === "\r") end += 1;
  if (source[end] === "\n") end += 1;
  return end;
};
const sideOf = (node: MindmapNode) => (node.side === "left" ? "left" : "right");
// A multi-line label is written with the document's own line endings.
const withLineEndings = (source: string, value: Omit<MindmapNodeInput, "side">) => ({
  ...value,
  label: value.label.replace(/\r?\n/g, eol(source)),
});
const insertionPoint = (source: string) => treeInsertionPoint(MINDMAP_DIALECT, source);
const isMultiline = (source: string, node: MindmapNode) =>
  source.slice(node.sourceRange.from, node.sourceRange.to).includes("\n");
const hasMarkdown = (document: MindmapDocument, node: MindmapNode) =>
  document.nodes.some(
    (item) =>
      item.markdown !== undefined &&
      item.sourceRange.from >= node.sourceRange.from &&
      item.sourceRange.from <= node.subtreeRange.to,
  );

/**
 * Why a visual edit around these nodes is not possible, or undefined when it is. A node written in
 * Markdown form (`## Child`, an indented `*` bullet) can only be edited as text, and so can any
 * parent or sibling whose subtree contains one, because moving or inserting next to it would
 * re-mark or break the list.
 */
export function mindmapEditBlocker(
  document: MindmapDocument,
  ...nodes: Array<MindmapNode | undefined>
): string | undefined {
  return nodes.some((node) => node && (node.markdown || hasMarkdown(document, node)))
    ? MINDMAP_MARKDOWN_UNAVAILABLE
    : undefined;
}

const subtreeOf = (document: MindmapDocument, node: MindmapNode) =>
  document.nodes.filter(
    (item) => item.sourceRange.from >= node.sourceRange.from && item.sourceRange.from <= node.subtreeRange.to,
  );

// The depth-2 node that decides a node's side: the node itself, or its ancestor at depth 2.
function sideOwner(document: MindmapDocument, node: MindmapNode): MindmapNode | undefined {
  let current: MindmapNode | undefined = node;
  while (current && current.depth > 2) current = document.nodes.find((item) => item.id === current!.parentId);
  return current?.depth === 2 ? current : undefined;
}

// Rewrites the marker characters of the node line that starts at `from`, keeping any `_`.
function remarkLine(source: string, from: number, marker: string) {
  const match = /^[ \t]*[*+-]+/.exec(source.slice(from, from + 64));
  if (!match) return source;
  const indent = /^[ \t]*/.exec(match[0])![0].length;
  return `${source.slice(0, from + indent)}${marker}${source.slice(from + match[0].length)}`;
}

function remarkLines(source: string, changes: Array<{ from: number; marker: string }>) {
  let result = source;
  for (const change of [...changes].sort((left, right) => right.from - left.from))
    result = remarkLine(result, change.from, change.marker);
  return result;
}

/**
 * After a generic tree edit, so the result is something the engine accepts:
 * - a multi-line label only works with `*` markers (`++:` and `--:` are engine errors);
 * - below a `-` node every descendant has to use `-` too, and below any other node none may;
 * - a depth-2 node can be asked to end up on a side the generic edit did not pick.
 * `start` is where the edited node's line begins.
 */
function settleNode(source: string, start: number, side?: "left" | "right"): string {
  let document = parseMindmap(source);
  let node = document.nodes.find((item) => item.sourceRange.from === start);
  if (!node) return source;
  let current = source;
  if (isMultiline(current, node) && node.marker !== "*".repeat(node.depth)) {
    current = remarkLine(current, start, "*".repeat(node.depth));
    document = parseMindmap(current);
    node = document.nodes.find((item) => item.sourceRange.from === start);
    if (!node) return current;
  }
  const owner = node.markdown ? undefined : sideOwner(document, node);
  if (!owner) return current;
  return applySide(current, document, owner, node === owner ? (side ?? sideOf(owner)) : sideOf(owner));
}

export function insertMindmapNode(
  source: string,
  document: MindmapDocument,
  value: MindmapNodeInput,
  parent?: MindmapNode,
  after?: MindmapNode,
): string {
  if (mindmapEditBlocker(document, parent, after)) return source;
  const depth = parent ? parent.depth + 1 : after ? after.depth : 1;
  // A new depth-2 node sits on the side it is asked for, else beside its sibling, else wherever its
  // position puts a `*` node.
  const side = depth === 2 ? (value.side ?? (after?.depth === 2 ? sideOf(after) : undefined)) : undefined;
  const { side: _requested, ...input } = value;
  const result = insertTreeNodeAt(MINDMAP_DIALECT, source, document, withLineEndings(source, input), parent, after);
  return settleMirroredMarkerFamilies(
    result.nodeStart === undefined ? result.source : settleNode(result.source, result.nodeStart, side),
  );
}

export function updateMindmapNode(source: string, node: MindmapNode, value: MindmapNodeInput): string {
  if (node.markdown) return source;
  const { side: requested, ...input } = value;
  // The node's range ends with its line's carriage return; keep it so a CRLF document stays CRLF.
  const to = source[node.sourceRange.to - 1] === "\r" ? node.sourceRange.to - 1 : node.sourceRange.to;
  // The shared writer would put the boxless `_` before the colour, which the engine reads as text.
  const written = updateTreeNode(
    source,
    { ...node, boxless: false, sourceRange: { from: node.sourceRange.from, to } },
    withLineEndings(source, input),
  );
  const next = node.boxless ? setBoxlessAt(written, node.sourceRange.from, true) : written;
  // A depth-2 node stays on its side even when a multi-line label forces its marker to `*`.
  return settleNode(next, node.sourceRange.from, node.depth === 2 ? (requested ?? sideOf(node)) : undefined);
}

/** Adds or removes the `_` that draws a node without a box. Only the marker is rewritten. */
export function setMindmapNodeBoxless(source: string, node: MindmapNode, boxless: boolean): string {
  return node.markdown ? source : setBoxlessAt(source, node.sourceRange.from, boxless);
}

// `**[#color]_ Label`: the engine wants the `_` after the colour, and reads `**_[#color]` as text.
function setBoxlessAt(source: string, from: number, boxless: boolean) {
  const match = /^([ \t]*[*+-]+(?:\[#[\w-]+\])?)(_?)/.exec(source.slice(from, from + 96));
  if (!match || Boolean(match[2]) === boxless) return source;
  return `${source.slice(0, from + match[1]!.length)}${boxless ? "_" : ""}${source.slice(from + match[0].length)}`;
}

export function deleteMindmapNode(source: string, node: MindmapNode): string {
  return deleteTreeNode(source, node);
}

export function moveMindmapSubtree(
  source: string,
  document: MindmapDocument,
  node: MindmapNode,
  parent?: MindmapNode,
  before?: MindmapNode,
  side?: "left" | "right",
): string {
  if (mindmapEditBlocker(document, node, parent, before)) return source;
  const newDepth = parent ? parent.depth + 1 : (before?.depth ?? 1);
  // A depth-2 node keeps its side when it stays under the same parent, otherwise it lands on its new
  // neighbour's side. An explicit side wins.
  const sameParent = node.depth === 2 && parent?.id === node.parentId;
  const wanted =
    newDepth === 2
      ? (side ??
        (sameParent ? sideOf(node) : undefined) ??
        (before?.depth === 2 ? sideOf(before) : undefined) ??
        (node.depth === 2 ? sideOf(node) : undefined))
      : undefined;
  // The generic move keeps the family of the new parent; the side is settled afterwards, so a node that
  // is already where it should be keeps its own markers.
  const result = moveTreeSubtreeAt(MINDMAP_DIALECT, source, document, node, parent, before);
  return settleMirroredMarkerFamilies(
    result.nodeStart === undefined ? result.source : settleNode(result.source, result.nodeStart, wanted),
  );
}

export function reorderMindmapNode(
  source: string,
  document: MindmapDocument,
  node: MindmapNode,
  before?: MindmapNode,
): string {
  const parent = node.parentId ? document.nodes.find((item) => item.id === node.parentId) : undefined;
  return moveMindmapSubtree(source, document, node, parent, before);
}

/** Why `setMindmapNodeSide` cannot do this, or undefined when it can. */
export function mindmapSideBlocker(source: string, document: MindmapDocument, node: MindmapNode): string | undefined {
  if (node.markdown) return MINDMAP_MARKDOWN_UNAVAILABLE;
  if (node.depth !== 2) return "Only the direct children of a root have a side";
  if (!document.nodes.some((item) => item.id === node.parentId)) return "The node has no root";
  if (
    subtreeOf(document, node).some((item) => isMultiline(source, item)) &&
    document.sideSwitches.some(
      (item) => item.range.from > node.sourceRange.from && item.range.from < node.subtreeRange.to,
    )
  )
    return "A node with a multi-line label and a left side or right side line inside it cannot change side";
  return undefined;
}

/**
 * Puts a depth-2 node and its subtree on `side`.
 *
 * The engine draws a `+` node on the right and a `-` node on the left whatever `left side` says, and
 * it only accepts a `-` node when its parent and children are `-` nodes as well (a `*` or `+`
 * descendant below a `-` node, or a `-` descendant below any other, is a syntax error). So the node's
 * marker and the markers of its whole subtree are rewritten, and only the marker characters.
 *
 * A multi-line label (`**:a` ... `b;`) only works with `*` markers: `++:` and `--:` are engine errors,
 * and `*` below a `-` node is one too. A node whose subtree holds a multi-line label therefore keeps
 * `*` markers and moves in the source instead, to the end of the last place in its root where the
 * document-wide `left side` / `right side` switch already has the wanted value. When no place has it,
 * a switch line is inserted before the node, and the previous side is restored after it when later
 * nodes depend on it.
 */
export function setMindmapNodeSide(
  source: string,
  document: MindmapDocument,
  node: MindmapNode,
  side: "left" | "right",
): string {
  if (mindmapSideBlocker(source, document, node)) return source;
  return settleMirroredMarkerFamilies(applySide(source, document, node, side));
}

const directionOf = (document: MindmapDocument, node: MindmapNode) => markerDirection(document.sideSwitches, node);

function applySide(source: string, document: MindmapDocument, owner: MindmapNode, side: "left" | "right"): string {
  const nodes = subtreeOf(document, owner);
  const consistent = nodes.every((item) => item.markdown || directionOf(document, item) === side);
  if (nodes.some((item) => isMultiline(source, item)))
    return owner.side === side && consistent ? source : relocateWithSwitch(source, document, owner, side, nodes);
  // A node already on this side keeps its own marker character. Otherwise `+` or `-` decides.
  const marker = side === "left" ? "-" : "+";
  const changes = nodes.flatMap((item) => {
    const current = item.marker[0]!;
    const wanted =
      item.id === owner.id
        ? owner.side === side
          ? current
          : marker
        : directionOf(document, item) === side
          ? current
          : marker;
    return wanted === current || item.markdown
      ? []
      : [{ from: item.sourceRange.from, marker: wanted.repeat(item.depth) }];
  });
  return remarkLines(source, changes);
}

// Moves the subtree to a place where the `left side` / `right side` switch has the wanted value, and
// writes it with `*` markers.
function relocateWithSwitch(
  source: string,
  document: MindmapDocument,
  owner: MindmapNode,
  side: "left" | "right",
  nodes: MindmapNode[],
): string {
  const root = document.nodes.find((item) => item.id === owner.parentId);
  if (!root) return source;
  const newline = eol(source);
  const blockFrom = owner.subtreeRange.from;
  const blockTo = lineEnd(source, owner.subtreeRange.to);
  const nextRoot = document.nodes.find((item) => item.depth === 1 && item.sourceRange.from > root.sourceRange.from);
  const zoneEnd = nextRoot?.sourceRange.from ?? insertionPoint(source);
  const siblings = document.nodes.filter((item) => item.parentId === root.id && item.id !== owner.id);
  const positions = new Set<number>([lineEnd(source, root.subtreeRange.to)]);
  for (const sibling of siblings) positions.add(sibling.sourceRange.from);
  for (const item of document.sideSwitches)
    if (item.range.from > root.sourceRange.from && item.range.from < zoneEnd) {
      positions.add(item.range.from);
      positions.add(wholeLineEnd(source, item.range.to));
    }
  const candidates = [...positions]
    .filter(
      (position) =>
        position > root.sourceRange.to &&
        position <= zoneEnd &&
        // Not between a sibling and its own children.
        !siblings.some(
          (sibling) => position > sibling.sourceRange.from && position < lineEnd(source, sibling.subtreeRange.to),
        ),
    )
    .sort((left, right) => left - right);
  if (candidates.length === 0) return source;
  const wanted = candidates.filter((position) => mindmapSideAt(document, position) === side);
  const at = wanted.length > 0 ? wanted[wanted.length - 1]! : candidates[candidates.length - 1]!;
  const insideBlock = (item: MindmapNode) => item.sourceRange.from >= blockFrom && item.sourceRange.from < blockTo;
  const restore =
    wanted.length === 0 && document.nodes.some((item) => item.sourceRange.from >= at && !insideBlock(item));
  // The block's own lines: `*` for the node, and `*` for any line below it that is drawn on the other
  // side than the place the block moves to. Lines already on that side keep their markers.
  let block = remarkLines(
    source.slice(blockFrom, blockTo),
    nodes.flatMap((item) =>
      item.id === owner.id || (!item.markdown && directionOf(document, item) !== side)
        ? [{ from: item.sourceRange.from - blockFrom, marker: "*".repeat(item.depth) }]
        : [],
    ),
  );
  if (!block.endsWith("\n")) block += newline;
  const without = `${source.slice(0, blockFrom)}${source.slice(blockTo)}`;
  const target = at >= blockTo ? at - (blockTo - blockFrom) : at;
  const lead = target > 0 && without[target - 1] !== "\n" ? newline : "";
  const text =
    wanted.length > 0
      ? block
      : `${side} side${newline}${block}${restore ? `${mindmapSideAt(document, at)} side${newline}` : ""}`;
  return `${without.slice(0, target)}${lead}${text}${without.slice(target)}`;
}

// The line that ends the block of a control statement, with its own line ending removed.
const removeRange = (source: string, range: TextRange) =>
  `${source.slice(0, range.from)}${source.slice(wholeLineEnd(source, range.to))}`;

// After the opening tag, or at the very start without one.
function afterStartTag(source: string) {
  const match = /^[ \t]*@startmindmap\b.*$/im.exec(source);
  return match ? wholeLineEnd(source, match.index + match[0].replace(/\r$/, "").length) : 0;
}

function writeControl(source: string, existing: MindmapControl | undefined, text: string | undefined) {
  if (text === undefined) return existing ? removeRange(source, existing.range) : source;
  if (existing) return `${source.slice(0, existing.range.from)}${text}${source.slice(existing.range.to)}`;
  const at = afterStartTag(source);
  const lead = at > 0 && source[at - 1] !== "\n" ? eol(source) : "";
  return `${source.slice(0, at)}${lead}${text}${eol(source)}${source.slice(at)}`;
}

const lines = (source: string, text: string) => text.replace(/\r?\n/g, eol(source));

/** Sets or, with an empty value, removes the `title`. Several lines are written as a `title` block. */
export function setMindmapTitle(source: string, document: MindmapDocument, title: string | undefined): string {
  const value = title?.replace(/\r\n?/g, "\n").trim();
  if (!value) return writeControl(source, document.title, undefined);
  return writeControl(
    source,
    document.title,
    value.includes("\n") ? lines(source, `title\n${value}\nend title`) : `title ${value}`,
  );
}

/** Sets or removes the `caption`. A caption is one line, so line breaks become the `\n` escape. */
export function setMindmapCaption(source: string, document: MindmapDocument, caption: string | undefined): string {
  const value = caption?.replace(/\r?\n/g, "\\n").trim();
  return writeControl(source, document.caption, value ? `caption ${value}` : undefined);
}

function setBlockControl(
  source: string,
  existing: MindmapControl | undefined,
  name: "header" | "footer",
  value: string | undefined,
  placement: string | undefined,
) {
  const text = value?.replace(/\r\n?/g, "\n").trim();
  if (!text) return writeControl(source, existing, undefined);
  const where = (placement ?? existing?.placement)?.trim();
  const head = `${where ? `${where} ` : ""}${name}`;
  const asBlock = text.includes("\n") || existing?.block;
  return writeControl(source, existing, asBlock ? lines(source, `${head}\n${text}\nend${name}`) : `${head} ${text}`);
}

/**
 * Sets or removes the header. `placement` is `left`, `center` or `right`; without it the existing
 * statement keeps its own. A header that was a block stays a block.
 */
export function setMindmapHeader(
  source: string,
  document: MindmapDocument,
  header: string | undefined,
  placement?: string,
): string {
  return setBlockControl(source, document.header, "header", header, placement);
}

/** Sets or removes the footer. See `setMindmapHeader`. */
export function setMindmapFooter(
  source: string,
  document: MindmapDocument,
  footer: string | undefined,
  placement?: string,
): string {
  return setBlockControl(source, document.footer, "footer", footer, placement);
}

/**
 * Sets or removes the legend. `placement` is the words after `legend`, such as `right` or
 * `left top`; without it the existing legend keeps its own.
 */
export function setMindmapLegend(
  source: string,
  document: MindmapDocument,
  legend: string | undefined,
  placement?: string,
): string {
  const text = legend?.replace(/\r\n?/g, "\n").trim();
  if (!text) return writeControl(source, document.legend, undefined);
  const where = (placement ?? document.legend?.placement)?.trim();
  return writeControl(source, document.legend, lines(source, `legend${where ? ` ${where}` : ""}\n${text}\nendlegend`));
}

/** Sets the direction line, or removes it when `direction` is undefined. */
export function setMindmapDirection(
  source: string,
  document: MindmapDocument,
  direction: MindmapDirection | undefined,
): string {
  const existing = document.direction ? { ...document.direction, text: "", block: false } : undefined;
  return writeControl(source, existing, direction ? KEYWORDS[direction] : undefined);
}

/**
 * Rewrites a document written with `#` headers or indented `*` bullets to plain `*` markers, so it
 * can be edited visually. Labels, colours, boxless markers and every other line are kept.
 */
export function convertMindmapToOrgMode(source: string, document: MindmapDocument): string {
  let result = source;
  const converted = document.nodes
    .filter((node) => node.markdown)
    .sort((a, b) => b.sourceRange.from - a.sourceRange.from);
  for (const node of converted) {
    const prefix = /^[ \t]*(?:#+|\*)/.exec(result.slice(node.sourceRange.from, node.sourceRange.from + 256));
    if (!prefix) continue;
    result = `${result.slice(0, node.sourceRange.from)}${"*".repeat(node.depth)}${result.slice(node.sourceRange.from + prefix[0].length)}`;
  }
  return result;
}
