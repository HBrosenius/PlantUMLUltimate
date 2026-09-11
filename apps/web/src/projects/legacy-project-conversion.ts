import {
  portableDocumentFromPlantUml,
  projectFromLegacy,
  type PortableDocument,
  type PortableProject,
} from "@plantuml-studio/document-format";
import type { ProjectElement, ProjectLink } from "@plantuml-studio/project-model";
import type { VirtualProject } from "./project-index";

type LegacyNativeDocuments = ReadonlyMap<string, { document: PortableDocument }>;

function displayName(path: string): string {
  return (
    path
      .split("/")
      .at(-1)
      ?.replace(/\.(puml|pumlu)$/i, "") || "Diagram"
  );
}

/**
 * Stage a complete legacy folder/ZIP project as a v2 payload.
 * The caller must explicitly resolve unavailable members before conversion.
 */
export async function convertLegacyProject(
  project: VirtualProject,
  nativeDocuments: LegacyNativeDocuments,
  savedAt = new Date().toISOString(),
): Promise<PortableProject> {
  const diagrams = [];
  for (const document of project.manifest.documents) {
    const member = project.members.find((item) => item.documentId === document.id);
    if (!member?.source || member.state !== "available" || !member.diagramKind)
      throw new Error(`Cannot convert ${document.path}: the diagram is ${member?.state ?? "missing"}`);
    const native = document.format === "pumlu" ? nativeDocuments.get(document.id) : undefined;
    if (document.format === "pumlu" && !native)
      throw new Error(`Cannot convert ${document.path}: its native history is unavailable`);
    diagrams.push({
      id: document.id,
      name: displayName(document.path),
      document: native?.document ?? (await portableDocumentFromPlantUml(member.source, member.diagramKind, savedAt)),
    });
  }
  return projectFromLegacy(
    {
      projectId: project.manifest.projectId,
      revisionId: project.manifest.revisionId,
      name: project.manifest.name,
      diagrams,
      elements: project.manifest.elements as ProjectElement[],
      links: project.manifest.links as ProjectLink[],
    },
    savedAt,
  );
}
