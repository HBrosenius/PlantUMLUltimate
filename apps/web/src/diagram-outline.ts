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
    groups.set(id, [...(groups.get(id) ?? []), occurrence]);
  }
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
        line: source.slice(0, occurrence.range.from).split(/\r?\n/).length,
        range: occurrence.range,
        target: { type: "semantic" as const, occurrence },
      };
    })
    .sort((left, right) => left.range.from - right.range.from);
}

export function outlineLine(source: string, range: { from: number }): number {
  return source.slice(0, range.from).split(/\r?\n/).length;
}
