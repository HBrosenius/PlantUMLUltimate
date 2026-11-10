import type { PresentationDocument } from "../presentation-review";
import { embeddedMemberHistoryId } from "../projects/embedded-project";
import type { DiagramKind } from "../model";
import type { PortableProject } from "../../../../packages/document-format/src/types";
import type { DocumentSnapshot, WorkspaceSession } from "../workspace-storage";

export interface buildPresentationDataInputs {
  portable: PortableProject | undefined;
  presentationOpen: boolean;
  tabLabels: Map<string, string>;
  tabs: {
    documents: DocumentSnapshot[];
    activeId: string;
    addDocument: (input?: Partial<Omit<DocumentSnapshot, "id">>) => string;
    closeDocument: (id: string) => void;
    activateDocument: (id: string) => void;
    duplicateDocument: (id: string) => string;
    closeOtherDocuments: (id: string) => void;
    reorderDocument: (draggedId: string, targetId: string) => void;
    restoreSession: (next: WorkspaceSession) => void;
    setDocumentHistoryId: (id: string, historyId: string) => void;
    setDocumentBaselineVersionId: (id: string, baselineVersionId?: string) => void;
    replaceDocumentFromFile: (
      id: string,
      input: Pick<DocumentSnapshot, "source" | "fileName" | "diagramKind">,
      dirty?: boolean,
    ) => void;
    updateDocumentSource: (id: string, source: string, diagramKind: DocumentSnapshot["diagramKind"]) => void;
    updateDocumentFormat: (id: string, patch: Partial<DocumentSnapshot>, flushRecovery?: boolean) => void;
    getDocument: (id: string) => DocumentSnapshot | undefined;
    setOnboarded: () => void;
    session: WorkspaceSession;
  };
}

export function buildPresentationData({ portable, presentationOpen, tabLabels, tabs }: buildPresentationDataInputs) {
  const presentationDocuments: PresentationDocument[] = presentationOpen
    ? tabs.documents.map((item) => ({
        id: item.historyId,
        name: tabLabels.get(item.id) ?? item.displayName ?? item.fileName,
        kind: item.diagramKind,
        source: item.source,
      }))
    : [];
  const presentationConnections: { from: string; to: string }[] = [];
  if (presentationOpen) {
    for (const item of tabs.documents) {
      const linked = tabs.documents.find((other) => other.id === item.linkedWbsDocumentId);
      if (linked) presentationConnections.push({ from: item.historyId, to: linked.historyId });
    }
    if (portable) {
      const reviewId = (id: string) => embeddedMemberHistoryId(portable.projectId, id);
      for (const diagram of portable.diagrams) {
        if (!presentationDocuments.some((item) => item.id === reviewId(diagram.id)))
          presentationDocuments.push({
            id: reviewId(diagram.id),
            name: diagram.name,
            kind: diagram.document.current.diagramKind as DiagramKind,
            source: diagram.document.current.source,
          });
        if (diagram.wbsGantt)
          presentationConnections.push({ from: reviewId(diagram.id), to: reviewId(diagram.wbsGantt.wbsDiagramId) });
      }
      for (const link of portable.links) {
        const from = portable.elements.find((item) => item.id === link.from)?.documentId;
        const to = portable.elements.find((item) => item.id === link.to)?.documentId;
        if (from && to && from !== to) presentationConnections.push({ from: reviewId(from), to: reviewId(to) });
      }
    }
  }

  return { presentationDocuments, presentationConnections };
}
