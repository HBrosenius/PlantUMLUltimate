import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { downloadText, openWorkspaceBackupFile, type FileSnapshot, type WritableFileHandle } from "./file-service";
import {
  DEFAULT_ACTIVITY_SOURCE,
  DEFAULT_CLASS_SOURCE,
  DEFAULT_SEQUENCE_SOURCE,
  DEFAULT_SOURCE,
  DEFAULT_USECASE_SOURCE,
  DEFAULT_WBS_SOURCE,
  type DiagramKind,
} from "./model";
import { parseWorkspaceBackupBundle, serializeWorkspaceBackup } from "./workspace-backup";
import {
  importDocumentVersions,
  loadDocumentVersions,
  type DocumentSnapshot,
  type WorkspaceSession,
} from "./workspace-storage";

type TabControls = {
  activeId: string;
  documents: DocumentSnapshot[];
  session: WorkspaceSession;
  addDocument: (input?: Partial<Omit<DocumentSnapshot, "id">>) => string;
  closeDocument: (id: string) => void;
  restoreSession: (session: WorkspaceSession) => void;
};

type Options = {
  tabs: TabControls;
  replaceActiveDocumentOnCreate: boolean;
  openNewDocumentDialog: (replaceActiveDocument: boolean) => void;
  closeNewDocumentDialog: () => void;
  fileHandles: MutableRefObject<Map<string, WritableFileHandle>>;
  fileSnapshots: MutableRefObject<Map<string, FileSnapshot>>;
  externalCheckSnoozedUntil: MutableRefObject<Map<string, number>>;
  removeHistory: (id: string) => void;
  retainHistories: (ids: readonly string[]) => void;
  refreshHistoryControls: () => void;
  resetSelection: () => void;
  openProjectInspector: () => void;
  reportError: (error: unknown) => void;
  setInteractionMessage: Dispatch<SetStateAction<string | undefined>>;
};

export function starterSource(diagramKind: DiagramKind): string {
  if (diagramKind === "sequence") return DEFAULT_SEQUENCE_SOURCE;
  if (diagramKind === "usecase") return DEFAULT_USECASE_SOURCE;
  if (diagramKind === "class") return DEFAULT_CLASS_SOURCE;
  if (diagramKind === "activity") return DEFAULT_ACTIVITY_SOURCE;
  if (diagramKind === "wbs") return DEFAULT_WBS_SOURCE;
  return DEFAULT_SOURCE;
}

export function diagramKindDisplayName(diagramKind: DiagramKind): string {
  if (diagramKind === "usecase") return "Use Case";
  if (diagramKind === "wbs") return "WBS";
  return `${diagramKind[0]!.toUpperCase()}${diagramKind.slice(1)}`;
}

export function useWorkspaceDocuments({
  tabs,
  replaceActiveDocumentOnCreate,
  openNewDocumentDialog,
  closeNewDocumentDialog,
  fileHandles,
  fileSnapshots,
  externalCheckSnoozedUntil,
  removeHistory,
  retainHistories,
  refreshHistoryControls,
  resetSelection,
  openProjectInspector,
  reportError,
  setInteractionMessage,
}: Options) {
  const backupWorkspace = useCallback(async () => {
    try {
      const versions = (
        await Promise.all(tabs.documents.map((document) => loadDocumentVersions(document.historyId)))
      ).flat();
      downloadText(
        serializeWorkspaceBackup(tabs.session, versions),
        "plantuml-studio-backup.json",
        "application/json;charset=utf-8",
      );
      setInteractionMessage(
        `Backed up ${tabs.documents.length} open document${tabs.documents.length === 1 ? "" : "s"}`,
      );
    } catch (error) {
      reportError(error);
    }
  }, [reportError, setInteractionMessage, tabs.documents, tabs.session]);

  const restoreWorkspace = useCallback(async () => {
    try {
      const contents = await openWorkspaceBackupFile();
      if (!contents) return;
      const restored = parseWorkspaceBackupBundle(contents);
      if (
        tabs.documents.some((document) => document.dirty) &&
        !window.confirm("Restore this backup and replace all currently open tabs?")
      )
        return;
      tabs.restoreSession(restored.session);
      await importDocumentVersions(restored.versions);
      fileHandles.current.clear();
      fileSnapshots.current.clear();
      externalCheckSnoozedUntil.current.clear();
      retainHistories(restored.session.documents.map((document) => document.id));
      resetSelection();
      setInteractionMessage(
        `Restored ${restored.session.documents.length} document${restored.session.documents.length === 1 ? "" : "s"}`,
      );
    } catch (error) {
      reportError(error);
    }
  }, [
    externalCheckSnoozedUntil,
    fileHandles,
    fileSnapshots,
    reportError,
    resetSelection,
    retainHistories,
    setInteractionMessage,
    tabs,
  ]);

  const createDocument = useCallback(
    (diagramKind: DiagramKind) => {
      const replacedDocumentId = replaceActiveDocumentOnCreate ? tabs.activeId : undefined;
      tabs.addDocument({
        diagramKind,
        source: starterSource(diagramKind),
        fileName: "untitled.pumlu",
        dirty: false,
        cursor: { line: 1, column: 1 },
      });
      if (replacedDocumentId) {
        tabs.closeDocument(replacedDocumentId);
        removeHistory(replacedDocumentId);
        fileHandles.current.delete(replacedDocumentId);
        fileSnapshots.current.delete(replacedDocumentId);
        externalCheckSnoozedUntil.current.delete(replacedDocumentId);
      }
      resetSelection();
      refreshHistoryControls();
      closeNewDocumentDialog();
      setInteractionMessage(`Created a new ${diagramKindDisplayName(diagramKind)} diagram`);
      if (diagramKind === "gantt") window.setTimeout(openProjectInspector, 0);
    },
    [
      externalCheckSnoozedUntil,
      fileHandles,
      fileSnapshots,
      openProjectInspector,
      refreshHistoryControls,
      removeHistory,
      replaceActiveDocumentOnCreate,
      resetSelection,
      setInteractionMessage,
      closeNewDocumentDialog,
      tabs,
    ],
  );

  const newDocument = useCallback(() => {
    openNewDocumentDialog(false);
  }, [openNewDocumentDialog]);

  return { backupWorkspace, restoreWorkspace, createDocument, newDocument };
}
