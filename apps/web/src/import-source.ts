import { detectDiagramKind } from "./diagram-kind";
import type { DiagramKind } from "./model";

export function importedDiagramKind(source: string): DiagramKind {
  if (new TextEncoder().encode(source).length > 500_000)
    throw new Error("PlantUML source exceeds the 500 kB text limit.");
  const starts = [...source.matchAll(/^\s*@start(uml|gantt|wbs)\b/gim)];
  if (starts.length !== 1) throw new Error("Import one PlantUML diagram with @startuml, @startgantt or @startwbs.");
  const family = starts[0]![1]!.toLowerCase();
  const ends = [...source.matchAll(/^\s*@end(uml|gantt|wbs)\b/gim)];
  if (ends.length !== 1 || ends[0]![1]!.toLowerCase() !== family || ends[0]!.index! <= starts[0]!.index!) {
    throw new Error(`Source needs a matching @end${family} after its start.`);
  }
  return detectDiagramKind(source) ?? "sequence";
}
