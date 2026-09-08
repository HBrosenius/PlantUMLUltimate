import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { detectDiagramKind } from "./diagram-kind";
import {
  openPlantUmlDocument,
  readFileSnapshot,
  registerLaunchFileConsumer,
  savePlantUmlDocumentAs,
  writePlantUmlDocument,
  type FileSnapshot,
  type OpenedDocument,
  type WritableFileHandle,
} from "./file-service";
import type { DocumentVersionOverride } from "./use-document-versions";
import type { DocumentSnapshot, DocumentVersionReason, WorkspaceSnapshot } from "./workspace-storage";

export type ExternalFileConflict = {
  documentId: string;
  fileName: string;
  baseSource: string;
  localSource: string;
  external: FileSnapshot;
};

type TabControls = {
  activeId: string;
  documents: DocumentSnapshot[];
  addDocument: (input?: Partial<Omit<DocumentSnapshot, "id">>) => string;
  setDocumentHistoryId: (id: string, historyId: string) => void;
  replaceDocumentFromFile: (
    id: string,
    input: Pick<DocumentSnapshot, "source" | "fileName" | "diagramKind">,
    dirty?: boolean,
  ) => void;
};

type UseDocumentFilesOptions = {
  hydrated: boolean;
  workspace: WorkspaceSnapshot;
  setWorkspace: Dispatch<SetStateAction<WorkspaceSnapshot>>;
  tabs: TabControls;
  fileHandles: MutableRefObject<Map<string, WritableFileHandle>>;
  fileSnapshots: MutableRefObject<Map<string, FileSnapshot>>;
  externalCheckSnoozedUntil: MutableRefObject<Map<string, number>>;
  clearBaseline: () => void;
  recordDocumentVersion: (
    reason: DocumentVersionReason,
    label?: string,
    override?: DocumentVersionOverride,
  ) => Promise<unknown>;
  refreshHistoryControls: () => void;
  resetSelection: () => void;
  reportError: (error: unknown) => void;
  setInteractionMessage: Dispatch<SetStateAction<string | undefined>>;
};

export function externalFileChanged(previous: FileSnapshot | undefined, external: FileSnapshot) {
  return Boolean(previous && external.source !== previous.source);
}

export function useDocumentFiles({
  hydrated,
  workspace,
  setWorkspace,
  tabs,
  fileHandles,
  fileSnapshots,
  externalCheckSnoozedUntil,
  clearBaseline,
  recordDocumentVersion,
  refreshHistoryControls,
  resetSelection,
  reportError,
  setInteractionMessage,
}: UseDocumentFilesOptions) {
  const [externalConflict, setExternalConflict] = useState<ExternalFileConflict>();
  const checkingExternalFiles = useRef(false);

  const addOpenedDocument = useCallback(
    async (opened: OpenedDocument | undefined) => {
      if (!opened) return;
      const historyId = `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const diagramKind = detectDiagramKind(opened.source) ?? "gantt";
      const id = tabs.addDocument({
        historyId,
        diagramKind,
        source: opened.source,
        fileName: opened.fileName,
        dirty: false,
        cursor: { line: 1, column: 1 },
      });
      if (opened.handle) {
        fileHandles.current.set(id, opened.handle);
        fileSnapshots.current.set(id, {
          source: opened.source,
          lastModified: opened.lastModified ?? 0,
          size: opened.size ?? new Blob([opened.source]).size,
        });
      }
      await recordDocumentVersion("opened", "Opened file", {
        historyId,
        source: opened.source,
        fileName: opened.fileName,
        diagramKind,
      });
      refreshHistoryControls();
      resetSelection();
      setInteractionMessage(`Opened ${opened.fileName}`);
    },
    [
      fileHandles,
      fileSnapshots,
      recordDocumentVersion,
      refreshHistoryControls,
      resetSelection,
      setInteractionMessage,
      tabs,
    ],
  );

  const openDocument = useCallback(async () => {
    try {
      await addOpenedDocument(await openPlantUmlDocument());
    } catch (error) {
      reportError(error);
    }
  }, [addOpenedDocument, reportError]);

  useEffect(() => {
    if (!hydrated) return;
    registerLaunchFileConsumer(addOpenedDocument, reportError);
  }, [addOpenedDocument, hydrated, reportError]);

  const saveDocumentAs = useCallback(async () => {
    try {
      const saved = await savePlantUmlDocumentAs(workspace.source, workspace.fileName);
      if (!saved) return;
      if (saved.handle) fileHandles.current.set(tabs.activeId, saved.handle);
      else fileHandles.current.delete(tabs.activeId);
      if (saved.handle) fileSnapshots.current.set(tabs.activeId, await readFileSnapshot(saved.handle));
      else fileSnapshots.current.delete(tabs.activeId);
      const historyId = `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      tabs.setDocumentHistoryId(tabs.activeId, historyId);
      clearBaseline();
      setWorkspace((current) => ({ ...current, fileName: saved.fileName, dirty: false }));
      await recordDocumentVersion("saved", "Saved as new file", { historyId, fileName: saved.fileName });
      setInteractionMessage(`Saved ${saved.fileName}`);
    } catch (error) {
      reportError(error);
    }
  }, [
    clearBaseline,
    fileHandles,
    fileSnapshots,
    recordDocumentVersion,
    reportError,
    setInteractionMessage,
    setWorkspace,
    tabs,
    workspace.fileName,
    workspace.source,
  ]);

  const saveDocument = useCallback(async () => {
    const handle = fileHandles.current.get(tabs.activeId);
    if (!handle) return saveDocumentAs();
    try {
      const previous = fileSnapshots.current.get(tabs.activeId);
      const external = await readFileSnapshot(handle);
      if (externalFileChanged(previous, external)) {
        if (workspace.dirty) {
          setExternalConflict({
            documentId: tabs.activeId,
            fileName: handle.name,
            baseSource: previous!.source,
            localSource: workspace.source,
            external,
          });
        } else {
          await recordDocumentVersion("before-restore", "Before external reload");
          tabs.replaceDocumentFromFile(tabs.activeId, {
            source: external.source,
            fileName: handle.name,
            diagramKind: detectDiagramKind(external.source) ?? "gantt",
          });
          fileSnapshots.current.set(tabs.activeId, external);
          setInteractionMessage(`Reloaded external changes from ${handle.name}`);
        }
        return;
      }
      await writePlantUmlDocument(handle, workspace.source);
      fileSnapshots.current.set(tabs.activeId, await readFileSnapshot(handle));
      setWorkspace((current) => ({ ...current, fileName: handle.name, dirty: false }));
      await recordDocumentVersion("saved", undefined, { fileName: handle.name });
      setInteractionMessage(`Saved ${handle.name}`);
    } catch (error) {
      reportError(error);
    }
  }, [
    fileHandles,
    fileSnapshots,
    recordDocumentVersion,
    reportError,
    saveDocumentAs,
    setInteractionMessage,
    setWorkspace,
    tabs,
    workspace.dirty,
    workspace.source,
  ]);

  const checkExternalFiles = useCallback(async () => {
    if (checkingExternalFiles.current || document.visibilityState === "hidden") return;
    checkingExternalFiles.current = true;
    try {
      for (const [documentId, handle] of fileHandles.current) {
        const previous = fileSnapshots.current.get(documentId);
        if (!previous) continue;
        const external = await readFileSnapshot(handle);
        if (!externalFileChanged(previous, external)) {
          fileSnapshots.current.set(documentId, external);
          continue;
        }
        const documentSnapshot = tabs.documents.find((item) => item.id === documentId);
        if (!documentSnapshot) continue;
        if (documentSnapshot.dirty) {
          if ((externalCheckSnoozedUntil.current.get(documentId) ?? 0) > Date.now()) continue;
          setExternalConflict(
            (current) =>
              current ?? {
                documentId,
                fileName: documentSnapshot.fileName,
                baseSource: previous.source,
                localSource: documentSnapshot.source,
                external,
              },
          );
          continue;
        }
        await recordDocumentVersion("before-restore", "Before external reload", {
          historyId: documentSnapshot.historyId,
          source: documentSnapshot.source,
          fileName: documentSnapshot.fileName,
          diagramKind: documentSnapshot.diagramKind,
        });
        tabs.replaceDocumentFromFile(documentId, {
          source: external.source,
          fileName: handle.name,
          diagramKind: detectDiagramKind(external.source) ?? "gantt",
        });
        fileSnapshots.current.set(documentId, external);
        setInteractionMessage(`Reloaded external changes from ${handle.name}`);
      }
    } catch (error) {
      reportError(error);
    } finally {
      checkingExternalFiles.current = false;
    }
  }, [
    externalCheckSnoozedUntil,
    fileHandles,
    fileSnapshots,
    recordDocumentVersion,
    reportError,
    setInteractionMessage,
    tabs,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkExternalFiles();
    };
    const timer = window.setInterval(() => void checkExternalFiles(), 5_000);
    window.addEventListener("focus", checkWhenVisible);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", checkWhenVisible);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [checkExternalFiles, hydrated]);

  const dismissExternalConflict = useCallback(() => {
    if (externalConflict) externalCheckSnoozedUntil.current.set(externalConflict.documentId, Date.now() + 60_000);
    setExternalConflict(undefined);
  }, [externalCheckSnoozedUntil, externalConflict]);

  const keepLocalExternalConflict = useCallback(() => {
    if (!externalConflict) return;
    fileSnapshots.current.set(externalConflict.documentId, externalConflict.external);
    externalCheckSnoozedUntil.current.delete(externalConflict.documentId);
    setExternalConflict(undefined);
    setInteractionMessage(`Kept local changes for ${externalConflict.fileName}`);
  }, [externalCheckSnoozedUntil, externalConflict, fileSnapshots, setInteractionMessage]);

  const reloadExternalConflict = useCallback(async () => {
    if (!externalConflict) return;
    const documentSnapshot = tabs.documents.find((item) => item.id === externalConflict.documentId);
    if (!documentSnapshot) return setExternalConflict(undefined);
    try {
      await recordDocumentVersion("before-restore", "Before external reload", {
        historyId: documentSnapshot.historyId,
        source: documentSnapshot.source,
        fileName: documentSnapshot.fileName,
        diagramKind: documentSnapshot.diagramKind,
      });
      tabs.replaceDocumentFromFile(externalConflict.documentId, {
        source: externalConflict.external.source,
        fileName: externalConflict.fileName,
        diagramKind: detectDiagramKind(externalConflict.external.source) ?? "gantt",
      });
      fileSnapshots.current.set(externalConflict.documentId, externalConflict.external);
      externalCheckSnoozedUntil.current.delete(externalConflict.documentId);
      setExternalConflict(undefined);
      setInteractionMessage(`Reloaded external changes from ${externalConflict.fileName}`);
    } catch (error) {
      reportError(error);
    }
  }, [
    externalCheckSnoozedUntil,
    externalConflict,
    fileSnapshots,
    recordDocumentVersion,
    reportError,
    setInteractionMessage,
    tabs,
  ]);

  const openExternalConflictCopy = useCallback(async () => {
    if (!externalConflict) return;
    const diagramKind = detectDiagramKind(externalConflict.external.source) ?? "gantt";
    const historyId = `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fileName = `External copy of ${externalConflict.fileName}`;
    tabs.addDocument({
      historyId,
      diagramKind,
      source: externalConflict.external.source,
      fileName,
      dirty: true,
      cursor: { line: 1, column: 1 },
    });
    await recordDocumentVersion("opened", "External conflict copy", {
      historyId,
      source: externalConflict.external.source,
      fileName,
      diagramKind,
    });
    fileSnapshots.current.set(externalConflict.documentId, externalConflict.external);
    externalCheckSnoozedUntil.current.delete(externalConflict.documentId);
    setExternalConflict(undefined);
    setInteractionMessage(`Opened external changes from ${externalConflict.fileName} as a copy`);
  }, [externalCheckSnoozedUntil, externalConflict, fileSnapshots, recordDocumentVersion, setInteractionMessage, tabs]);

  const applyExternalConflictMerge = useCallback(
    async (source: string) => {
      if (!externalConflict) return;
      const documentSnapshot = tabs.documents.find((item) => item.id === externalConflict.documentId);
      if (!documentSnapshot) return setExternalConflict(undefined);
      try {
        await recordDocumentVersion("before-restore", "Before external merge", {
          historyId: documentSnapshot.historyId,
          source: documentSnapshot.source,
          fileName: documentSnapshot.fileName,
          diagramKind: documentSnapshot.diagramKind,
        });
        tabs.replaceDocumentFromFile(
          externalConflict.documentId,
          { source, fileName: externalConflict.fileName, diagramKind: detectDiagramKind(source) ?? "gantt" },
          true,
        );
        fileSnapshots.current.set(externalConflict.documentId, externalConflict.external);
        externalCheckSnoozedUntil.current.delete(externalConflict.documentId);
        setExternalConflict(undefined);
        setInteractionMessage(`Merged local and external changes from ${externalConflict.fileName}`);
      } catch (error) {
        reportError(error);
      }
    },
    [
      externalCheckSnoozedUntil,
      externalConflict,
      fileSnapshots,
      recordDocumentVersion,
      reportError,
      setInteractionMessage,
      tabs,
    ],
  );

  return {
    externalConflict,
    openDocument,
    saveDocument,
    saveDocumentAs,
    dismissExternalConflict,
    keepLocalExternalConflict,
    reloadExternalConflict,
    openExternalConflictCopy,
    applyExternalConflictMerge,
  };
}
