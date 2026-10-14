/** The plain shared-document shape and project conversions; the yjs model lives in collaboration-document.ts. */
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
