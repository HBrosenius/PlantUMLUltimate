import * as Y from "yjs";
import { validateCollaborationState } from "../../../packages/shared/src/collaboration-schema";
import { validateProject, type PortableProject, type PortableProjectDiagram } from "@plantuml-studio/document-format";
import type { DiagramKind } from "./model";

export type SharedDiagram = {
  id: string;
  name: string;
  documentId: string;
  kind: DiagramKind;
  source: string;
  settings: PortableProjectDiagram["document"]["settings"];
  historyPolicy: PortableProjectDiagram["document"]["historyPolicy"];
  wbsGantt?: PortableProjectDiagram["wbsGantt"] | undefined;
};
export type SharedDocument = {
  id: string;
  name: string;
  diagrams: SharedDiagram[];
  elements: PortableProject["elements"];
  links: PortableProject["links"];
};

export function sharedDocumentFromProject(project: PortableProject): SharedDocument {
  return {
    id: project.projectId,
    name: project.name,
    diagrams: project.diagrams.map((diagram) => ({
      id: diagram.id,
      name: diagram.name,
      documentId: diagram.document.documentId,
      kind: diagram.document.current.diagramKind as DiagramKind,
      source: diagram.document.current.source,
      settings: diagram.document.settings,
      historyPolicy: diagram.document.historyPolicy,
      ...(diagram.wbsGantt && project.diagrams.some((member) => member.id === diagram.wbsGantt!.wbsDiagramId)
        ? { wbsGantt: diagram.wbsGantt }
        : {}),
    })),
    elements: project.elements,
    links: project.links,
  };
}

/** Source hashes are rebuilt at save time, just as for other live editor changes. */
export function liveProjectFromSharedDocument(shared: SharedDocument, current?: PortableProject): PortableProject {
  const savedAt = new Date().toISOString();
  return validateProject({
    schemaVersion: 2,
    projectId: shared.id,
    revisionId: crypto.randomUUID(),
    savedAt,
    name: shared.name,
    diagrams: shared.diagrams.map((diagram) => {
      const existing =
        current?.projectId === shared.id ? current.diagrams.find((item) => item.id === diagram.id) : undefined;
      return {
        id: diagram.id,
        name: diagram.name,
        document: {
          ...(existing?.document ?? {
            schemaVersion: 1,
            documentId: diagram.documentId,
            savedAt,
            versions: [],
            contents: [],
          }),
          current: {
            ...existing?.document.current,
            source: diagram.source,
            sourceHash: existing?.document.current.sourceHash ?? "0".repeat(64),
            diagramKind: diagram.kind,
          },
          settings: diagram.settings,
          historyPolicy: diagram.historyPolicy,
        },
        ...(diagram.wbsGantt ? { wbsGantt: diagram.wbsGantt } : {}),
      };
    }),
    elements: shared.elements,
    links: shared.links,
  });
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Per-diagram maps/text and per-link entries merge independent edits without replacing a whole file. */
export class SharedDocumentModel {
  private readonly metadata: Y.Map<string>;
  private readonly diagrams: Y.Map<Y.Map<unknown>>;
  private readonly elements: Y.Map<PortableProject["elements"][number]>;
  private readonly links: Y.Map<PortableProject["links"][number]>;
  constructor(private readonly document: Y.Doc) {
    this.metadata = document.getMap("document-metadata");
    this.diagrams = document.getMap("document-diagrams");
    this.elements = document.getMap("document-elements");
    this.links = document.getMap("document-links");
  }
  get snapshot(): SharedDocument | undefined {
    try {
      validateCollaborationState(this.document);
    } catch {
      return undefined;
    }
    const id = this.metadata.get("id");
    const name = this.metadata.get("name");
    if (!id || !name) return undefined;
    return {
      id,
      name,
      diagrams: [...this.diagrams.entries()]
        .sort(([a, x], [b, y]) => Number(x.get("position") ?? 0) - Number(y.get("position") ?? 0) || a.localeCompare(b))
        .map(([id, fields]) => ({
          ...fields.toJSON(),
          id,
          source: (fields.get("source") as Y.Text).toString(),
        })) as SharedDiagram[],
      elements: [...this.elements.values()].sort((a, b) => a.id.localeCompare(b.id)),
      links: [...this.links.values()].sort((a, b) => a.id.localeCompare(b.id)),
    };
  }
  apply(next: SharedDocument, previous?: SharedDocument): void {
    this.document.transact(() => {
      for (const [key, value] of Object.entries({ id: next.id, name: next.name })) {
        if (!previous || value !== previous[key as "id" | "name"]) this.metadata.set(key, value);
      }
      const previousDiagrams = new Map(previous?.diagrams.map((diagram) => [diagram.id, diagram]));
      const nextIds = new Set(next.diagrams.map((diagram) => diagram.id));
      for (const id of previousDiagrams.keys()) if (!nextIds.has(id)) this.diagrams.delete(id);
      for (const diagram of next.diagrams) {
        const old = previousDiagrams.get(diagram.id);
        // Do not resurrect a diagram deleted remotely while a local edit was in flight.
        if (old && !this.diagrams.has(diagram.id)) continue;
        let fields = this.diagrams.get(diagram.id);
        if (!fields) {
          fields = new Y.Map();
          fields.set("source", new Y.Text());
          fields.set(
            "position",
            next.diagrams.findIndex((item) => item.id === diagram.id),
          );
          this.diagrams.set(diagram.id, fields);
        }
        for (const [key, value] of Object.entries(diagram)) {
          if (key === "id" || key === "source") continue;
          if (old && same(value, old[key as keyof SharedDiagram])) continue;
          fields.set(key, structuredClone(value));
        }
        if (old?.wbsGantt && !diagram.wbsGantt) fields.delete("wbsGantt");
        if (!old || old.source !== diagram.source) {
          const text = fields.get("source") as Y.Text;
          const before = text.toString();
          let from = 0;
          while (from < before.length && from < diagram.source.length && before[from] === diagram.source[from]) from++;
          let suffix = 0;
          while (
            suffix < before.length - from &&
            suffix < diagram.source.length - from &&
            before[before.length - 1 - suffix] === diagram.source[diagram.source.length - 1 - suffix]
          )
            suffix++;
          if (before.length - from - suffix) text.delete(from, before.length - from - suffix);
          const inserted = diagram.source.slice(from, diagram.source.length - suffix);
          if (inserted) text.insert(from, inserted);
        }
      }
      this.applyEntries(this.elements, next.elements, previous?.elements);
      this.applyEntries(this.links, next.links, previous?.links);
    });
  }
  private applyEntries<T extends { id: string }>(map: Y.Map<T>, next: T[], previous?: T[]): void {
    const old = new Map(previous?.map((item) => [item.id, item]));
    const ids = new Set(next.map((item) => item.id));
    for (const id of old.keys()) if (!ids.has(id)) map.delete(id);
    for (const item of next) if (!same(item, old.get(item.id))) map.set(item.id, structuredClone(item));
  }
}
