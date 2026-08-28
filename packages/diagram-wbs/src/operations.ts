import type { WbsDocument, WbsNode, WbsNodeInput, WbsSide } from "./model";

const lineEnd = (source: string, to: number) => (source[to] === "\n" ? to + 1 : to);
const markerFor = (depth: number, side: WbsSide) =>
  (side === "left" ? "-" : side === "right" ? "+" : "*").repeat(depth);
const plantUmlColor = (value: string) => (value.startsWith("#") ? value : `#${value}`);
const statement = (marker: string, value: WbsNodeInput, alias?: string) => {
  const label = value.textColor?.trim()
    ? `<color:${plantUmlColor(value.textColor.trim())}>${value.label.trim()}</color>`
    : value.label.trim();
  return `${marker}${alias ? `(${alias})` : ""}${value.color?.trim() ? `[${plantUmlColor(value.color.trim())}]` : ""} ${label}${value.stereotype?.trim() ? ` <<${value.stereotype.trim()}>>` : ""}`;
};
const insertionPoint = (source: string) => {
  const match = /(?:^|\n)\s*@endwbs\b/i.exec(source);
  return match ? match.index + (match[0].startsWith("\n") ? 1 : 0) : source.length;
};

export function insertWbsNode(
  source: string,
  document: WbsDocument,
  value: WbsNodeInput,
  parent?: WbsNode,
  after?: WbsNode,
): string {
  const depth = parent ? parent.depth + 1 : after ? after.depth : 1;
  const side = depth === 1 ? "root" : (value.side ?? parent?.side ?? after?.side ?? "right");
  const inheritedMarker = !value.side ? (parent?.marker[0] ?? after?.marker[0]) : undefined;
  const marker = depth === 1 ? "*" : inheritedMarker ? inheritedMarker.repeat(depth) : markerFor(depth, side);
  const at = after
    ? lineEnd(source, after.subtreeRange.to)
    : parent
      ? lineEnd(source, parent.subtreeRange.to)
      : insertionPoint(source);
  const prefix = at > 0 && source[at - 1] !== "\n" ? "\n" : "";
  return `${source.slice(0, at)}${prefix}${statement(marker, value)}\n${source.slice(at)}`;
}

export function updateWbsNode(source: string, node: WbsNode, value: WbsNodeInput): string {
  const side = value.side ?? node.side;
  const marker = !value.side || side === node.side ? node.marker : markerFor(node.depth, side);
  if (side === node.side || node.depth === 1)
    return `${source.slice(0, node.sourceRange.from)}${statement(marker, value, node.alias)}${source.slice(node.sourceRange.to)}`;
  const tail = source.slice(node.sourceRange.to, node.subtreeRange.to);
  const family = side === "left" ? "-" : "+";
  const changedTail = tail.replace(
    /^(\s*)[*+-]+(?=\s)/gm,
    (match) => `${match.match(/^\s*/)?.[0] ?? ""}${family.repeat(match.trim().length)}`,
  );
  return `${source.slice(0, node.sourceRange.from)}${statement(marker, value, node.alias)}${changedTail}${source.slice(node.subtreeRange.to)}`;
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
  const ranges = [
    { from: node.subtreeRange.from, to: removedNodeTo },
    ...document.relationships
      .filter((relationship) => aliases.has(relationship.from) || aliases.has(relationship.to))
      .map((relationship) => ({
        from: relationship.sourceRange.from,
        to: lineEnd(source, relationship.sourceRange.to),
      }))
      .filter((range) => range.to <= node.subtreeRange.from || range.from >= removedNodeTo),
  ].sort((left, right) => right.from - left.from);
  let updated = source;
  for (const range of ranges) updated = `${updated.slice(0, range.from)}${updated.slice(range.to)}`;
  return updated;
}

export function moveWbsSubtree(
  source: string,
  document: WbsDocument,
  node: WbsNode,
  parent?: WbsNode,
  before?: WbsNode,
): string {
  if (
    parent &&
    (parent.id === node.id ||
      (parent.sourceRange.from > node.sourceRange.from && parent.sourceRange.from <= node.subtreeRange.to))
  )
    return source;
  const block = source.slice(node.subtreeRange.from, lineEnd(source, node.subtreeRange.to)).replace(/\n$/, "");
  const newDepth = parent ? parent.depth + 1 : (before?.depth ?? 1);
  const markerCharacter = parent?.marker[0] ?? before?.marker[0] ?? node.marker[0] ?? "*";
  const depthDelta = newDepth - node.depth;
  const transformed = block
    .split("\n")
    .map((line) => {
      const match = line.match(/^(\s*)([*+-]+)(\s*.*)$/);
      if (!match?.[2]) return line;
      const depth = Math.max(1, match[2].length + depthDelta);
      return `${match[1]}${depth === 1 ? "*" : markerCharacter.repeat(depth)}${match[3]}`;
    })
    .join("\n");
  const removedTo = lineEnd(source, node.subtreeRange.to);
  const without = `${source.slice(0, node.subtreeRange.from)}${source.slice(removedTo)}`;
  const originalAt =
    before?.sourceRange.from ?? (parent ? lineEnd(source, parent.subtreeRange.to) : insertionPoint(source));
  const removedLength = removedTo - node.subtreeRange.from;
  const at = originalAt > node.subtreeRange.from ? originalAt - removedLength : originalAt;
  return `${without.slice(0, at)}${transformed}\n${without.slice(at)}`;
}

export function reorderWbsNode(source: string, document: WbsDocument, node: WbsNode, before?: WbsNode): string {
  const parent = node.parentId ? document.nodes.find((item) => item.id === node.parentId) : undefined;
  return moveWbsSubtree(source, document, node, parent, before);
}
