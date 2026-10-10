import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { downloadText, openWorkspaceBackupFile, type FileSnapshot, type WritableFileHandle } from "./file-service";
import {
  DEFAULT_ACTIVITY_SOURCE,
  DEFAULT_CLASS_SOURCE,
  DEFAULT_COMPONENT_SOURCE,
  DEFAULT_SEQUENCE_SOURCE,
  createDefaultGanttSource,
  DEFAULT_USECASE_SOURCE,
  DEFAULT_WBS_SOURCE,
  type DiagramKind,
} from "./model";
import { setPlantUmlTheme } from "./plantuml-theme";
import { exampleFileName, type StarterExample } from "./starter-examples";
import { parseWorkspaceBackupBundle, prepareWorkspaceRestore, serializeWorkspaceBackup } from "./workspace-backup";
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
  defaultDiagramTheme: string;
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
  notifySuccess?: (message: string, context?: { documentId: string; source: string }) => void;
};

export function starterSource(diagramKind: DiagramKind): string {
  if (diagramKind === "sequence") return DEFAULT_SEQUENCE_SOURCE;
  if (diagramKind === "usecase") return DEFAULT_USECASE_SOURCE;
  if (diagramKind === "class") return DEFAULT_CLASS_SOURCE;
  if (diagramKind === "component") return DEFAULT_COMPONENT_SOURCE;
  if (diagramKind === "activity") return DEFAULT_ACTIVITY_SOURCE;
  if (diagramKind === "wbs") return DEFAULT_WBS_SOURCE;
  return createDefaultGanttSource();
}

export function diagramKindDisplayName(diagramKind: DiagramKind): string {
  if (diagramKind === "usecase") return "Use Case";
  if (diagramKind === "wbs") return "WBS";
  return `${diagramKind[0]!.toUpperCase()}${diagramKind.slice(1)}`;
}

export function useWorkspaceDocuments({
  tabs,
  replaceActiveDocumentOnCreate,
  defaultDiagramTheme,
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
  notifySuccess = setInteractionMessage,
}: Options) {
  const latestTabs = useRef(tabs);
  latestTabs.current = tabs;
  const restoring = useRef(false);
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
    if (restoring.current) return;
    restoring.current = true;
    try {
      const contents = await openWorkspaceBackupFile();
      if (!contents) return;
      const restored = prepareWorkspaceRestore(parseWorkspaceBackupBundle(contents));
      const current = latestTabs.current;
      const hasEncryptedTabs = current.documents.some((document) => document.encrypted);
      if (
        (hasEncryptedTabs || current.documents.some((document) => document.dirty)) &&
        !window.confirm(
          hasEncryptedTabs
            ? "Restore this backup and replace all currently open tabs? Encrypted tabs are excluded from the checkpoint backup. Save them to files before continuing."
            : "Restore this backup and replace all currently open tabs?",
        )
      )
        return;
      const versions = (
        await Promise.all(current.documents.map((document) => loadDocumentVersions(document.historyId)))
      ).flat();
      const unchanged = () => {
        if (latestTabs.current.session !== current.session)
          throw new Error("The workspace changed during restore. Try restoring the backup again.");
      };
      unchanged();
      downloadText(
        serializeWorkspaceBackup(current.session, versions),
        "plantuml-studio-before-restore.json",
        "application/json;charset=utf-8",
      );
      await importDocumentVersions(restored.versions);
      unchanged();
      current.restoreSession(restored.session);
      fileHandles.current.clear();
      fileSnapshots.current.clear();
      externalCheckSnoozedUntil.current.clear();
      retainHistories(restored.session.documents.map((document) => document.id));
      resetSelection();
      setInteractionMessage(
        `Restored ${restored.session.documents.length} document${restored.session.documents.length === 1 ? "" : "s"}. A backup of the previous tabs was downloaded${hasEncryptedTabs ? "; encrypted tabs are excluded" : ""}.`,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "The backup could not be restored";
      reportError(
        new Error(
          `Restore failed. Your open documents were kept. ${detail} Check the backup and browser storage, then try again.`,
        ),
      );
    } finally {
      restoring.current = false;
    }
  }, [
    externalCheckSnoozedUntil,
    fileHandles,
    fileSnapshots,
    reportError,
    resetSelection,
    retainHistories,
    setInteractionMessage,
  ]);

  const createDocument = useCallback(
    (
      diagramKind: DiagramKind,
      example?: Pick<StarterExample, "title" | "source" | "personal">,
      name?: string,
      contentSource?: string,
    ) => {
      const replacedDocumentId = replaceActiveDocumentOnCreate ? tabs.activeId : undefined;
      const initialSource = example?.source ?? contentSource ?? starterSource(diagramKind);
      const source =
        defaultDiagramTheme && !example?.personal
          ? setPlantUmlTheme(initialSource, defaultDiagramTheme)
          : initialSource;
      const createdId = tabs.addDocument({
        diagramKind,
        source,
        displayName: name?.trim() || example?.title || `${diagramKindDisplayName(diagramKind)} diagram`,
        fileName: example ? exampleFileName(example) : "untitled.pumlu",
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
      notifySuccess(
        example
          ? `Created a new ${diagramKindDisplayName(diagramKind)} diagram from ${example.personal ? "starter" : "example"} "${example.title}"`
          : `Created a new ${diagramKindDisplayName(diagramKind)} diagram`,
        { documentId: createdId, source },
      );
      if (diagramKind === "gantt") window.setTimeout(openProjectInspector, 0);
    },
    [
      defaultDiagramTheme,
      externalCheckSnoozedUntil,
      fileHandles,
      fileSnapshots,
      openProjectInspector,
      refreshHistoryControls,
      removeHistory,
      replaceActiveDocumentOnCreate,
      resetSelection,
      closeNewDocumentDialog,
      notifySuccess,
      tabs,
    ],
  );

  const newDocument = useCallback(() => {
    openNewDocumentDialog(false);
  }, [openNewDocumentDialog]);

  return { backupWorkspace, restoreWorkspace, createDocument, newDocument };
}
