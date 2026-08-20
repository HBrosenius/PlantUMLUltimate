import type { DiagramAdapter } from "@plantuml-studio/language-core";

export type PlantUmlDiagramType = "gantt" | "uml" | "mindmap" | "wbs" | "json" | "yaml" | "chronology" | "unknown";

const START_DIRECTIVES: Array<[RegExp, PlantUmlDiagramType]> = [
  [/^\s*@startgantt\b/im, "gantt"],
  [/^\s*@startuml\b/im, "uml"],
  [/^\s*@startmindmap\b/im, "mindmap"],
  [/^\s*@startwbs\b/im, "wbs"],
  [/^\s*@startjson\b/im, "json"],
  [/^\s*@startyaml\b/im, "yaml"],
  [/^\s*@startchronology\b/im, "chronology"],
];

export function detectPlantUmlDiagramType(source: string): PlantUmlDiagramType {
  return START_DIRECTIVES.find(([pattern]) => pattern.test(source))?.[1] ?? "unknown";
}

export class DiagramAdapterRegistry {
  private readonly adapters = new Map<string, DiagramAdapter<unknown>>();

  register<TModel>(adapter: DiagramAdapter<TModel>): this {
    this.adapters.set(adapter.id, adapter as DiagramAdapter<unknown>);
    return this;
  }

  get(id: string): DiagramAdapter<unknown> | undefined {
    return this.adapters.get(id);
  }
  detect(source: string): DiagramAdapter<unknown> | undefined {
    return [...this.adapters.values()].find((adapter) => adapter.detect(source));
  }
  list(): readonly DiagramAdapter<unknown>[] {
    return [...this.adapters.values()];
  }
}
