import type { SemanticSymbolOccurrence } from "./semantic-symbol-provider";
import type { DiagramKind } from "./model";

export interface DiagramOutlineEntry {
  id: string;
  kind: SemanticSymbolOccurrence["kind"];
  typeLabel: string;
  label: string;
  line: number;
  occurrence: SemanticSymbolOccurrence;
}

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
        occurrence,
      };
    })
    .sort((left, right) => left.occurrence.range.from - right.occurrence.range.from);
}
