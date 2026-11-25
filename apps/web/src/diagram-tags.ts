import type { DiagramKind } from "./model";

/** The `@start…` / `@end…` suffix PlantUML uses for each kind. Exhaustive, so a new kind cannot fall through to `uml`. */
export function diagramTagSuffix(kind: DiagramKind): "gantt" | "wbs" | "mindmap" | "uml" {
  switch (kind) {
    case "gantt":
      return "gantt";
    case "wbs":
      return "wbs";
    case "mindmap":
      return "mindmap";
    case "sequence":
    case "usecase":
    case "class":
    case "component":
    case "activity":
    case "c4":
      return "uml";
    default: {
      const unreachable: never = kind;
      throw new Error(`Unknown diagram kind: ${String(unreachable)}`);
    }
  }
}

/** Kinds that are a tree of `*`/`+`/`-` depth-marker lines (WBS and mindmap). */
export function isTreeKind(kind: DiagramKind): kind is "wbs" | "mindmap" {
  return kind === "wbs" || kind === "mindmap";
}
