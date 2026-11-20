import { useCallback, useState, type RefObject, type Dispatch, type SetStateAction } from "react";
import {
  downloadText,
  plantUmlFileName,
  svgFileName,
  downloadSvgAsPng,
  type WritableFileHandle,
  type FileSnapshot,
} from "../file-service";
import { useWorkspaceDocuments } from "../use-workspace-documents";
import type { DiagramKind, RenderResult, RenderStatus } from "../model";
import { canExportPreview } from "../export-preview";
import {
  downloadDiagramPdf,
  copyDiagramImage,
  copyText,
  plantUmlMarkdown,
  confluencePlantUmlMarkup,
} from "../diagram-export";
import type { DocumentSnapshot, WorkspaceSession, WorkspaceSnapshot } from "../workspace-storage";

export interface useExportActionsInputs {
  decorateExportSvg: (svg: string) => string;
  activeDocument: DocumentSnapshot;
  closeNewDocumentDialog: () => void;
  externalCheckSnoozedUntil: RefObject<Map<string, number>>;
  fileHandles: RefObject<Map<string, WritableFileHandle>>;
  fileSnapshots: RefObject<Map<string, FileSnapshot>>;
  notifySuccess: (text: string, context?: { documentId: string; source: string }) => void;
  openNewDocumentDialog: (replaceActiveDocument: boolean) => void;
  openProjectInspector: () => void;
  refreshHistoryControls: () => void;
  removeHistory: (id: string) => void;
  replaceActiveDocumentOnCreate: boolean;
  reportFileError: (error: unknown) => void;
  result: RenderResult | undefined;
  retainHistories: (ids: readonly string[]) => void;
  setInteractionMessage: Dispatch<SetStateAction<string | undefined>>;
  setSelectedDependencyIndex: (value: SetStateAction<number | undefined>) => void;
  setSelectedTaskId: (value: SetStateAction<string | undefined>) => void;
  status: RenderStatus;
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

export function useExportActions({
  decorateExportSvg,
  activeDocument,
  closeNewDocumentDialog,
  externalCheckSnoozedUntil,
  fileHandles,
  fileSnapshots,
  notifySuccess,
  openNewDocumentDialog,
  openProjectInspector,
  refreshHistoryControls,
  removeHistory,
  replaceActiveDocumentOnCreate,
  reportFileError,
  result,
  retainHistories,
  setInteractionMessage,
  setSelectedDependencyIndex,
  setSelectedTaskId,
  status,
  tabs,
  workspace,
}: useExportActionsInputs) {
  const exportSource = useCallback(() => {
    const warnings = [
      ...(activeDocument.encrypted ? ["This export is plaintext and is not password protected."] : []),
      ...(activeDocument.progressForecast
        ? [
            "Plain .puml source does not include the progress forecast setting, as-of date, time zone, or remaining-work estimates. Save a .pumlu document to keep them.",
          ]
        : []),
    ];
    if (warnings.length > 0 && !window.confirm(`${warnings.join("\n\n")}\n\nExport source anyway?`)) return;
    downloadText(workspace.source, plantUmlFileName(workspace.fileName), "text/plain;charset=utf-8");
    notifySuccess("Exported PlantUML source (plaintext)");
  }, [activeDocument.encrypted, activeDocument.progressForecast, workspace.fileName, workspace.source, notifySuccess]);
  const resetWorkspaceDocumentSelection = useCallback(() => {
    setSelectedTaskId(undefined);
    setSelectedDependencyIndex(undefined);
  }, [setSelectedDependencyIndex, setSelectedTaskId]);
  const { backupWorkspace, restoreWorkspace, createDocument, newDocument } = useWorkspaceDocuments({
    tabs,
    replaceActiveDocumentOnCreate,
    defaultDiagramTheme: workspace.defaultDiagramTheme,
    openNewDocumentDialog,
    closeNewDocumentDialog,
    fileHandles,
    fileSnapshots,
    externalCheckSnoozedUntil,
    removeHistory,
    retainHistories,
    refreshHistoryControls,
    resetSelection: resetWorkspaceDocumentSelection,
    openProjectInspector,
    reportError: reportFileError,
    setInteractionMessage,
    notifySuccess,
  });
  const [formatDraft, setFormatDraft] = useState<{ source: string; kind: DiagramKind; documentId: string }>();
  const openFormatSource = useCallback(
    () => setFormatDraft({ source: workspace.source, kind: workspace.diagramKind, documentId: tabs.activeId }),
    [workspace.source, workspace.diagramKind, tabs.activeId],
  );
  const [exportDialog, setExportDialog] = useState<"export" | "share">();
  const exportReady = canExportPreview(result, workspace.source, tabs.activeId, status);
  const exportSvg = useCallback(() => {
    if (!result?.svg || !exportReady) {
      setInteractionMessage("Render a valid diagram before exporting SVG");
      return;
    }
    downloadText(decorateExportSvg(result.svg), svgFileName(workspace.fileName), "image/svg+xml;charset=utf-8");
  }, [decorateExportSvg, exportReady, result, workspace.fileName, setInteractionMessage]);
  const exportPng = useCallback(async () => {
    if (!result?.svg || !exportReady) {
      setInteractionMessage("Render a valid diagram before exporting PNG");
      return;
    }
    try {
      await downloadSvgAsPng(decorateExportSvg(result.svg), workspace.fileName);
    } catch (error) {
      reportFileError(error);
    }
  }, [decorateExportSvg, exportReady, reportFileError, result, workspace.fileName, setInteractionMessage]);
  const exportPdf = useCallback(async () => {
    if (!result?.svg || !exportReady) {
      setInteractionMessage("Render a valid diagram before exporting PDF");
      return;
    }
    try {
      await downloadDiagramPdf(decorateExportSvg(result.svg), workspace.fileName);
      notifySuccess("Exported PDF");
    } catch (error) {
      reportFileError(error);
    }
  }, [
    decorateExportSvg,
    exportReady,
    reportFileError,
    result,
    workspace.fileName,
    setInteractionMessage,
    notifySuccess,
  ]);
  const copyImage = useCallback(async () => {
    if (!result?.svg || !exportReady) {
      setInteractionMessage("Render a valid diagram before copying it");
      return;
    }
    try {
      await copyDiagramImage(decorateExportSvg(result.svg));
      notifySuccess("Copied diagram image");
    } catch (error) {
      setInteractionMessage(error instanceof Error ? error.message : "Could not copy the diagram image");
    }
  }, [decorateExportSvg, exportReady, result, setInteractionMessage, notifySuccess]);
  const copySourceAs = useCallback(
    async (text: string, label: string) => {
      try {
        await copyText(text);
        notifySuccess(`Copied ${label}`);
      } catch (error) {
        setInteractionMessage(error instanceof Error ? error.message : `Could not copy ${label}`);
      }
    },
    [setInteractionMessage, notifySuccess],
  );
  const copyMarkdown = useCallback(
    () => copySourceAs(plantUmlMarkdown(workspace.source), "source as Markdown"),
    [copySourceAs, workspace.source],
  );
  const copyConfluence = useCallback(
    () => copySourceAs(confluencePlantUmlMarkup(workspace.source), "Confluence PlantUML markup"),
    [copySourceAs, workspace.source],
  );

  return {
    exportSource,
    backupWorkspace,
    restoreWorkspace,
    createDocument,
    newDocument,
    formatDraft,
    setFormatDraft,
    openFormatSource,
    exportDialog,
    setExportDialog,
    exportReady,
    exportSvg,
    exportPng,
    exportPdf,
    copyImage,
    copyMarkdown,
    copyConfluence,
  };
}
