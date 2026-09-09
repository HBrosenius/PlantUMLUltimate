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
import { decodeDocument, encodeDocument, DocumentFormatError } from "@plantuml-studio/document-format";
import {
  openDocumentFile,
  readFileSnapshot,
  registerDocumentLaunchConsumer,
  savePortableDocumentAs,
  writeDocumentBytes,
  type FileSnapshot,
  type OpenedDocument,
  type WritableFileHandle,
} from "./file-service";
import { assemblePortableDocument } from "./document-format/portable-document";
import { mapPortableHistoryToLocal } from "./document-format/history-mapping";
import { documentKey, forgetDocumentKey, rememberDocumentKey } from "./document-format/document-keys";
import type { DocumentVersionOverride } from "./use-document-versions";
import {
  enableMemoryOnlyHistory,
  disableMemoryOnlyHistory,
  importDocumentVersions,
  loadDocumentVersions,
  type DocumentSnapshot,
  type DocumentVersionReason,
  type WorkspaceSnapshot,
} from "./workspace-storage";

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
  updateDocumentFormat: (id: string, patch: Partial<DocumentSnapshot>) => void;
  getDocument: (id: string) => DocumentSnapshot | undefined;
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

  const addOpenedFile = useCallback(async (opened: Awaited<ReturnType<typeof openDocumentFile>>) => {
    if (!opened) return;
    if (opened.kind === "legacy") {
      await addOpenedDocument({
        source: opened.source!, fileName: opened.fileName, ...(opened.handle ? { handle: opened.handle } : {}),
        lastModified: opened.lastModified, size: opened.size,
      });
      return;
    }
    let decoded;
    try {
      decoded = await decodeDocument(opened.bytes);
    } catch (error) {
      if (!(error instanceof DocumentFormatError) || error.code !== "password-required") throw error;
      const password = window.prompt("This document is encrypted. Enter its password:");
      if (password === null) return;
      decoded = await decodeDocument(opened.bytes, { password });
    }
    const mapped = mapPortableHistoryToLocal(
      decoded.document.versions, decoded.contents, opened.fileName, decoded.document.current.baselineVersionId,
    );
    const encrypted = Boolean(decoded.unlockedKey);
    if (encrypted) await enableMemoryOnlyHistory(mapped.historyId);
    await importDocumentVersions(mapped.versions);
    const id = tabs.addDocument({
      historyId: mapped.historyId,
      source: decoded.document.current.source,
      diagramKind: decoded.document.current.diagramKind,
      fileName: opened.fileName,
      dirty: false,
      cursor: { line: 1, column: 1 },
      portableDocumentId: decoded.document.documentId,
      native: true,
      encrypted,
      compression: decoded.compression,
      historyMaxVersions: decoded.document.historyPolicy.maxVersions,
      historyMaxLogicalBytes: decoded.document.historyPolicy.maxLogicalBytes,
      ...(mapped.baselineVersionId ? { baselineVersionId: mapped.baselineVersionId } : {}),
    });
    if (decoded.unlockedKey) rememberDocumentKey(id, decoded.unlockedKey);
    if (opened.handle) fileHandles.current.set(id, opened.handle);
    refreshHistoryControls();
    resetSelection();
    setInteractionMessage(`Opened ${opened.fileName}${encrypted ? " (encrypted)" : ""}`);
  }, [addOpenedDocument, fileHandles, refreshHistoryControls, resetSelection, setInteractionMessage, tabs]);

  const openDocument = useCallback(async () => {
    try {
      await addOpenedFile(await openDocumentFile());
    } catch (error) {
      reportError(error);
    }
  }, [addOpenedFile, reportError]);

  useEffect(() => {
    if (!hydrated) return;
    registerDocumentLaunchConsumer(addOpenedFile, reportError);
  }, [addOpenedFile, hydrated, reportError]);

  const saveDocumentAs = useCallback(async () => {
    try {
      const active = tabs.documents.find((document) => document.id === tabs.activeId)!;
      const capturedRevision = active.revision ?? 0;
      await recordDocumentVersion("saved", "Saved portable document");
      const portable = await assemblePortableDocument(
        { ...active, source: workspace.source, fileName: workspace.fileName },
        await loadDocumentVersions(active.historyId),
      );
      const unlockedKey = documentKey(tabs.activeId);
      const encoded = await encodeDocument(portable, {
        compression: active.compression ?? "gzip",
        ...(unlockedKey ? { unlockedKey } : {}),
      });
      const saved = await savePortableDocumentAs(encoded.bytes, workspace.fileName);
      if (!saved) return;
      if (saved.handle) fileHandles.current.set(tabs.activeId, saved.handle);
      else fileHandles.current.delete(tabs.activeId);
      fileSnapshots.current.delete(tabs.activeId);
      tabs.updateDocumentFormat(tabs.activeId, {
        portableDocumentId: portable.documentId, native: true, fileName: saved.fileName,
      });
      const clean = (tabs.getDocument(tabs.activeId)?.revision ?? 0) === capturedRevision;
      if (clean) setWorkspace((current) => ({ ...current, fileName: saved.fileName, dirty: false }));
      setInteractionMessage(
        clean
          ? (saved.downloaded ? `Downloaded snapshot ${saved.fileName}` : `Saved ${saved.fileName}`)
          : `Saved snapshot ${saved.fileName}; newer changes remain unsaved`,
      );
    } catch (error) {
      reportError(error);
    }
  }, [
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
    const active = tabs.documents.find((document) => document.id === tabs.activeId);
    if (!active?.native) return saveDocumentAs();
    const handle = fileHandles.current.get(tabs.activeId);
    if (!handle) return saveDocumentAs();
    try {
      const capturedRevision = active.revision ?? 0;
      await recordDocumentVersion("saved");
      const portable = await assemblePortableDocument(
        { ...active, source: workspace.source, fileName: handle.name },
        await loadDocumentVersions(active.historyId),
      );
      const unlockedKey = documentKey(tabs.activeId);
      const encoded = await encodeDocument(portable, {
        compression: active.compression ?? "gzip",
        ...(unlockedKey ? { unlockedKey } : {}),
      });
      await writeDocumentBytes(handle, encoded.bytes);
      const clean = (tabs.getDocument(tabs.activeId)?.revision ?? 0) === capturedRevision;
      if (clean) setWorkspace((current) => ({ ...current, fileName: handle.name, dirty: false }));
      setInteractionMessage(clean ? `Saved ${handle.name}` : `Saved snapshot; newer changes remain unsaved`);
    } catch (error) {
      reportError(error);
    }
  }, [
    fileHandles,
    recordDocumentVersion,
    reportError,
    saveDocumentAs,
    setInteractionMessage,
    setWorkspace,
    tabs,
    workspace.source,
  ]);

  const configureDocumentFormat = useCallback(async (settings: {
    compression: "gzip" | "none";
    encrypted: boolean;
    password?: string;
    maxVersions: number;
    maxLogicalMiB: number;
  }) => {
    const active = tabs.getDocument(tabs.activeId);
    if (!active) return;
    const patch: Partial<DocumentSnapshot> = {
      compression: settings.compression,
      historyMaxVersions: Math.min(500, Math.max(10, settings.maxVersions)),
      historyMaxLogicalBytes: Math.min(64, Math.max(1, settings.maxLogicalMiB)) * 1024 * 1024,
      dirty: true,
      revision: (active.revision ?? 0) + 1,
    };
    if (!settings.encrypted && active.encrypted) {
      await disableMemoryOnlyHistory(active.historyId);
      forgetDocumentKey(active.id);
      tabs.updateDocumentFormat(active.id, { ...patch, encrypted: false });
      setInteractionMessage("Password protection disabled; save to write an unencrypted file");
      return;
    }
    if (settings.encrypted && (!active.encrypted || settings.password)) {
      if (!settings.password) throw new Error("A password is required to enable protection");
      const next = { ...active, ...patch, source: workspace.source };
      const portable = await assemblePortableDocument(next, await loadDocumentVersions(active.historyId));
      const encoded = await encodeDocument(portable, { compression: settings.compression, password: settings.password });
      const existingHandle = active.native ? fileHandles.current.get(active.id) : undefined;
      let fileName = active.fileName;
      let handle = existingHandle;
      if (existingHandle) await writeDocumentBytes(existingHandle, encoded.bytes);
      else {
        const saved = await savePortableDocumentAs(encoded.bytes, active.fileName);
        if (!saved) return;
        fileName = saved.fileName;
        handle = saved.handle;
      }
      await enableMemoryOnlyHistory(active.historyId);
      rememberDocumentKey(active.id, encoded.unlockedKey!);
      if (handle) fileHandles.current.set(active.id, handle);
      tabs.updateDocumentFormat(active.id, {
        ...patch, portableDocumentId: portable.documentId, native: true, encrypted: true, fileName, dirty: false,
      });
      setWorkspace((current) => ({ ...current, fileName, dirty: false }));
      setInteractionMessage("Saved password-protected document");
      return;
    }
    tabs.updateDocumentFormat(active.id, patch);
    setWorkspace((current) => ({ ...current, dirty: true }));
    setInteractionMessage("Document settings changed; save to apply them");
  }, [fileHandles, setInteractionMessage, setWorkspace, tabs, workspace.source]);

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
    configureDocumentFormat,
  };
}
