import { useFocusRestoration } from "./app/use-focus-restoration";
import { useDiagramOutlineEntries } from "./app/use-diagram-outline-entries";
import { createAddMissingProjectItem } from "./app/add-missing-project-item";
import { useAppCommands } from "./app/use-app-commands";
import { useGlobalShortcuts } from "./app/use-global-shortcuts";
import { useStageSelection } from "./app/use-stage-selection";
import { buildSourceEditor } from "./app/build-source-editor";
import { buildStageDock } from "./app/build-stage-dock";
import { RibbonChrome } from "./app/RibbonChrome";
import { NavigationChrome } from "./app/NavigationChrome";
import { WorkspaceMain } from "./app/WorkspaceMain";
import { diagramFocusSelector } from "./app/diagram-focus";
import { StatusBar } from "./app/StatusBar";
import { DiagramDialogs } from "./app/DiagramDialogs";
import { DocumentDialogs } from "./app/DocumentDialogs";
import { DiagramInspectors } from "./app/DiagramInspectors";
import { GanttSideInspectors } from "./app/GanttSideInspectors";
import { AppOverlays } from "./app/AppOverlays";
import { InspectorWorkspace } from "./InspectorWorkspace";

import type { ComponentProps } from "react";
import { canExportPreview } from "./export-preview";

import { inlineLabelRenameRequest } from "./inline-label-rename";
import type { LinkedWorkPreview } from "./projects/LinkedWorkPreviewDialog";

import { type TaskRowDraft } from "./gantt-task-table";

import { useEditorPreferences } from "./editor-preferences";
import { requestSidePanelChange } from "./side-panel-events";
import { useSidePanelState } from "./use-side-panel-state";

import { useInteractionMessage } from "./use-interaction-message";
import { startupChooserPolicy } from "./startup-chooser-policy";

import { useWorkspaceLayout } from "./use-workspace-layout";

import type { PresentationDocument } from "./presentation-review";
import { useResponsiveViewMode } from "./use-responsive-view-mode";

import { readStageTokens, useResolvedDark } from "./stage/stage-theme";

import { recolorSvgForStage } from "./render/stage-recolor";
import { storageGet } from "./safe-storage";
import { applyShellTheme } from "./shell-theme";
import { useResourceWarningPreference } from "./use-resource-warning-preference";
import type { RepairCategory } from "./remaining-repair-summary";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { type SourceRepairRequest } from "./CodeEditor";
import { taskHoverDetails } from "./DiagramPreview";
import {
  addMissingGanttTasksToWbs,
  convertWbsToGantt,
  ensureLinkedGanttProjectStart,
  relinkWbsGanttTask,
} from "./wbs-gantt";
import { useWbsActions } from "./features/wbs/use-wbs-actions";
import { useWbsController } from "./features/wbs/use-wbs-controller";
import { parseActivitySettings } from "./activity-settings";
import type { ActivityDialogKind } from "./features/activity/ActivityDialogs";
import { useActivityActions } from "./features/activity/use-activity-actions";
import { useActivityController } from "./features/activity/use-activity-controller";
import type { ClassDialogKind } from "./features/class/ClassDialogs";
import { useClassActions } from "./features/class/use-class-actions";
import { useClassController } from "./features/class/use-class-controller";
import { parseClassSettings } from "./class-settings";
import { type GanttDialogKind } from "./features/gantt/GanttDialogs";

import { useGanttCalendarActions } from "./features/gantt/use-gantt-calendar-actions";
import { useGanttController } from "./features/gantt/use-gantt-controller";
import { useGanttDependencyActions } from "./features/gantt/use-gantt-dependency-actions";
import { findResourceConflicts } from "./features/gantt/gantt-resource-conflicts";
import { useGanttScheduleActions } from "./features/gantt/use-gantt-schedule-actions";
import { useGanttTaskActions } from "./features/gantt/use-gantt-task-actions";

import { outlineTargetSelector, type DiagramOutlineEntry } from "./diagram-outline";
import { parseLegendEntries, removeLegend, synchronizeLegend, usedLegendColors } from "./legend";

import { buildResourceOverAllocations } from "./ResourceWorkloadPanel";

import { createDiagramAnalyzer, type GanttParse } from "./diagram-diagnostics";

import type { WbsGanttProjectLink } from "./projects/wbs-gantt-project-links";
import { collectMissingWbsGanttItems, type WbsGanttMissingItem } from "./projects/wbs-gantt-missing";
import { embeddedMemberHistoryId } from "./projects/embedded-project";
import { collectWbsGanttIssues, type WbsGanttIssue } from "./wbs-gantt-health";

import { useFolderProject } from "./projects/use-folder-project";
import { useSingleFileProject } from "./projects/use-single-file-project";
import { projectElementForEdit } from "./projects/project-edit-mapping";

import type { SequenceDialog } from "./features/sequence/SequenceDialogs";
import { useSequenceActions } from "./features/sequence/use-sequence-actions";
import { useSequenceController } from "./features/sequence/use-sequence-controller";
import { parseSequenceSettings } from "./sequence-settings";
import { parseUseCaseSettings } from "./usecase-settings";
import { resolveTaskDates } from "./gantt-schedule";

import { ganttAnalysisContext } from "./gantt-analysis-context";
import { analyzeCriticalPath } from "./schedule-analysis";

import { parseGanttCalendar } from "./gantt-calendar";

import { parseProjectSettings } from "./project-settings";
import type { DiagramKind, ViewMode } from "./model";
import { rendererLayoutEngineForDiagramKind, useRenderer } from "./render/use-renderer";
import { usePersistedWorkspace } from "./use-persisted-workspace";
import { useDiagramSelection } from "./use-diagram-selection";
import { useAppDialog } from "./use-app-dialog";
import { documentDisplayNames } from "./workspace-storage";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { applicationGanttAdapter, applicationWbsAdapter } from "./diagram-adapters";

import { usePwa } from "./pwa";
import {
  confluencePlantUmlMarkup,
  copyDiagramImage,
  copyText,
  downloadDiagramPdf,
  plantUmlMarkdown,
} from "./diagram-export";

import {
  downloadSvgAsPng,
  downloadText,
  svgFileName,
  plantUmlFileName,
  type WritableFileHandle,
  type FileSnapshot,
  type OpenedFileBytes,
} from "./file-service";
import { parseWbs, updateWbsNode } from "@plantuml-studio/diagram-wbs";
import { parseSequence } from "@plantuml-studio/diagram-sequence";
import { parseUseCase } from "@plantuml-studio/diagram-usecase";
import { parseClassDiagram } from "@plantuml-studio/diagram-class";
import { hashSource } from "@plantuml-studio/document-format";
import { parseActivity } from "@plantuml-studio/diagram-activity";
import { useUseCaseActions } from "./features/usecase/use-usecase-actions";
import { useUseCaseController } from "./features/usecase/use-usecase-controller";
import { useDocumentHistory } from "./use-document-history";
import { useDocumentTabLifecycle } from "./use-document-tab-lifecycle";
import { useDocumentVersions, type RecordDocumentVersion } from "./use-document-versions";
import { useDocumentFiles } from "./use-document-files";
import { collaborationLinkDetails } from "./collaboration";
import { useCollaborationLifecycle, type CollaborationDocumentBridge } from "./use-collaboration-lifecycle";
import { useJiraIntegration } from "./use-jira-integration";
import { useWorkspaceDocuments } from "./use-workspace-documents";
import { useWorkspaceFocus } from "./app/use-workspace-focus";
import { useSourceCommands, type SourceProblemPreview } from "./features/documents/use-source-commands";
import { useResourceCapacities } from "./use-resource-capacities";
import {
  createSemanticSymbolProvider,
  type SemanticRenameRequest,
  type SemanticSymbolOccurrence,
} from "./semantic-symbol-provider";

import { useDiagramMultiSelection } from "./use-diagram-multi-selection";
import {
  copyTasksText,
  describeBulkResult,
  duplicateTasks,
  pasteTasksText,
  type BulkTaskResult,
} from "./gantt-bulk-operations";

const EMPTY_SEQUENCE_DOCUMENT = parseSequence("");
const EMPTY_USECASE_DOCUMENT = parseUseCase("");
const EMPTY_CLASS_DOCUMENT = parseClassDiagram("");
const EMPTY_ACTIVITY_DOCUMENT = parseActivity("");
const EMPTY_WBS_DOCUMENT = applicationWbsAdapter.parse("").document;

import { lazyFeature } from "./lazy-feature";
const ExportDialog = lazyFeature<ComponentProps<typeof import("./ExportDialog").ExportDialog>>(
  () => import("./ExportDialog").then((module) => ({ default: module.ExportDialog })),
  "export options",
);
const FormatSourceDialog = lazyFeature<ComponentProps<typeof import("./FormatSourceDialog").FormatSourceDialog>>(
  () => import("./FormatSourceDialog").then((module) => ({ default: module.FormatSourceDialog })),
  "the formatter",
);

function useInspectorSettings<T>(open: boolean, source: string, parse: (source: string) => T): T {
  const settingsSource = open ? source : "";
  return useMemo(() => parse(settingsSource), [settingsSource, parse]);
}

export function App() {
  // The editor's quick fixes analyze the same source without a parse; let them reuse the Gantt parse below.
  const latestGanttParse = useRef<{ source: string; parsed: GanttParse }>(undefined);
  const analyzeSource = useMemo(
    () =>
      createDiagramAnalyzer((source) =>
        latestGanttParse.current?.source === source ? latestGanttParse.current.parsed : undefined,
      ),
    [],
  );
  const [workspace, setWorkspace, hydrated, tabs] = usePersistedWorkspace();
  const editorPreferences = useEditorPreferences();
  const [openWorkOpen, setOpenWorkOpen] = useState(false);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const presentationReturnFocus = useRef<HTMLElement | null>(null);
  const openPresentation = () => {
    const opener = document.activeElement as HTMLElement | null;
    presentationReturnFocus.current = opener?.closest(".application-menu")?.querySelector("button") ?? opener;
    setPresentationOpen(true);
  };
  const [starterDraft, setStarterDraft] = useState<{ kind: DiagramKind; source: string; name: string }>();
  const [closedDayFocus, setClosedDayFocus] = useState(0);
  const [outlineMode, setOutlineMode] = useState<"dock" | "find">();
  const [outlineWide, setOutlineWide] = useState(
    () => typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1100px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia?.("(min-width: 1100px)");
    if (!media) return;
    const change = () => setOutlineWide(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const [outlineMatches, setOutlineMatches] = useState<readonly DiagramOutlineEntry[]>([]);
  const [outlineReveal, setOutlineReveal] = useState<{ entry: DiagramOutlineEntry }>();
  const persistViewMode = useCallback(
    (mode: ViewMode) => setWorkspace((current) => ({ ...current, viewMode: mode })),
    [setWorkspace],
  );
  const {
    narrow,
    viewMode: normalViewMode,
    selectViewMode: selectNormalViewMode,
  } = useResponsiveViewMode(workspace.viewMode, persistViewMode);
  const [taskViewDocument, setTaskViewDocument] = useState<string>();
  const [taskTablePane, setTaskTablePane] = useState<"table" | "chart">("table");
  const [taskTablePercent, setTaskTablePercent] = useState(55);
  const [taskTableInspector, setTaskTableInspector] = useState(false);
  const [taskRowDrafts, setTaskRowDrafts] = useState<Record<string, TaskRowDraft[]>>({});
  const [tasksNarrow, setTasksNarrow] = useState(
    () => typeof window.matchMedia === "function" && window.matchMedia("(max-width: 900px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 900px)");
    if (!media) return;
    const change = () => setTasksNarrow(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const [mobileDiagramDocument, setMobileDiagramDocument] = useState<string>();
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [mobileReveal, setMobileReveal] = useState<{
    documentId: string;
    kind: "gantt" | "wbs";
    id: string;
    source: string;
  }>();
  const mobileSupported =
    (narrow || mobileSheetOpen) && (workspace.diagramKind === "gantt" || workspace.diagramKind === "wbs");
  const taskViewActive = taskViewDocument === tabs.activeId && workspace.diagramKind === "gantt";
  const mobileListActive =
    mobileSupported &&
    !taskViewActive &&
    (mobileSheetOpen || (normalViewMode !== "code" && mobileDiagramDocument !== tabs.activeId));
  const mobileRevealActive =
    mobileReveal?.documentId === tabs.activeId &&
    mobileReveal.kind === workspace.diagramKind &&
    mobileReveal.source === workspace.source
      ? mobileReveal
      : undefined;
  const viewMode: ViewMode = mobileListActive
    ? "code"
    : taskViewActive
      ? tasksNarrow
        ? taskTablePane === "table"
          ? "code"
          : "diagram"
        : "split"
      : normalViewMode;
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const selectViewMode = useCallback(
    (mode: ViewMode) => {
      setTaskViewDocument(undefined);
      setTaskTableInspector(false);
      setMobileReveal(undefined);
      setMobileDiagramDocument(mode === "diagram" ? tabs.activeId : undefined);
      selectNormalViewMode(mode);
    },
    [selectNormalViewMode, tabs.activeId],
  );
  const [pendingWbsDeleteId, setPendingWbsDeleteId] = useState<string>();
  const [pendingGanttDeleteTaskId, setPendingGanttDeleteTaskId] = useState<string>();
  const [pendingWbsRelink, setPendingWbsRelink] = useState<{
    nodeId: string;
    documentId: string;
    targetTaskId: string;
  }>();
  const [pendingProjectWbsSelection, setPendingProjectWbsSelection] = useState<{ tabId: string; nodeId: string }>();
  const activeDocument = tabs.documents.find((document) => document.id === tabs.activeId)!;
  const projectLaunchRef = useRef<((opened: OpenedFileBytes) => Promise<boolean>) | undefined>(undefined);
  const {
    selectedTaskId,
    setSelectedTaskId,
    selectedDependencyIndex,
    setSelectedDependencyIndex,
    selectedDividerIndex,
    setSelectedDividerIndex,
    selectedVerticalSeparatorIndex,
    setSelectedVerticalSeparatorIndex,
    sourceHighlightedTaskId,
    setSourceHighlightedTaskId,
    resetTransientTabSelection,
    dismissInspectorSelection,
  } = useDiagramSelection();
  const {
    focusNoteTaskId,
    setFocusNoteTaskId,
    legendInspectorOpen,
    setLegendInspectorOpen,
    legendFocusColor,
    setLegendFocusColor,
    highlightDate,
    setHighlightDate,
    dateMenuFor,
    setDateMenuFor,
    resourceFilter,
    setResourceFilter,
    schedulePreview,
    setSchedulePreview,
    scheduleMode,
    setScheduleMode,
  } = useGanttController(workspace.diagramKind);
  const { dialog, openDialog, closeDialog, toggleCommandPalette } = useAppDialog();
  const newDocumentOpen = dialog?.kind === "new-document";
  const replaceActiveDocumentOnCreate = newDocumentOpen && dialog.replaceActiveDocument;
  const openNewDocumentDialog = useCallback(
    (replaceActiveDocument: boolean) => openDialog({ kind: "new-document", replaceActiveDocument }),
    [openDialog],
  );
  const closeNewDocumentDialog = useCallback(() => closeDialog("new-document"), [closeDialog]);
  const [sourceSymbol, setSourceSymbol] = useState<Pick<SemanticSymbolOccurrence, "kind" | "key">>();
  const [sourceSymbolPosition, setSourceSymbolPosition] = useState<number>();
  const [renameSymbol, setRenameSymbol] = useState<SemanticRenameRequest>();
  const [symbolMenu, setSymbolMenu] = useState<{
    position?: number;
    occurrence?: SemanticSymbolOccurrence;
    x: number;
    y: number;
  }>();
  const [classMemberMenu, setClassMemberMenu] = useState<{
    entityId: string;
    memberId: string;
    x: number;
    y: number;
  }>();
  const [referenceSymbol, setReferenceSymbol] = useState<{
    kind: SemanticSymbolOccurrence["kind"];
    key: string;
    label: string;
  }>();
  const [repairRequest, setRepairRequest] = useState<SourceRepairRequest>();
  const [selectionRequest, setSelectionRequest] = useState<{ from: number; to: number }>();
  const [stageTrueRender, setStageTrueRender] = useState(false);
  const [stageInspectorOpen, setStageInspectorOpen] = useState(false);
  const [stageLensExpanded, setStageLensExpanded] = useState(false);
  const {
    message: interactionMessage,
    setMessage: setInteractionMessage,
    notifySuccess,
  } = useInteractionMessage(tabs.activeId, workspace.source);
  const [repairCategoryFilter, setRepairCategoryFilter] = useState<{
    source: string;
    documentId: string;
    category: RepairCategory;
  }>();
  useEffect(() => {
    setRepairCategoryFilter((current) =>
      current?.source === workspace.source && current.documentId === tabs.activeId ? current : undefined,
    );
  }, [workspace.source, tabs.activeId]);
  const [repairHost, setRepairHost] = useState<HTMLDivElement | null>(null);
  const [documentSettingsOpen, setDocumentSettingsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState("Editor & navigation");
  const [problemPreview, setProblemPreview] = useState<SourceProblemPreview>();
  const [linkedWorkPreview, setLinkedWorkPreview] = useState<LinkedWorkPreview>();
  const [projectNavigatorOpen, setProjectNavigatorOpen] = useState(true);
  const [draggedTabId, setDraggedTabId] = useState<string>();
  const [tabMenu, setTabMenu] = useState<{ id: string; x: number; y: number }>();
  const fileHandles = useRef(new Map<string, WritableFileHandle>());
  const fileSnapshots = useRef(new Map<string, FileSnapshot>());
  const externalCheckSnoozedUntil = useRef(new Map<string, number>());
  const workspaceElement = useRef<HTMLElement>(null);
  useWorkspaceLayout(workspaceElement, hydrated);
  useEffect(() => {
    if (hydrated) applyShellTheme(workspace.theme);
  }, [hydrated, workspace.theme]);
  const documentTabs = useRef<HTMLElement>(null);
  useEffect(() => {
    // Keep the active tab visible when the strip overflows (phones, many open documents).
    if (!hydrated) return;
    const frame = requestAnimationFrame(() => {
      documentTabs.current
        ?.querySelector<HTMLButtonElement>("button.active")
        ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [hydrated, tabs.activeId]);
  const { captureBeforeCommit } = useWorkspaceFocus(workspace.source, workspaceElement);
  const lastDiagramFocus = useRef<HTMLElement | SVGElement | undefined>(undefined);
  const lastDiagramFocusSelector = useRef<string | undefined>(undefined);
  const renameReturnFocus = useRef<HTMLElement | SVGElement | undefined>(undefined);
  const [inlineRename, setInlineRename] = useState<{
    request: SemanticRenameRequest;
    source: string;
    documentId: string;
    anchor: { left: number; bottom: number };
  }>();
  const pendingDiagramFocusSelector = useRef<string | undefined>(undefined);
  const startupSplashShown = useRef(false);
  const { activeHistory, refreshHistoryControls, removeHistory, retainHistories, recordSourceChange } =
    useDocumentHistory(tabs.activeId);
  // Timers read the latest tab controls through this ref, so caret moves (which rebuild `tabs`) don't restart them.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  /** Updates another open document's source as an undoable step in that document's own history. */
  const updateLinkedSource = useCallback(
    (document: { id: string; source: string }, next: string, kind: DiagramKind, description: string) => {
      if (next === document.source) return;
      recordSourceChange(document.id, document.source, next, description);
      tabsRef.current.updateDocumentSource(document.id, next, kind);
    },
    [recordSourceChange],
  );
  const {
    capacities: resourceCapacities,
    updateCapacities: updateResourceCapacities,
    renameCapacity,
  } = useResourceCapacities(
    tabs.activeId,
    activeDocument.resourceCapacities ?? {},
    activeDocument.encrypted === true,
    (capacities) => tabs.updateDocumentFormat(tabs.activeId, { resourceCapacities: capacities, dirty: true }),
  );
  const { enabled: resourceWarningsEnabled, setEnabled: setResourceWarningsEnabled } = useResourceWarningPreference();
  const {
    status,
    result,
    retry: retryRender,
  } = useRenderer(
    workspace.source,
    hydrated && dialog?.kind !== "new-document" && viewMode !== "code",
    rendererLayoutEngineForDiagramKind(workspace.diagramKind),
    tabs.activeId,
  );
  const pwa = usePwa(
    hydrated &&
      (dialog?.kind === "new-document" ||
        viewMode === "code" ||
        result?.source === workspace.source ||
        status === "error"),
  );
  useEffect(() => {
    const selector = pendingDiagramFocusSelector.current;
    if (!selector || !result?.svg) return;
    const target = document.querySelector<HTMLElement | SVGElement>(selector);
    if (!target) return;
    pendingDiagramFocusSelector.current = undefined;
    lastDiagramFocus.current = target;
    target.focus({ preventScroll: true });
  }, [result?.svg]);
  const activeGanttSource = workspace.diagramKind === "gantt" ? workspace.source : "@startgantt\n@endgantt";
  const parsed = useMemo(() => {
    const started = performance.now();
    const value = applicationGanttAdapter.parse(activeGanttSource);
    return { value, durationMs: performance.now() - started };
  }, [activeGanttSource]);
  const parseResult = parsed.value;
  const ganttParse = useMemo<GanttParse>(
    () => ({ document: parseResult.document, diagnostics: [...parseResult.diagnostics] }),
    [parseResult],
  );
  latestGanttParse.current = { source: activeGanttSource, parsed: ganttParse };
  const {
    endpoint: defaultJiraEndpoint,
    binding: jiraBinding,
    taskStatuses: jiraTaskStatuses,
    diagramStatuses: jiraDiagramStatuses,
    jiraDialogOpen,
    setJiraDialogOpen,
  } = useJiraIntegration({
    source: workspace.source,
    document: parseResult.document,
    setInteractionMessage,
  });
  // Only the active diagram type is parsed on each edit; the other editors receive empty documents.
  const activeKind = workspace.diagramKind;
  const previewSequence = useMemo(() => {
    if (activeKind !== "sequence" || !result?.source) return undefined;
    const document = parseSequence(result.source);
    return {
      ...document,
      structures: [
        ...document.fragments,
        ...document.activations,
        ...document.notes,
        ...document.timelineItems,
        ...document.references,
        ...document.boxes,
        ...document.autonumbers,
        ...document.creations,
        ...document.durations,
      ],
    };
  }, [activeKind, result?.source]);
  const previewClass = useMemo(
    () =>
      (activeKind === "class" || activeKind === "component") && result?.source
        ? parseClassDiagram(result.source)
        : undefined,
    [activeKind, result?.source],
  );
  const previewWbs = useMemo(
    () => (activeKind === "wbs" && result?.source ? parseWbs(result.source) : undefined),
    [activeKind, result?.source],
  );
  const sequenceDocument = useMemo(
    () => (activeKind === "sequence" ? parseSequence(workspace.source) : EMPTY_SEQUENCE_DOCUMENT),
    [activeKind, workspace.source],
  );
  const useCaseDocument = useMemo(
    () => (activeKind === "usecase" ? parseUseCase(workspace.source) : EMPTY_USECASE_DOCUMENT),
    [activeKind, workspace.source],
  );
  const classDocument = useMemo(
    () =>
      activeKind === "class" || activeKind === "component" ? parseClassDiagram(workspace.source) : EMPTY_CLASS_DOCUMENT,
    [activeKind, workspace.source],
  );
  const activityDocument = useMemo(
    () => (activeKind === "activity" ? parseActivity(workspace.source) : EMPTY_ACTIVITY_DOCUMENT),
    [activeKind, workspace.source],
  );
  const wbsDocument = useMemo(
    () => (activeKind === "wbs" ? applicationWbsAdapter.parse(workspace.source).document : EMPTY_WBS_DOCUMENT),
    [activeKind, workspace.source],
  );
  const {
    selectedNodeId: selectedWbsNodeId,
    selectedRelationshipId: selectedWbsRelationshipId,
    sourceHighlightedNodeId: sourceHighlightedWbsNodeId,
    settingsOpen: wbsSettingsOpen,
    selectedNode: selectedWbsNode,
    selectedRelationship: selectedWbsRelationship,
    setSourceHighlightedNodeId: setSourceHighlightedWbsNodeId,
    clearSelectedNode: clearSelectedWbsNode,
    clearSelectedRelationship: clearSelectedWbsRelationship,
    closeSettings: closeWbsSettings,
    openSettings: openWbsSettings,
    openSettingsFromToolbar: openWbsSettingsFromToolbar,
    selectNode: selectWbsNode,
    selectRelationship: selectWbsRelationship,
    selectFromSource: selectWbsFromSource,
  } = useWbsController(workspace.diagramKind, wbsDocument);
  useEffect(() => {
    if (!pendingProjectWbsSelection || tabs.activeId !== pendingProjectWbsSelection.tabId) return;
    if (
      workspace.diagramKind !== "wbs" ||
      !wbsDocument.nodes.some((node) => node.id === pendingProjectWbsSelection.nodeId)
    )
      return;
    const node = wbsDocument.nodes.find((item) => item.id === pendingProjectWbsSelection.nodeId)!;
    selectWbsNode(node.id);
    setSelectionRequest({ ...node.sourceRange });
    setPendingProjectWbsSelection(undefined);
  }, [pendingProjectWbsSelection, selectWbsNode, tabs.activeId, wbsDocument.nodes, workspace.diagramKind]);
  const linkedGantt = useMemo(
    () => tabs.documents.find((item) => item.diagramKind === "gantt" && item.linkedWbsDocumentId === tabs.activeId),
    [tabs.documents, tabs.activeId],
  );
  const linkedWbsNodeIds = useMemo(
    () =>
      new Set(
        wbsDocument.nodes
          .filter((node) => linkedGantt?.wbsGanttLinks?.some((link) => link.wbsAlias === node.alias))
          .map((node) => node.id),
      ),
    [wbsDocument.nodes, linkedGantt?.wbsGanttLinks],
  );
  // The linked Gantt is parsed and scheduled once per change of its own source, not per
  // WBS keystroke; the per-node maps below only do lookups against these models.
  const linkedGanttSource = linkedGantt?.source;
  const linkedGanttModel = useMemo(
    () => (linkedGanttSource === undefined ? undefined : parseGantt(linkedGanttSource).document),
    [linkedGanttSource],
  );
  const linkedGanttSchedule = useMemo(() => {
    if (!linkedGanttModel || linkedGanttSource === undefined) return undefined;
    const calendar = parseGanttCalendar(linkedGanttSource);
    const dates = resolveTaskDates(
      linkedGanttModel.tasks,
      linkedGanttModel.dependencies,
      linkedGanttModel.projectStart?.resolved ? linkedGanttModel.projectStart.value : undefined,
      calendar,
    );
    const analysis = analyzeCriticalPath(linkedGanttModel.tasks, linkedGanttModel.dependencies, dates, calendar);
    return { dates, analysis };
  }, [linkedGanttModel, linkedGanttSource]);
  const wbsNodeCompletion = useMemo(() => {
    const completion = new Map<string, number>();
    if (!linkedGantt || !linkedGanttModel) return completion;
    const tasks = linkedGanttModel.symbols.tasks;
    for (const link of linkedGantt.wbsGanttLinks ?? []) {
      const node = wbsDocument.nodes.find((item) => item.alias === link.wbsAlias);
      const value = tasks.get(link.ganttAlias.toLowerCase())?.completion?.value;
      if (node && value !== undefined) completion.set(node.id, value);
    }
    return completion;
  }, [linkedGantt, linkedGanttModel, wbsDocument.nodes]);
  const wbsNodeSchedule = useMemo(() => {
    const details = new Map<string, NonNullable<ReturnType<typeof taskHoverDetails>>>();
    if (!linkedGantt || !linkedGanttModel || !linkedGanttSchedule) return details;
    const gantt = linkedGanttModel;
    const { dates, analysis } = linkedGanttSchedule;
    for (const link of linkedGantt.wbsGanttLinks ?? []) {
      const node = wbsDocument.nodes.find((item) => item.alias === link.wbsAlias);
      const task = gantt.symbols.tasks.get(link.ganttAlias.toLowerCase());
      if (!node || !task) continue;
      const summary = taskHoverDetails(task, gantt.dependencies, gantt.tasks, dates.get(task.id), analysis);
      if (summary) details.set(node.id, summary);
    }
    return details;
  }, [linkedGantt, linkedGanttModel, linkedGanttSchedule, wbsDocument.nodes]);
  // Inspector inputs for the selected WBS node: computed once per selection or document change
  // rather than by parsing every open Gantt tab inside the render.
  const selectedWbsNodeLink = useMemo(() => {
    if (!selectedWbsNode) return undefined;
    const link = linkedGantt?.wbsGanttLinks?.find((item) => item.wbsAlias === selectedWbsNode.alias);
    const task = link ? linkedGanttModel?.symbols.tasks.get(link.ganttAlias.toLowerCase()) : undefined;
    return {
      link,
      targetKey: link && linkedGantt && task ? `${linkedGantt.id}:${link.ganttAlias.toLowerCase()}` : undefined,
      label: task?.label,
    };
  }, [selectedWbsNode, linkedGantt, linkedGanttModel]);
  const wbsGanttTargets = useMemo(() => {
    if (!selectedWbsNode) return [];
    return tabs.documents
      .filter(
        (item) =>
          item.diagramKind === "gantt" &&
          (!linkedGantt || item.id === linkedGantt.id) &&
          (!item.linkedWbsDocumentId || item.linkedWbsDocumentId === tabs.activeId),
      )
      .flatMap((item) =>
        (item === linkedGantt && linkedGanttModel ? linkedGanttModel : parseGantt(item.source).document).tasks
          .filter(
            (task) =>
              !item.wbsGanttLinks?.some(
                (link) => link.ganttAlias.toLowerCase() === task.id && link.wbsAlias !== selectedWbsNode.alias,
              ),
          )
          .map((task) => ({
            key: `${item.id}:${task.id}`,
            label: `${item.fileName} · ${task.label}`,
          })),
      );
  }, [selectedWbsNode, tabs.documents, tabs.activeId, linkedGantt, linkedGanttModel]);
  const linkedWbs = useMemo(
    () =>
      activeDocument.linkedWbsDocumentId
        ? tabs.documents.find((item) => item.id === activeDocument.linkedWbsDocumentId && item.diagramKind === "wbs")
        : undefined,
    [activeDocument.linkedWbsDocumentId, tabs.documents],
  );
  const missingWbsTaskCount = useMemo(() => {
    if (!linkedGantt) return 0;
    const linked = new Set(linkedGantt.wbsGanttLinks?.map((link) => link.wbsAlias));
    return wbsDocument.nodes.filter((node) => !node.alias || !linked.has(node.alias)).length;
  }, [linkedGantt, wbsDocument.nodes]);
  const missingGanttTaskCount = useMemo(() => {
    if (!linkedWbs) return 0;
    const linked = new Set(activeDocument.wbsGanttLinks?.map((link) => link.ganttAlias.toLowerCase()));
    return parseResult.document.tasks.filter((task) => !linked.has(task.id)).length;
  }, [activeDocument.wbsGanttLinks, linkedWbs, parseResult.document.tasks]);
  // The full WBS-to-Gantt conversion behind these warnings runs on a debounced source, off the typing path.
  // Only a WBS with a linked Gantt chart schedules the update, so other diagrams get no extra renders.
  const [debouncedWbs, setDebouncedWbs] = useState<{ id: string; source: string }>();
  const wbsWarningsActive = workspace.diagramKind === "wbs" && Boolean(linkedGantt);
  useEffect(() => {
    if (!wbsWarningsActive) return;
    const id = tabs.activeId;
    const timer = window.setTimeout(() => setDebouncedWbs({ id, source: workspace.source }), 300);
    return () => window.clearTimeout(timer);
  }, [tabs.activeId, wbsWarningsActive, workspace.source]);
  const debouncedWbsSource = debouncedWbs?.id === tabs.activeId ? debouncedWbs.source : undefined;
  const wbsDependencyWarnings = useMemo(() => {
    const warnings = new Map<string, string>();
    if (workspace.diagramKind !== "wbs" || !linkedGantt || debouncedWbsSource === undefined) return warnings;
    const conversion = convertWbsToGantt(
      debouncedWbsSource,
      linkedGantt.source,
      linkedGantt.wbsGanttLinks,
      linkedGantt.wbsGanttDependencies,
      "keep-scheduled",
      false,
    );
    for (const relationship of wbsDocument.relationships) {
      const warning = conversion.warnings.find((message) =>
        message.startsWith(`Dependency ${relationship.from} → ${relationship.to} `),
      );
      if (warning) warnings.set(relationship.id, warning);
    }
    return warnings;
  }, [debouncedWbsSource, linkedGantt, wbsDocument.relationships, workspace.diagramKind]);
  useEffect(() => {
    if (workspace.diagramKind !== "gantt" || !linkedWbs || !activeDocument.wbsGanttLinks?.length) return;
    if (parseResult.diagnostics.some((item) => item.severity === "error")) return;
    const timer = window.setTimeout(() => {
      let next = linkedWbs.source;
      for (const link of activeDocument.wbsGanttLinks ?? []) {
        const task = parseResult.document.symbols.tasks.get(link.ganttAlias.toLowerCase());
        const node = parseWbs(next).nodes.find((item) => item.alias === link.wbsAlias);
        if (!task || !node) continue;
        const label = task.label.replace(/^(?:↳\s*)+/, "").trim();
        if (!label || label === node.label) continue;
        next = updateWbsNode(next, node, {
          label,
          ...(node.color ? { color: node.color } : {}),
          ...(node.textColor ? { textColor: node.textColor } : {}),
          ...(node.stereotype ? { stereotype: node.stereotype } : {}),
          ...(node.link ? { link: node.link } : {}),
          ...(node.icon ? { icon: node.icon } : {}),
          side: node.side === "left" ? "left" : "right",
        });
      }
      updateLinkedSource(linkedWbs, next, "wbs", "Synchronize names from linked Gantt");
    }, 400);
    return () => window.clearTimeout(timer);
  }, [activeDocument.wbsGanttLinks, linkedWbs, parseResult, updateLinkedSource, workspace.diagramKind]);
  const convertCurrentWbs = () => {
    const converted = convertWbsToGantt(
      workspace.source,
      linkedGantt?.source,
      linkedGantt?.wbsGanttLinks,
      linkedGantt?.wbsGanttDependencies,
    );
    updateLinkedSource(
      { id: tabs.activeId, source: workspace.source },
      converted.wbsSource,
      "wbs",
      "Add WBS aliases for Gantt",
    );
    if (linkedGantt) {
      updateLinkedSource(linkedGantt, converted.ganttSource, "gantt", "Update schedule from WBS");
      tabs.updateDocumentFormat(linkedGantt.id, {
        wbsGanttLinks: converted.links,
        wbsGanttDependencies: converted.dependencies,
      });
      tabs.activateDocument(linkedGantt.id);
    } else {
      tabs.addDocument({
        diagramKind: "gantt",
        source: converted.ganttSource,
        fileName: `${workspace.fileName.replace(/\.[^.]+$/, "")}-schedule.pumlu`,
        dirty: true,
        linkedWbsDocumentId: tabs.activeId,
        wbsGanttLinks: converted.links,
        wbsGanttDependencies: converted.dependencies,
      });
    }
    setInteractionMessage(
      converted.warnings.length
        ? `Created Gantt chart. ${converted.warnings.join(" ")}`
        : `Linked ${converted.links.length} WBS nodes to Gantt entries`,
    );
  };
  const importCurrentGanttToWbs = () => {
    if (!linkedWbs) return;
    try {
      const imported = addMissingGanttTasksToWbs(
        linkedWbs.source,
        workspace.source,
        activeDocument.wbsGanttLinks ?? [],
        activeDocument.wbsGanttDependencies ?? [],
      );
      if (!imported.addedCount) {
        setInteractionMessage("All Gantt tasks already have WBS nodes");
        return;
      }
      if (
        imported.ganttSource !== workspace.source &&
        !commitGeneratedSource(imported.ganttSource, "Link Gantt tasks to WBS")
      )
        return;
      updateLinkedSource(linkedWbs, imported.wbsSource, "wbs", "Add Gantt tasks to WBS");
      tabs.updateDocumentFormat(tabs.activeId, {
        wbsGanttLinks: imported.links,
        wbsGanttDependencies: imported.dependencies,
      });
      setInteractionMessage(
        `Added ${imported.addedCount} Gantt ${imported.addedCount === 1 ? "task" : "tasks"} to WBS${imported.warnings.length ? `. ${imported.warnings.join(" ")}` : ""}`,
      );
    } catch (error) {
      setInteractionMessage(error instanceof Error ? error.message : "Could not add Gantt tasks to WBS");
    }
  };
  useEffect(() => {
    if (
      workspace.diagramKind !== "wbs" ||
      !linkedGantt?.wbsGanttLinks?.some((link) => link.ganttAlias === `wbs_${link.wbsAlias}`) ||
      wbsDocument.diagnostics.some((item) => item.severity === "error")
    )
      return;
    const timer = window.setTimeout(() => {
      const converted = convertWbsToGantt(
        workspace.source,
        linkedGantt.source,
        linkedGantt.wbsGanttLinks,
        linkedGantt.wbsGanttDependencies,
        "keep-scheduled",
        false,
      );
      const tabControls = tabsRef.current;
      if (converted.wbsSource !== workspace.source) {
        // Fold generated aliases into the edit that needed them. After an undo, leave the source alone so
        // the undo and redo history stays valid; the next edit synchronizes again.
        if (!activeHistory.amendLast(workspace.source, converted.wbsSource) && activeHistory.canUndo) return;
        tabControls.updateDocumentSource(tabControls.activeId, converted.wbsSource, "wbs");
        refreshHistoryControls();
      }
      updateLinkedSource(linkedGantt, converted.ganttSource, "gantt", "Synchronize schedule from linked WBS");
      if (
        JSON.stringify(converted.links) !== JSON.stringify(linkedGantt.wbsGanttLinks) ||
        JSON.stringify(converted.dependencies) !== JSON.stringify(linkedGantt.wbsGanttDependencies)
      )
        tabControls.updateDocumentFormat(linkedGantt.id, {
          wbsGanttLinks: converted.links,
          wbsGanttDependencies: converted.dependencies,
        });
      if (converted.warnings.length) setInteractionMessage(converted.warnings.join(" "));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    activeHistory,
    setInteractionMessage,
    linkedGantt,
    refreshHistoryControls,
    updateLinkedSource,
    wbsDocument.diagnostics,
    workspace.diagramKind,
    workspace.source,
  ]);
  const symbolProvider = useMemo(
    () =>
      createSemanticSymbolProvider({
        diagramKind: workspace.diagramKind,
        source: workspace.source,
        gantt: parseResult.document,
        sequence: sequenceDocument,
        useCase: useCaseDocument,
        classDiagram: classDocument,
        activity: activityDocument,
        wbs: wbsDocument,
      }),
    [
      activityDocument,
      classDocument,
      parseResult.document,
      sequenceDocument,
      useCaseDocument,
      wbsDocument,
      workspace.diagramKind,
      workspace.source,
    ],
  );
  const symbolOccurrences = symbolProvider.occurrences;
  const symbolHighlights = useMemo(
    () =>
      sourceSymbol
        ? symbolOccurrences
            .filter((item) => item.kind === sourceSymbol.kind && item.key === sourceSymbol.key)
            .map((item) => ({
              ...item.range,
              active:
                sourceSymbolPosition !== undefined &&
                sourceSymbolPosition >= item.range.from &&
                sourceSymbolPosition <= item.range.to,
            }))
        : [],
    [sourceSymbol, sourceSymbolPosition, symbolOccurrences],
  );
  const symbolAt = symbolProvider.occurrenceAt;
  const requestSymbolRename = useCallback(
    (position: number) => {
      const occurrence = symbolAt(position);
      if (!occurrence) return false;
      const request = symbolProvider.renameRequest(occurrence);
      if (!request) return false;
      const active = document.activeElement;
      if (active instanceof HTMLElement || active instanceof SVGElement) renameReturnFocus.current = active;
      setRenameSymbol(request);
      return true;
    },
    [symbolAt, symbolProvider],
  );
  const occurrencesFor = useCallback(
    (symbol: Pick<SemanticSymbolOccurrence, "kind" | "key">) => symbolProvider.occurrencesFor(symbol),
    [symbolProvider],
  );
  const navigateOccurrence = useCallback(
    (occurrence: SemanticSymbolOccurrence, direction: -1 | 1) => {
      const occurrences = occurrencesFor(occurrence);
      const currentIndex = occurrences.findIndex(
        (item) => item.range.from === occurrence.range.from && item.range.to === occurrence.range.to,
      );
      const next = occurrences[(Math.max(0, currentIndex) + direction + occurrences.length) % occurrences.length];
      if (next) {
        if (viewMode === "diagram") selectViewMode("split");
        setSelectionRequest({ ...next.range });
      }
    },
    [occurrencesFor, selectViewMode, viewMode],
  );
  // Preview notices ask for a source line (e.g. a syntax error) without knowing which view is open.
  useEffect(() => {
    const reveal = (event: Event) => {
      const line = (event as CustomEvent<{ line?: number }>).detail?.line;
      const lines = workspace.source.split("\n");
      if (!line || line < 1 || line > lines.length) return;
      const from = lines.slice(0, line - 1).reduce((offset, text) => offset + text.length + 1, 0);
      if (viewMode === "diagram") selectViewMode("split");
      setSelectionRequest({ from, to: from + lines[line - 1]!.length });
    };
    window.addEventListener("reveal-source-line", reveal);
    return () => window.removeEventListener("reveal-source-line", reveal);
  }, [selectViewMode, viewMode, workspace.source]);
  const diagramOccurrenceForTarget = useCallback(
    (target: Element): SemanticSymbolOccurrence | undefined => {
      const closestValue = (attribute: string) => target.closest(`[${attribute}]`)?.getAttribute(attribute);
      if (target instanceof SVGTextElement) {
        const text = target.textContent?.trim().replace(/^\{|\}$/g, "");
        const person = text
          ? symbolOccurrences.find(
              (item) => item.kind === "person" && item.value.toLocaleLowerCase() === text.toLocaleLowerCase(),
            )
          : undefined;
        if (person) return person;
      }
      const candidates: Array<{ kind: SemanticSymbolOccurrence["kind"]; key: string | null | undefined }> = [
        { kind: "task", key: closestValue("data-task-id") ?? closestValue("data-visual-task-id") },
        { kind: "participant", key: closestValue("data-sequence-participant-id") },
        {
          kind:
            closestValue("data-usecase-object-type") === "package" ||
            closestValue("data-usecase-object-type") === "rectangle"
              ? "usecase-package"
              : closestValue("data-usecase-object-type") === "actor"
                ? "actor"
                : "usecase",
          key: closestValue("data-usecase-object-id"),
        },
        {
          kind: closestValue("data-class-object-type") === "package" ? "class-package" : "class-entity",
          key: closestValue("data-class-object-id"),
        },
        {
          kind: closestValue("data-activity-object-type") === "action" ? "activity-action" : "activity-partition",
          key: closestValue("data-activity-object-id"),
        },
        { kind: "wbs-node", key: closestValue("data-wbs-node-id") },
      ];
      for (const candidate of candidates) {
        if (!candidate.key) continue;
        const occurrence = symbolOccurrences.find(
          (item) => item.kind === candidate.kind && item.key === candidate.key && item.role === "declaration",
        );
        if (occurrence) return occurrence;
      }
      return undefined;
    },
    [symbolOccurrences],
  );
  const openDiagramSymbolMenu = useCallback(
    (target: Element, x: number, y: number) => {
      const occurrence = diagramOccurrenceForTarget(target);
      if (!occurrence) return false;
      const focusTarget = target.closest<HTMLElement | SVGElement>("[tabindex], button");
      if (focusTarget) {
        lastDiagramFocus.current = focusTarget;
        lastDiagramFocusSelector.current = diagramFocusSelector(target);
        renameReturnFocus.current = focusTarget;
      }
      const bounds = target.getBoundingClientRect();
      setSymbolMenu({
        occurrence,
        x: x || bounds.left + Math.min(24, bounds.width / 2),
        y: y || bounds.top + Math.min(24, bounds.height),
      });
      return true;
    },
    [diagramOccurrenceForTarget],
  );
  const openClassMemberMenu = useCallback((target: Element, x: number, y: number) => {
    const element = target.closest("[data-class-member-id]");
    const memberId = element?.getAttribute("data-class-member-id");
    const entityId = element?.getAttribute("data-class-object-id");
    if (!element || !memberId || !entityId) return false;
    const bounds = element.getBoundingClientRect();
    setClassMemberMenu({
      entityId,
      memberId,
      x: x || bounds.left + Math.min(24, bounds.width / 2),
      y: y || bounds.top + Math.min(24, bounds.height),
    });
    return true;
  }, []);
  const reportFileError = useCallback(
    (error: unknown) => {
      setInteractionMessage(error instanceof Error ? error.message : "File operation failed");
    },
    [setInteractionMessage],
  );
  const recordDocumentVersionRef = useRef<RecordDocumentVersion | undefined>(undefined);
  const recordCollaborationVersion = useCallback<RecordDocumentVersion>((reason, label, override) => {
    if (!recordDocumentVersionRef.current) return Promise.reject(new Error("Version history is not ready"));
    return recordDocumentVersionRef.current(reason, label, override);
  }, []);
  const documentCollaborationBridge = useRef<CollaborationDocumentBridge | undefined>(undefined);
  const defaultCollaborationEndpoint =
    storageGet("plantuml-studio.collaboration-server") ??
    import.meta.env.VITE_COLLABORATION_URL ??
    "https://collaboration.plantuml.brosenius.se";
  const {
    collaboration,
    collaborationAppliesToActiveDiagram,
    activeParticipants,
    pendingCollaboration,
    remoteEditFlash,
    collaborationDialogOpen,
    setCollaborationDialogOpen,
    startCollaboration,
    rotateCollaborationRoom,
    leaveCollaboration,
    updateSelection: updateCollaborationSelection,
  } = useCollaborationLifecycle({
    hydrated,
    onboarded: tabs.session.onboarded,
    defaultEndpoint: defaultCollaborationEndpoint,
    documentBridge: documentCollaborationBridge,
    workspace,
    tabs,
    recordDocumentVersion: recordCollaborationVersion,
    reportError: reportFileError,
    setInteractionMessage,
  });
  useEffect(() => {
    if (!hydrated || startupSplashShown.current) return;
    if (!tabs.session.onboarded) tabs.setOnboarded();
    startupSplashShown.current = true;
    if (collaborationLinkDetails(window.location.href).roomId) return;
    const policy = startupChooserPolicy(tabs.session);
    if (policy) openDialog({ kind: "new-document", replaceActiveDocument: policy === "replace-welcome" });
  }, [hydrated, openDialog, tabs]);
  useEffect(() => {
    if (workspace.diagramKind !== "wbs") closeDialog("add-wbs-node");
  }, [closeDialog, workspace.diagramKind]);
  const {
    selectedObjectId: selectedActivityObjectId,
    sourceHighlightedId: sourceHighlightedActivityId,
    settingsOpen: activitySettingsOpen,
    selectedAction: selectedActivityAction,
    selectedTerminal: selectedActivityTerminal,
    selectedPartition: selectedActivityPartition,
    selectedNote: selectedActivityNote,
    selectedControl: selectedActivityControl,
    selectedArrow: selectedActivityArrow,
    setSourceHighlightedId: setSourceHighlightedActivityId,
    clearSelection: clearSelectedActivityObject,
    closeSettings: closeActivitySettings,
    openSettingsFromToolbar: openActivitySettingsFromToolbar,
    selectObject: selectActivityObject,
    selectFromSource: selectActivityFromSource,
    dismissInspector: dismissActivityInspector,
  } = useActivityController(workspace.diagramKind, activityDocument, tabs.activeId);
  const revealClassSource = useCallback((range: { from: number; to: number }) => setSelectionRequest({ ...range }), []);
  const {
    selectedObjectId: selectedClassObjectId,
    sourceHighlightedEntityId: sourceHighlightedClassEntityId,
    sourceHighlightedMemberId: sourceHighlightedClassMemberId,
    settingsOpen: classSettingsOpen,
    selectedEntity: selectedClassEntity,
    selectedRelationship: selectedClassRelationship,
    selectedPackage: selectedClassPackage,
    selectedNote: selectedClassNote,
    setSelectedObjectId: setSelectedClassObjectId,
    setSourceHighlightedEntityId: setSourceHighlightedClassEntityId,
    clearSelection: clearSelectedClassObject,
    closeSettings: closeClassSettings,
    openSettingsFromToolbar: openClassSettingsFromToolbar,
    selectObject: selectClassObject,
    selectMember: selectClassMember,
    selectFromSource: selectClassFromSource,
    dismissInspector: dismissClassInspector,
  } = useClassController(workspace.diagramKind, classDocument, revealClassSource);
  const sequenceStructures = useMemo(
    () => [
      ...sequenceDocument.fragments,
      ...sequenceDocument.activations,
      ...sequenceDocument.notes,
      ...sequenceDocument.timelineItems,
      ...sequenceDocument.references,
      ...sequenceDocument.boxes,
      ...sequenceDocument.autonumbers,
      ...sequenceDocument.creations,
      ...sequenceDocument.durations,
    ],
    [sequenceDocument],
  );
  const revealSequenceSource = useCallback(
    (range: { from: number; to: number }) => setSelectionRequest({ ...range }),
    [],
  );
  const {
    selectedParticipantId: selectedSequenceParticipantId,
    selectedMessageId: selectedSequenceMessageId,
    selectedStructureId: selectedSequenceStructureId,
    sourceHighlightedParticipantId: sourceHighlightedSequenceParticipantId,
    settingsOpen: sequenceSettingsOpen,
    selectedParticipant: selectedSequenceParticipant,
    selectedMessage: selectedSequenceMessage,
    selectedStructure: selectedSequenceStructure,
    setSourceHighlightedParticipantId: setSourceHighlightedSequenceParticipantId,
    setSelectedParticipantId: setSelectedSequenceParticipantId,
    setSelectedMessageId: setSelectedSequenceMessageId,
    setSelectedStructureId: setSelectedSequenceStructureId,
    selectParticipant: selectSequenceParticipant,
    selectMessage: selectSequenceMessage,
    selectStructure: selectSequenceStructure,
    clearSelection: clearSequenceSelection,
    closeSettings: closeSequenceSettings,
    openSettings: openSequenceSettings,
    dismissInspector: dismissSequenceInspector,
    resetTransientSelection: resetTransientSequenceSelection,
  } = useSequenceController(workspace.diagramKind, sequenceDocument, sequenceStructures, revealSequenceSource);
  const {
    selectedObjectId: selectedUseCaseObjectId,
    sourceHighlightedId: sourceHighlightedUseCaseId,
    settingsOpen: useCaseSettingsOpen,
    selectedElement: selectedUseCaseElement,
    selectedRelationship: selectedUseCaseRelationship,
    selectedPackage: selectedUseCasePackage,
    selectedNote: selectedUseCaseNote,
    setSourceHighlightedId: setSourceHighlightedUseCaseId,
    clearSelection: clearSelectedUseCaseObject,
    closeSettings: closeUseCaseSettings,
    openSettingsFromToolbar: openUseCaseSettingsFromToolbar,
    selectObject: selectUseCaseObject,
    selectFromSource: selectUseCaseFromSource,
    dismissInspector: dismissUseCaseInspector,
  } = useUseCaseController(workspace.diagramKind, useCaseDocument);
  const sequenceParticipantNames = [
    ...new Set([
      ...sequenceDocument.participants.map((participant) => participant.alias ?? participant.label),
      ...sequenceDocument.creations.map((creation) => creation.participant),
    ]),
  ];
  const sequenceMessageAnchors = sequenceDocument.messages.flatMap((message) =>
    message.anchor ? [message.anchor] : [],
  );
  // Diagnostics and repairs only describe the source, so a keystroke paints before they are recomputed.
  const liveAnalysisInput = useMemo(
    () => ({ kind: workspace.diagramKind, source: workspace.source, gantt: ganttParse }),
    [workspace.diagramKind, workspace.source, ganttParse],
  );
  const analysisInput = useDeferredValue(liveAnalysisInput);
  const diagramAnalysis = useMemo(
    () =>
      analyzeSource(
        analysisInput.kind,
        analysisInput.source,
        analysisInput.kind === "gantt" ? analysisInput.gantt : undefined,
      ),
    [analyzeSource, analysisInput],
  );
  const activeDiagnostics = diagramAnalysis.diagnostics;
  const activeQuickFixes = diagramAnalysis.quickFixes;
  const diagnosticCount = activeDiagnostics.length;
  const preservedSyntax =
    workspace.diagramKind === "gantt"
      ? parseResult.document.unknown
      : workspace.diagramKind === "usecase"
        ? useCaseDocument.unknown
        : workspace.diagramKind === "class" || workspace.diagramKind === "component"
          ? classDocument.unknown
          : workspace.diagramKind === "activity"
            ? activityDocument.unknown
            : workspace.diagramKind === "wbs"
              ? wbsDocument.unknown
              : [];
  const unsupportedCount = preservedSyntax.length;
  const selectedTask = selectedTaskId ? parseResult.document.symbols.tasks.get(selectedTaskId) : undefined;
  // Tasks added to the selection with Shift or Ctrl/⌘-click, after the primary `selectedTaskId`.
  const [extraSelectedTaskIds, setExtraSelectedTaskIds] = useState<string[]>([]);
  const selectedTaskIds = useMemo(
    () =>
      selectedTaskId && workspace.diagramKind === "gantt"
        ? [
            selectedTaskId,
            ...extraSelectedTaskIds.filter((id) => id !== selectedTaskId && parseResult.document.symbols.tasks.has(id)),
          ]
        : [],
    [extraSelectedTaskIds, parseResult.document.symbols.tasks, selectedTaskId, workspace.diagramKind],
  );
  const multipleTasksSelected = selectedTaskIds.length > 1;
  useEffect(() => {
    if (!selectedTaskId) setExtraSelectedTaskIds([]);
  }, [selectedTaskId]);
  useEffect(() => setExtraSelectedTaskIds([]), [tabs.activeId]);
  const taskClipboard = useRef<string | undefined>(undefined);
  const selectedTaskDependency = selectedTask
    ? parseResult.document.dependencies.find((item) => item.successorTaskId === selectedTask.id)
    : undefined;
  const selectedPredecessorId = selectedTaskDependency?.predecessorTaskId ?? "";
  const selectedDependency =
    selectedDependencyIndex === undefined ? undefined : parseResult.document.dependencies[selectedDependencyIndex];
  const resourceNames = useMemo(
    () =>
      [...new Set(parseResult.document.tasks.flatMap((task) => (task.resources ?? []).map((item) => item.value)))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [parseResult.document.tasks],
  );
  const selectedResourceConflicts = useMemo(
    () => (selectedTask ? findResourceConflicts(selectedTask, parseResult.document.tasks) : []),
    [selectedTask, parseResult.document.tasks],
  );
  const ganttCalendar = useMemo(
    () => ganttAnalysisContext(activeGanttSource, parseResult).calendar,
    [activeGanttSource, parseResult],
  );
  // With a forecast enabled, `today` in the source resolves in the forecast time zone like its status date.
  const [reportsOpen, setReportsOpen] = useState(false);
  const [reportsSuspended, setReportsSuspended] = useState(false);
  const [reportResource, setReportResource] = useState<string>();
  const [reportCoordinator, setReportCoordinator] = useState(false);
  const openReports = useCallback(() => {
    setReportResource(undefined);
    setReportCoordinator(false);
    setReportsSuspended(false);
    setReportsOpen(true);
  }, []);
  const planTimeZone = activeDocument.progressForecast?.enabled
    ? (activeDocument.progressForecast.timeZone ?? "UTC")
    : undefined;
  const useCaseInspectorSettings = useInspectorSettings(useCaseSettingsOpen, workspace.source, parseUseCaseSettings);
  const classInspectorSettings = useInspectorSettings(classSettingsOpen, workspace.source, parseClassSettings);
  const activityInspectorSettings = useInspectorSettings(activitySettingsOpen, workspace.source, parseActivitySettings);
  const sequenceInspectorSettings = useInspectorSettings(sequenceSettingsOpen, workspace.source, parseSequenceSettings);
  const resolvedTaskDates = useMemo(() => {
    return ganttAnalysisContext(activeGanttSource, parseResult, planTimeZone).dates;
  }, [activeGanttSource, parseResult, planTimeZone]);
  const resourceOverAllocations = useMemo(
    () =>
      buildResourceOverAllocations(parseResult.document.tasks, resourceCapacities, resolvedTaskDates, ganttCalendar),
    [ganttCalendar, parseResult.document.tasks, resourceCapacities, resolvedTaskDates],
  );
  const legendEntries = useMemo(() => {
    const labels = new Map(
      parseLegendEntries(workspace.source).map((entry) => [entry.color.toLowerCase(), entry.label]),
    );
    return usedLegendColors(parseResult.document.tasks).map((color) => ({
      color,
      label: labels.get(color.toLowerCase()) ?? color,
    }));
  }, [parseResult.document.tasks, workspace.source]);

  const legendReadOnly = collaborationAppliesToActiveDiagram && collaboration?.role === "viewer";
  useEffect(() => {
    if (workspace.diagramKind !== "gantt" || legendReadOnly) return;
    const timer = window.setTimeout(() => {
      const next = parseProjectSettings(workspace.source).showLegend
        ? synchronizeLegend(workspace.source, parseResult.document.tasks)
        : removeLegend(workspace.source);
      // Fold the legend into the edit that changed the colours, so undo and redo treat them as one step.
      // Sources that were only opened, or reached by undo, are left as they are.
      if (next === workspace.source || !activeHistory.amendLast(workspace.source, next)) return;
      setWorkspace((current) => ({ ...current, source: next, dirty: true }));
      refreshHistoryControls();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    activeHistory,
    legendReadOnly,
    parseResult.document.tasks,
    refreshHistoryControls,
    setWorkspace,
    workspace.diagramKind,
    workspace.source,
  ]);
  const openSourceBytes = useMemo(
    () => tabs.documents.reduce((total, document) => total + document.source.length * 2, 0),
    [tabs.documents],
  );

  useEffect(() => {
    if (!mobileRevealActive || mobileListActive || status !== "idle" || result?.source !== workspace.source) return;
    const frame = requestAnimationFrame(() => {
      const attribute = mobileRevealActive.kind === "gantt" ? "data-task-id" : "data-wbs-node-id";
      workspaceElement.current
        ?.querySelector(`[${attribute}="${CSS.escape(mobileRevealActive.id)}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
      workspaceElement.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [mobileRevealActive, mobileListActive, status, result?.source, workspace.source]);

  useEffect(() => {
    setSourceHighlightedTaskId(undefined);
    setSourceSymbol(undefined);
    setSourceSymbolPosition(undefined);
    setRenameSymbol(undefined);
    setReferenceSymbol(undefined);
  }, [setSourceHighlightedTaskId, tabs.activeId, workspace.diagramKind]);

  useEffect(() => {
    // The code editor (and its onCursorChange handler) is unmounted in diagram-only view, so
    // sourceHighlightedTaskId would otherwise stay frozen at whatever task the cursor was in
    // last time the editor was visible. DiagramPreview prefers that highlight over a task
    // clicked directly in the diagram, which silently pinned the anchor/selection markers to
    // a stale task and made connection handles unclickable. Clear it once the editor is gone.
    if (viewMode === "diagram") setSourceHighlightedTaskId(undefined);
  }, [setSourceHighlightedTaskId, viewMode]);

  useEffect(() => {
    if (!hydrated || pendingProjectWbsSelection?.tabId === tabs.activeId) return;
    const lines = workspace.source.split(/\n/);
    const lineIndex = Math.min(Math.max(0, workspace.cursor.line - 1), lines.length - 1);
    let position = 0;
    for (let index = 0; index < lineIndex; index += 1) position += (lines[index]?.length ?? 0) + 1;
    position += Math.min(Math.max(0, workspace.cursor.column - 1), lines[lineIndex]?.length ?? 0);
    setSelectionRequest({ from: position, to: position });
    // Restore the saved cursor only when hydration or the active tab changes; source edits must not steal selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, tabs.activeId]);

  const releaseDocumentResources = useCallback((id: string) => {
    fileHandles.current.delete(id);
    fileSnapshots.current.delete(id);
    externalCheckSnoozedUntil.current.delete(id);
  }, []);
  const retainDocumentResources = useCallback((id: string) => {
    for (const documentId of [...fileHandles.current.keys()]) {
      if (documentId === id) continue;
      fileHandles.current.delete(documentId);
      fileSnapshots.current.delete(documentId);
      externalCheckSnoozedUntil.current.delete(documentId);
    }
  }, []);
  const resetTransientDocumentSelection = useCallback(() => {
    resetTransientTabSelection();
    resetTransientSequenceSelection();
  }, [resetTransientSequenceSelection, resetTransientTabSelection]);
  const { activateTab, closeTab, duplicateTab, closeOtherTabs, rememberSelectedTask } = useDocumentTabLifecycle({
    tabs,
    selectedTaskId,
    setSelectedTaskId,
    resetTransientSelection: resetTransientDocumentSelection,
    removeHistory,
    retainHistories,
    releaseDocumentResources,
    retainDocumentResources,
    closeTabMenu: () => setTabMenu(undefined),
    openNewDocumentDialog: () => {
      openNewDocumentDialog(true);
    },
    setInteractionMessage,
  });

  const tabLabels = useMemo(() => {
    return documentDisplayNames(tabs.documents);
  }, [tabs.documents]);

  useEffect(() => {
    if (!tabMenu) return;
    const dismiss = () => setTabMenu(undefined);
    document.querySelector<HTMLButtonElement>('[aria-label="Tab actions"] [role="menuitem"]:not(:disabled)')?.focus();
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [tabMenu]);

  useEffect(() => {
    if (!symbolMenu) return;
    const dismiss = () => setSymbolMenu(undefined);
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [symbolMenu]);

  const clearDiagramMultiSelection = useRef<() => void>(() => {});
  const dismissPropertyInspectors = useCallback(() => {
    dismissInspectorSelection();
    dismissSequenceInspector();
    dismissUseCaseInspector();
    dismissClassInspector();
    dismissActivityInspector();
    setFocusNoteTaskId(undefined);
  }, [
    dismissActivityInspector,
    dismissClassInspector,
    dismissInspectorSelection,
    dismissSequenceInspector,
    dismissUseCaseInspector,
    setFocusNoteTaskId,
  ]);

  const prepareUtilityPanel = useCallback(() => {
    if (!requestSidePanelChange()) return false;
    dismissPropertyInspectors();
    setLegendInspectorOpen(false);
    setLegendFocusColor(undefined);
    setExtraSelectedTaskIds([]);
    clearDiagramMultiSelection.current();
    clearSelectedWbsNode();
    clearSelectedWbsRelationship();
    closeWbsSettings();
    setProjectNavigatorOpen(false);
    return true;
  }, [
    dismissPropertyInspectors,
    clearSelectedWbsNode,
    clearSelectedWbsRelationship,
    closeWbsSettings,
    setLegendInspectorOpen,
    setLegendFocusColor,
  ]);
  const openTasksView = useCallback(() => {
    if (!requestSidePanelChange()) return;
    setTaskTableInspector(false);
    setTaskTablePane("table");
    setTaskViewDocument(tabs.activeId);
  }, [tabs.activeId]);
  const propertySelections = [
    selectedTaskId,
    selectedDependencyIndex,
    selectedDividerIndex,
    selectedVerticalSeparatorIndex,
    selectedSequenceParticipantId,
    selectedSequenceMessageId,
    selectedSequenceStructureId,
    selectedUseCaseObjectId,
    selectedClassObjectId,
    selectedActivityObjectId,
    selectedWbsNodeId,
    selectedWbsRelationshipId,
    sequenceSettingsOpen || undefined,
    useCaseSettingsOpen || undefined,
    classSettingsOpen || undefined,
    activitySettingsOpen || undefined,
    wbsSettingsOpen || undefined,
    legendInspectorOpen || undefined,
  ];
  const propertySelection = propertySelections.some((value) => value !== undefined)
    ? JSON.stringify(propertySelections)
    : undefined;
  const {
    projectInspectorOpen,
    setProjectInspectorOpen,
    resourcePanelOpen,
    setResourcePanelOpen,
    problemsOpen,
    setProblemsOpen,
    unsupportedOpen,
    setUnsupportedOpen,
  } = useSidePanelState(workspace.diagramKind, propertySelection, prepareUtilityPanel);
  const dismissAllInspectors = useCallback(() => {
    dismissPropertyInspectors();
    setProjectInspectorOpen(false);
  }, [dismissPropertyInspectors, setProjectInspectorOpen]);

  const showDocumentNavigator = useCallback(() => {
    dismissAllInspectors();
    clearSelectedWbsNode();
    clearSelectedWbsRelationship();
    closeWbsSettings();
    setResourcePanelOpen(false);
    setUnsupportedOpen(false);
    setProblemsOpen(false);
    setProjectNavigatorOpen(true);
  }, [
    dismissAllInspectors,
    clearSelectedWbsNode,
    clearSelectedWbsRelationship,
    closeWbsSettings,
    setResourcePanelOpen,
    setProblemsOpen,
    setUnsupportedOpen,
  ]);

  useEffect(() => {
    if (
      !selectedTaskId &&
      selectedDependencyIndex === undefined &&
      selectedDividerIndex === undefined &&
      selectedVerticalSeparatorIndex === undefined &&
      !selectedSequenceParticipantId &&
      !selectedSequenceMessageId &&
      !selectedSequenceStructureId &&
      !selectedUseCaseObjectId &&
      !selectedClassObjectId &&
      !selectedActivityObjectId &&
      !projectInspectorOpen &&
      !useCaseSettingsOpen &&
      !classSettingsOpen &&
      !activitySettingsOpen
    )
      return;
    const dismissInspector = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof Element && target.closest(".task-inspector")) return;
      if (event.composedPath().some((item) => item instanceof Element && item.matches(".task-inspector"))) return;
      // View-only controls (fit, zoom) adjust the view around the selection and must not dismiss its inspector.
      const inspectorTrigger =
        "[data-inspector-trigger], [data-view-control], [data-task-id], [data-dependency-index], [data-divider-index], [data-vertical-separator-index], [data-sequence-participant-id], [data-sequence-message-id], [data-sequence-message-endpoint], [data-sequence-structure-id], [data-sequence-structure-endpoint], [data-usecase-object-id], [data-usecase-connect-from], [data-usecase-move-id], [data-usecase-relationship-endpoint], [data-class-object-id], [data-class-connect-from], [data-activity-object-id], [data-wbs-node-id], [data-wbs-connect-from], [data-wbs-relationship-id], [data-wbs-relationship-endpoint]";
      if (target instanceof Element && target.closest(inspectorTrigger)) return;
      if (event.composedPath().some((item) => item instanceof Element && item.matches(inspectorTrigger))) return;
      dismissAllInspectors();
    };
    document.addEventListener("click", dismissInspector);
    return () => document.removeEventListener("click", dismissInspector);
  }, [
    projectInspectorOpen,
    useCaseSettingsOpen,
    selectedDependencyIndex,
    selectedDividerIndex,
    selectedSequenceMessageId,
    selectedSequenceParticipantId,
    selectedSequenceStructureId,
    selectedUseCaseObjectId,
    selectedClassObjectId,
    selectedActivityObjectId,
    classSettingsOpen,
    activitySettingsOpen,
    dismissAllInspectors,
    selectedTaskId,
    selectedVerticalSeparatorIndex,
  ]);

  const selectTask = (taskId: string) => {
    const task = parseResult.document.symbols.tasks.get(taskId);
    if (!task) return;
    setExtraSelectedTaskIds([]);
    setResourcePanelOpen(false);
    setProjectInspectorOpen(false);
    setSelectedTaskId(task.id);
    setSelectedDividerIndex(undefined);
    setFocusNoteTaskId(undefined);
    rememberSelectedTask(task.id);
    const declaration = task.declarations[0];
    setSelectionRequest(declaration ? { ...declaration.range } : { ...task.sourceRange });
  };

  /** Shift or Ctrl/⌘-click: adds a task to, or removes it from, the multi-task selection. */
  const toggleTaskSelection = (taskId: string) => {
    if (!parseResult.document.symbols.tasks.has(taskId)) return;
    if (!selectedTaskId) {
      selectTask(taskId);
      return;
    }
    if (taskId === selectedTaskId) {
      const [next, ...rest] = selectedTaskIds.slice(1);
      if (!next) return;
      selectTask(next);
      setExtraSelectedTaskIds(rest);
      return;
    }
    setExtraSelectedTaskIds((current) =>
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId],
    );
  };
  const applyBulkTaskChange = (verb: string, result: BulkTaskResult, keepSelection = true) => {
    if (result.applied.length && !commitGeneratedSource(result.source, `${verb} ${result.applied.length} tasks`))
      return;
    if (!keepSelection) setSelectedTaskId(undefined);
    setInteractionMessage(describeBulkResult(verb, result));
  };
  const copySelectedTasks = () => {
    const text = copyTasksText(workspace.source, selectedTaskIds);
    if (!text) return;
    taskClipboard.current = text;
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    setInteractionMessage(
      `Copied ${selectedTaskIds.length} task${selectedTaskIds.length === 1 ? "" : "s"} · paste with Ctrl/⌘+V in a Gantt chart`,
    );
  };
  const pasteCopiedTasks = () => {
    const text = taskClipboard.current;
    if (!text || workspace.diagramKind !== "gantt") return;
    const pasted = pasteTasksText(workspace.source, text);
    if (!pasted.taskIds.length || !commitGeneratedSource(pasted.source, `Paste ${pasted.taskIds.length} tasks`)) return;
    setSelectedTaskId(pasted.taskIds[0]);
    setExtraSelectedTaskIds(pasted.taskIds.slice(1));
    setInteractionMessage(`Pasted ${pasted.taskIds.length} task${pasted.taskIds.length === 1 ? "" : "s"}`);
  };
  const duplicateSelectedTasks = () => {
    const result = duplicateTasks(workspace.source, selectedTaskIds);
    if (!result.copies.length) {
      setInteractionMessage(describeBulkResult("Duplicated", result));
      return;
    }
    if (!commitGeneratedSource(result.source, `Duplicate ${result.copies.length} tasks`)) return;
    setSelectedTaskId(result.copies[0]);
    setExtraSelectedTaskIds(result.copies.slice(1));
    setInteractionMessage(describeBulkResult("Duplicated", result));
  };

  // Read by the window shortcut handler, which is not re-subscribed on every render.
  const taskShortcuts = useRef({ selectedTaskIds, copySelectedTasks, pasteCopiedTasks, duplicateSelectedTasks });
  taskShortcuts.current = { selectedTaskIds, copySelectedTasks, pasteCopiedTasks, duplicateSelectedTasks };

  const outlineVisible = dialog?.kind === "diagram-outline" || outlineMode !== undefined;
  const { diagramOutlineEntries } = useDiagramOutlineEntries({
    activityDocument,
    classDocument,
    outlineVisible,
    parseResult,
    sequenceDocument,
    sequenceStructures,
    symbolOccurrences,
    useCaseDocument,
    wbsDocument,
    workspace,
  });

  const revealOutlineOccurrence = (occurrence: SemanticSymbolOccurrence, showSource = true) => {
    if (showSource && viewMode === "diagram") update("viewMode", "split");
    setSourceSymbol({ kind: occurrence.kind, key: occurrence.key });
    setSourceSymbolPosition(occurrence.range.from);
    setSelectionRequest({ ...occurrence.range });
    switch (occurrence.kind) {
      case "task":
        selectTask(occurrence.key);
        break;
      case "participant":
        selectSequenceParticipant(occurrence.key);
        break;
      case "actor":
      case "usecase":
      case "usecase-package":
        selectUseCaseObject(occurrence.key);
        break;
      case "class-entity":
      case "class-package":
        selectClassObject(occurrence.key);
        break;
      case "activity-action":
      case "activity-partition":
        selectActivityObject(occurrence.key);
        break;
      case "wbs-node":
        selectWbsNode(occurrence.key);
        break;
    }
  };

  const revealOutlineEntry = (entry: DiagramOutlineEntry, showSource = true) => {
    setOutlineReveal({ entry });
    if (showSource && viewMode === "diagram") update("viewMode", "split");
    setSelectionRequest({ ...entry.range });
    switch (entry.target.type) {
      case "semantic":
        revealOutlineOccurrence(entry.target.occurrence, showSource);
        break;
      case "gantt-dependency":
        setSelectedTaskId(undefined);
        setSelectedDividerIndex(undefined);
        setSelectedVerticalSeparatorIndex(undefined);
        setSelectedDependencyIndex(entry.target.index);
        break;
      case "gantt-divider":
        setSelectedTaskId(undefined);
        setSelectedDependencyIndex(undefined);
        setSelectedVerticalSeparatorIndex(undefined);
        setSelectedDividerIndex(entry.target.index);
        break;
      case "gantt-separator":
        setSelectedTaskId(undefined);
        setSelectedDependencyIndex(undefined);
        setSelectedDividerIndex(undefined);
        setSelectedVerticalSeparatorIndex(entry.target.index);
        break;
      case "sequence-message":
        selectSequenceMessage(entry.target.id);
        break;
      case "sequence-structure":
        selectSequenceStructure(entry.target.id);
        break;
      case "usecase-object":
        selectUseCaseObject(entry.target.id);
        break;
      case "class-object":
        selectClassObject(entry.target.id);
        break;
      case "activity-object":
        selectActivityObject(entry.target.id);
        break;
      case "wbs-relationship":
        selectWbsRelationship(entry.target.id);
        break;
    }
  };

  const openProjectInspector = useCallback(() => setProjectInspectorOpen(true), [setProjectInspectorOpen]);

  const openDateActionMenu = useCallback(
    (date: string) => {
      setSelectedTaskId(undefined);
      setSelectedDependencyIndex(undefined);
      setProjectInspectorOpen(false);
      setResourcePanelOpen(false);
      setDateMenuFor(date);
    },
    [setDateMenuFor, setProjectInspectorOpen, setResourcePanelOpen, setSelectedDependencyIndex, setSelectedTaskId],
  );

  const openResourcePanel = useCallback(() => setResourcePanelOpen(true), [setResourcePanelOpen]);

  const activeZoomDocumentId = tabs.activeId;
  const updateZoomMetadata = tabs.updateDocumentFormat;
  const getNavigationDocument = tabs.getDocument;
  const saveDiagramScroll = useCallback(
    (scroll: { left: number; top: number }, flushRecovery = false) => {
      const previous = getNavigationDocument(activeZoomDocumentId)?.diagramScroll;
      if (!flushRecovery && (previous?.left ?? 0) === scroll.left && (previous?.top ?? 0) === scroll.top) return;
      updateZoomMetadata(activeZoomDocumentId, { diagramScroll: scroll }, flushRecovery);
    },
    [activeZoomDocumentId, updateZoomMetadata, getNavigationDocument],
  );
  const update = useCallback(
    <K extends keyof typeof workspace>(key: K, value: (typeof workspace)[K]) => {
      if (key === "viewMode") {
        selectViewMode(value as ViewMode);
        return;
      }
      if (key === "zoom") {
        updateZoomMetadata(activeZoomDocumentId, { zoom: value as number, zoomInitialized: true });
        return;
      }
      setWorkspace((current) => ({ ...current, [key]: value }));
    },
    [setWorkspace, selectViewMode, activeZoomDocumentId, updateZoomMetadata],
  );

  const viewModes = useMemo(
    () => (narrow ? ["code", "diagram"] : ["code", "split", "diagram", "stage"]) as ViewMode[],
    [narrow],
  );

  const { commitSource, commitGeneratedSource, undo, redo } = useSourceCommands({
    source: workspace.source,
    diagramKind: workspace.diagramKind,
    readOnly: collaborationAppliesToActiveDiagram && collaboration?.role === "viewer",
    history: activeHistory,
    setWorkspace,
    setInteractionMessage,
    setProblemPreview,
    setProblemsOpen,
    captureBeforeCommit,
    refreshHistoryControls,
    onForecastHistoryChange: (value, previous) => {
      const current = tabs.getDocument(tabs.activeId)?.progressForecast ?? value;
      if (!current) return;
      const remainingDays = { ...current.remainingDays };
      for (const id of new Set([
        ...Object.keys(value?.remainingDays ?? {}),
        ...Object.keys(previous?.remainingDays ?? {}),
      ])) {
        if (value?.remainingDays[id] === previous?.remainingDays[id]) continue;
        const days = value?.remainingDays[id];
        if (days === undefined) delete remainingDays[id];
        else remainingDays[id] = days;
      }
      tabs.updateDocumentFormat(tabs.activeId, { progressForecast: { ...current, remainingDays }, dirty: true });
    },
  });
  const commitLinkedGanttSchedule = useCallback(
    (nextSource: string, description: string) =>
      commitGeneratedSource(linkedWbs ? ensureLinkedGanttProjectStart(nextSource) : nextSource, description),
    [commitGeneratedSource, linkedWbs],
  );

  const {
    versionHistoryOpen,
    setVersionHistoryOpen,
    documentVersions,
    baselineVersion,
    setBaseline,
    clearBaseline,
    recordDocumentVersion,
    openVersionHistory,
    editDocumentVersion,
    removeDocumentVersion,
    restoreDocumentVersion,
  } = useDocumentVersions({
    activeDocument,
    workspace,
    setBaselineVersionId: tabs.setDocumentBaselineVersionId,
    commitSource,
    reportError: reportFileError,
    setInteractionMessage,
  });
  recordDocumentVersionRef.current = recordDocumentVersion;
  const baselineParseResult = useMemo(
    () => (baselineVersion ? parseGantt(baselineVersion.source) : undefined),
    [baselineVersion],
  );

  const resetFileSelection = useCallback(() => {
    setSelectedTaskId(undefined);
    setSelectedDependencyIndex(undefined);
  }, [setSelectedDependencyIndex, setSelectedTaskId]);
  const {
    importDocumentFile,
    fileSaveState: standaloneSaveState,
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
  } = useDocumentFiles({
    hydrated,
    workspace,
    setWorkspace,
    tabs,
    fileHandles,
    fileSnapshots,
    externalCheckSnoozedUntil,
    recordDocumentVersion,
    refreshHistoryControls,
    resetSelection: resetFileSelection,
    reportError: reportFileError,
    setInteractionMessage,
    notifySuccess,
    onProjectLaunch: async (opened) => projectLaunchRef.current?.(opened) ?? false,
  });
  const {
    project: legacyProject,
    fileSaveState: legacySaveState,
    saveZipProject,
    saveFolderProject,
    openMember: openLegacyMember,
    addProjectDiagram: addLegacyProjectDiagram,
    isProjectMemberTab: isLegacyProjectMemberTab,
    updateLinks: updateLegacyLinks,
    updateElements: updateLegacyElements,
    applyRenameMappings,
  } = useFolderProject({
    tabs,
    resetSelection: resetFileSelection,
    setInteractionMessage,
    reportError: reportFileError,
  });
  const singleFileProject = useSingleFileProject({
    tabs,
    resetSelection: resetFileSelection,
    onOpened: showDocumentNavigator,
    setInteractionMessage,
    reportError: reportFileError,
  });
  // App file launches should retain the ordinary document-opening experience
  // for .puml/.plantuml files. Native project files are still claimed here.
  documentCollaborationBridge.current = {
    getDocument: () => singleFileProject.sharedDocument,
    receiveDocument: singleFileProject.receiveSharedDocument,
    activeDiagram: () => {
      const shared = singleFileProject.sharedDocument;
      const diagram = shared?.diagrams.find(
        (item) => activeDocument.historyId === embeddedMemberHistoryId(shared.id, item.id),
      );
      return diagram ? { id: diagram.id, name: diagram.name } : undefined;
    },
    containsTab: (id) => {
      const shared = singleFileProject.sharedDocument;
      const tab = tabs.documents.find((item) => item.id === id);
      return Boolean(
        shared && tab && shared.diagrams.some((item) => tab.historyId === embeddedMemberHistoryId(shared.id, item.id)),
      );
    },
  };
  projectLaunchRef.current = (opened) =>
    opened.kind === "legacy" ? Promise.resolve(false) : singleFileProject.openOpenedProject(opened);
  const usingSingleFileProject = Boolean(singleFileProject.portableProject);
  const activeInLegacyProject = !usingSingleFileProject && isLegacyProjectMemberTab(tabs.activeId);
  const activeInSingleFileProject = Boolean(
    singleFileProject.portableProject &&
    activeDocument.historyId.startsWith(`project-history-${singleFileProject.portableProject.projectId}-`),
  );
  const project = singleFileProject.project ?? legacyProject;
  const openMember = usingSingleFileProject ? singleFileProject.openMember : openLegacyMember;
  const addProjectDiagram = usingSingleFileProject ? singleFileProject.addProjectDiagram : addLegacyProjectDiagram;
  const isProjectMemberTab = usingSingleFileProject
    ? (id: string) =>
        tabs.documents.some(
          (document) =>
            document.id === id &&
            document.historyId.startsWith(`project-history-${singleFileProject.portableProject!.projectId}-`),
        )
    : isLegacyProjectMemberTab;
  const portable = singleFileProject.portableProject;
  const linkedWorkContext = useRef({ portable, collaboration });
  linkedWorkContext.current = { portable, collaboration };
  const portableWbsDiagramId =
    portable && activeDocument.historyId.startsWith(`project-history-${portable.projectId}-`)
      ? activeDocument.historyId.slice(`project-history-${portable.projectId}-`.length)
      : undefined;
  const existingProjectGantt = portable?.diagrams.find(
    (diagram) => diagram.wbsGantt?.wbsDiagramId === portableWbsDiagramId,
  );
  const projectWbsGanttLinks: WbsGanttProjectLink[] = portable
    ? portable.diagrams.flatMap((gantt) => {
        const connection = gantt.wbsGantt;
        const wbs = portable.diagrams.find((item) => item.id === connection?.wbsDiagramId);
        if (!connection || !wbs) return [];
        const wbsTab = tabs.documents.find(
          (item) => item.historyId === embeddedMemberHistoryId(portable.projectId, wbs.id),
        );
        const ganttTab = tabs.documents.find(
          (item) => item.historyId === embeddedMemberHistoryId(portable.projectId, gantt.id),
        );
        const nodes = new Map(
          parseWbs(wbsTab?.source ?? wbs.document.current.source)
            .nodes.filter((node) => node.alias)
            .map((node) => [node.alias!, node]),
        );
        const tasks = parseGantt(ganttTab?.source ?? gantt.document.current.source).document.symbols.tasks;
        return (ganttTab?.wbsGanttLinks ?? connection.links).flatMap((link) => {
          const node = nodes.get(link.wbsAlias);
          const task = tasks.get(link.ganttAlias.toLowerCase());

          return [
            {
              id: `${gantt.id}:${link.wbsAlias}:${link.ganttAlias}`,
              missingWbsNode: !node,
              missingGanttTask: !task,
              wbsLabel: node?.label ?? `${link.wbsAlias} (missing)`,
              ganttLabel: task?.label ?? `${link.ganttAlias} (missing)`,
              wbsDiagramName: wbs.name,
              ganttDiagramName: gantt.name,
              wbsDocumentId: wbs.id,
              ganttDocumentId: gantt.id,
              wbsNodeId: node?.id ?? link.wbsAlias,
              ganttTaskId: task?.id ?? link.ganttAlias.toLowerCase(),
            },
          ];
        });
      })
    : [];
  const projectWbsGanttMissing: WbsGanttMissingItem[] = portable
    ? portable.diagrams.flatMap((gantt) => {
        const connection = gantt.wbsGantt;
        const wbs = portable.diagrams.find((item) => item.id === connection?.wbsDiagramId);
        if (!connection || !wbs) return [];
        const wbsTab = tabs.documents.find(
          (item) => item.historyId === embeddedMemberHistoryId(portable.projectId, wbs.id),
        );
        const ganttTab = tabs.documents.find(
          (item) => item.historyId === embeddedMemberHistoryId(portable.projectId, gantt.id),
        );
        return collectMissingWbsGanttItems(
          { id: wbs.id, name: wbs.name, source: wbsTab?.source ?? wbs.document.current.source },
          { id: gantt.id, name: gantt.name, source: ganttTab?.source ?? gantt.document.current.source },
          ganttTab?.wbsGanttLinks ?? connection.links,
        );
      })
    : [];
  const { addMissingProjectItem } = createAddMissingProjectItem({
    linkedWorkContext,
    portable,
    setInteractionMessage,
    setLinkedWorkPreview,
    setPendingProjectWbsSelection,
    setSelectedTaskId,
    singleFileProject,
    tabsRef,
    updateLinkedSource,
  });
  const projectWbsGanttIssues: (WbsGanttIssue & { documentId: string })[] = project
    ? tabs.documents.flatMap((gantt) => {
        if (gantt.diagramKind !== "gantt" || !gantt.linkedWbsDocumentId || !isProjectMemberTab(gantt.id)) return [];
        const wbs = tabs.documents.find(
          (item) => item.id === gantt.linkedWbsDocumentId && item.diagramKind === "wbs" && isProjectMemberTab(item.id),
        );
        if (!wbs)
          return [
            {
              message: `Linked WBS diagram for ${gantt.fileName} is missing.`,
              diagram: "gantt" as const,
              kind: "document" as const,
              documentId: gantt.id,
            },
          ];
        return collectWbsGanttIssues(
          wbs.source,
          gantt.source,
          gantt.wbsGanttLinks ?? [],
          gantt.wbsGanttDependencies ?? [],
        ).map((issue) => ({ ...issue, documentId: issue.diagram === "wbs" ? wbs.id : gantt.id }));
      })
    : [];
  const updateLinks = usingSingleFileProject ? singleFileProject.updateLinks : updateLegacyLinks;
  const updateElements = usingSingleFileProject ? singleFileProject.updateElements : updateLegacyElements;
  const applyActiveProjectRenameMappings = usingSingleFileProject
    ? singleFileProject.applyRenameMappings
    : applyRenameMappings;
  const saveActiveProject = useCallback(async () => {
    if (!usingSingleFileProject) return;
    const result = await singleFileProject.saveProject();
    if (!result) await singleFileProject.saveProjectAs();
  }, [singleFileProject, usingSingleFileProject]);
  const currentFileSaveState = activeInSingleFileProject
    ? singleFileProject.fileSaveState?.documentId === singleFileProject.portableProject?.projectId
      ? singleFileProject.fileSaveState
      : undefined
    : activeInLegacyProject && legacySaveState?.documentId === project?.manifest.projectId
      ? legacySaveState
      : standaloneSaveState?.documentId === tabs.activeId
        ? standaloneSaveState
        : undefined;
  const fileSaving = currentFileSaveState?.status === "saving";
  const fileDirty = activeInSingleFileProject ? singleFileProject.dirty : Boolean(activeDocument.dirty);
  const fileCopy = activeInSingleFileProject || activeInLegacyProject ? undefined : activeDocument.fileCopy;
  const saveNeeded = fileDirty || fileCopy === "new" || currentFileSaveState?.status === "error";
  const saveCurrentDocument = useCallback(async () => {
    if (fileSaving) return;
    if (activeInSingleFileProject) await saveActiveProject();
    else if (activeInLegacyProject && project)
      await ("archiveEntries" in project ? saveZipProject() : saveFolderProject());
    else await saveDocument();
  }, [
    activeInSingleFileProject,
    activeInLegacyProject,
    fileSaving,
    project,
    saveZipProject,
    saveFolderProject,
    saveActiveProject,
    saveDocument,
  ]);
  const saveCurrentDocumentAs = useCallback(async () => {
    if (fileSaving) return;
    if (activeInSingleFileProject) await singleFileProject.saveProjectAs();
    else await saveDocumentAs();
  }, [fileSaving, activeInSingleFileProject, singleFileProject, saveDocumentAs]);
  const projectLinkedTaskIds = useMemo(() => {
    if (!project || workspace.diagramKind !== "gantt") return new Set<string>();
    const member = project.members.find((item) => item.path === workspace.fileName);
    if (!member) return new Set<string>();
    const endpoints = new Set(project.manifest.links.flatMap((link) => [link.from, link.to]));
    const symbols = new Set(
      project.manifest.elements
        .filter((element) => element.documentId === member.documentId && endpoints.has(element.id))
        .map((element) => element.locator.symbolKey),
    );
    return new Set(parseResult.document.tasks.filter((task) => symbols.has(task.label)).map((task) => task.id));
  }, [parseResult.document.tasks, project, workspace.diagramKind, workspace.fileName]);
  const linkedGanttTaskIds = useMemo(
    () =>
      new Set([
        ...projectLinkedTaskIds,
        ...(activeDocument.wbsGanttLinks ?? []).map((link) => link.ganttAlias.toLowerCase()),
      ]),
    [activeDocument.wbsGanttLinks, projectLinkedTaskIds],
  );
  const projectDiagramLinks = useMemo(() => {
    const links = new Map<string, Array<{ documentId: string; path: string; label: string; relationship: string }>>();
    if (!project || workspace.diagramKind !== "gantt") return links;
    const projectHistoryPrefix = `project-history-${project.manifest.projectId}-`;
    const memberIdFromTab = activeDocument.historyId.startsWith(projectHistoryPrefix)
      ? activeDocument.historyId.slice(projectHistoryPrefix.length)
      : undefined;
    const currentMember =
      project.members.find((member) => member.documentId === memberIdFromTab) ??
      project.members.find((member) => member.path === workspace.fileName);
    if (!currentMember) return links;
    const tasksBySymbol = new Map<string, (typeof parseResult.document.tasks)[number]>();
    for (const task of parseResult.document.tasks) {
      tasksBySymbol.set(task.label.trim().toLocaleLowerCase(), task);
      if (task.alias?.value) tasksBySymbol.set(task.alias.value.trim().toLocaleLowerCase(), task);
    }
    const elementsById = new Map(project.manifest.elements.map((element) => [element.id, element]));
    const membersById = new Map(project.members.map((member) => [member.documentId, member]));
    for (const element of project.manifest.elements) {
      if (element.documentId !== currentMember.documentId || element.kind !== "gantt-task") continue;
      const task = tasksBySymbol.get(element.locator.symbolKey.trim().toLocaleLowerCase());
      if (!task) continue;
      for (const link of project.manifest.links) {
        if (link.from !== element.id && link.to !== element.id) continue;
        const target = elementsById.get(link.from === element.id ? link.to : link.from);
        if (!target || target.documentId === currentMember.documentId) continue;
        const targetMember = membersById.get(target.documentId);
        if (!targetMember) continue;
        const relationship =
          link.from === element.id
            ? link.kind === "implements"
              ? "Implements"
              : "Represents"
            : link.kind === "implements"
              ? "Implemented by"
              : "Represented by";
        const targets = links.get(task.id) ?? [];
        targets.push({
          documentId: targetMember.documentId,
          path: targetMember.path,
          label: target.locator.symbolKey,
          relationship,
        });
        links.set(task.id, targets);
      }
    }
    return links;
  }, [activeDocument.historyId, parseResult, project, workspace.diagramKind, workspace.fileName]);
  const activeProjectId = project?.manifest.projectId;
  useEffect(() => {
    if (activeProjectId) setProjectNavigatorOpen(true);
  }, [activeProjectId]);
  const mapProjectRename = useCallback(
    async (
      kind: "class-entity" | "sequence-participant" | "gantt-task" | "wbs-node",
      from: number,
      declaration: { symbolKey: string; from: number; to: number },
      source: string,
      previousSymbolKey?: string,
    ) => {
      const projectHistoryPrefix = project && `project-history-${project.manifest.projectId}-`;
      const memberId =
        projectHistoryPrefix && activeDocument.historyId.startsWith(projectHistoryPrefix)
          ? activeDocument.historyId.slice(projectHistoryPrefix.length)
          : undefined;
      const document = project?.manifest.documents.find(
        (item) => item.id === memberId || (!memberId && item.path === workspace.fileName),
      );
      const element =
        document &&
        project &&
        projectElementForEdit(
          project.manifest.elements,
          project.resolutions,
          document.id,
          kind,
          from,
          previousSymbolKey,
        );
      if (!document || !element) return;
      await applyActiveProjectRenameMappings(
        document.id,
        [
          {
            elementId: element.id,
            declaration: {
              kind,
              ...declaration,
              declarationHash: await hashSource(source.slice(declaration.from, declaration.to)),
            },
          },
        ],
        source,
      );
    },
    [activeDocument.historyId, applyActiveProjectRenameMappings, project, workspace.fileName],
  );
  const mapWbsProjectEdit = (node: (typeof wbsDocument.nodes)[number], source: string) => {
    const nextNode = parseWbs(source).nodes.find((item) => item.sourceRange.from === node.sourceRange.from);
    if (!nextNode) return;
    void mapProjectRename(
      "wbs-node",
      node.sourceRange.from,
      {
        symbolKey: nextNode.alias ?? nextNode.label,
        from: nextNode.sourceRange.from,
        to: nextNode.sourceRange.to,
      },
      source,
      node.alias ?? node.label,
    );
  };

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
    downloadText(result.svg, svgFileName(workspace.fileName), "image/svg+xml;charset=utf-8");
  }, [exportReady, result, workspace.fileName, setInteractionMessage]);
  const exportPng = useCallback(async () => {
    if (!result?.svg || !exportReady) {
      setInteractionMessage("Render a valid diagram before exporting PNG");
      return;
    }
    try {
      await downloadSvgAsPng(result.svg, workspace.fileName);
    } catch (error) {
      reportFileError(error);
    }
  }, [exportReady, reportFileError, result, workspace.fileName, setInteractionMessage]);
  const exportPdf = useCallback(async () => {
    if (!result?.svg || !exportReady) {
      setInteractionMessage("Render a valid diagram before exporting PDF");
      return;
    }
    try {
      await downloadDiagramPdf(result.svg, workspace.fileName);
      notifySuccess("Exported PDF");
    } catch (error) {
      reportFileError(error);
    }
  }, [exportReady, reportFileError, result, workspace.fileName, setInteractionMessage, notifySuccess]);
  const copyImage = useCallback(async () => {
    if (!result?.svg || !exportReady) {
      setInteractionMessage("Render a valid diagram before copying it");
      return;
    }
    try {
      await copyDiagramImage(result.svg);
      notifySuccess("Copied diagram image");
    } catch (error) {
      setInteractionMessage(error instanceof Error ? error.message : "Could not copy the diagram image");
    }
  }, [exportReady, result, setInteractionMessage, notifySuccess]);
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

  const confirmWbsDelete = useCallback((message: string) => window.confirm(message), []);
  const {
    addWbsNode,
    applyWbsNode,
    removeWbsNode,
    moveWbsNode,
    createWbsRelationship,
    applyWbsRelationshipColor,
    reconnectWbsArrow,
    removeWbsRelationship,
    applyWbsSettings,
  } = useWbsActions({
    source: workspace.source,
    document: wbsDocument,
    selectedNode: selectedWbsNode,
    selectedRelationship: selectedWbsRelationship,
    commitSource,
    confirmDelete: confirmWbsDelete,
    closeAddNode: () => closeDialog("add-wbs-node"),
    clearSelectedNode: clearSelectedWbsNode,
    clearSelectedRelationship: clearSelectedWbsRelationship,
    reportMessage: setInteractionMessage,
  });

  const confirmUseCaseDelete = useCallback((message: string) => window.confirm(message), []);
  const closeUseCaseDialog = useCallback(
    (kind: "element" | "relationship" | "package" | "note") => {
      closeDialog(`add-usecase-${kind}`);
    },
    [closeDialog],
  );
  const {
    addUseCaseElement,
    applyUseCaseElement,
    removeUseCaseElement,
    addUseCaseRelationship,
    applyUseCaseRelationship,
    removeUseCaseRelationship,
    addUseCasePackage,
    applyUseCasePackage,
    removeUseCasePackage,
    addUseCaseNote,
    applyUseCaseNote,
    removeUseCaseNote,
    createUseCaseRelationshipByDrag,
    reconnectUseCaseRelationshipByDrag,
    moveUseCaseElementByDrag,
    moveSelectedUseCaseElementToPackage,
    reorderUseCaseElementByDrag,
    applyUseCaseSettings,
  } = useUseCaseActions({
    source: workspace.source,
    document: useCaseDocument,
    selectedElement: selectedUseCaseElement,
    selectedRelationship: selectedUseCaseRelationship,
    selectedPackage: selectedUseCasePackage,
    selectedNote: selectedUseCaseNote,
    commitSource,
    confirmDelete: confirmUseCaseDelete,
    closeDialog: closeUseCaseDialog,
    selectObject: selectUseCaseObject,
    reportMessage: setInteractionMessage,
  });

  const closeClassDialog = useCallback((kind: ClassDialogKind) => closeDialog(`add-class-${kind}`), [closeDialog]);
  const {
    createClassRelationshipByDrag,
    reconnectClassRelationshipByDrag,
    moveClassEntityByDrag,
    reorderClassEntityByDrag,
    addClassEntity,
    applyClassEntity,
    removeClassEntity,
    addClassMember,
    applyClassMember,
    removeClassMember,
    moveClassMember,
    addClassRelationship,
    applyClassRelationship,
    removeClassRelationship,
    addClassPackage,
    applyClassPackage,
    removeClassPackage,
    moveSelectedClassPackage,
    moveSelectedClassEntity,
    applyClassSettings,
    addClassNote,
    applyClassNote,
    removeClassNote,
  } = useClassActions({
    componentMode: workspace.diagramKind === "component",
    source: workspace.source,
    document: classDocument,
    selectedEntity: selectedClassEntity,
    selectedRelationship: selectedClassRelationship,
    selectedPackage: selectedClassPackage,
    selectedNote: selectedClassNote,
    commitSource,
    mapProjectRename,
    closeDialog: closeClassDialog,
    selectObject: setSelectedClassObjectId,
    reportMessage: setInteractionMessage,
  });

  const closeActivityDialog = useCallback(
    (kind: ActivityDialogKind) => closeDialog(`add-activity-${kind}`),
    [closeDialog],
  );
  const {
    applyActivitySettings,
    addActivityAction,
    applyActivityAction,
    moveActivityActionPartition,
    removeActivityAction,
    addActivityPartition,
    applyActivityPartition,
    moveSelectedActivityPartition,
    removeActivityPartition,
    addActivityNote,
    addActivityStructure,
    addActivityTerminal,
    addActivityArrow,
    applyActivityNote,
    removeActivityNote,
    applyActivityControl,
    removeActivityControl,
    removeActivityTerminal,
    applyActivityArrow,
    removeActivityArrow,
    reorderActivityActionByDrag,
    connectActivityActionsByDrag,
    attachActivityNoteByDrag,
  } = useActivityActions({
    source: workspace.source,
    document: activityDocument,
    selectedAction: selectedActivityAction,
    selectedTerminal: selectedActivityTerminal,
    selectedPartition: selectedActivityPartition,
    selectedNote: selectedActivityNote,
    selectedControl: selectedActivityControl,
    selectedArrow: selectedActivityArrow,
    commitSource,
    closeDialog: closeActivityDialog,
    clearSelection: clearSelectedActivityObject,
    reportMessage: setInteractionMessage,
  });

  const closeSequenceDialog = useCallback(
    (kind: "participant" | "message" | "structure") => closeDialog(`add-sequence-${kind}`),
    [closeDialog],
  );
  const confirmSequenceDelete = useCallback((message: string) => window.confirm(message), []);
  const {
    addSequenceParticipant,
    addSequenceMessage,
    addSequenceStructure,
    applySequenceParticipant,
    removeSequenceParticipant,
    applySequenceMessage,
    removeSequenceMessage,
    applySequenceStructure,
    removeSequenceStructure,
    reorderSequenceParticipant,
    reorderSequenceMessage,
    reorderSequenceTimeline,
    reconnectSequenceElement,
    reconnectSequenceMessage,
    externalizeSequenceMessage,
    createSequenceMessageByDrag,
    applySequenceSettings,
  } = useSequenceActions({
    source: workspace.source,
    document: sequenceDocument,
    structures: sequenceStructures,
    selectedParticipant: selectedSequenceParticipant,
    selectedMessage: selectedSequenceMessage,
    selectedStructure: selectedSequenceStructure,
    commitSource,
    mapProjectRename,
    confirmDelete: confirmSequenceDelete,
    closeDialog: closeSequenceDialog,
    selectParticipant: setSelectedSequenceParticipantId,
    selectMessage: setSelectedSequenceMessageId,
    selectStructure: setSelectedSequenceStructureId,
    closeSettings: closeSequenceSettings,
    reportMessage: setInteractionMessage,
  });
  const closeGanttTaskDialog = useCallback((kind: "task" | "milestone") => closeDialog(`add-${kind}`), [closeDialog]);
  const confirmGanttTaskDelete = useCallback((message: string) => window.confirm(message), []);
  const { addTask, addMilestone, deleteSelectedTask, duplicateTaskOccurrence } = useGanttTaskActions({
    source: workspace.source,
    document: parseResult.document,
    selectedTask,
    diagramKind: workspace.diagramKind,
    commitGeneratedSource: commitLinkedGanttSchedule,
    closeDialog: closeGanttTaskDialog,
    selectTask: setSelectedTaskId,
    selectDependency: setSelectedDependencyIndex,
    reportMessage: setInteractionMessage,
    confirmDelete: confirmGanttTaskDelete,
  });
  const closeGanttDividerDialog = useCallback(() => closeDialog("add-divider"), [closeDialog]);
  const {
    addDivider,
    reorderDiagramDivider,
    applyDividerInspector,
    deleteSelectedDivider,
    connectTasks,
    deleteDependency,
    applyDependencyInspector,
    applyVerticalSeparatorInspector,
    deleteSelectedVerticalSeparator,
  } = useGanttDependencyActions({
    source: workspace.source,
    document: parseResult.document,
    selectedDependency,
    selectedDependencyIndex,
    selectedDividerIndex,
    selectedVerticalSeparatorIndex,
    commit: commitLinkedGanttSchedule,
    closeAddDivider: closeGanttDividerDialog,
    selectDependency: setSelectedDependencyIndex,
    selectDivider: setSelectedDividerIndex,
    selectVerticalSeparator: setSelectedVerticalSeparatorIndex,
    report: setInteractionMessage,
    confirmDelete: confirmGanttTaskDelete,
  });
  const closeGanttDateMenu = useCallback(() => setDateMenuFor(undefined), [setDateMenuFor]);
  const closeGanttProjectInspector = useCallback(() => setProjectInspectorOpen(false), [setProjectInspectorOpen]);
  const {
    applyTimelineDateHighlight,
    clearTimelineDateHighlight,
    applyTimelineDateClosed,
    clearTimelineDateSetting,
    applyProjectSettings,
  } = useGanttCalendarActions({
    source: workspace.source,
    highlightDate,
    commit: commitGeneratedSource,
    setHighlightDate,
    closeDateMenu: closeGanttDateMenu,
    closeProjectInspector: closeGanttProjectInspector,
    report: setInteractionMessage,
  });
  const {
    moveTask: moveGanttTask,
    resizeTask: resizeGanttTask,
    reorderDiagramTask: reorderGanttTask,
    applyTaskInspector: applyGanttTaskInspector,
    applyMilestoneInspector: applyGanttMilestoneInspector,
  } = useGanttScheduleActions({
    source: workspace.source,
    document: parseResult.document,
    selectedTaskId,
    resolvedTaskDates,
    scheduleMode,
    commit: commitLinkedGanttSchedule,
    showSchedulePreview: setSchedulePreview,
    selectTask: setSelectedTaskId,
    rememberSelectedTask,
    mapProjectRename,
    report: setInteractionMessage,
  });

  const commandReadOnly = collaborationAppliesToActiveDiagram && collaboration?.role === "viewer";
  const reviewApplyContext = useRef({ documentId: tabs.activeId, source: workspace.source, readOnly: commandReadOnly });
  reviewApplyContext.current = { documentId: tabs.activeId, source: workspace.source, readOnly: commandReadOnly };
  const startInlineRename = (id: string, anchor: Element) => {
    if (commandReadOnly || diagramMulti.multiple || status !== "idle" || anchor.closest("[data-class-member-id]"))
      return false;
    const request = inlineLabelRenameRequest(symbolProvider, workspace.diagramKind, id);
    if (!request) {
      setInteractionMessage(
        "This label cannot be identified uniquely for inline editing. Rename its declaration in the source editor.",
      );
      return false;
    }
    const focusTarget = anchor.closest<HTMLElement | SVGElement>("[tabindex], button");
    if (focusTarget) renameReturnFocus.current = focusTarget;
    const bounds = anchor.getBoundingClientRect();
    setInlineRename({
      request,
      source: workspace.source,
      documentId: tabs.activeId,
      anchor: { left: bounds.left, bottom: bounds.bottom },
    });
    return true;
  };
  const renameCommandPosition =
    workspace.source
      .split("\n")
      .slice(0, workspace.cursor.line - 1)
      .reduce((offset, line) => offset + line.length + 1, 0) +
    workspace.cursor.column -
    1;
  const renameCommandOccurrence = symbolAt(renameCommandPosition);
  const canRenameCommand =
    !commandReadOnly && !!renameCommandOccurrence && !!symbolProvider.renameRequest(renameCommandOccurrence);

  const dependencyTaskCount = parseResult.document.tasks.length;
  const { commands } = useAppCommands({
    activateTab,
    activeHistory,
    backupWorkspace,
    canRenameCommand,
    closeTab,
    collaboration,
    commandReadOnly,
    copyConfluence,
    copyImage,
    copyMarkdown,
    dependencyTaskCount,
    exportPdf,
    exportPng,
    exportReady,
    exportSource,
    exportSvg,
    newDocument,
    openActivitySettingsFromToolbar,
    openClassSettingsFromToolbar,
    openDialog,
    openDocument,
    openFormatSource,
    openProjectInspector,
    openReports,
    openResourcePanel,
    openSequenceSettings,
    openTasksView,
    openUseCaseSettingsFromToolbar,
    openVersionHistory,
    openWbsSettings,
    project,
    redo,
    renameCommandPosition,
    requestSymbolRename,
    restoreWorkspace,
    result,
    saveCurrentDocument,
    saveCurrentDocumentAs,
    setCollaborationDialogOpen,
    setDocumentSettingsOpen,
    setJiraDialogOpen,
    setLegendInspectorOpen,
    setProblemsOpen,
    setSettingsCategory,
    setSettingsOpen,
    showDocumentNavigator,
    tabs,
    undo,
    update,
    viewMode,
    viewModes,
    workspace,
  });

  useGlobalShortcuts({
    clearSelectedWbsNode,
    clearSelectedWbsRelationship,
    closeTab,
    closeWbsSettings,
    dismissAllInspectors,
    narrow,
    newDocument,
    openDialog,
    openDocument,
    redo,
    saveActiveProject,
    saveCurrentDocument,
    saveDocument,
    setStageLensExpanded,
    tabs,
    taskClipboard,
    taskShortcuts,
    toggleCommandPalette,
    undo,
    update,
    usingSingleFileProject,
    viewModeRef,
    workspace,
  });

  const resize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (viewMode !== "split") return;
    const root = event.currentTarget.parentElement;
    if (!root) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      const percent = Math.min(80, Math.max(20, ((moveEvent.clientX - rect.left) / rect.width) * 100));
      if (taskViewActive) setTaskTablePercent(percent);
      else update("splitPercent", percent);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  };

  const { restorePreviousFocus, restoreRenamedDiagramFocus } = useFocusRestoration({
    lastDiagramFocus,
    lastDiagramFocusSelector,
    pendingDiagramFocusSelector,
    renameReturnFocus,
    workspaceElement,
  });

  const activityDialogKind: ActivityDialogKind | undefined =
    dialog?.kind === "add-activity-action"
      ? "action"
      : dialog?.kind === "add-activity-partition"
        ? "partition"
        : dialog?.kind === "add-activity-note"
          ? "note"
          : dialog?.kind === "add-activity-structure"
            ? "structure"
            : dialog?.kind === "add-activity-terminal"
              ? "terminal"
              : dialog?.kind === "add-activity-arrow"
                ? "arrow"
                : undefined;
  const sequenceDialog: SequenceDialog | undefined =
    dialog?.kind === "add-sequence-participant"
      ? { kind: "participant" }
      : dialog?.kind === "add-sequence-message"
        ? { kind: "message" }
        : dialog?.kind === "add-sequence-structure"
          ? { kind: "structure", structureKind: dialog.structureKind }
          : undefined;
  const classDialogKind: ClassDialogKind | undefined =
    dialog?.kind === "add-class-entity"
      ? "entity"
      : dialog?.kind === "add-class-relationship"
        ? "relationship"
        : dialog?.kind === "add-class-package"
          ? "package"
          : dialog?.kind === "add-class-note"
            ? "note"
            : undefined;
  const ganttDialogKind: GanttDialogKind | undefined =
    dialog?.kind === "add-task"
      ? "task"
      : dialog?.kind === "add-divider"
        ? "divider"
        : dialog?.kind === "add-milestone"
          ? "milestone"
          : undefined;
  const selectedDivider =
    selectedDividerIndex === undefined ? undefined : parseResult.document.dividers[selectedDividerIndex];
  const selectedVerticalSeparator =
    selectedVerticalSeparatorIndex === undefined
      ? undefined
      : parseResult.document.verticalSeparators[selectedVerticalSeparatorIndex];
  const applyLegendInspector = (entries: readonly (typeof legendEntries)[number][]) => {
    const labels = new Map(entries.map((entry) => [entry.color.toLowerCase(), entry.label]));
    const source = synchronizeLegend(workspace.source, parseResult.document.tasks, labels);
    if (commitGeneratedSource(source, "Update legend labels")) {
      setLegendInspectorOpen(false);
      setLegendFocusColor(undefined);
      setInteractionMessage("Updated legend labels");
    }
  };
  const closeLegendInspector = () => {
    setLegendInspectorOpen(false);
    setLegendFocusColor(undefined);
  };
  const sideInspectorOpen = Boolean(
    (selectedTask && (!taskViewActive || taskTableInspector)) ||
    selectedDependency ||
    selectedSequenceParticipant ||
    selectedSequenceMessage ||
    selectedSequenceStructure ||
    selectedUseCaseObjectId ||
    selectedClassObjectId ||
    selectedActivityObjectId ||
    selectedWbsNodeId ||
    selectedWbsRelationshipId ||
    sequenceSettingsOpen ||
    useCaseSettingsOpen ||
    classSettingsOpen ||
    activitySettingsOpen ||
    wbsSettingsOpen ||
    resourcePanelOpen ||
    unsupportedOpen ||
    problemsOpen,
  );
  const menuOccurrence =
    symbolMenu?.occurrence ?? (symbolMenu?.position !== undefined ? symbolAt(symbolMenu.position) : undefined);
  const menuWbsNode =
    workspace.diagramKind === "wbs" && menuOccurrence?.kind === "wbs-node"
      ? wbsDocument.nodes.find((node) => node.id === menuOccurrence.key)
      : undefined;
  const menuGanttTask =
    workspace.diagramKind === "gantt" && menuOccurrence?.kind === "task"
      ? parseResult.document.symbols.tasks.get(menuOccurrence.key)
      : undefined;
  const menuLinkedGantt = menuWbsNode?.alias
    ? linkedGantt?.wbsGanttLinks?.find((link) => link.wbsAlias === menuWbsNode.alias)
    : undefined;
  const menuLinkedWbs = menuGanttTask
    ? activeDocument.wbsGanttLinks?.find((link) => link.ganttAlias.toLowerCase() === menuGanttTask.id)
    : undefined;
  const menuProjectWbsLinks = (() => {
    if (!project || !menuWbsNode) return [];
    const historyPrefix = `project-history-${project.manifest.projectId}-`;
    const memberId = activeDocument.historyId.startsWith(historyPrefix)
      ? activeDocument.historyId.slice(historyPrefix.length)
      : project.members.find((member) => member.path === workspace.fileName)?.documentId;
    const element = project.manifest.elements.find((item) => {
      const resolution = project.resolutions.get(item.id);
      return (
        item.documentId === memberId &&
        item.kind === "wbs-node" &&
        resolution?.state === "resolved" &&
        resolution.declaration.from === menuWbsNode.sourceRange.from
      );
    });
    if (!element) return [];
    return project.manifest.links.flatMap((link) => {
      if (link.kind !== "relates" || (link.from !== element.id && link.to !== element.id)) return [];
      const target = project.manifest.elements.find(
        (item) => item.id === (link.from === element.id ? link.to : link.from),
      );
      const member = project.members.find((item) => item.documentId === target?.documentId);
      const resolution = target && project.resolutions.get(target.id);
      if (!target || !member || resolution?.state !== "resolved") return [];
      return [
        { linkId: link.id, documentId: member.documentId, path: member.path, declaration: resolution.declaration },
      ];
    });
  })();
  const openProjectWbsNode = async (link: (typeof menuProjectWbsLinks)[number]) => {
    const member = project?.members.find((item) => item.documentId === link.documentId);
    const node =
      member?.source && parseWbs(member.source).nodes.find((item) => item.sourceRange.from === link.declaration.from);
    if (!node) return;
    if (usingSingleFileProject) {
      const tabId = await singleFileProject.openMember(link.documentId);
      if (tabId) setPendingProjectWbsSelection({ tabId, nodeId: node.id });
    } else {
      await openLegacyMember(link.documentId);
      window.setTimeout(() => selectWbsNode(node.id), 100);
    }
  };
  const openLinkedGanttTask = (alias: string) => {
    const link = linkedGantt?.wbsGanttLinks?.find((item) => item.wbsAlias === alias);
    if (!link || !linkedGantt) return;
    tabs.activateDocument(linkedGantt.id);
    window.setTimeout(() => setSelectedTaskId(link.ganttAlias.toLowerCase()), 0);
  };
  const openLinkedWbsNode = (taskId: string) => {
    if (!linkedWbs) return;
    const link = activeDocument.wbsGanttLinks?.find((item) => item.ganttAlias.toLowerCase() === taskId);
    if (!link) return;
    const node = parseWbs(linkedWbs.source).nodes.find((item) => item.alias === link.wbsAlias);
    tabs.activateDocument(linkedWbs.id);
    if (node) setPendingProjectWbsSelection({ tabId: linkedWbs.id, nodeId: node.id });
  };
  const applyWbsRelink = (nodeId: string, documentId: string, targetTaskId: string, policy: "keep" | "delete") => {
    const node = wbsDocument.nodes.find((item) => item.id === nodeId);
    const document = tabs.documents.find((item) => item.id === documentId && item.diagramKind === "gantt");
    if (!node || !document) return;
    const aliasedWbs = convertWbsToGantt(workspace.source).wbsSource;
    const alias = parseWbs(aliasedWbs).nodes[wbsDocument.nodes.indexOf(node)]?.alias;
    if (!alias) return;
    const result = relinkWbsGanttTask(document.source, document.wbsGanttLinks ?? [], alias, targetTaskId, policy);
    if (result.error) return setInteractionMessage(result.error);
    const synchronized =
      linkedGantt?.id === document.id
        ? convertWbsToGantt(
            aliasedWbs,
            result.ganttSource,
            result.links,
            document.wbsGanttDependencies,
            "keep-scheduled",
            false,
          )
        : undefined;
    const nextGanttSource = synchronized?.ganttSource ?? result.ganttSource;
    const nextLinks = synchronized?.links ?? result.links;
    updateLinkedSource({ id: tabs.activeId, source: workspace.source }, aliasedWbs, "wbs", "Link WBS to Gantt");
    updateLinkedSource(document, nextGanttSource, "gantt", "Link Gantt to WBS");
    tabs.updateDocumentFormat(document.id, {
      linkedWbsDocumentId: tabs.activeId,
      wbsGanttLinks: nextLinks,
      ...(synchronized ? { wbsGanttDependencies: synchronized.dependencies } : {}),
    });
    const target = parseGantt(nextGanttSource).document.symbols.tasks.get(
      nextLinks.find((link) => link.wbsAlias === alias)!.ganttAlias.toLowerCase(),
    );
    setInteractionMessage(
      `Linked ${node.label} to ${target?.label ?? "Gantt task"}${policy === "delete" ? "; removed the former task" : ""}`,
    );
  };
  const diagramMulti = useDiagramMultiSelection({
    kind: workspace.diagramKind,
    source: workspace.source,
    documentId: tabs.activeId,
    root: workspaceElement,
    commit: commitGeneratedSource,
    report: setInteractionMessage,
    readOnly: collaborationAppliesToActiveDiagram && collaboration?.role === "viewer",
    onSelect: (item) => {
      if (item.attribute === "data-sequence-participant-id") selectSequenceParticipant(item.id);
      else if (item.attribute === "data-sequence-message-id") selectSequenceMessage(item.id);
      else if (item.attribute === "data-sequence-structure-id") selectSequenceStructure(item.id);
      else if (item.attribute === "data-usecase-object-id") selectUseCaseObject(item.id);
      else if (item.attribute === "data-class-object-id") selectClassObject(item.id);
      else if (item.attribute === "data-activity-object-id") selectActivityObject(item.id);
      else if (item.attribute === "data-wbs-node-id") selectWbsNode(item.id);
      else selectWbsRelationship(item.id);
    },
  });
  // Stage mode: selection model for the lens and dock, and the theme-native preview SVG.
  const stageActive = viewMode === "stage";
  const stagePendingMessage = useRef<{ index: number; document: unknown } | undefined>(undefined);
  useEffect(() => {
    const pending = stagePendingMessage.current;
    // Wait for the parse that contains the reorder.
    if (!pending || pending.document === sequenceDocument) return;
    const moved = sequenceDocument.messages[pending.index];
    if (moved) {
      stagePendingMessage.current = undefined;
      // Move the lens caret too, or its stale cursor position would reselect the message that took the old line.
      setSelectionRequest({ ...moved.sourceRange });
      setSelectedSequenceMessageId(moved.id);
    }
  }, [sequenceDocument, setSelectedSequenceMessageId]);
  const stageDark = useResolvedDark(workspace.theme);
  const { stageSelection, stageLensFocusRef } = useStageSelection({
    activityDocument,
    classDocument,
    diagramMulti,
    parseResult,
    selectActivityFromSource,
    selectClassFromSource,
    selectSequenceMessage,
    selectSequenceParticipant,
    selectSequenceStructure,
    selectTask,
    selectUseCaseFromSource,
    selectWbsFromSource,
    selectedActivityAction,
    selectedActivityArrow,
    selectedActivityControl,
    selectedActivityNote,
    selectedActivityObjectId,
    selectedActivityPartition,
    selectedActivityTerminal,
    selectedClassEntity,
    selectedClassNote,
    selectedClassObjectId,
    selectedClassPackage,
    selectedClassRelationship,
    selectedDependency,
    selectedDependencyIndex,
    selectedDivider,
    selectedDividerIndex,
    selectedSequenceMessage,
    selectedSequenceParticipant,
    selectedSequenceStructure,
    selectedTask,
    selectedUseCaseElement,
    selectedUseCaseNote,
    selectedUseCaseObjectId,
    selectedUseCasePackage,
    selectedUseCaseRelationship,
    selectedVerticalSeparator,
    selectedWbsNode,
    selectedWbsNodeId,
    selectedWbsRelationship,
    selectionRequest,
    sequenceDocument,
    setSourceHighlightedActivityId,
    setSourceHighlightedClassEntityId,
    setSourceHighlightedSequenceParticipantId,
    setSourceHighlightedTaskId,
    setSourceHighlightedUseCaseId,
    setSourceHighlightedWbsNodeId,
    setStageInspectorOpen,
    setStageLensExpanded,
    stageActive,
    symbolAt,
    useCaseDocument,
    wbsDocument,
    workspace,
  });
  const stageRecolor = stageActive && stageDark && !stageTrueRender;
  const previewSvg = useMemo(
    () =>
      stageRecolor && result?.svg
        ? recolorSvgForStage(result.svg, readStageTokens(workspaceElement.current?.closest(".app")))
        : result?.svg,
    [stageRecolor, result?.svg],
  );
  clearDiagramMultiSelection.current = diagramMulti.clear;
  const canDuplicateMenuElement = !!menuOccurrence && diagramMulti.canDuplicateAt(menuOccurrence.range);

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

  useEffect(() => {
    setOutlineMode(undefined);
    setOutlineReveal(undefined);
  }, [tabs.activeId]);
  useEffect(() => {
    const root = workspaceElement.current;
    if (!root || !outlineMode) return;
    const selectors = new Set(outlineMatches.map(outlineTargetSelector).filter(Boolean));
    const attributes = [
      "data-task-id",
      "data-dependency-index",
      "data-divider-index",
      "data-vertical-separator-index",
      "data-sequence-participant-id",
      "data-sequence-message-id",
      "data-sequence-structure-id",
      "data-usecase-object-id",
      "data-class-object-id",
      "data-activity-object-id",
      "data-wbs-node-id",
      "data-wbs-relationship-id",
    ];
    const mark = () => {
      root.querySelectorAll("[data-outline-match]").forEach((element) => element.removeAttribute("data-outline-match"));
      if (!selectors.size) return;
      for (const element of root.querySelectorAll(".diagram [" + attributes.join("], .diagram [") + "]")) {
        if (
          attributes.some((attribute) => {
            const value = element.getAttribute(attribute);
            return value !== null && selectors.has(`[${attribute}="${CSS.escape(value)}"]`);
          })
        )
          element.setAttribute("data-outline-match", "true");
      }
    };
    mark();
    const observer = new MutationObserver(mark);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      root.querySelectorAll("[data-outline-match]").forEach((element) => element.removeAttribute("data-outline-match"));
    };
  }, [outlineMode, outlineMatches, workspace.source]);
  useEffect(() => {
    if (!outlineReveal) return;
    const selector = outlineTargetSelector(outlineReveal.entry);
    if (!selector) return;
    const root = workspaceElement.current;
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const target = root?.querySelector<SVGElement>(`.diagram ${selector}`);
        target?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [outlineReveal]);

  const applySemanticRename = (target: SemanticRenameRequest, nextValue: string): boolean => {
    if (commandReadOnly) return false;
    const result = symbolProvider.rename(target, nextValue);
    if (result.error || !result.source) {
      setInteractionMessage(result.error ?? "Rename made no changes");
      return false;
    }
    if (result.validateGenerated) {
      if (!commitGeneratedSource(result.source, `Rename ${target.mode}`)) return false;
    } else commitSource(result.source, `Rename ${target.mode}`);
    if (target.occurrence.kind === "wbs-node") {
      const node = wbsDocument.nodes.find((item) => item.id === target.occurrence.key);
      if (node) mapWbsProjectEdit(node, result.source);
    }
    if (result.personRename) {
      renameCapacity(result.personRename.from, result.personRename.to);
      setResourceFilter((current) =>
        current.toLocaleLowerCase() === result.personRename!.from.toLocaleLowerCase()
          ? result.personRename!.to
          : current,
      );
    }
    if (result.nextKey) {
      if (target.occurrence.kind === "participant") setSourceHighlightedSequenceParticipantId(result.nextKey);
      else if (target.occurrence.kind === "actor" || target.occurrence.kind === "usecase")
        setSourceHighlightedUseCaseId(result.nextKey);
      else if (target.occurrence.kind === "class-entity") setSourceHighlightedClassEntityId(result.nextKey);
      else if (target.occurrence.kind === "activity-action" || target.occurrence.kind === "activity-partition")
        setSourceHighlightedActivityId(result.nextKey);
      else if (target.occurrence.kind === "wbs-node") setSourceHighlightedWbsNodeId(result.nextKey);
    }
    if (referenceSymbol?.kind === target.occurrence.kind && referenceSymbol.key === target.occurrence.key)
      setReferenceSymbol({
        kind: target.occurrence.kind,
        key: result.nextKey ?? target.occurrence.key,
        label: nextValue.trim(),
      });
    setInteractionMessage(`Renamed ${target.occurrence.value} to ${nextValue.trim()}`);
    restoreRenamedDiagramFocus(target.occurrence.kind, result.nextKey);
    return true;
  };

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
  if (!hydrated)
    return (
      <main role="status" className="workspace-restoring">
        Restoring workspace…
      </main>
    );

  /** The one source editor; Stage mode mounts the same element inside its Source Lens. */
  const { renderSourceEditor } = buildSourceEditor({
    activeParticipants,
    activityDocument,
    analyzeSource,
    classDocument,
    clearSequenceSelection,
    collaboration,
    collaborationAppliesToActiveDiagram,
    commitSource,
    openFormatSource,
    parseResult,
    problemsOpen,
    projectInspectorOpen,
    remoteEditFlash,
    repairCategoryFilter,
    repairHost,
    repairRequest,
    requestSymbolRename,
    resourcePanelOpen,
    selectActivityFromSource,
    selectClassFromSource,
    selectSequenceMessage,
    selectSequenceParticipant,
    selectSequenceStructure,
    selectUseCaseFromSource,
    selectWbsFromSource,
    selectionRequest,
    sequenceDocument,
    setProblemPreview,
    setProblemsOpen,
    setRepairCategoryFilter,
    setRepairRequest,
    setSourceHighlightedSequenceParticipantId,
    setSourceHighlightedTaskId,
    setSourceSymbol,
    setSourceSymbolPosition,
    setSymbolMenu,
    setUnsupportedOpen,
    symbolAt,
    symbolHighlights,
    tabs,
    unsupportedOpen,
    update,
    updateCollaborationSelection,
    useCaseDocument,
    wbsDocument,
    workspace,
  });

  const stageUtilityPanelOpen =
    problemsOpen ||
    unsupportedOpen ||
    resourcePanelOpen ||
    projectInspectorOpen ||
    legendInspectorOpen ||
    sequenceSettingsOpen ||
    useCaseSettingsOpen ||
    classSettingsOpen ||
    activitySettingsOpen ||
    wbsSettingsOpen;
  const stageHidesInspector = stageActive && !stageInspectorOpen && !stageUtilityPanelOpen && !diagramMulti.multiple;
  const { stageDockActions, stageAddItems } = buildStageDock({
    addClassMember,
    addWbsNode,
    commandReadOnly,
    deleteDependency,
    deleteSelectedDivider,
    deleteSelectedTask,
    deleteSelectedVerticalSeparator,
    duplicateTaskOccurrence,
    moveGanttTask,
    openDialog,
    parseResult,
    removeActivityAction,
    removeActivityArrow,
    removeActivityControl,
    removeActivityNote,
    removeActivityPartition,
    removeActivityTerminal,
    removeClassEntity,
    removeClassNote,
    removeClassPackage,
    removeClassRelationship,
    removeSequenceMessage,
    removeSequenceParticipant,
    removeSequenceStructure,
    removeUseCaseElement,
    removeUseCaseNote,
    removeUseCasePackage,
    removeUseCaseRelationship,
    removeWbsNode,
    removeWbsRelationship,
    reorderSequenceMessage,
    reorderSequenceParticipant,
    resizeGanttTask,
    sequenceDocument,
    stagePendingMessage,
    stageSelection,
    workspace,
  });

  return (
    <InspectorWorkspace
      history={{ canUndo: !commandReadOnly && activeHistory.canUndo, undo }}
      inert={presentationOpen || mobileSheetOpen}
      aria-hidden={presentationOpen || mobileSheetOpen || undefined}
      className={`app${outlineMode === "dock" && outlineWide ? " has-outline-dock" : ""}${(sideInspectorOpen || diagramMulti.multiple) && !stageHidesInspector ? " has-side-inspector" : ""}${projectInspectorOpen ? " has-project-inspector" : ""}${project && projectNavigatorOpen && !sideInspectorOpen && !diagramMulti.multiple && !stageActive ? " has-project-navigator" : ""}${stageActive ? " stage-mode" : ""}${stageHidesInspector ? " stage-inspector-hidden" : ""}${stageActive && stageTrueRender ? " stage-true-render" : ""}`}
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        if (event.dataTransfer.files.length) event.preventDefault();
      }}
      data-theme={workspace.theme}
      data-adapt-preview={editorPreferences.adaptPreview ? "true" : undefined}
      onClickCapture={(event) => {
        if (!(event.target instanceof Element)) return;
        // Safari does not focus mouse-activated buttons by default. Remember an
        // actual panel trigger so keyboard dismissal can return to it consistently.
        event.target.closest<HTMLButtonElement>("button[data-inspector-trigger]")?.focus({ preventScroll: true });
        const close = event.target.closest<HTMLButtonElement>(".task-inspector > header button");
        // Shared panels restore their own opener. Keep the canvas fallback only
        // for legacy panels that do not use the shared inspector shell.
        if (
          close &&
          !close.closest(".problems-panel") &&
          !close.closest(".task-inspector")?.querySelector(".inspector-resize")
        )
          restorePreviousFocus(lastDiagramFocus.current);
      }}
    >
      {formatDraft && (
        <FormatSourceDialog
          source={formatDraft.source}
          kind={formatDraft.kind}
          current={formatDraft.source === workspace.source && formatDraft.documentId === tabs.activeId}
          readOnly={Boolean(collaborationAppliesToActiveDiagram && collaboration?.role === "viewer")}
          onClose={() => setFormatDraft(undefined)}
          onApply={(source) => {
            if (formatDraft.source !== workspace.source || formatDraft.documentId !== tabs.activeId) return false;
            return commitSource(source, "Format source");
          }}
        />
      )}
      {exportDialog && (
        <ExportDialog
          mode={exportDialog}
          source={workspace.source}
          svg={result?.documentId === tabs.activeId ? result.svg : undefined}
          fileName={workspace.fileName}
          current={exportReady}
          renderStatus={status}
          renderError={result?.error}
          onRender={() => {
            if (viewMode === "code") update("viewMode", "split");
            retryRender();
          }}
          onClose={() => setExportDialog(undefined)}
        />
      )}
      <RibbonChrome
        activeDocument={activeDocument}
        activeHistory={activeHistory}
        activeInLegacyProject={activeInLegacyProject}
        activeInSingleFileProject={activeInSingleFileProject}
        backupWorkspace={backupWorkspace}
        closeDialog={closeDialog}
        collaboration={collaboration}
        collaborationAppliesToActiveDiagram={collaborationAppliesToActiveDiagram}
        commandReadOnly={commandReadOnly}
        commands={commands}
        copyConfluence={copyConfluence}
        copyImage={copyImage}
        copyMarkdown={copyMarkdown}
        currentFileSaveState={currentFileSaveState}
        diagramMulti={diagramMulti}
        dialog={dialog}
        exportPdf={exportPdf}
        exportPng={exportPng}
        exportReady={exportReady}
        exportSource={exportSource}
        exportSvg={exportSvg}
        fileCopy={fileCopy}
        fileDirty={fileDirty}
        fileSaving={fileSaving}
        linkedDiagramActions={linkedDiagramActions}
        linkedDiagramIssueCount={linkedDiagramIssueCount}
        linkedWbs={linkedWbs}
        narrow={narrow}
        newDocument={newDocument}
        openActivitySettingsFromToolbar={openActivitySettingsFromToolbar}
        openClassSettingsFromToolbar={openClassSettingsFromToolbar}
        openDialog={openDialog}
        openDocument={openDocument}
        openPresentation={openPresentation}
        openProjectInspector={openProjectInspector}
        openReports={openReports}
        openResourcePanel={openResourcePanel}
        openSequenceSettings={openSequenceSettings}
        openUseCaseSettingsFromToolbar={openUseCaseSettingsFromToolbar}
        openVersionHistory={openVersionHistory}
        openWbsSettingsFromToolbar={openWbsSettingsFromToolbar}
        parseResult={parseResult}
        project={project}
        projectInspectorOpen={projectInspectorOpen}
        redo={redo}
        restoreWorkspace={restoreWorkspace}
        saveCurrentDocument={saveCurrentDocument}
        saveCurrentDocumentAs={saveCurrentDocumentAs}
        saveNeeded={saveNeeded}
        selectViewMode={selectViewMode}
        setClosedDayFocus={setClosedDayFocus}
        setCollaborationDialogOpen={setCollaborationDialogOpen}
        setDocumentSettingsOpen={setDocumentSettingsOpen}
        setExportDialog={setExportDialog}
        setJiraDialogOpen={setJiraDialogOpen}
        setLegendInspectorOpen={setLegendInspectorOpen}
        setOpenWorkOpen={setOpenWorkOpen}
        setOutlineMode={setOutlineMode}
        setProblemsOpen={setProblemsOpen}
        setSettingsCategory={setSettingsCategory}
        setSettingsOpen={setSettingsOpen}
        setStarterDraft={setStarterDraft}
        showDocumentNavigator={showDocumentNavigator}
        sideInspectorOpen={sideInspectorOpen}
        singleFileProject={singleFileProject}
        tabLabels={tabLabels}
        tabs={tabs}
        undo={undo}
        viewMode={viewMode}
        workspace={workspace}
      />
      <NavigationChrome
        activateTab={activateTab}
        activeDocument={activeDocument}
        closeOtherTabs={closeOtherTabs}
        closeTab={closeTab}
        collaboration={collaboration}
        diagnosticCount={diagnosticCount}
        dismissAllInspectors={dismissAllInspectors}
        documentTabs={documentTabs}
        draggedTabId={draggedTabId}
        duplicateTab={duplicateTab}
        fileSaving={fileSaving}
        isProjectMemberTab={isProjectMemberTab}
        mobileListActive={mobileListActive}
        mobileSupported={mobileSupported}
        newDocument={newDocument}
        openTasksView={openTasksView}
        portable={portable}
        project={project}
        saveCurrentDocument={saveCurrentDocument}
        selectNormalViewMode={selectNormalViewMode}
        setDraggedTabId={setDraggedTabId}
        setMobileDiagramDocument={setMobileDiagramDocument}
        setMobileReveal={setMobileReveal}
        setProblemsOpen={setProblemsOpen}
        setStageTrueRender={setStageTrueRender}
        setTabMenu={setTabMenu}
        setTaskTablePane={setTaskTablePane}
        setTaskViewDocument={setTaskViewDocument}
        singleFileProject={singleFileProject}
        stageActive={stageActive}
        stageDark={stageDark}
        stageTrueRender={stageTrueRender}
        tabLabels={tabLabels}
        tabMenu={tabMenu}
        tabs={tabs}
        taskTablePane={taskTablePane}
        taskViewActive={taskViewActive}
        tasksNarrow={tasksNarrow}
        toggleCommandPalette={toggleCommandPalette}
        unsupportedCount={unsupportedCount}
        update={update}
        viewMode={viewMode}
        viewModes={viewModes}
        workspace={workspace}
      />
      <WorkspaceMain
        activeDocument={activeDocument}
        activityDocument={activityDocument}
        applyBulkTaskChange={applyBulkTaskChange}
        attachActivityNoteByDrag={attachActivityNoteByDrag}
        baselineParseResult={baselineParseResult}
        baselineVersion={baselineVersion}
        classDocument={classDocument}
        clearBaseline={clearBaseline}
        clearSelectedActivityObject={clearSelectedActivityObject}
        collaboration={collaboration}
        collaborationAppliesToActiveDiagram={collaborationAppliesToActiveDiagram}
        commandReadOnly={commandReadOnly}
        commitGeneratedSource={commitGeneratedSource}
        commitLinkedGanttSchedule={commitLinkedGanttSchedule}
        connectActivityActionsByDrag={connectActivityActionsByDrag}
        connectTasks={connectTasks}
        createClassRelationshipByDrag={createClassRelationshipByDrag}
        createSequenceMessageByDrag={createSequenceMessageByDrag}
        createUseCaseRelationshipByDrag={createUseCaseRelationshipByDrag}
        createWbsRelationship={createWbsRelationship}
        deleteDependency={deleteDependency}
        diagramMulti={diagramMulti}
        dismissAllInspectors={dismissAllInspectors}
        dismissClassInspector={dismissClassInspector}
        externalizeSequenceMessage={externalizeSequenceMessage}
        initialDiagramFit={initialDiagramFit}
        jiraDiagramStatuses={jiraDiagramStatuses}
        lastDiagramFocus={lastDiagramFocus}
        lastDiagramFocusSelector={lastDiagramFocusSelector}
        linkedGanttTaskIds={linkedGanttTaskIds}
        linkedWbs={linkedWbs}
        linkedWbsNodeIds={linkedWbsNodeIds}
        mapProjectRename={mapProjectRename}
        mobileListActive={mobileListActive}
        mobileRevealActive={mobileRevealActive}
        moveClassEntityByDrag={moveClassEntityByDrag}
        moveGanttTask={moveGanttTask}
        moveUseCaseElementByDrag={moveUseCaseElementByDrag}
        moveWbsNode={moveWbsNode}
        openClassMemberMenu={openClassMemberMenu}
        openDateActionMenu={openDateActionMenu}
        openDiagramSymbolMenu={openDiagramSymbolMenu}
        openMember={openMember}
        openProjectInspector={openProjectInspector}
        openResourcePanel={openResourcePanel}
        openSourceBytes={openSourceBytes}
        openVersionHistory={openVersionHistory}
        parseResult={parseResult}
        parsed={parsed}
        previewClass={previewClass}
        previewSequence={previewSequence}
        previewSvg={previewSvg}
        previewWbs={previewWbs}
        projectDiagramLinks={projectDiagramLinks}
        projectInspectorOpen={projectInspectorOpen}
        reconnectClassRelationshipByDrag={reconnectClassRelationshipByDrag}
        reconnectSequenceElement={reconnectSequenceElement}
        reconnectSequenceMessage={reconnectSequenceMessage}
        reconnectUseCaseRelationshipByDrag={reconnectUseCaseRelationshipByDrag}
        reconnectWbsArrow={reconnectWbsArrow}
        rememberSelectedTask={rememberSelectedTask}
        remoteEditFlash={remoteEditFlash}
        renderSourceEditor={renderSourceEditor}
        reorderActivityActionByDrag={reorderActivityActionByDrag}
        reorderClassEntityByDrag={reorderClassEntityByDrag}
        reorderDiagramDivider={reorderDiagramDivider}
        reorderGanttTask={reorderGanttTask}
        reorderSequenceMessage={reorderSequenceMessage}
        reorderSequenceParticipant={reorderSequenceParticipant}
        reorderSequenceTimeline={reorderSequenceTimeline}
        reorderUseCaseElementByDrag={reorderUseCaseElementByDrag}
        resize={resize}
        resizeGanttTask={resizeGanttTask}
        resolvedTaskDates={resolvedTaskDates}
        resourceCapacities={resourceCapacities}
        resourceFilter={resourceFilter}
        resourceNames={resourceNames}
        resourceOverAllocations={resourceOverAllocations}
        resourceWarningsEnabled={resourceWarningsEnabled}
        result={result}
        retryRender={retryRender}
        scheduleMode={scheduleMode}
        schedulePreview={schedulePreview}
        selectActivityObject={selectActivityObject}
        selectClassMember={selectClassMember}
        selectClassObject={selectClassObject}
        selectNormalViewMode={selectNormalViewMode}
        selectSequenceMessage={selectSequenceMessage}
        selectSequenceParticipant={selectSequenceParticipant}
        selectSequenceStructure={selectSequenceStructure}
        selectTask={selectTask}
        selectUseCaseObject={selectUseCaseObject}
        selectWbsNode={selectWbsNode}
        selectWbsRelationship={selectWbsRelationship}
        selectedActivityObjectId={selectedActivityObjectId}
        selectedClassObjectId={selectedClassObjectId}
        selectedClassRelationship={selectedClassRelationship}
        selectedDependencyIndex={selectedDependencyIndex}
        selectedSequenceMessageId={selectedSequenceMessageId}
        selectedSequenceParticipantId={selectedSequenceParticipantId}
        selectedSequenceStructureId={selectedSequenceStructureId}
        selectedTaskId={selectedTaskId}
        selectedTaskIds={selectedTaskIds}
        selectedUseCaseObjectId={selectedUseCaseObjectId}
        selectedWbsNodeId={selectedWbsNodeId}
        selectedWbsRelationshipId={selectedWbsRelationshipId}
        sequenceDocument={sequenceDocument}
        sequenceStructures={sequenceStructures}
        setFocusNoteTaskId={setFocusNoteTaskId}
        setInteractionMessage={setInteractionMessage}
        setLegendFocusColor={setLegendFocusColor}
        setLegendInspectorOpen={setLegendInspectorOpen}
        setMobileDiagramDocument={setMobileDiagramDocument}
        setMobileReveal={setMobileReveal}
        setMobileSheetOpen={setMobileSheetOpen}
        setOutlineMode={setOutlineMode}
        setResourceFilter={setResourceFilter}
        setSelectedDependencyIndex={setSelectedDependencyIndex}
        setSelectedDividerIndex={setSelectedDividerIndex}
        setSelectedTaskId={setSelectedTaskId}
        setSelectedVerticalSeparatorIndex={setSelectedVerticalSeparatorIndex}
        setSelectionRequest={setSelectionRequest}
        setSettingsCategory={setSettingsCategory}
        setSettingsOpen={setSettingsOpen}
        setStageInspectorOpen={setStageInspectorOpen}
        setStageLensExpanded={setStageLensExpanded}
        setTaskRowDrafts={setTaskRowDrafts}
        setTaskTableInspector={setTaskTableInspector}
        setTaskTablePercent={setTaskTablePercent}
        sideInspectorOpen={sideInspectorOpen}
        sourceHighlightedActivityId={sourceHighlightedActivityId}
        sourceHighlightedClassEntityId={sourceHighlightedClassEntityId}
        sourceHighlightedClassMemberId={sourceHighlightedClassMemberId}
        sourceHighlightedSequenceParticipantId={sourceHighlightedSequenceParticipantId}
        sourceHighlightedTaskId={sourceHighlightedTaskId}
        sourceHighlightedUseCaseId={sourceHighlightedUseCaseId}
        sourceHighlightedWbsNodeId={sourceHighlightedWbsNodeId}
        stageActive={stageActive}
        stageAddItems={stageAddItems}
        stageDockActions={stageDockActions}
        stageInspectorOpen={stageInspectorOpen}
        stageLensExpanded={stageLensExpanded}
        stageLensFocusRef={stageLensFocusRef}
        stageSelection={stageSelection}
        startInlineRename={startInlineRename}
        status={status}
        tabs={tabs}
        taskRowDrafts={taskRowDrafts}
        taskTablePercent={taskTablePercent}
        taskViewActive={taskViewActive}
        toggleTaskSelection={toggleTaskSelection}
        update={update}
        updateLinkedSource={updateLinkedSource}
        useCaseDocument={useCaseDocument}
        viewMode={viewMode}
        wbsDependencyWarnings={wbsDependencyWarnings}
        wbsDocument={wbsDocument}
        wbsNodeCompletion={wbsNodeCompletion}
        wbsNodeSchedule={wbsNodeSchedule}
        workspace={workspace}
        workspaceElement={workspaceElement}
      />
      <StatusBar
        activeDocument={activeDocument}
        activeInSingleFileProject={activeInSingleFileProject}
        collaboration={collaboration}
        diagnosticCount={diagnosticCount}
        hydrated={hydrated}
        interactionMessage={interactionMessage}
        mobileListActive={mobileListActive}
        pwa={pwa}
        result={result}
        setInteractionMessage={setInteractionMessage}
        setProblemsOpen={setProblemsOpen}
        setUnsupportedOpen={setUnsupportedOpen}
        singleFileProject={singleFileProject}
        status={status}
        tabs={tabs}
        unsupportedCount={unsupportedCount}
        viewMode={viewMode}
        workspace={workspace}
      />
      <DiagramDialogs
        activeDocument={activeDocument}
        activeInLegacyProject={activeInLegacyProject}
        activeInSingleFileProject={activeInSingleFileProject}
        activityDialogKind={activityDialogKind}
        activityDocument={activityDocument}
        addActivityAction={addActivityAction}
        addActivityArrow={addActivityArrow}
        addActivityNote={addActivityNote}
        addActivityPartition={addActivityPartition}
        addActivityStructure={addActivityStructure}
        addActivityTerminal={addActivityTerminal}
        addDivider={addDivider}
        addMilestone={addMilestone}
        addProjectDiagram={addProjectDiagram}
        addSequenceMessage={addSequenceMessage}
        addSequenceParticipant={addSequenceParticipant}
        addSequenceStructure={addSequenceStructure}
        addTask={addTask}
        addUseCaseElement={addUseCaseElement}
        addUseCaseNote={addUseCaseNote}
        addUseCasePackage={addUseCasePackage}
        addUseCaseRelationship={addUseCaseRelationship}
        addWbsNode={addWbsNode}
        applyProjectSettings={applyProjectSettings}
        applyWbsNode={applyWbsNode}
        applyWbsRelationshipColor={applyWbsRelationshipColor}
        applyWbsRelink={applyWbsRelink}
        applyWbsSettings={applyWbsSettings}
        clearSelectedWbsNode={clearSelectedWbsNode}
        clearSelectedWbsRelationship={clearSelectedWbsRelationship}
        closeDialog={closeDialog}
        closeNewDocumentDialog={closeNewDocumentDialog}
        closeWbsSettings={closeWbsSettings}
        closedDayFocus={closedDayFocus}
        collaboration={collaboration}
        collaborationAppliesToActiveDiagram={collaborationAppliesToActiveDiagram}
        commandReadOnly={commandReadOnly}
        commands={commands}
        commitGeneratedSource={commitGeneratedSource}
        commitSource={commitSource}
        connectTasks={connectTasks}
        createDocument={createDocument}
        diagramMulti={diagramMulti}
        diagramOutlineEntries={diagramOutlineEntries}
        dialog={dialog}
        ganttDialogKind={ganttDialogKind}
        importDocumentFile={importDocumentFile}
        linkedDiagramActions={linkedDiagramActions}
        linkedGantt={linkedGantt}
        linkedWbs={linkedWbs}
        linkedWorkPreview={linkedWorkPreview}
        mapWbsProjectEdit={mapWbsProjectEdit}
        narrow={narrow}
        newDocumentOpen={newDocumentOpen}
        openDialog={openDialog}
        openDocument={openDocument}
        openLinkedGanttTask={openLinkedGanttTask}
        openWorkOpen={openWorkOpen}
        outlineMode={outlineMode}
        outlineWide={outlineWide}
        parseResult={parseResult}
        pendingGanttDeleteTaskId={pendingGanttDeleteTaskId}
        pendingWbsDeleteId={pendingWbsDeleteId}
        pendingWbsRelink={pendingWbsRelink}
        portable={portable}
        project={project}
        projectInspectorOpen={projectInspectorOpen}
        removeWbsNode={removeWbsNode}
        removeWbsRelationship={removeWbsRelationship}
        restorePreviousFocus={restorePreviousFocus}
        revealOutlineEntry={revealOutlineEntry}
        selectedTaskId={selectedTaskId}
        selectedWbsNode={selectedWbsNode}
        selectedWbsNodeLink={selectedWbsNodeLink}
        selectedWbsRelationship={selectedWbsRelationship}
        sequenceDialog={sequenceDialog}
        sequenceMessageAnchors={sequenceMessageAnchors}
        sequenceParticipantNames={sequenceParticipantNames}
        setInteractionMessage={setInteractionMessage}
        setLinkedWorkPreview={setLinkedWorkPreview}
        setOpenWorkOpen={setOpenWorkOpen}
        setOutlineMatches={setOutlineMatches}
        setOutlineMode={setOutlineMode}
        setPendingGanttDeleteTaskId={setPendingGanttDeleteTaskId}
        setPendingWbsDeleteId={setPendingWbsDeleteId}
        setPendingWbsRelink={setPendingWbsRelink}
        setProjectInspectorOpen={setProjectInspectorOpen}
        setSelectedDependencyIndex={setSelectedDependencyIndex}
        setSelectedTaskId={setSelectedTaskId}
        setStarterDraft={setStarterDraft}
        singleFileProject={singleFileProject}
        starterDraft={starterDraft}
        tabs={tabs}
        updateLinkedSource={updateLinkedSource}
        useCaseDocument={useCaseDocument}
        usingSingleFileProject={usingSingleFileProject}
        wbsDependencyWarnings={wbsDependencyWarnings}
        wbsDocument={wbsDocument}
        wbsGanttTargets={wbsGanttTargets}
        wbsSettingsOpen={wbsSettingsOpen}
        workspace={workspace}
      />
      <DocumentDialogs
        activeDocument={activeDocument}
        addMissingProjectItem={addMissingProjectItem}
        addProjectDiagram={addProjectDiagram}
        applyExternalConflictMerge={applyExternalConflictMerge}
        applyTimelineDateClosed={applyTimelineDateClosed}
        applyTimelineDateHighlight={applyTimelineDateHighlight}
        clearTimelineDateHighlight={clearTimelineDateHighlight}
        clearTimelineDateSetting={clearTimelineDateSetting}
        closeDialog={closeDialog}
        collaboration={collaboration}
        collaborationAppliesToActiveDiagram={collaborationAppliesToActiveDiagram}
        collaborationDialogOpen={collaborationDialogOpen}
        commandReadOnly={commandReadOnly}
        commitGeneratedSource={commitGeneratedSource}
        commitSource={commitSource}
        configureDocumentFormat={configureDocumentFormat}
        dateMenuFor={dateMenuFor}
        defaultCollaborationEndpoint={defaultCollaborationEndpoint}
        defaultJiraEndpoint={defaultJiraEndpoint}
        diagramMulti={diagramMulti}
        dialog={dialog}
        dismissExternalConflict={dismissExternalConflict}
        documentSettingsOpen={documentSettingsOpen}
        documentVersions={documentVersions}
        editDocumentVersion={editDocumentVersion}
        externalConflict={externalConflict}
        fileSaving={fileSaving}
        highlightDate={highlightDate}
        jiraBinding={jiraBinding}
        jiraDialogOpen={jiraDialogOpen}
        keepLocalExternalConflict={keepLocalExternalConflict}
        leaveCollaboration={leaveCollaboration}
        openExternalConflictCopy={openExternalConflictCopy}
        openMember={openMember}
        pendingCollaboration={pendingCollaboration}
        portable={portable}
        portableWbsDiagramId={portableWbsDiagramId}
        project={project}
        projectNavigatorOpen={projectNavigatorOpen}
        projectWbsGanttIssues={projectWbsGanttIssues}
        projectWbsGanttLinks={projectWbsGanttLinks}
        projectWbsGanttMissing={projectWbsGanttMissing}
        recordDocumentVersion={recordDocumentVersion}
        reloadExternalConflict={reloadExternalConflict}
        removeDocumentVersion={removeDocumentVersion}
        reportFileError={reportFileError}
        resourceWarningsEnabled={resourceWarningsEnabled}
        restoreDocumentVersion={restoreDocumentVersion}
        reviewApplyContext={reviewApplyContext}
        rotateCollaborationRoom={rotateCollaborationRoom}
        saveCurrentDocumentAs={saveCurrentDocumentAs}
        scheduleMode={scheduleMode}
        selectWbsNode={selectWbsNode}
        selectWbsRelationship={selectWbsRelationship}
        setBaseline={setBaseline}
        setCollaborationDialogOpen={setCollaborationDialogOpen}
        setDateMenuFor={setDateMenuFor}
        setDocumentSettingsOpen={setDocumentSettingsOpen}
        setHighlightDate={setHighlightDate}
        setInteractionMessage={setInteractionMessage}
        setJiraDialogOpen={setJiraDialogOpen}
        setPendingProjectWbsSelection={setPendingProjectWbsSelection}
        setProjectNavigatorOpen={setProjectNavigatorOpen}
        setResourceWarningsEnabled={setResourceWarningsEnabled}
        setScheduleMode={setScheduleMode}
        setSelectedTaskId={setSelectedTaskId}
        setSettingsOpen={setSettingsOpen}
        setVersionHistoryOpen={setVersionHistoryOpen}
        setWorkspace={setWorkspace}
        settingsCategory={settingsCategory}
        settingsOpen={settingsOpen}
        sideInspectorOpen={sideInspectorOpen}
        singleFileProject={singleFileProject}
        startCollaboration={startCollaboration}
        tabs={tabs}
        updateElements={updateElements}
        updateLinks={updateLinks}
        usingSingleFileProject={usingSingleFileProject}
        versionHistoryOpen={versionHistoryOpen}
        workspace={workspace}
      />
      <DiagramInspectors
        activityDocument={activityDocument}
        activityInspectorSettings={activityInspectorSettings}
        activitySettingsOpen={activitySettingsOpen}
        addClassEntity={addClassEntity}
        addClassMember={addClassMember}
        addClassNote={addClassNote}
        addClassPackage={addClassPackage}
        addClassRelationship={addClassRelationship}
        applyActivityAction={applyActivityAction}
        applyActivityArrow={applyActivityArrow}
        applyActivityControl={applyActivityControl}
        applyActivityNote={applyActivityNote}
        applyActivityPartition={applyActivityPartition}
        applyActivitySettings={applyActivitySettings}
        applyBulkTaskChange={applyBulkTaskChange}
        applyClassEntity={applyClassEntity}
        applyClassMember={applyClassMember}
        applyClassNote={applyClassNote}
        applyClassPackage={applyClassPackage}
        applyClassRelationship={applyClassRelationship}
        applyClassSettings={applyClassSettings}
        applySequenceMessage={applySequenceMessage}
        applySequenceParticipant={applySequenceParticipant}
        applySequenceSettings={applySequenceSettings}
        applySequenceStructure={applySequenceStructure}
        applyUseCaseElement={applyUseCaseElement}
        applyUseCaseNote={applyUseCaseNote}
        applyUseCasePackage={applyUseCasePackage}
        applyUseCaseRelationship={applyUseCaseRelationship}
        applyUseCaseSettings={applyUseCaseSettings}
        classDialogKind={classDialogKind}
        classDocument={classDocument}
        classInspectorSettings={classInspectorSettings}
        classSettingsOpen={classSettingsOpen}
        clearSelectedActivityObject={clearSelectedActivityObject}
        clearSelectedClassObject={clearSelectedClassObject}
        clearSelectedUseCaseObject={clearSelectedUseCaseObject}
        clearSelectedWbsNode={clearSelectedWbsNode}
        clearSelectedWbsRelationship={clearSelectedWbsRelationship}
        closeActivitySettings={closeActivitySettings}
        closeClassDialog={closeClassDialog}
        closeClassSettings={closeClassSettings}
        closeSequenceSettings={closeSequenceSettings}
        closeUseCaseSettings={closeUseCaseSettings}
        copySelectedTasks={copySelectedTasks}
        diagramMulti={diagramMulti}
        dismissAllInspectors={dismissAllInspectors}
        duplicateSelectedTasks={duplicateSelectedTasks}
        moveActivityActionPartition={moveActivityActionPartition}
        moveClassMember={moveClassMember}
        moveSelectedActivityPartition={moveSelectedActivityPartition}
        moveSelectedClassEntity={moveSelectedClassEntity}
        moveSelectedClassPackage={moveSelectedClassPackage}
        moveSelectedUseCaseElementToPackage={moveSelectedUseCaseElementToPackage}
        multipleTasksSelected={multipleTasksSelected}
        parseResult={parseResult}
        removeActivityAction={removeActivityAction}
        removeActivityArrow={removeActivityArrow}
        removeActivityControl={removeActivityControl}
        removeActivityNote={removeActivityNote}
        removeActivityPartition={removeActivityPartition}
        removeActivityTerminal={removeActivityTerminal}
        removeClassEntity={removeClassEntity}
        removeClassMember={removeClassMember}
        removeClassNote={removeClassNote}
        removeClassPackage={removeClassPackage}
        removeClassRelationship={removeClassRelationship}
        removeSequenceMessage={removeSequenceMessage}
        removeSequenceParticipant={removeSequenceParticipant}
        removeSequenceStructure={removeSequenceStructure}
        removeUseCaseElement={removeUseCaseElement}
        removeUseCaseNote={removeUseCaseNote}
        removeUseCasePackage={removeUseCasePackage}
        removeUseCaseRelationship={removeUseCaseRelationship}
        resourceNames={resourceNames}
        selectedActivityAction={selectedActivityAction}
        selectedActivityArrow={selectedActivityArrow}
        selectedActivityControl={selectedActivityControl}
        selectedActivityNote={selectedActivityNote}
        selectedActivityPartition={selectedActivityPartition}
        selectedActivityTerminal={selectedActivityTerminal}
        selectedClassEntity={selectedClassEntity}
        selectedClassNote={selectedClassNote}
        selectedClassPackage={selectedClassPackage}
        selectedClassRelationship={selectedClassRelationship}
        selectedSequenceMessage={selectedSequenceMessage}
        selectedSequenceParticipant={selectedSequenceParticipant}
        selectedSequenceStructure={selectedSequenceStructure}
        selectedTaskIds={selectedTaskIds}
        selectedUseCaseElement={selectedUseCaseElement}
        selectedUseCaseNote={selectedUseCaseNote}
        selectedUseCasePackage={selectedUseCasePackage}
        selectedUseCaseRelationship={selectedUseCaseRelationship}
        sequenceInspectorSettings={sequenceInspectorSettings}
        sequenceMessageAnchors={sequenceMessageAnchors}
        sequenceParticipantNames={sequenceParticipantNames}
        sequenceSettingsOpen={sequenceSettingsOpen}
        setSelectedSequenceMessageId={setSelectedSequenceMessageId}
        setSelectedSequenceParticipantId={setSelectedSequenceParticipantId}
        setSelectedSequenceStructureId={setSelectedSequenceStructureId}
        setSelectedTaskId={setSelectedTaskId}
        setSelectionRequest={setSelectionRequest}
        tabs={tabs}
        update={update}
        useCaseDocument={useCaseDocument}
        useCaseInspectorSettings={useCaseInspectorSettings}
        useCaseSettingsOpen={useCaseSettingsOpen}
        viewMode={viewMode}
        workspace={workspace}
      />
      <GanttSideInspectors
        activeDocument={activeDocument}
        applyDependencyInspector={applyDependencyInspector}
        applyDividerInspector={applyDividerInspector}
        applyGanttMilestoneInspector={applyGanttMilestoneInspector}
        applyGanttTaskInspector={applyGanttTaskInspector}
        applyLegendInspector={applyLegendInspector}
        applyVerticalSeparatorInspector={applyVerticalSeparatorInspector}
        baselineVersion={baselineVersion}
        closeLegendInspector={closeLegendInspector}
        commitGeneratedSource={commitGeneratedSource}
        deleteDependency={deleteDependency}
        deleteSelectedDivider={deleteSelectedDivider}
        deleteSelectedTask={deleteSelectedTask}
        deleteSelectedVerticalSeparator={deleteSelectedVerticalSeparator}
        focusNoteTaskId={focusNoteTaskId}
        ganttCalendar={ganttCalendar}
        jiraTaskStatuses={jiraTaskStatuses}
        legendEntries={legendEntries}
        legendFocusColor={legendFocusColor}
        legendInspectorOpen={legendInspectorOpen}
        linkedWbs={linkedWbs}
        multipleTasksSelected={multipleTasksSelected}
        openLinkedWbsNode={openLinkedWbsNode}
        parseResult={parseResult}
        prepareUtilityPanel={prepareUtilityPanel}
        renameCapacity={renameCapacity}
        reportCoordinator={reportCoordinator}
        reportResource={reportResource}
        reportsOpen={reportsOpen}
        reportsSuspended={reportsSuspended}
        resolvedTaskDates={resolvedTaskDates}
        resourceCapacities={resourceCapacities}
        resourceNames={resourceNames}
        resourcePanelOpen={resourcePanelOpen}
        restorePreviousFocus={restorePreviousFocus}
        selectTask={selectTask}
        selectedDependency={selectedDependency}
        selectedDivider={selectedDivider}
        selectedPredecessorId={selectedPredecessorId}
        selectedResourceConflicts={selectedResourceConflicts}
        selectedTask={selectedTask}
        selectedTaskDependency={selectedTaskDependency}
        selectedVerticalSeparator={selectedVerticalSeparator}
        setInteractionMessage={setInteractionMessage}
        setPendingGanttDeleteTaskId={setPendingGanttDeleteTaskId}
        setProblemsOpen={setProblemsOpen}
        setReportCoordinator={setReportCoordinator}
        setReportResource={setReportResource}
        setReportsOpen={setReportsOpen}
        setReportsSuspended={setReportsSuspended}
        setResourceFilter={setResourceFilter}
        setResourcePanelOpen={setResourcePanelOpen}
        setSelectedDependencyIndex={setSelectedDependencyIndex}
        setSelectedDividerIndex={setSelectedDividerIndex}
        setSelectedTaskId={setSelectedTaskId}
        setSelectedVerticalSeparatorIndex={setSelectedVerticalSeparatorIndex}
        tabs={tabs}
        taskTableInspector={taskTableInspector}
        taskViewActive={taskViewActive}
        updateLinkedSource={updateLinkedSource}
        updateResourceCapacities={updateResourceCapacities}
        workspace={workspace}
      />
      <AppOverlays
        activeDiagnostics={activeDiagnostics}
        activeDocument={activeDocument}
        activeQuickFixes={activeQuickFixes}
        applySemanticRename={applySemanticRename}
        canDuplicateMenuElement={canDuplicateMenuElement}
        classDocument={classDocument}
        classMemberMenu={classMemberMenu}
        closeDialog={closeDialog}
        collaboration={collaboration}
        collaborationAppliesToActiveDiagram={collaborationAppliesToActiveDiagram}
        commandReadOnly={commandReadOnly}
        commitGeneratedSource={commitGeneratedSource}
        commitSource={commitSource}
        diagramAnalysis={diagramAnalysis}
        diagramMulti={diagramMulti}
        dialog={dialog}
        duplicateTaskOccurrence={duplicateTaskOccurrence}
        inlineRename={inlineRename}
        linkedWbs={linkedWbs}
        menuGanttTask={menuGanttTask}
        menuLinkedGantt={menuLinkedGantt}
        menuLinkedWbs={menuLinkedWbs}
        menuOccurrence={menuOccurrence}
        menuProjectWbsLinks={menuProjectWbsLinks}
        menuWbsNode={menuWbsNode}
        navigateOccurrence={navigateOccurrence}
        occurrencesFor={occurrencesFor}
        openLinkedGanttTask={openLinkedGanttTask}
        openLinkedWbsNode={openLinkedWbsNode}
        openProjectWbsNode={openProjectWbsNode}
        presentationConnections={presentationConnections}
        presentationDocuments={presentationDocuments}
        presentationOpen={presentationOpen}
        presentationReturnFocus={presentationReturnFocus}
        preservedSyntax={preservedSyntax}
        problemPreview={problemPreview}
        problemsOpen={problemsOpen}
        referenceSymbol={referenceSymbol}
        renameReturnFocus={renameReturnFocus}
        renameSymbol={renameSymbol}
        repairCategoryFilter={repairCategoryFilter}
        resourceCapacities={resourceCapacities}
        resourceWarningsEnabled={resourceWarningsEnabled}
        restorePreviousFocus={restorePreviousFocus}
        schedulePreview={schedulePreview}
        setClassMemberMenu={setClassMemberMenu}
        setInlineRename={setInlineRename}
        setInteractionMessage={setInteractionMessage}
        setPresentationOpen={setPresentationOpen}
        setProblemPreview={setProblemPreview}
        setProblemsOpen={setProblemsOpen}
        setReferenceSymbol={setReferenceSymbol}
        setRenameSymbol={setRenameSymbol}
        setRepairCategoryFilter={setRepairCategoryFilter}
        setRepairHost={setRepairHost}
        setRepairRequest={setRepairRequest}
        setSchedulePreview={setSchedulePreview}
        setSelectedClassObjectId={setSelectedClassObjectId}
        setSelectionRequest={setSelectionRequest}
        setSymbolMenu={setSymbolMenu}
        setUnsupportedOpen={setUnsupportedOpen}
        symbolAt={symbolAt}
        symbolMenu={symbolMenu}
        symbolProvider={symbolProvider}
        tabs={tabs}
        unsupportedOpen={unsupportedOpen}
        update={update}
        viewMode={viewMode}
        workspace={workspace}
      />
    </InspectorWorkspace>
  );
}
