import type { TextRange } from "@plantuml-studio/language-core";
import type { WbsDocument, WbsNode } from "./model";

export interface WbsSymbolOccurrence {
  kind: "wbs-node";
  key: string;
  value: string;
  range: TextRange;
  role: "declaration" | "reference";
  declaration?: "label" | "alias";
}

export function collectWbsSymbolOccurrences(source: string, document: WbsDocument): WbsSymbolOccurrence[] {
  const occurrences: WbsSymbolOccurrence[] = [];
  const byAlias = new Map(document.nodes.flatMap((node) => (node.alias ? [[node.alias, node] as const] : [])));
  const add = (
    node: WbsNode | undefined,
    value: string,
    range: TextRange,
    role: WbsSymbolOccurrence["role"],
    after = range.from,
    declaration?: WbsSymbolOccurrence["declaration"],
  ) => {
    if (!node) return undefined;
    const from = source.indexOf(value, Math.max(range.from, after));
    if (from < 0 || from + value.length > range.to) return undefined;
    occurrences.push({
      kind: "wbs-node",
      key: node.id,
      value,
      range: { from, to: from + value.length },
      role,
      ...(declaration ? { declaration } : {}),
    });
    return from + value.length;
  };

  for (const node of document.nodes) {
    const aliasEnd = node.alias
      ? add(node, node.alias, node.sourceRange, "declaration", node.sourceRange.from, "alias")
      : undefined;
    add(node, node.label, node.sourceRange, "declaration", aliasEnd, "label");
  }
  for (const relationship of document.relationships) {
    const after = add(byAlias.get(relationship.from), relationship.from, relationship.sourceRange, "reference");
    add(byAlias.get(relationship.to), relationship.to, relationship.sourceRange, "reference", after);
  }
  return occurrences.sort((left, right) => left.range.from - right.range.from);
}
