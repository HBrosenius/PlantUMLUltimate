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
import {
  loadDocumentVersions,
  type DocumentSnapshot,
  type WorkspaceSession,
  type WorkspaceSnapshot,
} from "../workspace-storage";
import {
  buildSnapshotDocumentHtml,
  buildSnapshotHtml,
  snapshotFileName,
  type SnapshotDiagram,
} from "../features/snapshot/snapshot-html";
import { snapshotRelations, type RenderedDiagram } from "../features/snapshot/render-queue";
import { ganttTaskDetails, markSnapshotTasks, type SnapshotTaskDetails } from "../features/snapshot/gantt-task-details";
import type { SharedDocument } from "../shared-document";

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
  /** The open document's diagrams (project or shared document); undefined for a plain single diagram. */
  sharedDocument: SharedDocument | undefined;
  openSnapshotDialog: () => void;
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

/**
 * Adds Gantt task details to a snapshot diagram: the card data, and hit areas on the bars that carry it.
 * A snapshot without details beats no snapshot, so a schedule that cannot be analysed is skipped.
 */
function withTaskDetails(
  kind: string,
  svg: string,
  source: string,
): { svg: string; taskDetails?: SnapshotTaskDetails[] } {
  if (kind !== "gantt") return { svg };
  try {
    const details = ganttTaskDetails(source);
    return details.length ? { svg: markSnapshotTasks(svg, source), taskDetails: details } : { svg };
  } catch {
    return { svg };
  }
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
  sharedDocument,
  openSnapshotDialog,
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
  const snapshotVersionLabel = useCallback(async () => {
    try {
      const versions = await loadDocumentVersions(activeDocument.historyId);
      const match = versions.find(
        (version) => version.source === workspace.source && (version.pinned || version.label),
      );
      if (match) return match.label ?? `Pinned ${match.createdAt.slice(0, 10)}`;
    } catch {
      /* The version stamp is optional. */
    }
    return undefined;
  }, [activeDocument.historyId, workspace.source]);
  const exportSnapshotThisDiagram = useCallback(async () => {
    if (!result?.svg || !exportReady) {
      setInteractionMessage("Render a valid diagram before exporting a snapshot");
      return;
    }
    try {
      const versionLabel = await snapshotVersionLabel();
      const name = activeDocument.displayName || workspace.fileName.replace(/\.(pumlu|puml|plantuml)$/i, "");
      const html = await buildSnapshotHtml({
        ...withTaskDetails(workspace.diagramKind, decorateExportSvg(result.svg), workspace.source),
        source: workspace.source,
        documentName: name,
        diagramTitle: name,
        diagramKind: workspace.diagramKind,
        snapshotDate: new Date(),
        versionLabel,
      });
      downloadText(html, snapshotFileName(workspace.fileName), "text/html;charset=utf-8");
      notifySuccess("Exported snapshot (HTML)");
    } catch (error) {
      reportFileError(error);
    }
  }, [
    activeDocument.displayName,
    decorateExportSvg,
    exportReady,
    notifySuccess,
    reportFileError,
    result,
    setInteractionMessage,
    snapshotVersionLabel,
    workspace.diagramKind,
    workspace.fileName,
    workspace.source,
  ]);
  /** Builds and downloads one snapshot from diagrams the snapshot queue has already rendered. */
  const exportSnapshotDocument = useCallback(
    async (rendered: readonly RenderedDiagram[]) => {
      if (!sharedDocument) return;
      const activeId = sharedDocument.diagrams.find(
        (diagram) => diagram.documentId === activeDocument.portableDocumentId,
      )?.id;
      // Live Jira markers exist only for the active diagram, so only it needs decorating.
      const diagrams: SnapshotDiagram[] = rendered.map((entry) => ({
        id: entry.id,
        title: entry.title,
        kind: entry.kind,
        source: entry.source,
        ...(entry.svg
          ? withTaskDetails(entry.kind, entry.id === activeId ? decorateExportSvg(entry.svg) : entry.svg, entry.source)
          : {}),
        ...(entry.error ? { error: entry.error } : {}),
      }));
      const html = await buildSnapshotDocumentHtml({
        documentName: sharedDocument.name || activeDocument.displayName || "Document",
        diagrams,
        relations: snapshotRelations(sharedDocument),
        snapshotDate: new Date(),
        versionLabel: await snapshotVersionLabel(),
      });
      const failed = diagrams.filter((diagram) => diagram.error).length;
      downloadText(html, snapshotFileName(workspace.fileName), "text/html;charset=utf-8");
      notifySuccess(
        failed
          ? `Exported snapshot (HTML); ${failed} diagram${failed === 1 ? "" : "s"} could not be rendered`
          : "Exported snapshot (HTML)",
      );
    },
    [
      activeDocument.displayName,
      activeDocument.portableDocumentId,
      decorateExportSvg,
      notifySuccess,
      sharedDocument,
      snapshotVersionLabel,
      workspace.fileName,
    ],
  );
  // With several diagrams a dialog offers this diagram or the whole document; otherwise export directly.
  const exportSnapshot = useCallback(async () => {
    if (sharedDocument && sharedDocument.diagrams.length > 1) openSnapshotDialog();
    else await exportSnapshotThisDiagram();
  }, [exportSnapshotThisDiagram, openSnapshotDialog, sharedDocument]);
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
    exportSnapshot,
    exportSnapshotThisDiagram,
    exportSnapshotDocument,
    copyImage,
    copyMarkdown,
    copyConfluence,
  };
}
