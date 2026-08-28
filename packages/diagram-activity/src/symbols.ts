import type { TextRange } from "@plantuml-studio/language-core";
import type { ActivityDocument } from "./model";

export interface ActivitySymbolOccurrence {
  kind: "activity-action" | "activity-partition";
  key: string;
  value: string;
  range: TextRange;
  role: "declaration";
}

export function collectActivitySymbolOccurrences(
  source: string,
  document: ActivityDocument,
): ActivitySymbolOccurrence[] {
  const occurrences: ActivitySymbolOccurrence[] = [];
  for (const node of document.nodes) {
    if (node.kind !== "action") continue;
    const text = source.slice(node.sourceRange.from, node.sourceRange.to);
    const match = /^\s*(?:#[\w-]+)?\s*:(.*);\s*(?:.*)$/.exec(text);
    if (!match?.[1]) continue;
    const relative = text.indexOf(match[1]);
    occurrences.push({
      kind: "activity-action",
      key: node.id,
      value: node.label,
      range: { from: node.sourceRange.from + relative, to: node.sourceRange.from + relative + match[1].length },
      role: "declaration",
    });
  }
  for (const partition of document.partitions) {
    const text = source.slice(partition.openRange.from, partition.openRange.to);
    const quoted = text.indexOf(`"${partition.label}"`);
    const raw = text.indexOf(partition.label);
    const relative = quoted >= 0 ? quoted + 1 : raw;
    if (relative < 0) continue;
    occurrences.push({
      kind: "activity-partition",
      key: partition.id,
      value: partition.label,
      range: {
        from: partition.openRange.from + relative,
        to: partition.openRange.from + relative + partition.label.length,
      },
      role: "declaration",
    });
  }
  return occurrences.sort((left, right) => left.range.from - right.range.from);
}
