import type { SemanticSymbolOccurrence } from "./semantic-symbol-provider";
import type { DiagramKind } from "./model";

export interface DiagramOutlineEntry {
  id: string;
  kind: string;
  typeLabel: string;
  label: string;
  line: number;
  range: { from: number; to: number };
  target: DiagramOutlineTarget;
  group?: string;
  depth?: number;
}

export type DiagramOutlineTarget =
  | { type: "semantic"; occurrence: SemanticSymbolOccurrence }
  | { type: "gantt-dependency"; index: number }
  | { type: "gantt-divider"; index: number }
  | { type: "gantt-separator"; index: number }
  | { type: "sequence-message"; id: string }
  | { type: "sequence-structure"; id: string }
  | { type: "usecase-object"; id: string }
  | { type: "class-object"; id: string }
  | { type: "activity-object"; id: string }
  | { type: "wbs-relationship"; id: string };

export const diagramOutlineTypeLabels: Record<SemanticSymbolOccurrence["kind"], string> = {
  task: "Task",
  person: "Person",
  participant: "Participant",
  "sequence-anchor": "Anchor",
  actor: "Actor",
  usecase: "Use case",
  "usecase-package": "Package",
  "class-entity": "Entity",
  "class-package": "Package",
  "activity-action": "Action",
  "activity-partition": "Partition",
  "wbs-node": "WBS node",
};

export function buildDiagramOutlineEntries(
  source: string,
  occurrences: readonly SemanticSymbolOccurrence[],
  diagramKind?: DiagramKind,
): DiagramOutlineEntry[] {
  const groups = new Map<string, SemanticSymbolOccurrence[]>();
  for (const occurrence of occurrences) {
    const id = `${occurrence.kind}:${occurrence.key}`;
    const items = groups.get(id);
    if (items) items.push(occurrence);
    else groups.set(id, [occurrence]);
  }
  const starts = [0];
  for (let index = 0; index < source.length; index++) if (source[index] === "\n") starts.push(index + 1);
  const lineAt = (position: number) => {
    let low = 0;
    let high = starts.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (starts[mid]! <= position) low = mid + 1;
      else high = mid;
    }
    return low;
  };
  return [...groups.entries()]
    .map(([id, items]) => {
      const occurrence = items.find((item) => item.role === "declaration") ?? items[0]!;
      return {
        id,
        kind: occurrence.kind,
        typeLabel:
          diagramKind === "component" && occurrence.kind === "class-entity"
            ? "Component"
            : diagramOutlineTypeLabels[occurrence.kind],
        label: occurrence.value,
        line: lineAt(occurrence.range.from),
        range: occurrence.range,
        target: { type: "semantic" as const, occurrence },
      };
    })
    .sort((left, right) => left.range.from - right.range.from);
}

export function outlineLine(source: string, range: { from: number }): number {
  return source.slice(0, range.from).split(/\r?\n/).length;
}

/** Shared by the modal, dock and canvas Find. Context is displayed, not hidden source text. */
export function filterDiagramOutline(entries: readonly DiagramOutlineEntry[], query: string, kind = "all") {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    if (kind !== "all" && entry.kind !== kind) return false;
    const text = `${entry.label} ${entry.typeLabel} ${entry.group ?? ""}`.toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}

export function outlineTargetSelector(entry: DiagramOutlineEntry): string | undefined {
  const target = entry.target;
  let attribute: string | undefined;
  let key: string | number | undefined;
  if (target.type === "semantic") {
    const attributes: Partial<Record<SemanticSymbolOccurrence["kind"], string>> = {
      task: "data-task-id",
      participant: "data-sequence-participant-id",
      actor: "data-usecase-object-id",
      usecase: "data-usecase-object-id",
      "usecase-package": "data-usecase-object-id",
      "class-entity": "data-class-object-id",
      "class-package": "data-class-object-id",
      "activity-action": "data-activity-object-id",
      "activity-partition": "data-activity-object-id",
      "wbs-node": "data-wbs-node-id",
    };
    attribute = attributes[target.occurrence.kind];
    key = target.occurrence.key;
  } else {
    const attributes = {
      "gantt-dependency": "data-dependency-index",
      "gantt-divider": "data-divider-index",
      "gantt-separator": "data-vertical-separator-index",
      "sequence-message": "data-sequence-message-id",
      "sequence-structure": "data-sequence-structure-id",
      "usecase-object": "data-usecase-object-id",
      "class-object": "data-class-object-id",
      "activity-object": "data-activity-object-id",
      "wbs-relationship": "data-wbs-relationship-id",
    };
    attribute = attributes[target.type];
    key = "index" in target ? target.index : target.id;
  }
  return attribute && key !== undefined ? `[${attribute}="${CSS.escape(String(key))}"]` : undefined;
}
