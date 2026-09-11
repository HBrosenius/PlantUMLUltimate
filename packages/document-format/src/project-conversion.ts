import { encodeContentHistory, hashSource } from "./content-codec";
import {
  DEFAULT_HISTORY_POLICY,
  type PortableDiagramKind,
  type PortableDocument,
  type PortableProject,
  type PortableProjectDiagram,
  type PortableProjectElement,
  type PortableProjectLink,
} from "./types";
import { validateProject } from "./validate";

export type LegacyProjectConversionInput = {
  projectId: string;
  revisionId: string;
  name: string;
  diagrams: readonly PortableProjectDiagram[];
  elements: readonly PortableProjectElement[];
  links: readonly PortableProjectLink[];
};

/** Wrap a v1 document without changing any of its own identity or retained history. */
export function projectFromDocument(
  document: PortableDocument,
  name: string,
  now = new Date().toISOString(),
): PortableProject {
  return validateProject({
    schemaVersion: 2,
    projectId: crypto.randomUUID(),
    revisionId: crypto.randomUUID(),
    name: name.trim() || "PlantUML project",
    savedAt: now,
    diagrams: [{ id: crypto.randomUUID(), name: name.trim() || "Diagram", document }],
    elements: [],
    links: [],
  });
}

/** Create a one-diagram project from imported PlantUML while retaining an initial native checkpoint. */
export async function projectFromPlantUml(
  source: string,
  diagramKind: PortableDiagramKind,
  name: string,
  now = new Date().toISOString(),
): Promise<PortableProject> {
  return projectFromDocument(await portableDocumentFromPlantUml(source, diagramKind, now), name, now);
}

/** Create the logical v1 document used when text PlantUML becomes a project member. */
export async function portableDocumentFromPlantUml(
  source: string,
  diagramKind: PortableDiagramKind,
  now = new Date().toISOString(),
): Promise<PortableDocument> {
  const content = await encodeContentHistory([source]);
  return {
    schemaVersion: 1,
    documentId: crypto.randomUUID(),
    savedAt: now,
    current: { source, sourceHash: await hashSource(source), diagramKind },
    settings: { resourceCapacities: {} },
    historyPolicy: { ...DEFAULT_HISTORY_POLICY },
    versions: [
      {
        id: crypto.randomUUID(),
        contentId: content.contentIds[0]!,
        createdAt: now,
        sequence: 0,
        reason: "opened",
        pinned: true,
        diagramKind,
      },
    ],
    contents: content.contents,
  };
}

/** Convert an already decoded legacy project, retaining all graph identities and ordering. */
export function projectFromLegacy(
  input: LegacyProjectConversionInput,
  now = new Date().toISOString(),
): PortableProject {
  return validateProject({
    schemaVersion: 2,
    projectId: input.projectId,
    revisionId: input.revisionId,
    name: input.name,
    savedAt: now,
    diagrams: [...input.diagrams],
    elements: [...input.elements],
    links: [...input.links],
  });
}
