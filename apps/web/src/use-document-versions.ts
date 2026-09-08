import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
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
) => Promise<unknown>;

type UseDocumentVersionsOptions = {
  activeDocument: DocumentSnapshot;
  workspace: WorkspaceSnapshot;
  setBaselineVersionId: (id: string, baselineVersionId?: string) => void;
  commitSource: (source: string, description: string, preserveSelection?: boolean) => boolean;
  reportError: (error: unknown) => void;
  setInteractionMessage: Dispatch<SetStateAction<string | undefined>>;
};

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
      let versions = await refreshVersions();
      if (!versions.length) {
        await recordDocumentVersion("opened", "Initial version");
        versions = await refreshVersions();
      }
      setDocumentVersions(versions);
      setVersionHistoryOpen(true);
    } catch (error) {
      reportError(error);
    }
  }, [recordDocumentVersion, refreshVersions, reportError]);

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
