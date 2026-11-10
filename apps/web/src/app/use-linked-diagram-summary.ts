import type { DocumentSnapshot, WorkspaceSession, WorkspaceSnapshot } from "../workspace-storage";
import type { useDiagramMultiSelection } from "../use-diagram-multi-selection";
import type { PortableProjectDiagram, PortableProject } from "../../../../packages/document-format/src/types";
import type { AppDialog } from "../use-app-dialog";
import type { VirtualProject } from "../projects/project-index";
import type { WbsGanttIssue } from "../wbs-gantt-health";
import type { RenderResult, DiagramKind } from "../model";
import type { SharedDocument } from "../shared-document";
import type { ProjectRecoveryStatus } from "../projects/use-embedded-project";
import type { FileSaveState } from "../FileSaveStatus";
import type { WbsGanttConversion } from "../wbs-gantt";
import type { ProjectLink, ProjectElement } from "../../../../packages/project-model/src/types";
import type { IdentityMapping } from "../../../../packages/project-model/src/identity";
import type { ProjectLeaveChoice } from "../projects/use-unsaved-project-guard";
import type { ProjectChangeReview } from "../projects/project-change-review";
import type { OpenedFileBytes } from "../file-service";

export interface useLinkedDiagramSummaryInputs {
  activeDocument: DocumentSnapshot;
  convertCurrentWbs: () => void;
  diagramMulti: ReturnType<typeof useDiagramMultiSelection>;
  existingProjectGantt: PortableProjectDiagram | undefined;
  importCurrentGanttToWbs: () => void;
  isProjectMemberTab: (id: string) => boolean;
  linkedGantt: DocumentSnapshot | undefined;
  missingGanttTaskCount: number;
  missingWbsTaskCount: number;
  openDialog: (next: AppDialog) => void;
  project: VirtualProject | undefined;
  projectWbsGanttIssues: (WbsGanttIssue & { documentId: string })[];
  result: RenderResult | undefined;
  saveDiagramScroll: (scroll: { left: number; top: number }, flushRecovery?: boolean) => void;
  showDocumentNavigator: () => void;
  singleFileProject: {
    portableProject: PortableProject | undefined;
    sharedDocument: SharedDocument | undefined;
    receiveSharedDocument: (shared: SharedDocument) => void;
    project: VirtualProject | undefined;
    indexStatus: { state: "idle" | "indexing" | "ready" | "error"; message?: string };
    dirty: boolean;
    recoveryStatus: ProjectRecoveryStatus;
    saving: boolean;
    fileSaveState: FileSaveState | undefined;
    newProject: (name: string) => Promise<void>;
    createWbsGanttProject: (name: string, converted: WbsGanttConversion, sourceTabId: string) => Promise<void>;
    addGanttFromWbs: (wbsDiagramId: string, converted: WbsGanttConversion, sourceTabId: string) => Promise<void>;
    addProjectDiagram: (kind: DiagramKind, name: string, initialSource?: string) => Promise<boolean>;
    importDiagram: () => Promise<void>;
    openProject: () => Promise<boolean>;
    openOpenedProject: (opened: OpenedFileBytes | undefined) => Promise<boolean>;
    openPortableProject: (project: PortableProject) => Promise<void>;
    openMember: (memberId: string) => Promise<string | undefined>;
    updateLinks: (links: readonly ProjectLink[]) => void;
    updateElements: (elements: readonly ProjectElement[]) => void;
    registerElements: (elements: readonly ProjectElement[]) => void;
    applyRenameMappings: (documentId: string, mappings: readonly IdentityMapping[], source: string) => Promise<void>;
    renameDiagram: (memberId: string, name: string) => void;
    deleteDiagram: (memberId: string) => void;
    saveProject: () => Promise<{ clean: boolean; message: string } | undefined>;
    saveProjectAs: () => Promise<{ clean: boolean } | undefined>;
    restoreProject: () => Promise<{ state: "locked" } | { state: "unlocked"; project: PortableProject } | undefined>;
    unlockRequest: { fileName: string } | undefined;
    unlock: (password: string) => void;
    cancelUnlock: () => void;
    cancelSave: () => void | undefined;
    leaveRequest: { projectName: string; action: string } | undefined;
    decideLeave: (choice: ProjectLeaveChoice) => void;
    reviewChanges: () => Promise<ProjectChangeReview | undefined>;
    exportReviewReport: () => Promise<void>;
    hasReviewBaseline: boolean;
    closeProject: () => Promise<void>;
  };
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
  workspace: WorkspaceSnapshot;
}

export function useLinkedDiagramSummary({
  activeDocument,
  convertCurrentWbs,
  diagramMulti,
  existingProjectGantt,
  importCurrentGanttToWbs,
  isProjectMemberTab,
  linkedGantt,
  missingGanttTaskCount,
  missingWbsTaskCount,
  openDialog,
  project,
  projectWbsGanttIssues,
  result,
  saveDiagramScroll,
  showDocumentNavigator,
  singleFileProject,
  tabs,
  workspace,
}: useLinkedDiagramSummaryInputs) {
  const linkedDiagramActions = [
    ...(workspace.diagramKind === "wbs"
      ? [
          {
            label:
              linkedGantt && isProjectMemberTab(tabs.activeId)
                ? `Add missing WBS tasks to Gantt (${missingWbsTaskCount})`
                : existingProjectGantt
                  ? "Open linked Gantt chart"
                  : "Create Gantt chart from WBS",
            disabled:
              diagramMulti.readOnly ||
              Boolean(linkedGantt && isProjectMemberTab(tabs.activeId) && missingWbsTaskCount === 0),
            run: () =>
              linkedGantt && isProjectMemberTab(tabs.activeId)
                ? convertCurrentWbs()
                : existingProjectGantt
                  ? void singleFileProject.openMember(existingProjectGantt.id)
                  : openDialog({ kind: "wbs-gantt-project" }),
          },
        ]
      : [
          {
            label: `Add missing Gantt tasks to WBS (${missingGanttTaskCount})`,
            disabled: diagramMulti.readOnly || missingGanttTaskCount === 0,
            run: importCurrentGanttToWbs,
          },
        ]),
    ...(project
      ? [
          {
            label: projectWbsGanttIssues.length
              ? `Review sync issues (${projectWbsGanttIssues.length})`
              : "Diagram connections",
            run: showDocumentNavigator,
          },
        ]
      : []),
  ];

  const linkedDiagramIssueCount =
    (workspace.diagramKind === "wbs" ? missingWbsTaskCount : missingGanttTaskCount) + projectWbsGanttIssues.length;
  const initialDiagramFit =
    result?.documentId === tabs.activeId && result.source === workspace.source && result.svg
      ? {
          documentId: tabs.activeId,
          fit: activeDocument.zoomInitialized === false,
          scroll: activeDocument.diagramScroll,
          onScrollChange: saveDiagramScroll,
        }
      : undefined;

  return { linkedDiagramActions, linkedDiagramIssueCount, initialDiagramFit };
}
