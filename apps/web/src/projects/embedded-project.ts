import { hashSource, type PortableProject } from "@plantuml-studio/document-format";
import type { DiagramKind } from "../model";
import type { DocumentSnapshot } from "../workspace-storage";

export type EmbeddedProjectTabs = {
  addDocument(input?: Partial<Omit<DocumentSnapshot, "id">>): string;
  activateDocument(id: string): void;
  documents: readonly DocumentSnapshot[];
};

export function embeddedMemberHistoryId(projectId: string, memberId: string): string {
  return `project-history-${projectId}-${memberId}`;
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
): string | undefined {
  const existing = knownTabs.get(memberId) ?? embeddedMemberTabs(project, tabs.documents).get(memberId);
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
  });
  knownTabs.set(memberId, tabId);
  return tabId;
}

/** Capture member source from currently open tabs without changing graph or history metadata. */
export async function snapshotEmbeddedProject(
  project: PortableProject,
  memberTabs: ReadonlyMap<string, string>,
  tabs: readonly DocumentSnapshot[],
  savedAt = new Date().toISOString(),
): Promise<PortableProject> {
  const byTabId = new Map(tabs.map((tab) => [tab.id, tab]));
  const diagrams = await Promise.all(
    project.diagrams.map(async (member) => {
      const tab = byTabId.get(memberTabs.get(member.id) ?? "");
      if (!tab || tab.source === member.document.current.source) return member;
      return {
        ...member,
        document: {
          ...member.document,
          savedAt,
          current: { ...member.document.current, source: tab.source, sourceHash: await hashSource(tab.source) },
        },
      };
    }),
  );
  return { ...project, savedAt, diagrams };
}
