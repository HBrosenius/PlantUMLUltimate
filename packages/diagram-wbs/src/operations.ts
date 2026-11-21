import {
  deleteTreeNode,
  insertTreeNode,
  insertionPoint as treeInsertionPoint,
  lineEnd,
  moveTreeSubtree,
  plantUmlColor,
  reorderTreeNode,
  updateTreeNode,
} from "@plantuml-studio/diagram-tree";
import { WBS_DIALECT } from "./dialect";
import type { WbsDocument, WbsNode, WbsNodeInput } from "./model";

const insertionPoint = (source: string) => treeInsertionPoint(WBS_DIALECT, source);

export function insertWbsNode(
  source: string,
  document: WbsDocument,
  value: WbsNodeInput,
  parent?: WbsNode,
  after?: WbsNode,
): string {
  return insertTreeNode(WBS_DIALECT, source, document, value, parent, after);
}

export function updateWbsNode(source: string, node: WbsNode, value: WbsNodeInput): string {
  return updateTreeNode(source, node, value, node.alias);
}

export function renameWbsNodeAlias(source: string, document: WbsDocument, node: WbsNode, alias: string): string {
  const next = alias.trim();
  if (!node.alias || !/^[A-Za-z_][\w-]*$/.test(next)) return source;
  if (document.nodes.some((item) => item.id !== node.id && item.alias === next)) return source;
  const replacements = [
    {
      ...node.sourceRange,
      text: source.slice(node.sourceRange.from, node.sourceRange.to).replace(`(${node.alias})`, `(${next})`),
    },
    ...document.relationships
      .filter((item) => item.from === node.alias || item.to === node.alias)
      .map((item) => ({
        ...item.sourceRange,
        text: `${item.from === node.alias ? next : item.from} ${item.arrow} ${item.to === node.alias ? next : item.to}${item.color ? ` ${item.color}` : ""}`,
      })),
  ].sort((left, right) => right.from - left.from);
  return replacements.reduce(
    (current, item) => `${current.slice(0, item.from)}${item.text}${current.slice(item.to)}`,
    source,
  );
}

const aliasFor = (node: WbsNode, used: Set<string>) => {
  const raw =
    node.label
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase() || "node";
  const base = /^[A-Za-z_]/.test(raw) ? raw : `node_${raw}`;
  let alias = base;
  let suffix = 2;
  while (used.has(alias)) alias = `${base}_${suffix++}`;
  used.add(alias);
  return alias;
};

export function insertWbsRelationship(source: string, document: WbsDocument, from: WbsNode, to: WbsNode): string {
  if (from.id === to.id) return source;
  const used = new Set(document.nodes.flatMap((node) => (node.alias ? [node.alias] : [])));
  const fromAlias = from.alias ?? aliasFor(from, used);
  const toAlias = to.alias ?? aliasFor(to, used);
  if (document.relationships.some((item) => item.from === fromAlias && item.to === toAlias)) return source;
  const aliases = [
    ...(from.alias ? [] : [{ node: from, alias: fromAlias }]),
    ...(to.alias ? [] : [{ node: to, alias: toAlias }]),
  ].sort((left, right) => right.node.sourceRange.from - left.node.sourceRange.from);
  let updated = source;
  for (const item of aliases) {
    const line = updated.slice(item.node.sourceRange.from, item.node.sourceRange.to);
    const replacement = line.replace(/^(\s*[*+-]+)/, `$1(${item.alias})`);
    updated = `${updated.slice(0, item.node.sourceRange.from)}${replacement}${updated.slice(item.node.sourceRange.to)}`;
  }
  const at = insertionPoint(updated);
  const prefix = at > 0 && updated[at - 1] !== "\n" ? "\n" : "";
  return `${updated.slice(0, at)}${prefix}${fromAlias} -> ${toAlias}\n${updated.slice(at)}`;
}

export function updateWbsRelationshipColor(
  source: string,
  relationship: WbsDocument["relationships"][number],
  color: string,
): string {
  const value = color.trim();
  const statement = `${relationship.from} ${relationship.arrow} ${relationship.to}${value ? ` ${plantUmlColor(value)}` : ""}`;
  return `${source.slice(0, relationship.sourceRange.from)}${statement}${source.slice(relationship.sourceRange.to)}`;
}

export function deleteWbsRelationship(source: string, relationship: WbsDocument["relationships"][number]): string {
  return `${source.slice(0, relationship.sourceRange.from)}${source.slice(lineEnd(source, relationship.sourceRange.to))}`;
}

export function reconnectWbsRelationship(
  source: string,
  document: WbsDocument,
  relationship: WbsDocument["relationships"][number],
  endpoint: "from" | "to",
  target: WbsNode,
): string {
  const used = new Set(document.nodes.flatMap((node) => (node.alias ? [node.alias] : [])));
  const targetAlias = target.alias ?? aliasFor(target, used);
  const from = endpoint === "from" ? targetAlias : relationship.from;
  const to = endpoint === "to" ? targetAlias : relationship.to;
  if (
    from === to ||
    document.relationships.some((item) => item.id !== relationship.id && item.from === from && item.to === to)
  )
    return source;
  const edits = [
    {
      from: relationship.sourceRange.from,
      to: relationship.sourceRange.to,
      text: `${from} ${relationship.arrow} ${to}${relationship.color ? ` ${relationship.color}` : ""}`,
    },
    ...(target.alias
      ? []
      : [
          {
            from: target.sourceRange.from,
            to: target.sourceRange.to,
            text: source
              .slice(target.sourceRange.from, target.sourceRange.to)
              .replace(/^(\s*[*+-]+)/, `$1(${targetAlias})`),
          },
        ]),
  ].sort((left, right) => right.from - left.from);
  let updated = source;
  for (const edit of edits) updated = `${updated.slice(0, edit.from)}${edit.text}${updated.slice(edit.to)}`;
  return updated;
}

export function deleteWbsNode(source: string, document: WbsDocument, node: WbsNode): string {
  const removedNodeTo = lineEnd(source, node.subtreeRange.to);
  const aliases = new Set(
    document.nodes
      .filter(
        (candidate) =>
          candidate.sourceRange.from >= node.sourceRange.from && candidate.sourceRange.to <= node.subtreeRange.to,
      )
      .flatMap((candidate) => (candidate.alias ? [candidate.alias] : [])),
  );
  // Relationships that touch the removed subtree go with it.
  const relationshipRanges = document.relationships
    .filter((relationship) => aliases.has(relationship.from) || aliases.has(relationship.to))
    .map((relationship) => ({
      from: relationship.sourceRange.from,
      to: lineEnd(source, relationship.sourceRange.to),
    }))
    .filter((range) => range.to <= node.subtreeRange.from || range.from >= removedNodeTo);
  return deleteTreeNode(source, node, relationshipRanges);
}

export function moveWbsSubtree(
  source: string,
  document: WbsDocument,
  node: WbsNode,
  parent?: WbsNode,
  before?: WbsNode,
  side?: "left" | "right",
): string {
  return moveTreeSubtree(WBS_DIALECT, source, document, node, parent, before, side);
}

export function reorderWbsNode(source: string, document: WbsDocument, node: WbsNode, before?: WbsNode): string {
  return reorderTreeNode(WBS_DIALECT, source, document, node, before);
}
