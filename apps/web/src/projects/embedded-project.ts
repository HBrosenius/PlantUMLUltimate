import { hashSource, type PortableProject } from "@plantuml-studio/document-format";
import { assemblePortableDocument } from "../document-format/portable-document";
import type { DiagramKind } from "../model";
import { loadDocumentVersions, type DocumentSnapshot } from "../workspace-storage";

export type EmbeddedProjectTabs = {
  addDocument(input?: Partial<Omit<DocumentSnapshot, "id">>): string;
  activateDocument(id: string): void;
  closeDocument?(id: string): void;
  documents: readonly DocumentSnapshot[];
};

export function embeddedMemberHistoryId(projectId: string, memberId: string): string {
  return `project-history-${projectId}-${memberId}`;
}

export function embeddedMemberVersionId(projectId: string, memberId: string, portableVersionId: string): string {
  return `project-version-${projectId}-${memberId}-${portableVersionId}`;
}

export function embeddedDiagramDisplayName(name: string): string {
  return (
    name
      .trim()
      .replace(/\.(?:puml|plantuml|pumlu)$/i, "")
      .trim() || "Diagram"
  );
}

export function embeddedMemberTabs(
  project: PortableProject,
  documents: readonly DocumentSnapshot[],
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const member of project.diagrams) {
    const tab = documents.find((item) => item.historyId === embeddedMemberHistoryId(project.projectId, member.id));
    if (tab) result.set(member.id, tab.id);
  }
  return result;
}

export function openEmbeddedMember(
  project: PortableProject,
  memberId: string,
  tabs: EmbeddedProjectTabs,
  knownTabs: Map<string, string>,
  encrypted = false,
  baselineVersionId?: string,
): string | undefined {
  const knownTab = knownTabs.get(memberId);
  const existing =
    (knownTab && tabs.documents.some((tab) => tab.id === knownTab) ? knownTab : undefined) ??
    embeddedMemberTabs(project, tabs.documents).get(memberId);
  if (existing) {
    knownTabs.set(memberId, existing);
    tabs.activateDocument(existing);
    return existing;
  }
  const member = project.diagrams.find((item) => item.id === memberId);
  if (!member) return undefined;
  const tabId = tabs.addDocument({
    historyId: embeddedMemberHistoryId(project.projectId, member.id),
    source: member.document.current.source,
    diagramKind: member.document.current.diagramKind as DiagramKind,
    fileName: member.name,
    dirty: false,
    cursor: { line: 1, column: 1 },
    portableDocumentId: member.document.documentId,
    encrypted,
    historyMaxVersions: member.document.historyPolicy.maxVersions,
    historyMaxLogicalBytes: member.document.historyPolicy.maxLogicalBytes,
    resourceCapacities: member.document.settings.resourceCapacities,
    ...(baselineVersionId ? { baselineVersionId } : {}),
  });
  knownTabs.set(memberId, tabId);
  return tabId;
}

/** Project view with source from currently open member tabs, for indexing and recovery. */
export function projectWithOpenTabSources(
  project: PortableProject,
  memberTabs: ReadonlyMap<string, string>,
  tabs: readonly DocumentSnapshot[],
): PortableProject {
  const byTabId = new Map(tabs.map((tab) => [tab.id, tab]));
  let changed = false;
  const diagrams = project.diagrams.map((member) => {
    const source = byTabId.get(memberTabs.get(member.id) ?? "")?.source;
    if (source === undefined || source === member.document.current.source) return member;
    changed = true;
    return { ...member, document: { ...member.document, current: { ...member.document.current, source } } };
  });
  return changed ? { ...project, diagrams } : project;
}

/** Capture every persistent member field from currently open tabs. */
export async function snapshotEmbeddedProject(
  project: PortableProject,
  memberTabs: ReadonlyMap<string, string>,
  tabs: readonly DocumentSnapshot[],
  savedAt = new Date().toISOString(),
  loadVersions: typeof loadDocumentVersions = loadDocumentVersions,
): Promise<PortableProject> {
  const effective = projectWithOpenTabSources(project, memberTabs, tabs);
  const byTabId = new Map(tabs.map((tab) => [tab.id, tab]));
  const diagrams = await Promise.all(
    effective.diagrams.map(async (member) => {
      const tab = byTabId.get(memberTabs.get(member.id) ?? "");
      if (!tab) return member;
      const versions = await loadVersions(tab.historyId);
      if (!versions.length)
        return {
          ...member,
          document: {
            ...member.document,
            savedAt,
            current: {
              ...member.document.current,
              source: tab.source,
              sourceHash: await hashSource(tab.source),
            },
            settings: { resourceCapacities: tab.resourceCapacities ?? {} },
            historyPolicy: {
              maxVersions: tab.historyMaxVersions ?? member.document.historyPolicy.maxVersions,
              maxLogicalBytes: tab.historyMaxLogicalBytes ?? member.document.historyPolicy.maxLogicalBytes,
            },
          },
        };
      return {
        ...member,
        document: await assemblePortableDocument(tab, versions, undefined, savedAt),
      };
    }),
  );
  return { ...project, savedAt, diagrams };
}
