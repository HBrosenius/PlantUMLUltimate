import type { TextRange } from "@plantuml-studio/language-core";
import type { MindmapDocument } from "./model";

export interface MindmapSymbolOccurrence {
  kind: "mindmap-node";
  key: string;
  value: string;
  range: TextRange;
  role: "declaration";
  declaration: "label";
}

/** One label declaration per node. Mindmaps have no aliases, so there are no references. */
export function collectMindmapSymbolOccurrences(source: string, document: MindmapDocument): MindmapSymbolOccurrence[] {
  const occurrences: MindmapSymbolOccurrence[] = [];
  for (const node of document.nodes) {
    const from = source.indexOf(node.label, node.sourceRange.from);
    if (!node.label || from < 0 || from + node.label.length > node.sourceRange.to) continue;
    occurrences.push({
      kind: "mindmap-node",
      key: node.id,
      value: node.label,
      range: { from, to: from + node.label.length },
      role: "declaration",
      declaration: "label",
    });
  }
  return occurrences.sort((left, right) => left.range.from - right.range.from);
}
