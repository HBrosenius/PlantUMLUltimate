import { hashSource, type PortableProject } from "@plantuml-studio/document-format";
import { assemblePortableDocument } from "../document-format/portable-document";
import type { DiagramKind } from "../model";
import { loadDocumentVersions, type DocumentSnapshot } from "../workspace-storage";

export type EmbeddedProjectTabs = {
  addDocument(input?: Partial<Omit<DocumentSnapshot, "id">>): string;
  activateDocument(id: string): void;
  closeDocument?(id: string): void;
  updateDocumentFormat?(id: string, patch: Partial<DocumentSnapshot>): void;
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
    const tab = byTabId.get(memberTabs.get(member.id) ?? "");
    const source = tab?.source;
    const wbsGantt =
      member.wbsGantt && tab
        ? {
            ...member.wbsGantt,
            links: tab.wbsGanttLinks ?? member.wbsGantt.links,
            dependencies: tab.wbsGanttDependencies ?? member.wbsGantt.dependencies,
          }
        : member.wbsGantt;
    if (
      (source === undefined || source === member.document.current.source) &&
      JSON.stringify(wbsGantt) === JSON.stringify(member.wbsGantt)
    )
      return member;
    changed = true;
    return {
      ...member,
      ...(wbsGantt ? { wbsGantt } : {}),
      document: {
        ...member.document,
        current: { ...member.document.current, source: source ?? member.document.current.source },
      },
    };
  });
  return changed ? { ...project, diagrams } : project;
}

/**
 * Compares the persisted-member fields two project snapshots would save, ignoring metadata
 * (savedAt, version history) that changes without representing a real content difference.
 * Used to recover from a save whose revision counter advanced between snapshot capture and
 * write completion for a reason that didn't actually change what gets written to disk.
 */
export function projectContentEqual(a: PortableProject, b: PortableProject): boolean {
  if (a.name !== b.name) return false;
  if (JSON.stringify(a.elements) !== JSON.stringify(b.elements)) return false;
  if (JSON.stringify(a.links) !== JSON.stringify(b.links)) return false;
  if (a.diagrams.length !== b.diagrams.length) return false;
  const byId = new Map(b.diagrams.map((diagram) => [diagram.id, diagram]));
  return a.diagrams.every((diagram) => {
    const other = byId.get(diagram.id);
    if (!other) return false;
    return (
      diagram.name === other.name &&
      JSON.stringify(diagram.wbsGantt) === JSON.stringify(other.wbsGantt) &&
      diagram.document.current.source === other.document.current.source &&
      diagram.document.current.diagramKind === other.document.current.diagramKind &&
      diagram.document.current.baselineVersionId === other.document.current.baselineVersionId &&
      diagram.document.historyPolicy.maxVersions === other.document.historyPolicy.maxVersions &&
      diagram.document.historyPolicy.maxLogicalBytes === other.document.historyPolicy.maxLogicalBytes &&
      JSON.stringify(diagram.document.settings.resourceCapacities) ===
        JSON.stringify(other.document.settings.resourceCapacities)
    );
  });
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
          ...(member.wbsGantt
            ? {
                wbsGantt: {
                  ...member.wbsGantt,
                  links: tab.wbsGanttLinks ?? member.wbsGantt.links,
                  dependencies: tab.wbsGanttDependencies ?? member.wbsGantt.dependencies,
                },
              }
            : {}),
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
        ...(member.wbsGantt
          ? {
              wbsGantt: {
                ...member.wbsGantt,
                links: tab.wbsGanttLinks ?? member.wbsGantt.links,
                dependencies: tab.wbsGanttDependencies ?? member.wbsGantt.dependencies,
              },
            }
          : {}),
        document: await assemblePortableDocument(tab, versions, undefined, savedAt),
      };
    }),
  );
  return { ...project, savedAt, diagrams };
}
