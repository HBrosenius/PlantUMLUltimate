import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { DiagramKind } from "./model";
import {
  createDocumentVersion,
  deleteDocumentVersion,
  loadDocumentVersions,
  updateDocumentVersion,
  type DocumentSnapshot,
  type DocumentVersion,
  type DocumentVersionAuthor,
  type DocumentVersionReason,
  type WorkspaceSnapshot,
} from "./workspace-storage";

export type DocumentVersionOverride = {
  historyId?: string;
  source?: string;
  fileName?: string;
  diagramKind?: DiagramKind;
  author?: DocumentVersionAuthor;
};

export type RecordDocumentVersion = (
  reason: DocumentVersionReason,
  label?: string,
  override?: DocumentVersionOverride,
) => Promise<DocumentVersion>;

type UseDocumentVersionsOptions = {
  activeDocument: DocumentSnapshot;
  workspace: WorkspaceSnapshot;
  setBaselineVersionId: (id: string, baselineVersionId?: string) => void;
  commitSource: (source: string, description: string, preserveSelection?: boolean) => boolean;
  reportError: (error: unknown) => void;
  setInteractionMessage: Dispatch<SetStateAction<string | undefined>>;
};

const initialVersionRequests = new Map<string, Promise<DocumentVersion>>();

export function ensureInitialDocumentVersion(
  document: Pick<DocumentSnapshot, "historyId" | "source" | "fileName" | "diagramKind">,
  load = loadDocumentVersions,
  create = createDocumentVersion,
): Promise<DocumentVersion> {
  const pending = initialVersionRequests.get(document.historyId);
  if (pending) return pending;
  const request = load(document.historyId)
    .then((versions) =>
      versions[0]
        ? versions[0]
        : create({
            historyId: document.historyId,
            source: document.source,
            fileName: document.fileName,
            diagramKind: document.diagramKind,
            reason: "opened",
            label: "Initial version",
            pinned: false,
          }),
    )
    .finally(() => initialVersionRequests.delete(document.historyId));
  initialVersionRequests.set(document.historyId, request);
  return request;
}

export async function recordVersionHistoryReview(
  document: Pick<DocumentSnapshot, "historyId" | "source" | "fileName" | "diagramKind">,
  versions: readonly DocumentVersion[],
  create = createDocumentVersion,
): Promise<DocumentVersion | undefined> {
  if (versions[0]?.source === document.source) return undefined;
  return create({
    historyId: document.historyId,
    ...(versions[0] ? { parentVersionId: versions[0].id } : {}),
    source: document.source,
    fileName: document.fileName,
    diagramKind: document.diagramKind,
    reason: "opened",
    label: "Last reviewed",
    pinned: false,
  });
}

export function documentVersionDisplayName(version: Pick<DocumentVersion, "label" | "createdAt">) {
  return version.label || new Date(version.createdAt).toLocaleString();
}

export function useDocumentVersions({
  activeDocument,
  workspace,
  setBaselineVersionId,
  commitSource,
  reportError,
  setInteractionMessage,
}: UseDocumentVersionsOptions) {
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [documentVersions, setDocumentVersions] = useState<DocumentVersion[]>([]);
  const [baselineVersion, setBaselineVersion] = useState<DocumentVersion>();
  const initialDocuments = useRef(
    new Map<string, Pick<DocumentSnapshot, "historyId" | "source" | "fileName" | "diagramKind">>(),
  );
  let initialDocument = initialDocuments.current.get(activeDocument.historyId);
  if (!initialDocument) {
    initialDocument = {
      historyId: activeDocument.historyId,
      source: activeDocument.source,
      fileName: activeDocument.fileName,
      diagramKind: activeDocument.diagramKind,
    };
    initialDocuments.current.set(activeDocument.historyId, initialDocument);
  }

  useEffect(() => {
    void ensureInitialDocumentVersion(initialDocument).catch(reportError);
  }, [initialDocument, reportError]);

  const refreshVersions = useCallback(async () => {
    const versions = await loadDocumentVersions(activeDocument.historyId);
    setDocumentVersions(versions);
    return versions;
  }, [activeDocument.historyId]);

  useEffect(() => {
    let cancelled = false;
    if (!activeDocument.baselineVersionId) {
      setBaselineVersion(undefined);
      return;
    }
    void loadDocumentVersions(activeDocument.historyId)
      .then((versions) => {
        if (!cancelled) setBaselineVersion(versions.find((version) => version.id === activeDocument.baselineVersionId));
      })
      .catch(reportError);
    return () => {
      cancelled = true;
    };
  }, [activeDocument.baselineVersionId, activeDocument.historyId, reportError]);

  const recordDocumentVersion = useCallback(
    async (reason: DocumentVersionReason, label?: string, override?: DocumentVersionOverride) => {
      const historyId = override?.historyId ?? activeDocument.historyId;
      const initial = initialDocuments.current.get(historyId);
      if (initial) await ensureInitialDocumentVersion(initial);
      const existing = await loadDocumentVersions(historyId);
      const version = await createDocumentVersion({
        historyId,
        ...(existing[0] ? { parentVersionId: existing[0].id } : {}),
        source: override?.source ?? workspace.source,
        fileName: override?.fileName ?? workspace.fileName,
        diagramKind: override?.diagramKind ?? workspace.diagramKind,
        reason,
        ...(override?.author ? { author: override.author } : {}),
        ...(label?.trim() ? { label: label.trim() } : {}),
        pinned: reason === "manual" || reason === "before-restore",
      });
      if (historyId === activeDocument.historyId) await refreshVersions();
      return version;
    },
    [activeDocument.historyId, refreshVersions, workspace.diagramKind, workspace.fileName, workspace.source],
  );

  const openVersionHistory = useCallback(async () => {
    try {
      await ensureInitialDocumentVersion(activeDocument);
      const versions = await refreshVersions();
      await recordVersionHistoryReview(activeDocument, versions);
      setDocumentVersions(versions);
      setVersionHistoryOpen(true);
    } catch (error) {
      reportError(error);
    }
  }, [activeDocument, refreshVersions, reportError]);

  const editDocumentVersion = useCallback(
    async (version: DocumentVersion, patch: { label?: string; pinned?: boolean }) => {
      try {
        await updateDocumentVersion(version.id, patch);
        await refreshVersions();
        setInteractionMessage("Updated document version");
      } catch (error) {
        reportError(error);
      }
    },
    [refreshVersions, reportError, setInteractionMessage],
  );

  const removeDocumentVersion = useCallback(
    async (version: DocumentVersion) => {
      if (!window.confirm(`Delete version “${documentVersionDisplayName(version)}”?`)) return;
      try {
        await deleteDocumentVersion(version.id);
        if (version.id === activeDocument.baselineVersionId) {
          setBaselineVersionId(activeDocument.id, undefined);
          setBaselineVersion(undefined);
        }
        await refreshVersions();
        setInteractionMessage("Deleted document version");
      } catch (error) {
        reportError(error);
      }
    },
    [
      activeDocument.baselineVersionId,
      activeDocument.id,
      refreshVersions,
      reportError,
      setBaselineVersionId,
      setInteractionMessage,
    ],
  );

  const restoreDocumentVersion = useCallback(
    async (version: DocumentVersion) => {
      try {
        await recordDocumentVersion("before-restore", "Before restore");
        commitSource(version.source, `Restore version from ${new Date(version.createdAt).toLocaleString()}`, false);
        setInteractionMessage(`Restored ${documentVersionDisplayName(version)}`);
        setVersionHistoryOpen(false);
      } catch (error) {
        reportError(error);
      }
    },
    [commitSource, recordDocumentVersion, reportError, setInteractionMessage],
  );

  const clearBaseline = useCallback(() => {
    setBaselineVersionId(activeDocument.id, undefined);
    setBaselineVersion(undefined);
    setInteractionMessage("Baseline cleared");
  }, [activeDocument.id, setBaselineVersionId, setInteractionMessage]);

  const setBaseline = useCallback(
    async (version?: DocumentVersion) => {
      try {
        if (version) await updateDocumentVersion(version.id, { pinned: true });
        setBaselineVersionId(activeDocument.id, version?.id);
        setBaselineVersion(version ? { ...version, pinned: true } : undefined);
        await refreshVersions();
        setInteractionMessage(version ? "Baseline version selected" : "Baseline cleared");
      } catch (error) {
        reportError(error);
      }
    },
    [activeDocument.id, refreshVersions, reportError, setBaselineVersionId, setInteractionMessage],
  );

  return {
    versionHistoryOpen,
    setVersionHistoryOpen,
    documentVersions,
    baselineVersion,
    clearBaseline,
    setBaseline,
    recordDocumentVersion,
    openVersionHistory,
    editDocumentVersion,
    removeDocumentVersion,
    restoreDocumentVersion,
  };
}
