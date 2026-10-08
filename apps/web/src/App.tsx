import { ReportsDialog } from "./features/reports/ReportsDialog";
import { FileSaveStatus } from "./FileSaveStatus";
import { useWorkspaceLayout } from "./use-workspace-layout";
import { ActionMenu } from "./ActionMenu";
import { WorkspaceHint } from "./WorkspaceHint";
import { storageGet } from "./safe-storage";
import { useResourceWarningPreference } from "./use-resource-warning-preference";
import type { RepairCategory } from "./remaining-repair-summary";
import { MAX_DIAGRAM_ZOOM } from "./diagram-zoom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CodeEditor, type SourceRepairRequest } from "./CodeEditor";
import { DiagramPreview, taskHoverDetails } from "./DiagramPreview";
import { SequenceDiagramPreview } from "./SequenceDiagramPreview";
import { UseCaseDiagramPreview } from "./UseCaseDiagramPreview";
import { ClassDiagramPreview } from "./ClassDiagramPreview";
import { ActivityDiagramPreview } from "./ActivityDiagramPreview";
import { WbsDiagramPreview } from "./WbsDiagramPreview";
import {
  addMissingGanttTasksToWbs,
  convertWbsToGantt,
  ensureLinkedGanttProjectStart,
  relinkWbsGanttTask,
  setGeneratedGanttProjectStart,
} from "./wbs-gantt";
import { AddWbsNodeDialog } from "./features/wbs/WbsDialogs";
import { WbsNodeInspector, WbsRelationshipInspector, WbsSettingsInspector } from "./features/wbs/WbsInspectors";
import { WbsLinkedDeleteDialog } from "./features/wbs/WbsLinkedDeleteDialog";
import { WbsRelinkDialog } from "./features/wbs/WbsRelinkDialog";
import { useWbsActions } from "./features/wbs/use-wbs-actions";
import { useWbsController } from "./features/wbs/use-wbs-controller";
import { parseActivitySettings } from "./activity-settings";
import { ActivityDialogs, type ActivityDialogKind } from "./features/activity/ActivityDialogs";
import { ActivityInspectors } from "./features/activity/ActivityInspectors";
import { useActivityActions } from "./features/activity/use-activity-actions";
import { useActivityController } from "./features/activity/use-activity-controller";
import { ClassDialogs, type ClassDialogKind } from "./features/class/ClassDialogs";
import { ClassInspectors } from "./features/class/ClassInspectors";
import { useClassActions } from "./features/class/use-class-actions";
import { useClassController } from "./features/class/use-class-controller";
import { parseClassSettings } from "./class-settings";
import { GanttDialogs, type GanttDialogKind } from "./features/gantt/GanttDialogs";
import { GanttLinkedDeleteDialog } from "./features/gantt/GanttLinkedDeleteDialog";
import { GanttInspectors } from "./features/gantt/GanttInspectors";
import { useGanttCalendarActions } from "./features/gantt/use-gantt-calendar-actions";
import { useGanttController } from "./features/gantt/use-gantt-controller";
import { useGanttDependencyActions } from "./features/gantt/use-gantt-dependency-actions";
import { findResourceConflicts } from "./features/gantt/gantt-resource-conflicts";
import { useGanttScheduleActions } from "./features/gantt/use-gantt-schedule-actions";
import { useGanttTaskActions } from "./features/gantt/use-gantt-task-actions";
import { CommandPalette } from "./CommandPalette";
import { DiagramOutlineDialog } from "./DiagramOutlineDialog";
import { buildDiagramOutlineEntries, outlineLine, type DiagramOutlineEntry } from "./diagram-outline";
import { parseLegendEntries, removeLegend, synchronizeLegend, usedLegendColors } from "./legend";
import { ProjectInspector } from "./ProjectInspector";
import { SchedulePreviewDialog } from "./SchedulePreviewDialog";
import { DeliveryScenarioDialog } from "./DeliveryScenarioDialog";
import { buildResourceOverAllocations, ResourceWorkloadPanel } from "./ResourceWorkloadPanel";
import { HelpDialog } from "./HelpDialog";
import { ProblemsPanel } from "./ProblemsPanel";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";
import { HighlightDateDialog } from "./HighlightDateDialog";
import { DateActionMenu } from "./DateActionMenu";
import { FileMenu } from "./FileMenu";
import { ProjectNavigator } from "./projects/ProjectNavigator";
import { UnsavedProjectDialog } from "./projects/UnsavedProjectDialog";
import type { WbsGanttProjectLink } from "./projects/wbs-gantt-project-links";
import { collectMissingWbsGanttItems, type WbsGanttMissingItem } from "./projects/wbs-gantt-missing";
import { embeddedMemberHistoryId } from "./projects/embedded-project";
import { collectWbsGanttIssues, type WbsGanttIssue } from "./wbs-gantt-health";
import { ProjectNameDialog } from "./projects/ProjectNameDialog";
import { ProjectUnlockDialog } from "./projects/ProjectUnlockDialog";
import { useFolderProject } from "./projects/use-folder-project";
import { useSingleFileProject } from "./projects/use-single-file-project";
import { projectElementForEdit } from "./projects/project-edit-mapping";
import { DocumentSettingsDialog } from "./DocumentSettingsDialog";
import { SettingsDialog } from "./SettingsDialog";
import { plantUmlTheme, setPlantUmlTheme } from "./plantuml-theme";
import { VersionHistoryDialog } from "./VersionHistoryDialog";
import { ExternalFileConflictDialog } from "./ExternalFileConflictDialog";
import { CollaborationDialog } from "./CollaborationDialog";
import { JiraDialog } from "./JiraDialog";
import { AddMenu } from "./AddMenu";
import { NewDocumentDialog } from "./NewDocumentDialog";
import { SequenceDialogs, type SequenceDialog } from "./features/sequence/SequenceDialogs";
import { SequenceInspectors } from "./features/sequence/SequenceInspectors";
import { useSequenceActions } from "./features/sequence/use-sequence-actions";
import { useSequenceController } from "./features/sequence/use-sequence-controller";
import { parseSequenceSettings } from "./sequence-settings";
import { parseUseCaseSettings } from "./usecase-settings";
import { resolveTaskDates } from "./gantt-schedule";
import { analyzeCriticalPath } from "./schedule-analysis";
import { optionShortcut } from "./platform-shortcuts";
import { parseGanttCalendar } from "./gantt-calendar";
import { prepareForecastApply } from "./gantt-apply-forecast";
import { forecastToday } from "./forecast-date";
import { parseProjectSettings } from "./project-settings";
import type { DiagramKind, ViewMode } from "./model";
import { rendererLayoutEngineForDiagramKind, useRenderer } from "./render/use-renderer";
import { usePersistedWorkspace } from "./use-persisted-workspace";
import { useDiagramSelection } from "./use-diagram-selection";
import { useAppDialog } from "./use-app-dialog";
import { documentDisplayNames } from "./workspace-storage";
import {
  applySourceEdits,
  deleteTask,
  findTaskAt,
  moveVerticalSeparatorByDays,
  parseGantt,
  renameTask,
  renameResource,
} from "@plantuml-studio/diagram-gantt";
import { applicationGanttAdapter, applicationWbsAdapter } from "./diagram-adapters";
import { RenameSymbolDialog } from "./RenameSymbolDialog";
import { SymbolReferencesPanel } from "./SymbolReferencesPanel";
import { usePwa } from "./pwa";
import {
  confluencePlantUmlMarkup,
  copyDiagramImage,
  copyText,
  downloadDiagramPdf,
  plantUmlMarkdown,
} from "./diagram-export";
import type { Command } from "@plantuml-studio/editor-core";
import {
  downloadSvgAsPng,
  downloadText,
  svgFileName,
  plantUmlFileName,
  type WritableFileHandle,
  type FileSnapshot,
  type OpenedFileBytes,
} from "./file-service";
import { findWbsNodeAt, parseWbs, updateWbsNode } from "@plantuml-studio/diagram-wbs";
import { findSequenceObjectAt, parseSequence } from "@plantuml-studio/diagram-sequence";
import { findUseCaseObjectAt, parseUseCase } from "@plantuml-studio/diagram-usecase";
import { findClassObjectAt, parseClassDiagram } from "@plantuml-studio/diagram-class";
import { hashSource } from "@plantuml-studio/document-format";
import { findActivityObjectAt, parseActivity } from "@plantuml-studio/diagram-activity";
import { UseCaseDialogs } from "./features/usecase/UseCaseDialogs";
import { UseCaseInspectors } from "./features/usecase/UseCaseInspectors";
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
import {
  SOURCE_EDIT_DESCRIPTION,
  useSourceCommands,
  type SourceProblemPreview,
} from "./features/documents/use-source-commands";
import { useResourceCapacities } from "./use-resource-capacities";
import {
  createSemanticSymbolProvider,
  type SemanticRenameRequest,
  type SemanticSymbolOccurrence,
} from "./semantic-symbol-provider";
import { StorageStatus } from "./StorageStatus";
import { HistoryMenu } from "./HistoryMenu";
import { BulkTaskInspector } from "./BulkTaskInspector";
import { BulkDiagramInspector } from "./BulkDiagramInspector";
import { useDiagramMultiSelection } from "./use-diagram-multi-selection";
import {
  copyTasksText,
  deleteTasks,
  describeBulkResult,
  duplicateTasks,
  moveTasksByDays,
  pasteTasksText,
  setTasksColor,
  setTasksCompletion,
  setTasksResource,
  type BulkTaskResult,
} from "./gantt-bulk-operations";

function diagramFocusSelector(target: Element): string | undefined {
  for (const attribute of [
    "data-task-id",
    "data-sequence-participant-id",
    "data-usecase-object-id",
    "data-class-object-id",
    "data-activity-object-id",
    "data-wbs-node-id",
  ]) {
    const owner = target.closest(`[${attribute}]`);
    const value = owner?.getAttribute(attribute);
    if (value)
      return `[${attribute}="${CSS.escape(value)}"][tabindex], [${attribute}="${CSS.escape(value)}"] [tabindex]`;
  }
  return undefined;
}

const EMPTY_SEQUENCE_DOCUMENT = parseSequence("");
const EMPTY_USECASE_DOCUMENT = parseUseCase("");
const EMPTY_CLASS_DOCUMENT = parseClassDiagram("");
const EMPTY_ACTIVITY_DOCUMENT = parseActivity("");
const EMPTY_WBS_DOCUMENT = applicationWbsAdapter.parse("").document;

export function App() {
  const pwa = usePwa();
  const [workspace, setWorkspace, hydrated, tabs] = usePersistedWorkspace();
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
    projectInspectorOpen,
    setProjectInspectorOpen,
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
    resourcePanelOpen,
    setResourcePanelOpen,
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
  const [interactionMessage, setInteractionMessage] = useState<string>();
  const [problemsOpen, setProblemsOpen] = useState(false);
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
  const [problemPreview, setProblemPreview] = useState<SourceProblemPreview>();
  const [projectNavigatorOpen, setProjectNavigatorOpen] = useState(true);
  const [draggedTabId, setDraggedTabId] = useState<string>();
  const [tabMenu, setTabMenu] = useState<{ id: string; x: number; y: number }>();
  const [unsupportedOpen, setUnsupportedOpen] = useState(false);
  const fileHandles = useRef(new Map<string, WritableFileHandle>());
  const fileSnapshots = useRef(new Map<string, FileSnapshot>());
  const externalCheckSnoozedUntil = useRef(new Map<string, number>());
  const workspaceElement = useRef<HTMLElement>(null);
  useWorkspaceLayout(workspaceElement, hydrated);
  const { captureBeforeCommit } = useWorkspaceFocus(workspace.source, workspaceElement);
  const lastDiagramFocus = useRef<HTMLElement | SVGElement | undefined>(undefined);
  const lastDiagramFocusSelector = useRef<string | undefined>(undefined);
  const renameReturnFocus = useRef<HTMLElement | SVGElement | undefined>(undefined);
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
    hydrated && dialog?.kind !== "new-document" && workspace.viewMode !== "code",
    rendererLayoutEngineForDiagramKind(workspace.diagramKind),
    tabs.activeId,
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
  const parsed = useMemo(() => {
    const started = performance.now();
    const value = applicationGanttAdapter.parse(workspace.source);
    return { value, durationMs: performance.now() - started };
  }, [workspace.source]);
  const parseResult = parsed.value;
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
  const linkedGantt = tabs.documents.find(
    (item) => item.diagramKind === "gantt" && item.linkedWbsDocumentId === tabs.activeId,
  );
  const wbsNodeCompletion = useMemo(() => {
    const completion = new Map<string, number>();
    if (!linkedGantt) return completion;
    const tasks = parseGantt(linkedGantt.source).document.symbols.tasks;
    for (const link of linkedGantt.wbsGanttLinks ?? []) {
      const node = wbsDocument.nodes.find((item) => item.alias === link.wbsAlias);
      const value = tasks.get(link.ganttAlias.toLowerCase())?.completion?.value;
      if (node && value !== undefined) completion.set(node.id, value);
    }
    return completion;
  }, [linkedGantt, wbsDocument.nodes]);
  const wbsNodeSchedule = useMemo(() => {
    const details = new Map<string, NonNullable<ReturnType<typeof taskHoverDetails>>>();
    if (!linkedGantt) return details;
    const gantt = parseGantt(linkedGantt.source).document;
    const calendar = parseGanttCalendar(linkedGantt.source);
    const dates = resolveTaskDates(
      gantt.tasks,
      gantt.dependencies,
      gantt.projectStart?.resolved ? gantt.projectStart.value : undefined,
      calendar,
    );
    const analysis = analyzeCriticalPath(gantt.tasks, gantt.dependencies, dates, calendar);
    for (const link of linkedGantt.wbsGanttLinks ?? []) {
      const node = wbsDocument.nodes.find((item) => item.alias === link.wbsAlias);
      const task = gantt.symbols.tasks.get(link.ganttAlias.toLowerCase());
      if (!node || !task) continue;
      const summary = taskHoverDetails(task, gantt.dependencies, gantt.tasks, dates.get(task.id), analysis);
      if (summary) details.set(node.id, summary);
    }
    return details;
  }, [linkedGantt, wbsDocument.nodes]);
  const linkedWbs = activeDocument.linkedWbsDocumentId
    ? tabs.documents.find((item) => item.id === activeDocument.linkedWbsDocumentId && item.diagramKind === "wbs")
    : undefined;
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
        if (workspace.viewMode === "diagram") setWorkspace((current) => ({ ...current, viewMode: "split" }));
        setSelectionRequest({ ...next.range });
      }
    },
    [occurrencesFor, setWorkspace, workspace.viewMode],
  );
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
  const reportFileError = useCallback((error: unknown) => {
    setInteractionMessage(error instanceof Error ? error.message : "File operation failed");
  }, []);
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
    if (!hydrated || startupSplashShown.current || !tabs.session.onboarded) return;
    startupSplashShown.current = true;
    if (collaborationLinkDetails(window.location.href).roomId) return;
    openDialog({ kind: "new-document", replaceActiveDocument: activeDocument.historyId === "history-welcome" });
  }, [activeDocument.historyId, hydrated, openDialog, tabs.session.onboarded]);
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
  } = useActivityController(workspace.diagramKind, activityDocument);
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
  const activeDiagnostics = useMemo(
    () => diagnosticsForDiagram(workspace.diagramKind, workspace.source),
    [workspace.diagramKind, workspace.source],
  );
  const activeQuickFixes = useMemo(
    () => quickFixesForDiagram(workspace.diagramKind, workspace.source),
    [workspace.diagramKind, workspace.source],
  );
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
  const ganttCalendar = useMemo(() => parseGanttCalendar(workspace.source), [workspace.source]);
  // With a forecast enabled, `today` in the source resolves in the forecast time zone like its status date.
  const [reportsOpen, setReportsOpen] = useState(false);
  const [reportResource, setReportResource] = useState<string>();
  const planTimeZone = activeDocument.progressForecast?.enabled
    ? (activeDocument.progressForecast.timeZone ?? "UTC")
    : undefined;
  const resolvedTaskDates = useMemo(() => {
    return resolveTaskDates(
      parseResult.document.tasks,
      parseResult.document.dependencies,
      parseResult.document.projectStart?.resolved ? parseResult.document.projectStart.value : undefined,
      ganttCalendar,
      planTimeZone,
    );
  }, [ganttCalendar, parseResult.document, planTimeZone]);
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
    if (workspace.viewMode === "diagram") setSourceHighlightedTaskId(undefined);
  }, [setSourceHighlightedTaskId, workspace.viewMode]);

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

  const dismissAllInspectors = useCallback(() => {
    dismissInspectorSelection();
    dismissSequenceInspector();
    dismissUseCaseInspector();
    dismissClassInspector();
    dismissActivityInspector();
    setProjectInspectorOpen(false);
    setFocusNoteTaskId(undefined);
  }, [
    dismissActivityInspector,
    dismissClassInspector,
    dismissInspectorSelection,
    dismissSequenceInspector,
    dismissUseCaseInspector,
    setFocusNoteTaskId,
    setProjectInspectorOpen,
  ]);

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
      const inspectorTrigger =
        "[data-inspector-trigger], [data-task-id], [data-dependency-index], [data-divider-index], [data-vertical-separator-index], [data-sequence-participant-id], [data-sequence-message-id], [data-sequence-message-endpoint], [data-sequence-structure-id], [data-sequence-structure-endpoint], [data-usecase-object-id], [data-usecase-connect-from], [data-usecase-move-id], [data-usecase-relationship-endpoint], [data-class-object-id], [data-class-connect-from], [data-activity-object-id], [data-wbs-node-id], [data-wbs-connect-from], [data-wbs-relationship-id], [data-wbs-relationship-endpoint]";
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

  const diagramOutlineEntries = useMemo(() => {
    const source = workspace.source;
    const semantic = buildDiagramOutlineEntries(source, symbolOccurrences, workspace.diagramKind);
    const entry = (
      id: string,
      kind: string,
      typeLabel: string,
      label: string,
      range: { from: number; to: number },
      target: DiagramOutlineEntry["target"],
      group?: string,
    ): DiagramOutlineEntry => ({
      id,
      kind,
      typeLabel,
      label,
      range,
      target,
      ...(group ? { group } : {}),
      line: outlineLine(source, range),
    });
    const named = (id: string) =>
      parseResult.document.tasks.find((item) => item.id === id)?.label ??
      sequenceDocument.participants.find((item) => item.id === id)?.label ??
      useCaseDocument.elements.find((item) => item.id === id)?.label ??
      classDocument.entities.find((item) => item.id === id)?.label ??
      wbsDocument.nodes.find((item) => item.id === id)?.label ??
      id;
    const extras: DiagramOutlineEntry[] = [];

    if (workspace.diagramKind === "gantt") {
      parseResult.document.dependencies.forEach((item, index) =>
        extras.push(
          entry(
            `dependency:${index}`,
            "gantt-dependency",
            "Dependency",
            `${named(item.predecessorTaskId)} → ${named(item.successorTaskId)}`,
            item.sourceRange,
            { type: "gantt-dependency", index },
            "Dependencies",
          ),
        ),
      );
      parseResult.document.dividers.forEach((item, index) =>
        extras.push(
          entry(`divider:${index}`, "gantt-divider", "Divider", item.label, item.sourceRange, {
            type: "gantt-divider",
            index,
          }),
        ),
      );
      parseResult.document.verticalSeparators.forEach((item, index) =>
        extras.push(
          entry(
            `separator:${index}`,
            "gantt-separator",
            "Separator",
            `${item.taskLabel} ${item.anchor} ${item.direction} ${Math.abs(item.offset)} day${Math.abs(item.offset) === 1 ? "" : "s"}`,
            item.sourceRange,
            { type: "gantt-separator", index },
          ),
        ),
      );
    } else if (workspace.diagramKind === "sequence") {
      sequenceDocument.messages.forEach((item) =>
        extras.push(
          entry(
            `message:${item.id}`,
            "sequence-message",
            "Message",
            item.label || `${named(item.from)} → ${named(item.to)}`,
            item.sourceRange,
            { type: "sequence-message", id: item.id },
            `${named(item.from)} → ${named(item.to)}`,
          ),
        ),
      );
      sequenceStructures.forEach((item) => {
        const typeLabel =
          "branches" in item
            ? "Fragment"
            : "placement" in item
              ? "Note"
              : "participant" in item && "kind" in item
                ? "Activation"
                : "fromAnchor" in item
                  ? "Duration"
                  : "participants" in item && "multiline" in item
                    ? "Reference"
                    : "participants" in item
                      ? "Participant box"
                      : "command" in item
                        ? "Autonumber"
                        : "participantKind" in item
                          ? "Creation"
                          : "Timeline item";
        const label =
          "text" in item
            ? item.text
            : "label" in item && item.label
              ? item.label
              : "participant" in item
                ? `${"kind" in item ? item.kind : "create"} ${item.participant}`
                : "command" in item
                  ? `${item.command} ${item.value}`.trim()
                  : typeLabel;
        extras.push(
          entry(
            `structure:${item.id}`,
            `sequence-${typeLabel.toLowerCase().replaceAll(" ", "-")}`,
            typeLabel,
            label,
            item.sourceRange,
            {
              type: "sequence-structure",
              id: item.id,
            },
          ),
        );
      });
    } else if (workspace.diagramKind === "usecase") {
      useCaseDocument.relationships.forEach((item) =>
        extras.push(
          entry(
            `usecase:${item.id}`,
            "usecase-relationship",
            "Relationship",
            item.label || `${named(item.from)} → ${named(item.to)}`,
            item.sourceRange,
            {
              type: "usecase-object",
              id: item.id,
            },
          ),
        ),
      );
      useCaseDocument.notes.forEach((item) =>
        extras.push(
          entry(`usecase:${item.id}`, "usecase-note", "Note", item.text, item.sourceRange, {
            type: "usecase-object",
            id: item.id,
          }),
        ),
      );
    } else if (workspace.diagramKind === "class" || workspace.diagramKind === "component") {
      classDocument.relationships.forEach((item) =>
        extras.push(
          entry(
            `class:${item.id}`,
            "class-relationship",
            "Relationship",
            item.label || `${named(item.from)} → ${named(item.to)}`,
            item.sourceRange,
            {
              type: "class-object",
              id: item.id,
            },
          ),
        ),
      );
      classDocument.notes.forEach((item) =>
        extras.push(
          entry(`class:${item.id}`, "class-note", "Note", item.text, item.sourceRange, {
            type: "class-object",
            id: item.id,
          }),
        ),
      );
    } else if (workspace.diagramKind === "activity") {
      activityDocument.controls.forEach((item) =>
        extras.push(
          entry(
            `activity:${item.id}`,
            "activity-control",
            "Control",
            item.condition ?? item.label ?? item.kind,
            item.sourceRange,
            {
              type: "activity-object",
              id: item.id,
            },
          ),
        ),
      );
      activityDocument.notes.forEach((item) =>
        extras.push(
          entry(`activity:${item.id}`, "activity-note", "Note", item.text, item.sourceRange, {
            type: "activity-object",
            id: item.id,
          }),
        ),
      );
      activityDocument.arrows.forEach((item) =>
        extras.push(
          entry(`activity:${item.id}`, "activity-arrow", "Arrow", item.label ?? "Arrow", item.sourceRange, {
            type: "activity-object",
            id: item.id,
          }),
        ),
      );
    } else if (workspace.diagramKind === "wbs") {
      wbsDocument.relationships.forEach((item) =>
        extras.push(
          entry(
            `wbs:${item.id}`,
            "wbs-relationship",
            "Relationship",
            `${named(item.from)} → ${named(item.to)}`,
            item.sourceRange,
            {
              type: "wbs-relationship",
              id: item.id,
            },
          ),
        ),
      );
    }

    const groupedSemantic = semantic.map((item) => {
      const key = item.target.type === "semantic" ? item.target.occurrence.key : "";
      const task = parseResult.document.tasks.find((object) => object.id === key);
      const activityNode = activityDocument.nodes.find((object) => object.id === key);
      const parentId =
        useCaseDocument.elements.find((object) => object.id === key)?.packageId ??
        useCaseDocument.packages.find((object) => object.id === key)?.parentId ??
        classDocument.entities.find((object) => object.id === key)?.packageId ??
        classDocument.packages.find((object) => object.id === key)?.parentId ??
        activityDocument.nodes.find((object) => object.id === key)?.partitionId ??
        activityDocument.partitions.find((object) => object.id === key)?.parentId ??
        wbsDocument.nodes.find((object) => object.id === key)?.parentId;
      return {
        ...item,
        ...(task?.milestone ? { kind: "gantt-milestone", typeLabel: "Milestone" } : {}),
        ...(activityNode && activityNode.kind !== "action" ? { kind: "activity-terminal", typeLabel: "Terminal" } : {}),
        ...(parentId ? { group: named(parentId) } : {}),
      };
    });
    return [...groupedSemantic, ...extras].sort((left, right) => left.range.from - right.range.from);
  }, [
    activityDocument,
    classDocument,
    parseResult.document,
    sequenceDocument,
    sequenceStructures,
    symbolOccurrences,
    useCaseDocument,
    wbsDocument,
    workspace.diagramKind,
    workspace.source,
  ]);

  const revealOutlineOccurrence = (occurrence: SemanticSymbolOccurrence) => {
    if (workspace.viewMode === "diagram") update("viewMode", "split");
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

  const revealOutlineEntry = (entry: DiagramOutlineEntry) => {
    if (workspace.viewMode === "diagram") update("viewMode", "split");
    setSelectionRequest({ ...entry.range });
    switch (entry.target.type) {
      case "semantic":
        revealOutlineOccurrence(entry.target.occurrence);
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

  const openProjectInspector = useCallback(() => {
    setSelectedTaskId(undefined);
    setSelectedDependencyIndex(undefined);
    setProjectInspectorOpen(true);
  }, [setProjectInspectorOpen, setSelectedDependencyIndex, setSelectedTaskId]);

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

  const openResourcePanel = useCallback(() => {
    setSelectedTaskId(undefined);
    setSelectedDependencyIndex(undefined);
    setProjectInspectorOpen(false);
    setResourcePanelOpen(true);
  }, [setProjectInspectorOpen, setResourcePanelOpen, setSelectedDependencyIndex, setSelectedTaskId]);

  const update = useCallback(
    <K extends keyof typeof workspace>(key: K, value: (typeof workspace)[K]) => {
      setWorkspace((current) => ({ ...current, [key]: value }));
    },
    [setWorkspace],
  );

  const viewModes = useMemo(
    () => (workspace.advancedMode ? (["code", "split", "diagram"] as ViewMode[]) : (["diagram"] as ViewMode[])),
    [workspace.advancedMode],
  );
  useEffect(() => {
    if (!workspace.advancedMode && workspace.viewMode !== "diagram") update("viewMode", "diagram");
  }, [update, workspace.advancedMode, workspace.viewMode]);

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
        tabs.documents.some((document) => document.id === id && document.historyId.startsWith("project-history-"))
    : isLegacyProjectMemberTab;
  const portable = singleFileProject.portableProject;
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
          if (!node || !task) return [];
          return [
            {
              id: `${gantt.id}:${link.wbsAlias}:${link.ganttAlias}`,
              wbsLabel: node.label,
              ganttLabel: task.label,
              wbsDiagramName: wbs.name,
              ganttDiagramName: gantt.name,
              wbsDocumentId: wbs.id,
              ganttDocumentId: gantt.id,
              wbsNodeId: node.id,
              ganttTaskId: task.id,
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
  const addMissingProjectItem = async (item: WbsGanttMissingItem) => {
    if (!portable) return;
    const wbsId = item.kind === "wbs" ? item.documentId : item.counterpartDocumentId;
    const ganttId = item.kind === "gantt" ? item.documentId : item.counterpartDocumentId;
    const wbs = portable.diagrams.find((diagram) => diagram.id === wbsId);
    const gantt = portable.diagrams.find((diagram) => diagram.id === ganttId);
    if (!wbs || !gantt?.wbsGantt) return;
    const ganttTabId = await singleFileProject.openMember(ganttId);
    const wbsTabId = await singleFileProject.openMember(wbsId);
    if (!ganttTabId || !wbsTabId) return;
    const wbsTab = tabs.documents.find((tab) => tab.id === wbsTabId);
    const ganttTab = tabs.documents.find((tab) => tab.id === ganttTabId);
    const wbsSource = wbsTab?.source ?? wbs.document.current.source;
    const ganttSource = ganttTab?.source ?? gantt.document.current.source;
    const links = ganttTab?.wbsGanttLinks ?? gantt.wbsGantt.links;
    const dependencies = ganttTab?.wbsGanttDependencies ?? gantt.wbsGantt.dependencies;
    try {
      const result =
        item.kind === "wbs"
          ? convertWbsToGantt(wbsSource, ganttSource, links, dependencies, "keep-scheduled", true, [item.key])
          : addMissingGanttTasksToWbs(wbsSource, ganttSource, links, dependencies, [item.key]);
      updateLinkedSource({ id: wbsTabId, source: wbsSource }, result.wbsSource, "wbs", "Add missing linked work");
      updateLinkedSource(
        { id: ganttTabId, source: ganttSource },
        result.ganttSource,
        "gantt",
        "Add missing linked work",
      );
      tabs.updateDocumentFormat(ganttTabId, {
        wbsGanttLinks: result.links,
        wbsGanttDependencies: result.dependencies,
      });
      setInteractionMessage(
        `Added ${item.label} to ${item.kind === "wbs" ? gantt.name : wbs.name}${result.warnings.length ? `. ${result.warnings.join(" ")}` : ""}`,
      );
      if (item.kind === "wbs") {
        const alias = parseWbs(result.wbsSource).nodes.find((node) => node.id === item.key)?.alias;
        const taskAlias = result.links.find((link) => link.wbsAlias === alias)?.ganttAlias;
        tabs.activateDocument(ganttTabId);
        if (taskAlias) window.setTimeout(() => setSelectedTaskId(taskAlias.toLowerCase()), 100);
      } else {
        const alias = result.links.find((link) => link.ganttAlias.toLowerCase() === item.key)?.wbsAlias;
        const node = parseWbs(result.wbsSource).nodes.find((candidate) => candidate.alias === alias);
        tabs.activateDocument(wbsTabId);
        if (node) setPendingProjectWbsSelection({ tabId: wbsTabId, nodeId: node.id });
      }
    } catch (error) {
      setInteractionMessage(error instanceof Error ? error.message : "Could not add linked work");
    }
  };
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
    setInteractionMessage("Exported PlantUML source (plaintext)");
  }, [activeDocument.encrypted, activeDocument.progressForecast, workspace.fileName, workspace.source]);
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
  });
  const exportSvg = useCallback(() => {
    if (!result?.svg || result.source !== workspace.source || result.documentId !== tabs.activeId) {
      setInteractionMessage("Render a valid diagram before exporting SVG");
      return;
    }
    downloadText(result.svg, svgFileName(workspace.fileName), "image/svg+xml;charset=utf-8");
  }, [result, workspace.fileName, workspace.source, tabs.activeId]);
  const exportPng = useCallback(async () => {
    if (!result?.svg || result.source !== workspace.source || result.documentId !== tabs.activeId) {
      setInteractionMessage("Render a valid diagram before exporting PNG");
      return;
    }
    try {
      await downloadSvgAsPng(result.svg, workspace.fileName);
    } catch (error) {
      reportFileError(error);
    }
  }, [reportFileError, result, workspace.fileName, workspace.source, tabs.activeId]);
  const exportPdf = useCallback(async () => {
    if (!result?.svg || result.source !== workspace.source || result.documentId !== tabs.activeId) {
      setInteractionMessage("Render a valid diagram before exporting PDF");
      return;
    }
    try {
      await downloadDiagramPdf(result.svg, workspace.fileName);
      setInteractionMessage("Exported PDF");
    } catch (error) {
      reportFileError(error);
    }
  }, [reportFileError, result, workspace.fileName, workspace.source, tabs.activeId]);
  const copyImage = useCallback(async () => {
    if (!result?.svg || result.source !== workspace.source || result.documentId !== tabs.activeId) {
      setInteractionMessage("Render a valid diagram before copying it");
      return;
    }
    try {
      await copyDiagramImage(result.svg);
      setInteractionMessage("Copied diagram image");
    } catch (error) {
      setInteractionMessage(error instanceof Error ? error.message : "Could not copy the diagram image");
    }
  }, [result, workspace.source, tabs.activeId]);
  const copySourceAs = useCallback(async (text: string, label: string) => {
    try {
      await copyText(text);
      setInteractionMessage(`Copied ${label}`);
    } catch (error) {
      setInteractionMessage(error instanceof Error ? error.message : `Could not copy ${label}`);
    }
  }, []);
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

  const commands = useMemo<Command[]>(() => {
    const diagramCommands: Command[] =
      workspace.diagramKind === "gantt"
        ? [
            {
              id: "edit.add-task",
              label: "Add task…",
              category: "Edit",
              shortcut: optionShortcut("T"),
              run: () => openDialog({ kind: "add-task" }),
            },
            {
              id: "edit.add-milestone",
              label: "Add milestone…",
              category: "Edit",
              shortcut: optionShortcut("M"),
              run: () => openDialog({ kind: "add-milestone" }),
            },
            {
              id: "edit.add-divider",
              label: "Add divider…",
              category: "Edit",
              shortcut: optionShortcut("D"),
              run: () => openDialog({ kind: "add-divider" }),
            },
            { id: "edit.project-calendar", label: "Calendar & schedule…", category: "Edit", run: openProjectInspector },
            { id: "edit.legend", label: "Legend labels…", category: "Edit", run: () => setLegendInspectorOpen(true) },
            {
              id: "view.reports",
              label: "Reports…",
              category: "View",
              run: () => {
                setReportResource(undefined);
                setReportsOpen(true);
              },
            },
            { id: "view.resource-workload", label: "Resource workload…", category: "View", run: openResourcePanel },
            {
              id: "view.delivery-scenario",
              label: "Gantt analysis…",
              category: "View",
              run: () => openDialog({ kind: "delivery-scenario" }),
            },
          ]
        : workspace.diagramKind === "wbs"
          ? [
              {
                id: "edit.add-wbs-node",
                label: "Add WBS node…",
                category: "Edit",
                shortcut: optionShortcut("N"),
                run: () => openDialog({ kind: "add-wbs-node" }),
              },
              {
                id: "edit.wbs-settings",
                label: "WBS settings…",
                category: "Edit",
                run: openWbsSettings,
              },
            ]
          : [
              {
                id: "edit.add-participant",
                label: "Add participant…",
                category: "Edit",
                shortcut: optionShortcut("P"),
                run: () => openDialog({ kind: "add-sequence-participant" }),
              },
              {
                id: "edit.add-message",
                label: "Add message…",
                category: "Edit",
                shortcut: optionShortcut("M"),
                run: () => openDialog({ kind: "add-sequence-message" }),
              },
              {
                id: "edit.add-fragment",
                label: "Add combined fragment…",
                category: "Edit",
                run: () => openDialog({ kind: "add-sequence-structure", structureKind: "fragment" }),
              },
              {
                id: "edit.add-activation",
                label: "Add activation…",
                category: "Edit",
                run: () => openDialog({ kind: "add-sequence-structure", structureKind: "activation" }),
              },
              {
                id: "edit.add-note",
                label: "Add Sequence note…",
                category: "Edit",
                run: () => openDialog({ kind: "add-sequence-structure", structureKind: "note" }),
              },
            ];
    return [
      { id: "file.new", label: "New diagram", category: "File", shortcut: "⌘N", run: newDocument },
      { id: "file.open", label: "Open…", category: "File", shortcut: "⌘O", run: openDocument },
      { id: "file.save", label: "Save", category: "File", shortcut: "⌘S", run: saveCurrentDocument },
      { id: "settings.open", label: "Settings…", category: "View", run: () => setSettingsOpen(true) },
      ...(["light", "dark", "system"] as const).map((theme) => ({
        id: `appearance.${theme}`,
        label: `App theme: ${theme}`,
        category: "Appearance",
        run: () => update("theme", theme),
      })),
      { id: "view.issues", label: "Issues", category: "View", run: () => setProblemsOpen(true) },
      { id: "file.save-as", label: "Save as…", category: "File", run: saveCurrentDocumentAs },
      ...(project
        ? [
            {
              id: "project.connections",
              label: "Diagram connections",
              category: "Document",
              run: showDocumentNavigator,
            },
          ]
        : []),
      { id: "file.backup", label: "Back up workspace", category: "File", run: backupWorkspace },
      { id: "file.restore", label: "Restore workspace…", category: "File", run: () => void restoreWorkspace() },
      {
        id: "collaboration.open",
        label: collaboration ? "Show collaboration room" : "Start collaboration…",
        category: "Collaboration",
        run: () => setCollaborationDialogOpen(true),
      },
      {
        id: "view.diagram-outline",
        label: "Diagram outline…",
        category: "View",
        shortcut: "⇧⌘O",
        run: () => openDialog({ kind: "diagram-outline" }),
      },
      ...diagramCommands,
      {
        id: "help.reference",
        label: "Help & keyboard shortcuts",
        category: "Help",
        shortcut: "?",
        run: () => openDialog({ kind: "help" }),
      },
      { id: "edit.undo", label: "Undo", category: "Edit", shortcut: "⌘Z", enabled: activeHistory.canUndo, run: undo },
      { id: "edit.redo", label: "Redo", category: "Edit", shortcut: "⇧⌘Z", enabled: activeHistory.canRedo, run: redo },
      ...viewModes.map((mode, index) => ({
        id: `view.${mode}`,
        label: `${mode[0]!.toUpperCase()}${mode.slice(1)} view`,
        category: "View",
        shortcut: `⌘${index + 1}`,
        run: () => update("viewMode", mode),
      })),
      {
        id: "view.zoom-in",
        label: "Zoom in",
        category: "View",
        run: () => update("zoom", Math.min(MAX_DIAGRAM_ZOOM, workspace.zoom + 0.1)),
      },
      {
        id: "view.zoom-out",
        label: "Zoom out",
        category: "View",
        run: () => update("zoom", Math.max(0.5, workspace.zoom - 0.1)),
      },
      { id: "export.source", label: "Export source", category: "Export", run: exportSource },
      {
        id: "export.svg",
        label: "Export SVG",
        category: "Export",
        enabled: Boolean(result?.svg && result.source === workspace.source && result.documentId === tabs.activeId),
        run: exportSvg,
      },
      {
        id: "export.png",
        label: "Export PNG",
        category: "Export",
        enabled: Boolean(result?.svg && result.source === workspace.source && result.documentId === tabs.activeId),
        run: exportPng,
      },
      {
        id: "export.pdf",
        label: "Export PDF",
        category: "Export",
        enabled: Boolean(result?.svg && result.source === workspace.source && result.documentId === tabs.activeId),
        run: exportPdf,
      },
      {
        id: "export.copy-image",
        label: "Copy diagram image",
        category: "Export",
        enabled: Boolean(result?.svg && result.source === workspace.source && result.documentId === tabs.activeId),
        run: copyImage,
      },
      { id: "export.copy-markdown", label: "Copy as Markdown", category: "Export", run: copyMarkdown },
      { id: "export.copy-confluence", label: "Copy for Confluence", category: "Export", run: copyConfluence },
    ];
  }, [
    activeHistory,
    backupWorkspace,
    collaboration,
    copyConfluence,
    copyImage,
    copyMarkdown,
    exportPdf,
    exportPng,
    exportSource,
    exportSvg,
    newDocument,
    openDocument,
    openDialog,
    openWbsSettings,
    openProjectInspector,
    openResourcePanel,
    project,
    redo,
    restoreWorkspace,
    result,
    tabs.activeId,
    workspace.source,
    saveCurrentDocument,
    saveCurrentDocumentAs,
    setCollaborationDialogOpen,
    showDocumentNavigator,
    setLegendInspectorOpen,
    undo,
    update,
    viewModes,
    workspace.zoom,
    workspace.diagramKind,
  ]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      const editingOutsideCodeEditor =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (target?.isContentEditable && !target.closest(".cm-editor"));
      const modalOpen = Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
      if (event.key === "Escape") {
        if (document.querySelector(".icon-field-panel, .color-field-panel")) return;
        dismissAllInspectors();
        clearSelectedWbsNode();
        clearSelectedWbsRelationship();
        closeWbsSettings();
        return;
      }
      if (event.key === "?" && !event.metaKey && !event.ctrlKey && !event.altKey && !editing) {
        event.preventDefault();
        openDialog({ kind: "help" });
        return;
      }
      if (
        event.altKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !editingOutsideCodeEditor &&
        !modalOpen &&
        !event.repeat
      ) {
        const creation =
          event.code === "KeyT"
            ? "t"
            : event.code === "KeyM"
              ? "m"
              : event.code === "KeyD"
                ? "d"
                : event.code === "KeyP"
                  ? "p"
                  : event.code === "KeyN"
                    ? "n"
                    : "";
        if (workspace.diagramKind === "wbs" && creation === "n") {
          event.preventDefault();
          openDialog({ kind: "add-wbs-node" });
          return;
        }
        if (workspace.diagramKind === "sequence" && (creation === "p" || creation === "m")) {
          event.preventDefault();
          if (creation === "p") openDialog({ kind: "add-sequence-participant" });
          else openDialog({ kind: "add-sequence-message" });
          return;
        }
        if (workspace.diagramKind === "gantt" && (creation === "t" || creation === "m" || creation === "d")) {
          event.preventDefault();
          if (creation === "t") openDialog({ kind: "add-task" });
          else if (creation === "m") openDialog({ kind: "add-milestone" });
          else openDialog({ kind: "add-divider" });
          return;
        }
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (event.shiftKey && key === "p") {
        event.preventDefault();
        toggleCommandPalette();
        return;
      }
      if (modalOpen) {
        // Document commands must not act on the document behind a dialog. Still block the browser's
        // own save, open, new-window and close-tab shortcuts.
        if (["s", "o", "n", "w"].includes(key)) event.preventDefault();
        return;
      }
      // Text fields keep their native undo and redo.
      if (key === "z" && editingOutsideCodeEditor) return;
      // Copy, paste and duplicate Gantt tasks when focus is on the diagram rather than in text.
      if (!editing && workspace.diagramKind === "gantt" && !event.shiftKey && !event.altKey) {
        const shortcuts = taskShortcuts.current;
        if (key === "c" && shortcuts.selectedTaskIds.length) {
          event.preventDefault();
          shortcuts.copySelectedTasks();
          return;
        }
        if (key === "v" && taskClipboard.current) {
          event.preventDefault();
          shortcuts.pasteCopiedTasks();
          return;
        }
        if (key === "d" && shortcuts.selectedTaskIds.length) {
          event.preventDefault();
          shortcuts.duplicateSelectedTasks();
          return;
        }
      }
      if (event.shiftKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        openDialog({ kind: "diagram-outline" });
        return;
      }
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        newDocument();
        return;
      }
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (key === "y" && !event.shiftKey && !editingOutsideCodeEditor) {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveCurrentDocument();
        return;
      }
      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        void openDocument();
        return;
      }
      if (event.key.toLowerCase() === "w") {
        event.preventDefault();
        closeTab(tabs.activeId);
        return;
      }
      const mode = event.key === "1" ? "code" : event.key === "2" ? "split" : event.key === "3" ? "diagram" : undefined;
      if (mode) {
        event.preventDefault();
        update("viewMode", mode);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    closeTab,
    dismissAllInspectors,
    clearSelectedWbsNode,
    clearSelectedWbsRelationship,
    closeWbsSettings,
    newDocument,
    openDialog,
    openDocument,
    redo,
    saveCurrentDocument,
    saveActiveProject,
    saveDocument,
    tabs.activeId,
    toggleCommandPalette,
    undo,
    update,
    usingSingleFileProject,
    workspace.diagramKind,
  ]);

  const resize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (workspace.viewMode !== "split") return;
    const root = event.currentTarget.parentElement;
    if (!root) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      update("splitPercent", Math.min(80, Math.max(20, ((moveEvent.clientX - rect.left) / rect.width) * 100)));
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  };

  const restorePreviousFocus = useCallback((preferred?: HTMLElement | SVGElement) => {
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const remembered = lastDiagramFocusSelector.current
          ? document.querySelector<HTMLElement | SVGElement>(lastDiagramFocusSelector.current)
          : undefined;
        const target = preferred?.isConnected ? preferred : (remembered ?? lastDiagramFocus.current);
        if (target?.isConnected) target.focus({ preventScroll: true });
        else workspaceElement.current?.focus({ preventScroll: true });
      }),
    );
  }, []);
  const restoreRenamedDiagramFocus = useCallback(
    (kind: SemanticSymbolOccurrence["kind"], key: string | undefined) => {
      if (!key || !renameReturnFocus.current?.closest(".diagram")) {
        restorePreviousFocus(renameReturnFocus.current);
        return;
      }
      const attribute =
        kind === "task"
          ? "data-task-id"
          : kind === "participant"
            ? "data-sequence-participant-id"
            : kind === "actor" || kind === "usecase" || kind === "usecase-package"
              ? "data-usecase-object-id"
              : kind === "class-entity" || kind === "class-package"
                ? "data-class-object-id"
                : kind === "activity-action" || kind === "activity-partition"
                  ? "data-activity-object-id"
                  : kind === "wbs-node"
                    ? "data-wbs-node-id"
                    : undefined;
      const selector = attribute
        ? `[${attribute}="${CSS.escape(key)}"][tabindex], [${attribute}="${CSS.escape(key)}"] [tabindex]`
        : undefined;
      pendingDiagramFocusSelector.current = selector;
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => {
          const target = selector ? document.querySelector<HTMLElement | SVGElement>(selector) : undefined;
          if (target) {
            pendingDiagramFocusSelector.current = undefined;
            lastDiagramFocus.current = target;
            lastDiagramFocusSelector.current = selector;
            target.focus({ preventScroll: true });
          } else restorePreviousFocus();
        }),
      );
    },
    [restorePreviousFocus],
  );

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
    selectedTask ||
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
  const canDuplicateMenuElement = !!menuOccurrence && diagramMulti.canDuplicateAt(menuOccurrence.range);

  if (!hydrated) return <main role="status">Restoring workspace…</main>;

  return (
    <div
      className={`app${sideInspectorOpen || diagramMulti.multiple ? " has-side-inspector" : ""}${projectInspectorOpen ? " has-project-inspector" : ""}${project && projectNavigatorOpen && !sideInspectorOpen && !diagramMulti.multiple ? " has-project-navigator" : ""}`}
      data-theme={workspace.theme}
      onClickCapture={(event) => {
        if (!(event.target instanceof Element)) return;
        const close = event.target.closest<HTMLButtonElement>(".task-inspector > header button");
        if (close && !close.closest(".problems-panel")) restorePreviousFocus(lastDiagramFocus.current);
      }}
    >
      <header className="toolbar">
        <strong>PlantUML Ultimate</strong>
        <div className="file-tools" aria-label="File controls">
          <FileMenu
            saving={fileSaving}
            canExport={Boolean(
              result?.svg && result.source === workspace.source && result.documentId === tabs.activeId,
            )}
            onNew={newDocument}
            onNewProject={() => openDialog({ kind: "new-project" })}
            onOpen={() => void openDocument()}
            onOpenProject={() => void singleFileProject.openProject()}
            onProjectConnections={project ? showDocumentNavigator : undefined}
            projectName={project?.manifest.name}
            onSave={() => void saveCurrentDocument()}
            onSaveAs={() => void saveCurrentDocumentAs()}
            onVersionHistory={() => void openVersionHistory()}
            onDocumentSettings={() => setDocumentSettingsOpen(true)}
            onDeliveryScenario={
              workspace.diagramKind === "gantt" ? () => openDialog({ kind: "delivery-scenario" }) : undefined
            }
            onJira={workspace.diagramKind === "gantt" ? () => setJiraDialogOpen(true) : undefined}
            onBackup={backupWorkspace}
            onRestore={() => void restoreWorkspace()}
            onExportSource={exportSource}
            onExportSvg={exportSvg}
            onExportPng={() => void exportPng()}
            onExportPdf={() => void exportPdf()}
            onCopyImage={() => void copyImage()}
            onCopyMarkdown={() => void copyMarkdown()}
            onCopyConfluence={() => void copyConfluence()}
          />
          <button
            type="button"
            className="save-button"
            disabled={fileSaving}
            onClick={() => void saveCurrentDocument()}
            title="Save (Ctrl/Cmd+S)"
          >
            Save
          </button>
          <button onClick={() => openDialog({ kind: "command-palette" })} title="Command palette (Cmd/Ctrl+Shift+P)">
            Commands
          </button>
          <button
            className={collaboration ? `collaboration-button ${collaboration.connection}` : "collaboration-button"}
            onClick={() => setCollaborationDialogOpen(true)}
          >
            {collaboration ? `${collaboration.participants.length} online` : "Collaborate"}
          </button>
          <ActionMenu
            label="More"
            actions={[
              ...(workspace.diagramKind === "gantt"
                ? [
                    {
                      label: "Reports…",
                      run: () => {
                        setReportResource(undefined);
                        setReportsOpen(true);
                      },
                    },
                  ]
                : []),
              { label: "Settings…", run: () => setSettingsOpen(true) },
              { label: "Help", run: () => openDialog({ kind: "help" }) },
            ]}
          />
        </div>
        <div className="document-identity">
          <span
            className="document-name"
            title={
              activeInSingleFileProject || activeInLegacyProject
                ? (project?.manifest.name ?? workspace.fileName)
                : workspace.fileName
            }
          >
            {activeInSingleFileProject || activeInLegacyProject
              ? (project?.manifest.name ?? workspace.fileName)
              : workspace.fileName}
          </span>
          <FileSaveStatus
            dirty={activeInSingleFileProject ? singleFileProject.dirty : Boolean(activeDocument.dirty)}
            state={
              activeInSingleFileProject
                ? singleFileProject.fileSaveState?.documentId === singleFileProject.portableProject?.projectId
                  ? singleFileProject.fileSaveState
                  : undefined
                : activeInLegacyProject && legacySaveState?.documentId === project?.manifest.projectId
                  ? legacySaveState
                  : standaloneSaveState?.documentId === tabs.activeId
                    ? standaloneSaveState
                    : undefined
            }
            onRetry={() => void saveCurrentDocument()}
          />
        </div>
        <div className="history-tools" aria-label="History controls">
          <button onClick={undo} disabled={!activeHistory.canUndo} aria-label="Undo">
            ↶
          </button>
          <button onClick={redo} disabled={!activeHistory.canRedo} aria-label="Redo">
            ↷
          </button>
          <HistoryMenu
            undoSteps={activeHistory.undoDescriptions}
            redoSteps={activeHistory.redoDescriptions}
            onUndo={undo}
            onRedo={redo}
          />
        </div>
      </header>
      <nav className="document-tabs" aria-label="Open documents">
        {tabs.documents.map((document) => (
          <button
            key={document.id}
            draggable
            className={`${document.id === tabs.activeId ? "active" : ""}${document.id === draggedTabId ? " dragging" : ""}`}
            onClick={() => activateTab(document.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              setTabMenu({ id: document.id, x: event.clientX, y: event.clientY });
            }}
            onKeyDown={(event) => {
              if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
              event.preventDefault();
              const bounds = event.currentTarget.getBoundingClientRect();
              setTabMenu({ id: document.id, x: Math.min(bounds.left, window.innerWidth - 210), y: bounds.bottom });
            }}
            onDragStart={(event) => {
              setDraggedTabId(document.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", document.id);
            }}
            onDragEnd={() => setDraggedTabId(undefined)}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              const id = event.dataTransfer.getData("text/plain") || draggedTabId;
              if (id) tabs.reorderDocument(id, document.id);
              setDraggedTabId(undefined);
            }}
            title={`${document.fileName}${isProjectMemberTab(document.id) ? ` — diagram in document ${project?.manifest.name}` : ""}${document.dirty ? " — unsaved changes" : ""}`}
          >
            <span className="tab-label">
              <span className={`dirty-dot${document.dirty ? " visible" : ""}`} aria-hidden="true">
                ●
              </span>
              {tabLabels.get(document.id)}
              {isProjectMemberTab(document.id) && <small className="tab-project-badge">Document</small>}
            </span>
            <span
              className="tab-close"
              role="button"
              aria-label={`Close ${document.fileName}`}
              onClick={(event) => {
                event.stopPropagation();
                closeTab(document.id);
              }}
            >
              ×
            </span>
          </button>
        ))}
        <button className="new-tab" onClick={newDocument} aria-label="New diagram tab">
          +
        </button>
      </nav>
      <section className="toolbar workspace-toolbar" aria-label="Diagram controls">
        <div className="diagram-tools">
          {" "}
          <AddMenu
            diagramKind={workspace.diagramKind}
            disabled={collaborationAppliesToActiveDiagram && collaboration?.role === "viewer"}
            onTask={() => openDialog({ kind: "add-task" })}
            onMilestone={() => openDialog({ kind: "add-milestone" })}
            onDivider={() => openDialog({ kind: "add-divider" })}
            onParticipant={() => openDialog({ kind: "add-sequence-participant" })}
            onMessage={() => openDialog({ kind: "add-sequence-message" })}
            onFragment={() => openDialog({ kind: "add-sequence-structure", structureKind: "fragment" })}
            onActivation={() => openDialog({ kind: "add-sequence-structure", structureKind: "activation" })}
            onNote={() => openDialog({ kind: "add-sequence-structure", structureKind: "note" })}
            onSequenceSpacing={() => openDialog({ kind: "add-sequence-structure", structureKind: "separator" })}
            onReference={() => openDialog({ kind: "add-sequence-structure", structureKind: "reference" })}
            onParticipantBox={() => openDialog({ kind: "add-sequence-structure", structureKind: "box" })}
            onUseCaseActor={() => openDialog({ kind: "add-usecase-element", elementKind: "actor" })}
            onUseCase={() => openDialog({ kind: "add-usecase-element", elementKind: "usecase" })}
            onUseCaseRelationship={() => openDialog({ kind: "add-usecase-relationship" })}
            onUseCasePackage={() => openDialog({ kind: "add-usecase-package" })}
            onUseCaseNote={() => openDialog({ kind: "add-usecase-note" })}
            onClassEntity={() => openDialog({ kind: "add-class-entity" })}
            onClassRelationship={() => openDialog({ kind: "add-class-relationship" })}
            onClassPackage={() => openDialog({ kind: "add-class-package" })}
            onClassNote={() => openDialog({ kind: "add-class-note" })}
            onActivityAction={() => openDialog({ kind: "add-activity-action" })}
            onActivityPartition={() => openDialog({ kind: "add-activity-partition" })}
            onActivityNote={() => openDialog({ kind: "add-activity-note" })}
            onActivityStructure={() => openDialog({ kind: "add-activity-structure" })}
            onActivityTerminal={() => openDialog({ kind: "add-activity-terminal" })}
            onActivityArrow={() => openDialog({ kind: "add-activity-arrow" })}
            onWbsNode={() => openDialog({ kind: "add-wbs-node" })}
          />
          <button
            type="button"
            className={dialog?.kind === "diagram-outline" ? "active" : ""}
            onClick={() => openDialog({ kind: "diagram-outline" })}
          >
            Outline
          </button>
          {workspace.diagramKind === "gantt" && (
            <>
              <button data-inspector-trigger onClick={openProjectInspector}>
                Calendar &amp; schedule
              </button>
              <button data-inspector-trigger onClick={openResourcePanel}>
                Workload
              </button>
            </>
          )}
          {workspace.diagramKind === "sequence" && (
            <button data-inspector-trigger onClick={openSequenceSettings}>
              Diagram settings
            </button>
          )}
          {workspace.diagramKind === "usecase" && (
            <button data-inspector-trigger onClick={openUseCaseSettingsFromToolbar}>
              Diagram settings
            </button>
          )}
          {(workspace.diagramKind === "class" || workspace.diagramKind === "component") && (
            <button data-inspector-trigger onClick={openClassSettingsFromToolbar}>
              Diagram settings
            </button>
          )}
          {workspace.diagramKind === "activity" && (
            <button data-inspector-trigger onClick={openActivitySettingsFromToolbar}>
              Diagram settings
            </button>
          )}
          {(workspace.diagramKind === "wbs" || (workspace.diagramKind === "gantt" && linkedWbs)) && (
            <ActionMenu
              label="Linked diagrams"
              count={
                (workspace.diagramKind === "wbs" ? missingWbsTaskCount : missingGanttTaskCount) +
                projectWbsGanttIssues.length
              }
              actions={[
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
              ]}
            />
          )}
          {workspace.diagramKind === "wbs" && (
            <button
              data-inspector-trigger
              onClick={() => {
                openWbsSettingsFromToolbar();
              }}
            >
              Diagram settings
            </button>
          )}
        </div>
        <div className="diagram-options">
          {" "}
          {workspace.diagramKind === "gantt" && (
            <label className="resource-filter">
              Filter by resource{" "}
              <select value={resourceFilter} onChange={(event) => setResourceFilter(event.target.value)}>
                <option value="">All</option>
                {resourceNames.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
          )}
          {workspace.diagramKind === "gantt" && (
            <label
              className="schedule-mode"
              title="When moving tasks: ask which tasks to move, move only this task, or include dependents"
            >
              When moving tasks{" "}
              <select
                value={scheduleMode}
                onChange={(event) => setScheduleMode(event.target.value as typeof scheduleMode)}
              >
                <option value="ask">Always ask</option>
                <option value="single">Only task</option>
                <option value="cascade">Include dependents</option>
              </select>
            </label>
          )}
        </div>
        <nav aria-label="View mode">
          {viewModes.map((mode, index) => (
            <button
              className={workspace.viewMode === mode ? "active" : ""}
              onClick={() => update("viewMode", mode)}
              aria-pressed={workspace.viewMode === mode}
              title={`Ctrl/Cmd+${index + 1}`}
              key={mode}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </nav>
        <WorkspaceHint key={workspace.diagramKind} kind={workspace.diagramKind} />
      </section>
      {tabMenu && (
        <div
          className="tab-menu"
          role="menu"
          aria-label="Tab actions"
          style={{ left: tabMenu.x, top: tabMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setTabMenu(undefined);
              document.querySelector<HTMLButtonElement>(".document-tabs > button.active")?.focus();
              return;
            }
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            const items = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
            ];
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
          }}
        >
          <button
            role="menuitem"
            disabled={tabs.documents.findIndex((document) => document.id === tabMenu.id) <= 0}
            onClick={() => {
              const index = tabs.documents.findIndex((document) => document.id === tabMenu.id);
              const previous = tabs.documents[index - 1];
              if (previous) tabs.reorderDocument(tabMenu.id, previous.id);
              setTabMenu(undefined);
            }}
          >
            Move tab left
          </button>
          <button
            role="menuitem"
            disabled={tabs.documents.findIndex((document) => document.id === tabMenu.id) >= tabs.documents.length - 1}
            onClick={() => {
              const index = tabs.documents.findIndex((document) => document.id === tabMenu.id);
              const next = tabs.documents[index + 1];
              if (next) tabs.reorderDocument(next.id, tabMenu.id);
              setTabMenu(undefined);
            }}
          >
            Move tab right
          </button>
          <button role="menuitem" onClick={() => duplicateTab(tabMenu.id)}>
            Duplicate
          </button>
          <button role="menuitem" disabled={tabs.documents.length < 2} onClick={() => closeOtherTabs(tabMenu.id)}>
            Close other tabs
          </button>
          <button
            role="menuitem"
            onClick={() => {
              closeTab(tabMenu.id);
              setTabMenu(undefined);
            }}
          >
            Close
          </button>
        </div>
      )}
      <main
        ref={workspaceElement}
        tabIndex={-1}
        className={`workspace mode-${workspace.viewMode}`}
        onClickCapture={diagramMulti.onClickCapture}
        onKeyDownCapture={diagramMulti.onKeyDownCapture}
        onPointerDownCapture={(event) => {
          diagramMulti.onPointerDownCapture(event);
          if (!(event.target instanceof Element) || !event.target.closest(".diagram")) return;
          const target = event.target.closest<HTMLElement | SVGElement>("[tabindex], button");
          if (target) {
            lastDiagramFocus.current = target;
            lastDiagramFocusSelector.current = diagramFocusSelector(event.target);
          }
        }}
        onFocusCapture={(event) => {
          if (!(event.target instanceof Element) || !event.target.closest(".diagram")) return;
          const target = event.target.closest<HTMLElement | SVGElement>("[tabindex], button");
          if (target) {
            lastDiagramFocus.current = target;
            lastDiagramFocusSelector.current = diagramFocusSelector(event.target);
          }
        }}
        onContextMenu={(event) => {
          if (!(event.target instanceof Element) || event.target.closest(".cm-editor")) return;
          if (
            !openClassMemberMenu(event.target, event.clientX, event.clientY) &&
            !openDiagramSymbolMenu(event.target, event.clientX, event.clientY)
          )
            return;
          event.preventDefault();
          event.stopPropagation();
        }}
        onKeyDown={(event) => {
          if (
            (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) ||
            !(event.target instanceof Element)
          )
            return;
          if (!openClassMemberMenu(event.target, 0, 0) && !openDiagramSymbolMenu(event.target, 0, 0)) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        style={{
          gridTemplateColumns:
            workspace.viewMode === "split"
              ? `min(${workspace.splitPercent}vw, calc(100% - 205px)) 5px minmax(0, 1fr)`
              : undefined,
        }}
      >
        {workspace.viewMode !== "diagram" && (
          <CodeEditor
            documentId={tabs.activeId}
            diagramKind={workspace.diagramKind}
            value={workspace.source}
            readOnly={collaborationAppliesToActiveDiagram && collaboration?.role === "viewer"}
            onChange={(source) => commitSource(source, SOURCE_EDIT_DESCRIPTION, false)}
            onApplyFix={(source, label) => {
              setRepairCategoryFilter((current) => (current ? { ...current, source } : undefined));
              commitSource(source, `Apply fix: ${label}`, false);
            }}
            selectedRange={selectionRequest}
            repairHost={repairHost}
            repairWorkspaceOpen={problemsOpen}
            repairCategoryFilter={
              repairCategoryFilter?.source === workspace.source && repairCategoryFilter.documentId === tabs.activeId
                ? repairCategoryFilter.category
                : undefined
            }
            onFilterRepairCategory={(category) =>
              setRepairCategoryFilter({ source: workspace.source, documentId: tabs.activeId, category })
            }
            onOpenRepairWorkspace={() => {
              setProblemPreview(undefined);
              setProblemsOpen(true);
            }}
            repairRequest={repairRequest}
            onRepairRequestHandled={() => setRepairRequest(undefined)}
            symbolHighlights={symbolHighlights}
            remoteParticipants={collaborationAppliesToActiveDiagram ? activeParticipants : []}
            remoteEditFlash={collaborationAppliesToActiveDiagram ? remoteEditFlash : undefined}
            onRenameRequest={
              workspace.diagramKind === "gantt" ||
              workspace.diagramKind === "sequence" ||
              workspace.diagramKind === "usecase" ||
              workspace.diagramKind === "class" ||
              workspace.diagramKind === "component" ||
              workspace.diagramKind === "activity" ||
              workspace.diagramKind === "wbs"
                ? requestSymbolRename
                : undefined
            }
            onSymbolContextMenu={
              workspace.diagramKind === "gantt" ||
              workspace.diagramKind === "sequence" ||
              workspace.diagramKind === "usecase" ||
              workspace.diagramKind === "class" ||
              workspace.diagramKind === "component" ||
              workspace.diagramKind === "activity" ||
              workspace.diagramKind === "wbs"
                ? (position, x, y) => {
                    if (!symbolAt(position)) return false;
                    setSymbolMenu({ position, x, y });
                    return true;
                  }
                : undefined
            }
            onCursorChange={(line, column, position, anchor, head) => {
              update("cursor", { line, column });
              if (collaborationAppliesToActiveDiagram) updateCollaborationSelection(line, column, anchor, head);
              if (workspace.diagramKind === "gantt") {
                const occurrence = symbolAt(position);
                setSourceSymbol(occurrence ? { kind: occurrence.kind, key: occurrence.key } : undefined);
                setSourceSymbolPosition(occurrence ? position : undefined);
                setSourceHighlightedTaskId(
                  occurrence?.kind === "task" ? occurrence.key : findTaskAt(parseResult.document, position)?.id,
                );
              } else if (workspace.diagramKind === "sequence") {
                const occurrence = symbolAt(position);
                setSourceSymbol(occurrence ? { kind: occurrence.kind, key: occurrence.key } : undefined);
                setSourceSymbolPosition(occurrence ? position : undefined);
                setSourceHighlightedSequenceParticipantId(occurrence?.key);
                const object = findSequenceObjectAt(sequenceDocument, position);
                if (
                  object &&
                  sequenceDocument.participants.includes(object as (typeof sequenceDocument.participants)[number])
                )
                  selectSequenceParticipant(object.id, false);
                else if (object && "from" in object) selectSequenceMessage(object.id, false);
                else if (object) selectSequenceStructure(object.id, false);
                else if (!occurrence) clearSequenceSelection();
              } else if (workspace.diagramKind === "usecase") {
                const occurrence = symbolAt(position);
                setSourceSymbol(occurrence ? { kind: occurrence.kind, key: occurrence.key } : undefined);
                setSourceSymbolPosition(occurrence ? position : undefined);
                selectUseCaseFromSource(occurrence?.key, findUseCaseObjectAt(useCaseDocument, position)?.id);
              } else if (workspace.diagramKind === "class" || workspace.diagramKind === "component") {
                const occurrence = symbolAt(position);
                setSourceSymbol(occurrence ? { kind: occurrence.kind, key: occurrence.key } : undefined);
                setSourceSymbolPosition(occurrence ? position : undefined);
                const member = classDocument.entities
                  .flatMap((entity) => entity.members.map((item) => ({ entity, item })))
                  .find(({ item }) => position >= item.sourceRange.from && position <= item.sourceRange.to);
                selectClassFromSource(
                  occurrence?.key ?? member?.entity.id,
                  member?.item.id,
                  findClassObjectAt(classDocument, position)?.id,
                );
              } else if (workspace.diagramKind === "activity") {
                const occurrence = symbolAt(position);
                setSourceSymbol(occurrence ? { kind: occurrence.kind, key: occurrence.key } : undefined);
                setSourceSymbolPosition(occurrence ? position : undefined);
                selectActivityFromSource(occurrence?.key, findActivityObjectAt(activityDocument, position)?.id);
              } else {
                const occurrence = symbolAt(position);
                setSourceSymbol(occurrence ? { kind: occurrence.kind, key: occurrence.key } : undefined);
                setSourceSymbolPosition(occurrence ? position : undefined);
                selectWbsFromSource(occurrence?.key, findWbsNodeAt(wbsDocument, position)?.id);
              }
            }}
          />
        )}
        {workspace.viewMode === "split" && (
          <div className="divider" onPointerDown={resize} role="separator" aria-orientation="vertical" />
        )}
        {workspace.viewMode !== "code" &&
          (workspace.diagramKind === "gantt" ? (
            <DiagramPreview
              svg={result?.svg}
              tasks={parseResult.document.tasks}
              dependencies={parseResult.document.dependencies}
              dividers={parseResult.document.dividers}
              verticalSeparators={parseResult.document.verticalSeparators}
              source={workspace.source}
              zoom={workspace.zoom}
              onZoomChange={(zoom) => update("zoom", zoom)}
              selectedTaskId={selectedTaskId}
              highlightedTaskId={sourceHighlightedTaskId}
              remoteEditTaskId={collaborationAppliesToActiveDiagram ? remoteEditFlash?.taskId : undefined}
              remoteEditColor={collaborationAppliesToActiveDiagram ? remoteEditFlash?.color : undefined}
              remoteEditName={collaborationAppliesToActiveDiagram ? remoteEditFlash?.name : undefined}
              onTaskSelect={selectTask}
              onTaskToggle={toggleTaskSelection}
              selectedTaskIds={selectedTaskIds}
              onTasksMove={(ids, days) => applyBulkTaskChange("Moved", moveTasksByDays(workspace.source, ids, days))}
              onNoteSelect={(taskId) => {
                selectTask(taskId);
                setFocusNoteTaskId(taskId);
              }}
              onBackgroundSelect={() => {
                setSelectedTaskId(undefined);
                setSelectedDependencyIndex(undefined);
                setFocusNoteTaskId(undefined);
              }}
              onTaskMove={moveGanttTask}
              onTaskReorder={(taskId, beforeTaskId) => {
                if (
                  linkedWbs &&
                  activeDocument.wbsGanttLinks?.some((link) => link.ganttAlias.toLowerCase() === taskId)
                ) {
                  setInteractionMessage("Reorder linked work in the WBS; the Gantt chart updates automatically");
                  return;
                }
                reorderGanttTask(taskId, beforeTaskId);
              }}
              onDividerReorder={reorderDiagramDivider}
              onVerticalSeparatorMove={(index, days) => {
                const separator = parseResult.document.verticalSeparators[index];
                if (!separator) return;
                const operation = moveVerticalSeparatorByDays(workspace.source, separator, days);
                if (operation.unavailableReason) {
                  setInteractionMessage(operation.unavailableReason);
                  return;
                }
                if (
                  commitGeneratedSource(applySourceEdits(workspace.source, operation.edits), "Move vertical separator")
                )
                  setInteractionMessage(`Moved vertical separator ${days > 0 ? "+" : ""}${days} days`);
              }}
              onVerticalSeparatorSelect={(index) => {
                setSelectedTaskId(undefined);
                setSelectedDependencyIndex(undefined);
                setSelectedDividerIndex(undefined);
                setSelectedVerticalSeparatorIndex(index);
              }}
              onDividerSelect={(index) => {
                setSelectedTaskId(undefined);
                setSelectedDependencyIndex(undefined);
                setSelectedDividerIndex(index);
                const divider = parseResult.document.dividers[index];
                if (divider) setSelectionRequest({ ...divider.sourceRange });
              }}
              onTaskResize={resizeGanttTask}
              onDependencyCreate={connectTasks}
              selectedDependencyIndex={selectedDependencyIndex}
              onDependencySelect={(index) => {
                setSelectedDependencyIndex(index);
                const dependency = index === undefined ? undefined : parseResult.document.dependencies[index];
                if (dependency) setSelectionRequest(dependency.sourceRange);
              }}
              onDependencyDelete={deleteDependency}
              onInteractionMessage={setInteractionMessage}
              resourceFilter={resourceFilter}
              scheduleGhost={
                schedulePreview
                  ? { taskIds: schedulePreview.affected.map((item) => item.id), days: schedulePreview.days }
                  : undefined
              }
              projectStart={
                parseResult.document.projectStart?.resolved ? parseResult.document.projectStart.value : undefined
              }
              renderStatus={status}
              renderError={result?.error}
              onRenderRetry={retryRender}
              parseDurationMs={parsed.durationMs}
              openDocumentCount={tabs.documents.length}
              openSourceBytes={openSourceBytes}
              resourceOverAllocations={resourceOverAllocations}
              showResourceOverAllocationWarnings={resourceWarningsEnabled}
              resourceCapacities={resourceCapacities}
              onOpenResourceWorkload={openResourcePanel}
              onDateHighlightRequest={openDateActionMenu}
              onLegendEditRequest={(color) => {
                setLegendFocusColor(color);
                setLegendInspectorOpen(true);
              }}
              baselineTasks={baselineParseResult?.document.tasks}
              baselineDependencies={baselineParseResult?.document.dependencies}
              baselineSource={baselineVersion?.source}
              baselineProjectStart={
                baselineParseResult?.document.projectStart?.resolved
                  ? baselineParseResult.document.projectStart.value
                  : undefined
              }
              onChangeBaseline={() => void openVersionHistory()}
              onClearBaseline={clearBaseline}
              jiraTaskStatuses={jiraDiagramStatuses}
              projectLinkedTaskIds={linkedGanttTaskIds}
              projectDiagramLinks={projectDiagramLinks}
              onOpenProjectDiagram={openMember}
              progressForecast={activeDocument.progressForecast}
              onProgressForecastChange={(value) =>
                tabs.updateDocumentFormat(tabs.activeId, { progressForecast: value, dirty: true })
              }
              onApplyForecast={
                collaborationAppliesToActiveDiagram && collaboration?.role === "viewer"
                  ? undefined
                  : (review) => {
                      const settings = activeDocument.progressForecast;
                      const asOf = settings?.asOf ?? forecastToday(settings?.timeZone ?? "UTC");
                      if (
                        !settings?.enabled ||
                        workspace.source !== review.sourceBefore ||
                        asOf !== review.asOf ||
                        JSON.stringify(settings.remainingDays) !== JSON.stringify(review.overridesBefore)
                      ) {
                        setInteractionMessage("Forecast inputs changed. Recalculate the review before applying.");
                        return false;
                      }
                      const fresh = prepareForecastApply(
                        workspace.source,
                        asOf,
                        settings.remainingDays,
                        settings.enabled ? (settings.timeZone ?? "UTC") : undefined,
                      );
                      if (!fresh.sourceAfter || fresh.sourceAfter !== review.sourceAfter) {
                        setInteractionMessage(
                          fresh.error ?? "Forecast changed. Recalculate the review before applying.",
                        );
                        return false;
                      }
                      const applied = commitGeneratedSource(fresh.sourceAfter, "Apply progress forecast to plan", {
                        before: settings,
                        after: { ...settings, remainingDays: fresh.overridesAfter },
                      });
                      if (applied)
                        setInteractionMessage("Applied forecast to plan. Undo restores dates and estimates together.");
                      return applied;
                    }
              }
            />
          ) : workspace.diagramKind === "sequence" ? (
            <SequenceDiagramPreview
              svg={result?.svg}
              zoom={workspace.zoom}
              onZoomChange={(zoom) => update("zoom", zoom)}
              renderStatus={status}
              renderError={result?.error}
              onRenderRetry={retryRender}
              participants={sequenceDocument.participants}
              messages={sequenceDocument.messages}
              structures={sequenceStructures}
              selectedParticipantId={
                diagramMulti.multiple
                  ? undefined
                  : (selectedSequenceParticipantId ??
                    (!selectedSequenceMessageId && !selectedSequenceStructureId
                      ? sourceHighlightedSequenceParticipantId
                      : undefined))
              }
              selectedMessageId={diagramMulti.multiple ? undefined : selectedSequenceMessageId}
              selectedStructureId={diagramMulti.multiple ? undefined : selectedSequenceStructureId}
              onParticipantSelect={selectSequenceParticipant}
              onMessageSelect={selectSequenceMessage}
              onStructureSelect={selectSequenceStructure}
              onParticipantReorder={reorderSequenceParticipant}
              onMessageReorder={reorderSequenceMessage}
              onTimelineReorder={reorderSequenceTimeline}
              onMessageReconnect={reconnectSequenceMessage}
              onStructureReconnect={reconnectSequenceElement}
              onMessageCreate={createSequenceMessageByDrag}
              onMessageExternalize={externalizeSequenceMessage}
            />
          ) : workspace.diagramKind === "usecase" ? (
            <UseCaseDiagramPreview
              svg={result?.svg}
              zoom={workspace.zoom}
              onZoomChange={(zoom) => update("zoom", zoom)}
              renderStatus={status}
              renderError={result?.error}
              onRenderRetry={retryRender}
              document={useCaseDocument}
              selectedId={diagramMulti.multiple ? undefined : (selectedUseCaseObjectId ?? sourceHighlightedUseCaseId)}
              onSelect={(id) => {
                selectUseCaseObject(id);
                const object = [
                  ...useCaseDocument.elements,
                  ...useCaseDocument.packages,
                  ...useCaseDocument.notes,
                ].find((item) => item.id === id);
                if (object) setSelectionRequest({ ...object.sourceRange });
              }}
              onRelationshipCreate={createUseCaseRelationshipByDrag}
              onRelationshipReconnect={reconnectUseCaseRelationshipByDrag}
              onMoveToPackage={moveUseCaseElementByDrag}
              onReorder={reorderUseCaseElementByDrag}
            />
          ) : workspace.diagramKind === "class" || workspace.diagramKind === "component" ? (
            <ClassDiagramPreview
              diagramKind={workspace.diagramKind}
              svg={result?.svg}
              zoom={workspace.zoom}
              onZoomChange={(zoom) => update("zoom", zoom)}
              renderStatus={status}
              renderError={result?.error}
              onRenderRetry={retryRender}
              document={classDocument}
              selectedId={
                diagramMulti.multiple
                  ? undefined
                  : selectedClassRelationship
                    ? selectedClassObjectId
                    : (sourceHighlightedClassEntityId ?? selectedClassObjectId)
              }
              highlightedMemberId={sourceHighlightedClassMemberId}
              onSelect={selectClassObject}
              onMemberSelect={selectClassMember}
              onBackgroundSelect={dismissClassInspector}
              onRelationshipCreate={createClassRelationshipByDrag}
              onRelationshipReconnect={reconnectClassRelationshipByDrag}
              onMoveToPackage={moveClassEntityByDrag}
              onReorder={reorderClassEntityByDrag}
            />
          ) : workspace.diagramKind === "activity" ? (
            <ActivityDiagramPreview
              svg={result?.svg}
              zoom={workspace.zoom}
              onZoomChange={(zoom) => update("zoom", zoom)}
              renderStatus={status}
              renderError={result?.error}
              onRenderRetry={retryRender}
              document={activityDocument}
              selectedId={diagramMulti.multiple ? undefined : (sourceHighlightedActivityId ?? selectedActivityObjectId)}
              onSelect={(id) => {
                selectActivityObject(id);
                const object = [
                  ...activityDocument.nodes,
                  ...activityDocument.controls,
                  ...activityDocument.partitions,
                  ...activityDocument.notes,
                  ...activityDocument.arrows,
                ].find((item) => item.id === id);
                if (object) setSelectionRequest({ ...object.sourceRange });
              }}
              onBackgroundSelect={clearSelectedActivityObject}
              onReorder={reorderActivityActionByDrag}
              onConnect={connectActivityActionsByDrag}
              onAttachNote={attachActivityNoteByDrag}
            />
          ) : (
            <WbsDiagramPreview
              svg={result?.svg}
              document={wbsDocument}
              dependencyWarnings={wbsDependencyWarnings}
              nodeCompletion={wbsNodeCompletion}
              nodeSchedule={wbsNodeSchedule}
              linkedNodeIds={
                new Set(
                  wbsDocument.nodes
                    .filter((node) => linkedGantt?.wbsGanttLinks?.some((link) => link.wbsAlias === node.alias))
                    .map((node) => node.id),
                )
              }
              selectedId={diagramMulti.multiple ? undefined : (sourceHighlightedWbsNodeId ?? selectedWbsNodeId)}
              selectedRelationshipId={diagramMulti.multiple ? undefined : selectedWbsRelationshipId}
              zoom={workspace.zoom}
              renderStatus={status}
              renderError={result?.error}
              onRenderRetry={retryRender}
              onZoomChange={(zoom) => update("zoom", zoom)}
              onSelect={(id) => {
                selectWbsNode(id);
                const node = wbsDocument.nodes.find((item) => item.id === id);
                if (node) setSelectionRequest({ ...node.sourceRange });
              }}
              onRelationshipSelect={(id) => {
                selectWbsRelationship(id);
                const relationship = wbsDocument.relationships.find((item) => item.id === id);
                if (relationship) setSelectionRequest({ ...relationship.sourceRange });
              }}
              onMove={moveWbsNode}
              onRelationshipCreate={createWbsRelationship}
              onRelationshipReconnect={reconnectWbsArrow}
            />
          ))}
      </main>
      <footer className="statusbar">
        <span role="status" aria-live="polite">
          {interactionMessage ??
            (result?.error ? `⚠ ${result.error}` : diagnosticCount ? "Source has problems" : "✓ Valid")}
        </span>
        <button
          type="button"
          className="problem-count"
          onClick={() => {
            setProblemsOpen(true);
            setUnsupportedOpen(false);
          }}
        >
          Issues{diagnosticCount + unsupportedCount > 0 ? ` (${diagnosticCount + unsupportedCount})` : ""}
        </button>
        <span>
          {workspace.diagramKind === "sequence"
            ? "Sequence"
            : workspace.diagramKind === "usecase"
              ? "Use Case"
              : workspace.diagramKind === "class" || workspace.diagramKind === "component"
                ? workspace.diagramKind === "component"
                  ? "Component"
                  : "Class"
                : workspace.diagramKind === "activity"
                  ? "Activity"
                  : workspace.diagramKind === "wbs"
                    ? "WBS"
                    : "Gantt"}
        </span>
        <details className="render-details">
          <summary>
            {workspace.viewMode === "code"
              ? "Preview paused"
              : status === "error" || result?.error
                ? "Preview failed"
                : status === "rendering"
                  ? result?.svg
                    ? "Rendering… · previous preview"
                    : "Rendering…"
                  : result?.svg && (result.source !== workspace.source || result.documentId !== tabs.activeId)
                    ? "Previous preview"
                    : "Preview current"}
          </summary>
          <div>
            <p>Render {Math.round(result?.durationMs ?? 0)} ms</p>
            {result?.error && <p role="alert">{result.error}</p>}
            <p>
              Changes are rendered locally. An older preview can remain visible while the current source is rendering or
              has an error.
            </p>
          </div>
        </details>
        {workspace.viewMode !== "diagram" && (
          <span>
            Ln {workspace.cursor.line}, Col {workspace.cursor.column}
          </span>
        )}
        {hydrated ? (
          <StorageStatus
            onExplain={setInteractionMessage}
            recoveryStatus={activeInSingleFileProject ? singleFileProject.recoveryStatus : undefined}
            encrypted={Boolean(activeDocument.encrypted)}
          />
        ) : (
          <span>Restoring…</span>
        )}
        {!pwa.online && <span className="connection-offline">Offline · changes stay local</span>}
        {collaboration && (
          <span className={`collaboration-status ${collaboration.connection}`}>
            {collaboration.connection === "connected"
              ? collaboration.role === "viewer"
                ? "Viewing only"
                : "Live collaboration"
              : collaboration.connection === "connecting"
                ? "Collaboration connecting…"
                : "Collaboration offline"}
          </span>
        )}
        {pwa.canInstall && (
          <button type="button" className="status-action" onClick={() => void pwa.install()}>
            Install app
          </button>
        )}
        {pwa.updateAvailable && (
          <button type="button" className="status-action" onClick={pwa.update}>
            Update available
          </button>
        )}
      </footer>
      {dialog?.kind === "command-palette" && (
        <CommandPalette commands={commands} onClose={() => closeDialog("command-palette")} />
      )}
      {dialog?.kind === "diagram-outline" && (
        <DiagramOutlineDialog
          entries={diagramOutlineEntries}
          onSelect={(entry) => {
            closeDialog("diagram-outline");
            revealOutlineEntry(entry);
          }}
          onClose={() => closeDialog("diagram-outline")}
        />
      )}
      {newDocumentOpen && (
        <NewDocumentDialog
          onOpen={() => {
            closeNewDocumentDialog();
            void openDocument();
          }}
          onChoose={createDocument}
          onChooseExample={(example) => createDocument(example.kind, example)}
          onClose={closeNewDocumentDialog}
        />
      )}
      {dialog?.kind === "add-wbs-node" && (
        <AddWbsNodeDialog
          selected={selectedWbsNode}
          hasRoot={wbsDocument.roots.length > 0}
          onAdd={addWbsNode}
          onClose={() => closeDialog("add-wbs-node")}
        />
      )}
      {wbsSettingsOpen && (
        <WbsSettingsInspector source={workspace.source} onApply={applyWbsSettings} onClose={closeWbsSettings} />
      )}
      {selectedWbsNode && !diagramMulti.multiple && (
        <WbsNodeInspector
          key={selectedWbsNode.id}
          node={selectedWbsNode}
          linkedTask={linkedGantt?.wbsGanttLinks?.find((link) => link.wbsAlias === selectedWbsNode.alias)}
          linkedTaskTargetKey={(() => {
            const link = linkedGantt?.wbsGanttLinks?.find((item) => item.wbsAlias === selectedWbsNode.alias);
            return link &&
              linkedGantt &&
              parseGantt(linkedGantt.source).document.symbols.tasks.has(link.ganttAlias.toLowerCase())
              ? `${linkedGantt.id}:${link.ganttAlias.toLowerCase()}`
              : undefined;
          })()}
          linkedTaskLabel={(() => {
            const link = linkedGantt?.wbsGanttLinks?.find((item) => item.wbsAlias === selectedWbsNode.alias);
            return link
              ? parseGantt(linkedGantt!.source).document.symbols.tasks.get(link.ganttAlias.toLowerCase())?.label
              : undefined;
          })()}
          ganttTargets={tabs.documents
            .filter(
              (item) =>
                item.diagramKind === "gantt" &&
                (!linkedGantt || item.id === linkedGantt.id) &&
                (!item.linkedWbsDocumentId || item.linkedWbsDocumentId === tabs.activeId),
            )
            .flatMap((item) =>
              parseGantt(item.source)
                .document.tasks.filter(
                  (task) =>
                    !item.wbsGanttLinks?.some(
                      (link) => link.ganttAlias.toLowerCase() === task.id && link.wbsAlias !== selectedWbsNode.alias,
                    ),
                )
                .map((task) => ({
                  key: `${item.id}:${task.id}`,
                  label: `${item.fileName} · ${task.label}`,
                })),
            )}
          onLinkGanttTask={(key) => {
            const split = key.indexOf(":");
            const document = tabs.documents.find((item) => item.id === key.slice(0, split));
            const task =
              document && parseGantt(document.source).document.tasks.find((item) => item.id === key.slice(split + 1));
            if (!document || !task) return;
            const oldLink = document.wbsGanttLinks?.find((link) => link.wbsAlias === selectedWbsNode.alias);
            if (oldLink?.ganttAlias.toLowerCase() === task.id) return;
            if (oldLink)
              setPendingWbsRelink({ nodeId: selectedWbsNode.id, documentId: document.id, targetTaskId: task.id });
            else applyWbsRelink(selectedWbsNode.id, document.id, task.id, "keep");
          }}
          onOpenLinkedTask={() => selectedWbsNode.alias && openLinkedGanttTask(selectedWbsNode.alias)}
          onApply={(value) => {
            const updated = applyWbsNode(value);
            if (!updated) return;
            mapWbsProjectEdit(selectedWbsNode, updated);
            if (!linkedGantt || !selectedWbsNode.alias || value.label === selectedWbsNode.label) return;
            const link = linkedGantt.wbsGanttLinks?.find((item) => item.wbsAlias === selectedWbsNode.alias);
            const parsed = parseGantt(linkedGantt.source).document;
            const task = link && parsed.symbols.tasks.get(link.ganttAlias.toLowerCase());
            if (!task) return;
            const label = value.label.replaceAll("]", ")").replaceAll("\n", " ").trim();
            const result = renameTask(linkedGantt.source, parsed, task, label);
            if (!result.unavailableReason && result.edits.length)
              updateLinkedSource(
                linkedGantt,
                applySourceEdits(linkedGantt.source, result.edits),
                "gantt",
                "Rename task from linked WBS",
              );
          }}
          onDelete={() => {
            const affected = wbsDocument.nodes.filter(
              (node) =>
                node.sourceRange.from >= selectedWbsNode.sourceRange.from &&
                node.sourceRange.to <= selectedWbsNode.subtreeRange.to,
            );
            if (linkedGantt?.wbsGanttLinks?.some((link) => affected.some((node) => node.alias === link.wbsAlias)))
              setPendingWbsDeleteId(selectedWbsNode.id);
            else removeWbsNode();
          }}
          onAddChild={() => openDialog({ kind: "add-wbs-node" })}
          onClose={clearSelectedWbsNode}
        />
      )}
      {pendingWbsRelink &&
        (() => {
          const node = wbsDocument.nodes.find((item) => item.id === pendingWbsRelink.nodeId);
          const document = tabs.documents.find((item) => item.id === pendingWbsRelink.documentId);
          const parsed = document ? parseGantt(document.source).document : undefined;
          const oldLink = document?.wbsGanttLinks?.find((link) => link.wbsAlias === node?.alias);
          const oldTask = oldLink && parsed?.symbols.tasks.get(oldLink.ganttAlias.toLowerCase());
          const newTask = parsed?.symbols.tasks.get(pendingWbsRelink.targetTaskId);
          if (!node || !document || !oldLink || !newTask) return null;
          return (
            <WbsRelinkDialog
              nodeLabel={node.label}
              oldTaskLabel={oldTask?.label ?? oldLink.ganttAlias}
              newTaskLabel={newTask.label}
              onClose={() => setPendingWbsRelink(undefined)}
              onChoose={(policy) => {
                applyWbsRelink(node.id, document.id, newTask.id, policy);
                setPendingWbsRelink(undefined);
              }}
            />
          );
        })()}
      {pendingWbsDeleteId &&
        (() => {
          const node = wbsDocument.nodes.find((item) => item.id === pendingWbsDeleteId);
          if (!node || !linkedGantt) return null;
          const subtree = wbsDocument.nodes.filter(
            (item) => item.sourceRange.from >= node.sourceRange.from && item.sourceRange.to <= node.subtreeRange.to,
          );
          const affected =
            linkedGantt.wbsGanttLinks?.filter((link) => subtree.some((item) => item.alias === link.wbsAlias)) ?? [];
          return (
            <WbsLinkedDeleteDialog
              label={node.label}
              nodeCount={subtree.length}
              taskCount={affected.length}
              onClose={() => setPendingWbsDeleteId(undefined)}
              onChoose={(policy) => {
                const deletion = applicationWbsAdapter.applyVisualOperation(
                  { kind: "delete-node", nodeId: node.id },
                  wbsDocument,
                  workspace.source,
                );
                if (deletion.unavailableReason) {
                  setInteractionMessage(deletion.unavailableReason);
                  return;
                }
                const nextWbs = applySourceEdits(workspace.source, deletion.edits);
                const converted = convertWbsToGantt(
                  nextWbs,
                  linkedGantt.source,
                  linkedGantt.wbsGanttLinks,
                  linkedGantt.wbsGanttDependencies,
                  policy,
                  false,
                );
                if (!commitSource(converted.wbsSource, `Delete WBS subtree ${node.label}`)) return;
                updateLinkedSource(linkedGantt, converted.ganttSource, "gantt", `Delete linked work ${node.label}`);
                tabs.updateDocumentFormat(linkedGantt.id, {
                  wbsGanttLinks: converted.links,
                  wbsGanttDependencies: converted.dependencies,
                });
                clearSelectedWbsNode();
                clearSelectedWbsRelationship();
                setPendingWbsDeleteId(undefined);
                setInteractionMessage(
                  policy === "keep"
                    ? `Deleted WBS subtree; kept ${affected.length} unlinked Gantt tasks`
                    : `Deleted WBS subtree and ${affected.length} linked Gantt tasks`,
                );
              }}
            />
          );
        })()}
      {pendingGanttDeleteTaskId &&
        (() => {
          const task = parseResult.document.symbols.tasks.get(pendingGanttDeleteTaskId);
          const link = activeDocument.wbsGanttLinks?.find(
            (item) => item.ganttAlias.toLowerCase() === pendingGanttDeleteTaskId,
          );
          const wbs = linkedWbs && parseWbs(linkedWbs.source);
          const node = wbs?.nodes.find((item) => item.alias === link?.wbsAlias);
          if (!task || !link || !linkedWbs || !wbs || !node) return null;
          const subtree = wbs.nodes.filter(
            (item) => item.sourceRange.from >= node.sourceRange.from && item.sourceRange.to <= node.subtreeRange.to,
          );
          const affected =
            activeDocument.wbsGanttLinks?.filter((item) =>
              subtree.some((descendant) => descendant.alias === item.wbsAlias),
            ) ?? [];
          return (
            <GanttLinkedDeleteDialog
              taskLabel={task.label}
              nodeCount={subtree.length}
              taskCount={affected.length}
              onClose={() => setPendingGanttDeleteTaskId(undefined)}
              onChoose={(policy) => {
                if (policy === "keep") {
                  const operation = deleteTask(workspace.source, parseResult.document, task);
                  if (operation.unavailableReason) return setInteractionMessage(operation.unavailableReason);
                  const nextLinks = (activeDocument.wbsGanttLinks ?? []).filter((item) => item !== link);
                  const converted = convertWbsToGantt(
                    linkedWbs.source,
                    applySourceEdits(workspace.source, operation.edits),
                    nextLinks,
                    activeDocument.wbsGanttDependencies,
                    "keep-scheduled",
                    false,
                  );
                  if (!commitGeneratedSource(converted.ganttSource, `Delete ${task.label}`)) return;
                  tabs.updateDocumentFormat(tabs.activeId, {
                    wbsGanttLinks: converted.links,
                    wbsGanttDependencies: converted.dependencies,
                  });
                  setInteractionMessage(`Deleted ${task.label}; kept its WBS node unlinked`);
                } else {
                  const deletion = applicationWbsAdapter.applyVisualOperation(
                    { kind: "delete-node", nodeId: node.id },
                    wbs,
                    linkedWbs.source,
                  );
                  if (deletion.unavailableReason) return setInteractionMessage(deletion.unavailableReason);
                  const converted = convertWbsToGantt(
                    applySourceEdits(linkedWbs.source, deletion.edits),
                    workspace.source,
                    activeDocument.wbsGanttLinks,
                    activeDocument.wbsGanttDependencies,
                    "delete",
                    false,
                  );
                  if (!commitGeneratedSource(converted.ganttSource, `Delete linked work ${task.label}`)) return;
                  updateLinkedSource(linkedWbs, converted.wbsSource, "wbs", `Delete linked work ${task.label}`);
                  tabs.updateDocumentFormat(tabs.activeId, {
                    wbsGanttLinks: converted.links,
                    wbsGanttDependencies: converted.dependencies,
                  });
                  setInteractionMessage(`Deleted WBS subtree and ${affected.length} linked Gantt tasks`);
                }
                setSelectedTaskId(undefined);
                setSelectedDependencyIndex(undefined);
                setPendingGanttDeleteTaskId(undefined);
              }}
            />
          );
        })()}
      {selectedWbsRelationship && !diagramMulti.multiple && (
        <WbsRelationshipInspector
          key={`${selectedWbsRelationship.id}:${selectedWbsRelationship.sourceRange.to}`}
          relationship={selectedWbsRelationship}
          document={wbsDocument}
          dependencyStatus={
            linkedGantt
              ? (wbsDependencyWarnings.get(selectedWbsRelationship.id) ?? "Linked to a Gantt dependency.")
              : undefined
          }
          onApply={applyWbsRelationshipColor}
          onDelete={removeWbsRelationship}
          onClose={clearSelectedWbsRelationship}
        />
      )}
      <ActivityDialogs
        active={activityDialogKind}
        document={activityDocument}
        onAddAction={addActivityAction}
        onAddPartition={addActivityPartition}
        onAddNote={addActivityNote}
        onAddStructure={addActivityStructure}
        onAddTerminal={addActivityTerminal}
        onAddArrow={addActivityArrow}
        onClose={() => closeDialog(dialog?.kind)}
      />
      <SequenceDialogs
        active={sequenceDialog}
        participants={sequenceParticipantNames}
        anchors={sequenceMessageAnchors}
        onAddParticipant={addSequenceParticipant}
        onAddMessage={addSequenceMessage}
        onAddStructure={addSequenceStructure}
        onClose={() => closeDialog(dialog?.kind)}
      />
      <UseCaseDialogs
        active={
          dialog?.kind === "add-usecase-element"
            ? { kind: "element", elementKind: dialog.elementKind }
            : dialog?.kind === "add-usecase-relationship"
              ? { kind: "relationship" }
              : dialog?.kind === "add-usecase-package"
                ? { kind: "package" }
                : dialog?.kind === "add-usecase-note"
                  ? { kind: "note" }
                  : undefined
        }
        elements={useCaseDocument.elements}
        onAddElement={addUseCaseElement}
        onAddRelationship={addUseCaseRelationship}
        onAddPackage={addUseCasePackage}
        onAddNote={addUseCaseNote}
        onClose={closeDialog}
      />
      <GanttDialogs
        active={ganttDialogKind}
        tasks={parseResult.document.tasks}
        defaultStartDate={
          parseResult.document.projectStart?.resolved ? parseResult.document.projectStart.value : undefined
        }
        onAddTask={addTask}
        onAddDivider={addDivider}
        onAddMilestone={addMilestone}
        onClose={() => ganttDialogKind && closeDialog(`add-${ganttDialogKind}`)}
      />
      {projectInspectorOpen && (
        <ProjectInspector
          settings={parseProjectSettings(workspace.source)}
          onApply={applyProjectSettings}
          onClose={() => setProjectInspectorOpen(false)}
        />
      )}
      {project && projectNavigatorOpen && !sideInspectorOpen && !diagramMulti.multiple && (
        <ProjectNavigator
          project={project}
          readOnly={Boolean(
            collaboration?.sharedDocumentId &&
            collaboration.sharedDocumentId === portable?.projectId &&
            collaboration.role === "viewer",
          )}
          wbsGanttIssues={projectWbsGanttIssues}
          wbsGanttLinks={projectWbsGanttLinks}
          {...(portable?.diagrams.some((diagram) => diagram.wbsGantt)
            ? { wbsGanttMissing: projectWbsGanttMissing }
            : {})}
          onAddMissingWbsGanttItem={(item) => void addMissingProjectItem(item)}
          onLinkMissingWbsGanttItem={async (item) => {
            await singleFileProject.openMember(item.kind === "wbs" ? item.counterpartDocumentId : item.documentId);
            const tabId = await singleFileProject.openMember(item.documentId);
            if (!tabId) return;
            setProjectNavigatorOpen(false);
            if (item.kind === "wbs") setPendingProjectWbsSelection({ tabId, nodeId: item.key });
            else window.setTimeout(() => setSelectedTaskId(item.key), 100);
          }}
          onOpenWbsGanttLink={async (documentId, kind, key) => {
            const tabId = await singleFileProject.openMember(documentId);
            if (!tabId) return;
            if (kind === "wbs") setPendingProjectWbsSelection({ tabId, nodeId: key });
            else window.setTimeout(() => setSelectedTaskId(key), 100);
          }}
          onOpenWbsGanttIssue={(issue) => {
            tabs.activateDocument(issue.documentId);
            window.setTimeout(() => {
              if (issue.kind === "task") setSelectedTaskId(issue.key);
              if (issue.kind === "node" && issue.key) selectWbsNode(issue.key);
              if (issue.kind === "relationship" && issue.key) selectWbsRelationship(issue.key);
            }, 100);
          }}
          {...(usingSingleFileProject
            ? {
                dirty: singleFileProject.dirty,
                recoveryStatus: singleFileProject.recoveryStatus,
                indexStatus: singleFileProject.indexStatus,
                saving: singleFileProject.saving,
                onCancelSave: singleFileProject.cancelSave,
                onReviewChanges: singleFileProject.reviewChanges,
                hasReviewBaseline: singleFileProject.hasReviewBaseline,
                onExportReview: singleFileProject.exportReviewReport,
              }
            : {})}
          onOpen={openMember}
          onAdd={addProjectDiagram}
          {...(usingSingleFileProject ? { onImport: singleFileProject.importDiagram } : {})}
          onClose={() => setProjectNavigatorOpen(false)}
          {...(usingSingleFileProject ? { onCloseProject: singleFileProject.closeProject } : {})}
          onLinksChange={updateLinks}
          onElementsChange={updateElements}
          {...(usingSingleFileProject
            ? {
                onElementsRegistered: singleFileProject.registerElements,
                onRename: singleFileProject.renameDiagram,
                onDelete: singleFileProject.deleteDiagram,
              }
            : {})}
        />
      )}
      {dialog?.kind === "new-project" && (
        <ProjectNameDialog
          title="New document"
          initialValue="PlantUML document"
          submitLabel="Create document"
          onSubmit={(name) => {
            closeDialog("new-project");
            void singleFileProject.newProject(name);
          }}
          onClose={() => closeDialog("new-project")}
        />
      )}
      {dialog?.kind === "wbs-gantt-project" && (
        <ProjectNameDialog
          title={portableWbsDiagramId ? "Create Gantt chart from WBS" : "Create document from WBS"}
          initialValue={workspace.fileName.replace(/\.[^.]+$/, "") || "WBS document"}
          hideName={Boolean(portableWbsDiagramId)}
          initialStartDate={(() => {
            const now = new Date();
            return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
          })()}
          submitLabel="Create Gantt chart"
          onSubmit={(name, startDate) => {
            if (!startDate) return;
            const converted = convertWbsToGantt(workspace.source);
            converted.ganttSource = setGeneratedGanttProjectStart(converted.ganttSource, startDate);
            const sourceTabId = tabs.activeId;
            closeDialog("wbs-gantt-project");
            void (
              portableWbsDiagramId
                ? singleFileProject.addGanttFromWbs(portableWbsDiagramId, converted, sourceTabId)
                : singleFileProject.createWbsGanttProject(name, converted, sourceTabId)
            ).catch(reportFileError);
          }}
          onClose={() => closeDialog("wbs-gantt-project")}
        />
      )}
      {singleFileProject.unlockRequest && (
        <ProjectUnlockDialog
          fileName={singleFileProject.unlockRequest.fileName}
          onUnlock={singleFileProject.unlock}
          onClose={singleFileProject.cancelUnlock}
        />
      )}
      {singleFileProject.leaveRequest && (
        <UnsavedProjectDialog {...singleFileProject.leaveRequest} onChoice={singleFileProject.decideLeave} />
      )}
      {dateMenuFor && (
        <DateActionMenu
          date={dateMenuFor}
          state={(() => {
            const rule = parseProjectSettings(workspace.source).dateRules.find(
              (item) => item.from === dateMenuFor && item.to === dateMenuFor,
            );
            if (!rule) return "none";
            return rule.state === "colored" ? "highlighted" : rule.state;
          })()}
          onHighlight={() => {
            setHighlightDate(dateMenuFor);
            setDateMenuFor(undefined);
          }}
          onMarkClosed={() => applyTimelineDateClosed(dateMenuFor)}
          onClear={() => clearTimelineDateSetting(dateMenuFor)}
          onClose={() => setDateMenuFor(undefined)}
        />
      )}
      {versionHistoryOpen && (
        <VersionHistoryDialog
          versions={documentVersions}
          currentSource={workspace.source}
          onCreate={async (label) => {
            const version = await recordDocumentVersion("manual", label || "Manual version");
            setInteractionMessage("Created document version");
            return version;
          }}
          onRestore={restoreDocumentVersion}
          onUpdate={editDocumentVersion}
          onDelete={removeDocumentVersion}
          baselineVersionId={activeDocument.baselineVersionId}
          diagramKind={workspace.diagramKind}
          fileName={workspace.fileName}
          onApplyReview={async (source) => {
            try {
              await recordDocumentVersion("before-restore", "Before semantic review");
              const applied = commitSource(source, "Apply semantic review selection");
              if (applied) {
                setInteractionMessage("Applied selected review changes");
                setVersionHistoryOpen(false);
              }
              return applied;
            } catch (error) {
              reportFileError(error);
              return false;
            }
          }}
          onSetBaseline={setBaseline}
          onClose={() => setVersionHistoryOpen(false)}
        />
      )}
      {documentSettingsOpen && (
        <DocumentSettingsDialog
          current={{
            compression: activeDocument.compression ?? "gzip",
            encrypted: activeDocument.encrypted === true,
            maxVersions: activeDocument.historyMaxVersions ?? 100,
            maxLogicalMiB: Math.round((activeDocument.historyMaxLogicalBytes ?? 16 * 1024 * 1024) / 1024 / 1024),
            diagramTheme: plantUmlTheme(workspace.source) ?? "",
            ...(workspace.diagramKind === "gantt" && activeDocument.progressForecast
              ? { forecastTimeZone: activeDocument.progressForecast.timeZone ?? "UTC" }
              : {}),
          }}
          diagramKind={workspace.diagramKind}
          onApply={async (settings) => {
            try {
              await configureDocumentFormat(settings);
              const themedSource = setPlantUmlTheme(workspace.source, settings.diagramTheme);
              if (themedSource !== workspace.source) commitSource(themedSource, "Change diagram theme", false);
            } catch (error) {
              reportFileError(error);
              throw error;
            }
          }}
          onClose={() => setDocumentSettingsOpen(false)}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          mode="settings"
          resourceWarningsEnabled={resourceWarningsEnabled}
          onResourceWarningsChange={setResourceWarningsEnabled}
          current={{
            theme: workspace.theme,
            advancedMode: workspace.advancedMode,
            defaultDiagramTheme: workspace.defaultDiagramTheme,
          }}
          onApply={(settings) => {
            setWorkspace((current) => ({
              ...current,
              ...settings,
              viewMode: !settings.advancedMode ? "diagram" : current.advancedMode ? current.viewMode : "split",
            }));
            setSettingsOpen(false);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {hydrated && !tabs.session.onboarded && (
        <SettingsDialog
          mode="onboarding"
          current={{
            theme: workspace.theme,
            advancedMode: workspace.advancedMode,
            defaultDiagramTheme: workspace.defaultDiagramTheme,
          }}
          onApply={(settings) => {
            setWorkspace((current) => ({
              ...current,
              ...settings,
              viewMode: settings.advancedMode ? "split" : "diagram",
            }));
            tabs.setOnboarded();
          }}
          onClose={tabs.setOnboarded}
          onPreview={(settings) => {
            setWorkspace((current) => ({
              ...current,
              theme: settings.theme,
              defaultDiagramTheme: settings.defaultDiagramTheme,
            }));
            const themedSource = setPlantUmlTheme(workspace.source, settings.defaultDiagramTheme);
            if (themedSource === workspace.source) return;
            // Previewing restyles the untouched welcome diagram without adding undo steps or unsaved state.
            if (activeHistory.canUndo || activeHistory.canRedo)
              commitSource(themedSource, "Preview diagram theme", false);
            else setWorkspace((current) => ({ ...current, source: themedSource }));
          }}
        />
      )}
      {externalConflict && (
        <ExternalFileConflictDialog
          fileName={externalConflict.fileName}
          baseSource={externalConflict.baseSource}
          localSource={externalConflict.localSource}
          externalSource={externalConflict.external.source}
          native={externalConflict.native === true}
          onMerge={(source) => void applyExternalConflictMerge(source)}
          onReload={() => void reloadExternalConflict()}
          onKeepLocal={keepLocalExternalConflict}
          onOpenCopy={() => void openExternalConflictCopy()}
          onClose={dismissExternalConflict}
        />
      )}
      {collaborationDialogOpen && (
        <CollaborationDialog
          documentName={singleFileProject.sharedDocument?.name}
          diagramCount={singleFileProject.sharedDocument?.diagrams.length}
          pendingRoom={pendingCollaboration?.roomId}
          pendingAccessToken={pendingCollaboration?.accessToken}
          pendingRole={pendingCollaboration?.role}
          pendingEndpoint={pendingCollaboration?.endpoint}
          defaultEndpoint={defaultCollaborationEndpoint}
          active={collaboration}
          onStart={startCollaboration}
          onRotate={rotateCollaborationRoom}
          onLeave={leaveCollaboration}
          onClose={() => setCollaborationDialogOpen(false)}
        />
      )}
      {jiraDialogOpen && workspace.diagramKind === "gantt" && (
        <JiraDialog
          endpoint={defaultJiraEndpoint}
          source={workspace.source}
          binding={jiraBinding}
          readOnly={collaborationAppliesToActiveDiagram && collaboration?.role === "viewer"}
          onApply={(source, message) => {
            if (commitGeneratedSource(source, "Synchronize Jira")) setInteractionMessage(message);
          }}
          onClose={() => setJiraDialogOpen(false)}
        />
      )}
      {highlightDate && (
        <HighlightDateDialog
          date={highlightDate}
          initialColor={
            parseProjectSettings(workspace.source).dateRules.find(
              (rule) => rule.state === "colored" && rule.from === highlightDate && rule.to === highlightDate,
            )?.color
          }
          canClear={parseProjectSettings(workspace.source).dateRules.some(
            (rule) => rule.state === "colored" && rule.from === highlightDate && rule.to === highlightDate,
          )}
          onApply={applyTimelineDateHighlight}
          onClear={clearTimelineDateHighlight}
          onClose={() => setHighlightDate(undefined)}
        />
      )}
      <UseCaseInspectors
        settingsOpen={useCaseSettingsOpen}
        settings={parseUseCaseSettings(workspace.source)}
        selectedElement={diagramMulti.multiple ? undefined : selectedUseCaseElement}
        selectedRelationship={diagramMulti.multiple ? undefined : selectedUseCaseRelationship}
        selectedPackage={diagramMulti.multiple ? undefined : selectedUseCasePackage}
        selectedNote={diagramMulti.multiple ? undefined : selectedUseCaseNote}
        elements={useCaseDocument.elements}
        packages={useCaseDocument.packages}
        onSettingsChange={applyUseCaseSettings}
        onElementChange={applyUseCaseElement}
        onElementDelete={removeUseCaseElement}
        onElementPackageChange={moveSelectedUseCaseElementToPackage}
        onRelationshipChange={applyUseCaseRelationship}
        onRelationshipDelete={removeUseCaseRelationship}
        onPackageChange={applyUseCasePackage}
        onPackageDelete={removeUseCasePackage}
        onNoteChange={applyUseCaseNote}
        onNoteDelete={removeUseCaseNote}
        onCloseSettings={closeUseCaseSettings}
        onCloseSelection={clearSelectedUseCaseObject}
      />
      <ClassInspectors
        componentMode={workspace.diagramKind === "component"}
        settingsOpen={classSettingsOpen}
        settings={parseClassSettings(workspace.source)}
        document={classDocument}
        selectedEntity={diagramMulti.multiple ? undefined : selectedClassEntity}
        selectedRelationship={diagramMulti.multiple ? undefined : selectedClassRelationship}
        selectedPackage={diagramMulti.multiple ? undefined : selectedClassPackage}
        selectedNote={diagramMulti.multiple ? undefined : selectedClassNote}
        onSettingsChange={applyClassSettings}
        onEntityChange={applyClassEntity}
        onEntityPackageChange={moveSelectedClassEntity}
        onEntityDelete={removeClassEntity}
        onMemberAdd={addClassMember}
        onMemberChange={applyClassMember}
        onMemberDelete={removeClassMember}
        onMemberMove={moveClassMember}
        onMemberReveal={(member) => {
          if (workspace.viewMode === "diagram") update("viewMode", "split");
          setSelectionRequest({ ...member.sourceRange });
        }}
        onRelationshipChange={applyClassRelationship}
        onRelationshipDelete={removeClassRelationship}
        onPackageChange={applyClassPackage}
        onPackageParentChange={moveSelectedClassPackage}
        onPackageDelete={removeClassPackage}
        onNoteChange={applyClassNote}
        onNoteDelete={removeClassNote}
        onCloseSettings={closeClassSettings}
        onCloseSelection={clearSelectedClassObject}
      />
      <ActivityInspectors
        settingsOpen={activitySettingsOpen}
        settings={parseActivitySettings(workspace.source)}
        document={activityDocument}
        selectedAction={diagramMulti.multiple ? undefined : selectedActivityAction}
        selectedControl={diagramMulti.multiple ? undefined : selectedActivityControl}
        selectedTerminal={diagramMulti.multiple ? undefined : selectedActivityTerminal}
        selectedArrow={diagramMulti.multiple ? undefined : selectedActivityArrow}
        selectedPartition={diagramMulti.multiple ? undefined : selectedActivityPartition}
        selectedNote={diagramMulti.multiple ? undefined : selectedActivityNote}
        onSettingsChange={applyActivitySettings}
        onActionChange={applyActivityAction}
        onActionPartitionChange={moveActivityActionPartition}
        onActionDelete={removeActivityAction}
        onControlChange={applyActivityControl}
        onControlDelete={removeActivityControl}
        onTerminalDelete={removeActivityTerminal}
        onArrowChange={applyActivityArrow}
        onArrowDelete={removeActivityArrow}
        onPartitionChange={applyActivityPartition}
        onPartitionParentChange={moveSelectedActivityPartition}
        onPartitionDelete={removeActivityPartition}
        onNoteChange={applyActivityNote}
        onNoteDelete={removeActivityNote}
        onCloseSettings={closeActivitySettings}
        onCloseSelection={clearSelectedActivityObject}
      />
      <ClassDialogs
        componentMode={workspace.diagramKind === "component"}
        active={classDialogKind}
        document={classDocument}
        onAddEntity={addClassEntity}
        onAddRelationship={addClassRelationship}
        onAddPackage={addClassPackage}
        onAddNote={addClassNote}
        onClose={() => classDialogKind && closeClassDialog(classDialogKind)}
      />
      <SequenceInspectors
        settingsOpen={sequenceSettingsOpen}
        settings={parseSequenceSettings(workspace.source)}
        selectedParticipant={diagramMulti.multiple ? undefined : selectedSequenceParticipant}
        selectedMessage={diagramMulti.multiple ? undefined : selectedSequenceMessage}
        selectedStructure={diagramMulti.multiple ? undefined : selectedSequenceStructure}
        participants={sequenceParticipantNames}
        anchors={sequenceMessageAnchors}
        onSettingsApply={applySequenceSettings}
        onParticipantApply={applySequenceParticipant}
        onParticipantDelete={removeSequenceParticipant}
        onMessageApply={applySequenceMessage}
        onMessageDelete={removeSequenceMessage}
        onStructureApply={applySequenceStructure}
        onStructureDelete={removeSequenceStructure}
        onCloseSettings={closeSequenceSettings}
        onCloseParticipant={() => setSelectedSequenceParticipantId(undefined)}
        onCloseMessage={() => setSelectedSequenceMessageId(undefined)}
        onCloseStructure={() => setSelectedSequenceStructureId(undefined)}
      />
      {diagramMulti.multiple && (
        <BulkDiagramInspector
          key={`${tabs.activeId}:${workspace.diagramKind}`}
          items={diagramMulti.selected}
          readOnly={diagramMulti.readOnly}
          onChange={diagramMulti.change}
          onCopy={diagramMulti.copy}
          onPaste={diagramMulti.paste}
          onDuplicate={diagramMulti.duplicate}
          onClose={() => {
            diagramMulti.clear();
            dismissAllInspectors();
            clearSelectedWbsNode();
            clearSelectedWbsRelationship();
          }}
        />
      )}
      {multipleTasksSelected && (
        <BulkTaskInspector
          labels={selectedTaskIds.map((id) => parseResult.document.symbols.tasks.get(id)?.label ?? id)}
          resourceNames={resourceNames}
          onMove={(days) => applyBulkTaskChange("Moved", moveTasksByDays(workspace.source, selectedTaskIds, days))}
          onColor={(color) =>
            applyBulkTaskChange("Recoloured", setTasksColor(workspace.source, selectedTaskIds, color))
          }
          onCompletion={(value) =>
            applyBulkTaskChange("Updated", setTasksCompletion(workspace.source, selectedTaskIds, value))
          }
          onResource={(name) =>
            applyBulkTaskChange("Assigned", setTasksResource(workspace.source, selectedTaskIds, name))
          }
          onDuplicate={duplicateSelectedTasks}
          onCopy={copySelectedTasks}
          onDelete={() => applyBulkTaskChange("Deleted", deleteTasks(workspace.source, selectedTaskIds), false)}
          onClose={() => setSelectedTaskId(undefined)}
        />
      )}
      <GanttInspectors
        selectedTask={multipleTasksSelected ? undefined : selectedTask}
        linkedWbsAlias={
          selectedTask
            ? activeDocument.wbsGanttLinks?.find((link) => link.ganttAlias.toLowerCase() === selectedTask.id)?.wbsAlias
            : undefined
        }
        wbsLinkStatus={
          selectedTask && linkedWbs
            ? (() => {
                const link = activeDocument.wbsGanttLinks?.find(
                  (item) => item.ganttAlias.toLowerCase() === selectedTask.id,
                );
                if (!link) return "Unlinked from WBS.";
                const node = parseWbs(linkedWbs.source).nodes.find((item) => item.alias === link.wbsAlias);
                return node ? `Linked to ${node.label}.` : `Missing WBS node (${link.wbsAlias}).`;
              })()
            : undefined
        }
        wbsTargets={
          linkedWbs
            ? parseWbs(linkedWbs.source)
                .nodes.filter(
                  (node) =>
                    node.alias &&
                    !activeDocument.wbsGanttLinks?.some(
                      (link) => link.wbsAlias === node.alias && link.ganttAlias.toLowerCase() !== selectedTask?.id,
                    ),
                )
                .map((node) => ({
                  key: node.alias!,
                  label: node.label,
                }))
            : []
        }
        onLinkWbsNode={(alias) => {
          if (!selectedTask || !linkedWbs || !alias) return;
          if (
            activeDocument.wbsGanttLinks?.some(
              (link) => link.wbsAlias === alias && link.ganttAlias.toLowerCase() !== selectedTask.id,
            )
          ) {
            setInteractionMessage("That WBS node is already linked to another Gantt task");
            return;
          }
          const ganttAlias = selectedTask.alias?.value ?? `wbs_link_${Date.now().toString(36)}`;
          if (!selectedTask.alias) {
            const at = selectedTask.labelRange.to + 1;
            updateLinkedSource(
              { id: tabs.activeId, source: workspace.source },
              `${workspace.source.slice(0, at)} as [${ganttAlias}]${workspace.source.slice(at)}`,
              "gantt",
              "Link task to WBS",
            );
          }
          const links = (activeDocument.wbsGanttLinks ?? []).filter(
            (item) => item.wbsAlias !== alias && item.ganttAlias !== ganttAlias,
          );
          tabs.updateDocumentFormat(tabs.activeId, {
            wbsGanttLinks: [...links, { wbsAlias: alias, ganttAlias }],
          });
          setInteractionMessage(`Linked ${selectedTask.label} to WBS node ${alias}`);
        }}
        linkedWbsLabel={
          selectedTask && linkedWbs
            ? (() => {
                const link = activeDocument.wbsGanttLinks?.find(
                  (item) => item.ganttAlias.toLowerCase() === selectedTask.id,
                );
                return link
                  ? parseWbs(linkedWbs.source).nodes.find((node) => node.alias === link.wbsAlias)?.label
                  : undefined;
              })()
            : undefined
        }
        onOpenLinkedWbs={() => selectedTask && openLinkedWbsNode(selectedTask.id)}
        selectedDependency={selectedDependency}
        selectedDivider={selectedDivider}
        selectedVerticalSeparator={selectedVerticalSeparator}
        tasks={parseResult.document.tasks}
        relativeMilestoneAnchor={
          selectedTask &&
          workspace.source
            .slice(
              selectedTask.declarations.find((item) => item.kind === "milestone")?.range.from ?? 0,
              selectedTask.declarations.find((item) => item.kind === "milestone")?.range.to ?? 0,
            )
            .match(/'s\s+(start|end)/i)?.[1]
            ?.toLowerCase() === "start"
            ? "start"
            : "end"
        }
        predecessorId={selectedPredecessorId}
        dependencyRelation={selectedTaskDependency?.relation ?? "start-after-end"}
        effectiveStart={selectedTask ? (resolvedTaskDates.get(selectedTask.id)?.start ?? "") : ""}
        effectiveEnd={selectedTask ? (resolvedTaskDates.get(selectedTask.id)?.end ?? "") : ""}
        calendar={ganttCalendar}
        resourceNames={resourceNames}
        resourceConflicts={selectedResourceConflicts}
        jiraStatus={selectedTask ? jiraTaskStatuses.get(selectedTask.id) : undefined}
        focusTaskNote={Boolean(selectedTask && focusNoteTaskId === selectedTask.id)}
        legendOpen={legendInspectorOpen}
        legendEntries={legendEntries}
        legendFocusColor={legendFocusColor}
        onMilestoneApply={applyGanttMilestoneInspector}
        onTaskApply={(value) => {
          applyGanttTaskInspector(value);
          if (!selectedTask || !linkedWbs || value.label.trim() === selectedTask.label.trim()) return;
          const link = activeDocument.wbsGanttLinks?.find((item) => item.ganttAlias.toLowerCase() === selectedTask.id);
          const document = parseWbs(linkedWbs.source);
          const node = link && document.nodes.find((item) => item.alias === link.wbsAlias);
          if (!node) return;
          updateLinkedSource(
            linkedWbs,
            updateWbsNode(linkedWbs.source, node, {
              label: value.label.replace(/^(?:↳\s*)+/, "").trim(),
              ...(node.color ? { color: node.color } : {}),
              ...(node.textColor ? { textColor: node.textColor } : {}),
              ...(node.stereotype ? { stereotype: node.stereotype } : {}),
              ...(node.link ? { link: node.link } : {}),
              ...(node.icon ? { icon: node.icon } : {}),
              side: node.side === "left" ? "left" : "right",
            }),
            "wbs",
            "Rename node from linked Gantt",
          );
        }}
        onTaskDelete={() => {
          if (
            selectedTask &&
            linkedWbs &&
            activeDocument.wbsGanttLinks?.some((item) => item.ganttAlias.toLowerCase() === selectedTask.id)
          )
            setPendingGanttDeleteTaskId(selectedTask.id);
          else deleteSelectedTask();
        }}
        onDependencyApply={applyDependencyInspector}
        onDependencyDelete={deleteDependency}
        onDividerApply={applyDividerInspector}
        onDividerDelete={deleteSelectedDivider}
        onVerticalSeparatorApply={applyVerticalSeparatorInspector}
        onVerticalSeparatorDelete={deleteSelectedVerticalSeparator}
        onLegendApply={applyLegendInspector}
        onCloseTask={() => setSelectedTaskId(undefined)}
        onCloseDependency={() => setSelectedDependencyIndex(undefined)}
        onCloseDivider={() => setSelectedDividerIndex(undefined)}
        onCloseVerticalSeparator={() => setSelectedVerticalSeparatorIndex(undefined)}
        onCloseLegend={closeLegendInspector}
      />
      {reportsOpen && (
        <ReportsDialog
          source={workspace.source}
          sourceIdentity={tabs.activeId}
          documentName={workspace.fileName}
          diagramName={workspace.source.match(/^\s*title\s+(.+)$/m)?.[1] ?? workspace.fileName}
          timeZone={activeDocument.progressForecast?.timeZone}
          resource={reportResource}
          onClose={() => setReportsOpen(false)}
        />
      )}
      {resourcePanelOpen && (
        <ResourceWorkloadPanel
          onReport={(name) => {
            setReportResource(name);
            setReportsOpen(true);
          }}
          tasks={parseResult.document.tasks}
          resolvedDates={resolvedTaskDates}
          calendar={ganttCalendar}
          capacities={resourceCapacities}
          onCapacityChange={(name, capacity) =>
            updateResourceCapacities((current) => ({
              ...current,
              [name]: Math.max(1, Number.isFinite(capacity) ? capacity : 100),
            }))
          }
          onRename={(currentName, nextName) => {
            const operation = renameResource(parseResult.document, currentName, nextName, workspace.source);
            if (operation.unavailableReason) {
              setInteractionMessage(operation.unavailableReason);
              return;
            }
            if (!commitGeneratedSource(applySourceEdits(workspace.source, operation.edits), `Rename ${currentName}`))
              return;
            renameCapacity(currentName, nextName);
            setResourceFilter((current) => (current === currentName ? nextName : current));
            setInteractionMessage(`Renamed ${currentName} to ${nextName}`);
          }}
          onFilter={(name) => setResourceFilter(name)}
          onTaskSelect={(id) => {
            setResourcePanelOpen(false);
            selectTask(id);
          }}
          onClose={() => setResourcePanelOpen(false)}
        />
      )}
      <ProblemsPanel
        categoryFilter={
          repairCategoryFilter?.source === workspace.source && repairCategoryFilter.documentId === tabs.activeId
            ? repairCategoryFilter.category
            : undefined
        }
        onClearCategoryFilter={() => setRepairCategoryFilter(undefined)}
        open={problemsOpen || unsupportedOpen}
        preserved={preservedSyntax}
        onRevealPreserved={(item) => {
          if (workspace.viewMode === "diagram") update("viewMode", "split");
          setSelectionRequest({ ...item.range });
        }}
        onRepairHost={setRepairHost}
        diagramKind={workspace.diagramKind}
        source={problemPreview?.source ?? workspace.source}
        diagnostics={problemPreview?.diagnostics ?? activeDiagnostics}
        quickFixes={problemPreview ? [] : activeQuickFixes}
        readOnly={collaborationAppliesToActiveDiagram && collaboration?.role === "viewer"}
        notice={problemPreview?.message}
        onReveal={(diagnostic) => {
          if (workspace.viewMode === "diagram") update("viewMode", "split");
          if (problemPreview) {
            setSelectionRequest({ from: diagnostic.from, to: diagnostic.to });
            return;
          }
          setRepairRequest({
            documentId: tabs.activeId,
            kind: workspace.diagramKind,
            source: workspace.source,
            diagnostic,
          });
        }}
        onPreviewDiagnostic={(diagnostic) => {
          if (workspace.viewMode === "diagram") update("viewMode", "split");
          setRepairRequest({
            documentId: tabs.activeId,
            kind: workspace.diagramKind,
            source: workspace.source,
            diagnostic,
            previewFixes: true,
          });
        }}
        onPreviewFix={(fix) => {
          if (workspace.viewMode === "diagram") update("viewMode", "split");
          setRepairRequest({ documentId: tabs.activeId, kind: workspace.diagramKind, source: workspace.source, fix });
        }}
        onClose={() => {
          setProblemsOpen(false);
          setUnsupportedOpen(false);
          setRepairCategoryFilter(undefined);
          setProblemPreview(undefined);
        }}
      />
      {schedulePreview && (
        <SchedulePreviewDialog
          preview={schedulePreview}
          onChoose={(cascade) => {
            if (
              commitGeneratedSource(
                cascade ? schedulePreview.cascadeSource : schedulePreview.singleSource,
                `${schedulePreview.action} ${schedulePreview.taskLabel}${cascade ? " with dependents" : ""}`,
              )
            )
              setSchedulePreview(undefined);
          }}
          onClose={() => setSchedulePreview(undefined)}
        />
      )}
      {dialog?.kind === "delivery-scenario" && (
        <DeliveryScenarioDialog
          currentSource={workspace.source}
          capacities={resourceCapacities}
          onApply={(source) => {
            if (!commitSource(source, "Apply delivery scenario")) return false;
            closeDialog("delivery-scenario");
            setInteractionMessage("Applied delivery scenario");
            return true;
          }}
          onClose={() => closeDialog("delivery-scenario")}
        />
      )}
      {dialog?.kind === "help" && <HelpDialog onClose={() => closeDialog("help")} />}
      {classMemberMenu && (
        <div
          className="tab-menu"
          role="menu"
          aria-label="Class member actions"
          style={{ left: classMemberMenu.x, top: classMemberMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Escape") setClassMemberMenu(undefined);
          }}
        >
          <button
            autoFocus
            role="menuitem"
            onClick={() => {
              setSelectedClassObjectId(classMemberMenu.entityId);
              setClassMemberMenu(undefined);
            }}
          >
            Edit member
          </button>
          <button
            role="menuitem"
            onClick={() => {
              const member = classDocument.entities
                .find((item) => item.id === classMemberMenu.entityId)
                ?.members.find((item) => item.id === classMemberMenu.memberId);
              if (member) {
                if (workspace.viewMode === "diagram") update("viewMode", "split");
                setSelectionRequest({ ...member.sourceRange });
              }
              setClassMemberMenu(undefined);
            }}
          >
            Reveal in code
          </button>
        </div>
      )}
      {symbolMenu && (
        <div
          className="tab-menu"
          role="menu"
          aria-label="Symbol actions"
          style={{ left: symbolMenu.x, top: symbolMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Escape") setSymbolMenu(undefined);
          }}
        >
          {canDuplicateMenuElement && menuOccurrence && (
            <button
              autoFocus
              role="menuitem"
              disabled={diagramMulti.readOnly}
              onClick={() => {
                diagramMulti.duplicateAt(menuOccurrence.range);
                setSymbolMenu(undefined);
              }}
            >
              Duplicate
            </button>
          )}
          {menuLinkedGantt && menuWbsNode?.alias && (
            <button
              role="menuitem"
              onClick={() => {
                openLinkedGanttTask(menuWbsNode.alias!);
                setSymbolMenu(undefined);
              }}
            >
              Open linked Gantt task
            </button>
          )}
          {menuProjectWbsLinks.map((link) => (
            <button
              key={link.linkId}
              role="menuitem"
              onClick={() => {
                void openProjectWbsNode(link);
                setSymbolMenu(undefined);
              }}
            >
              Open linked WBS node in {link.path}: {link.declaration.symbolKey}
            </button>
          ))}
          {menuLinkedWbs && linkedWbs && menuGanttTask && (
            <button
              role="menuitem"
              onClick={() => {
                openLinkedWbsNode(menuGanttTask.id);
                setSymbolMenu(undefined);
              }}
            >
              Open linked WBS node
            </button>
          )}
          {workspace.diagramKind === "gantt" &&
            (symbolMenu.occurrence ?? (symbolMenu.position !== undefined ? symbolAt(symbolMenu.position) : undefined))
              ?.kind === "task" && (
              <button
                autoFocus
                role="menuitem"
                onClick={() => {
                  const occurrence =
                    symbolMenu.occurrence ??
                    (symbolMenu.position !== undefined ? symbolAt(symbolMenu.position) : undefined);
                  if (occurrence) duplicateTaskOccurrence(occurrence);
                  setSymbolMenu(undefined);
                }}
              >
                Duplicate task
              </button>
            )}
          <button
            autoFocus={
              !canDuplicateMenuElement &&
              (workspace.diagramKind !== "gantt" ||
                (
                  symbolMenu.occurrence ??
                  (symbolMenu.position !== undefined ? symbolAt(symbolMenu.position) : undefined)
                )?.kind !== "task")
            }
            role="menuitem"
            onClick={() => {
              const occurrence =
                symbolMenu.occurrence ??
                (symbolMenu.position !== undefined ? symbolAt(symbolMenu.position) : undefined);
              const request = occurrence ? symbolProvider.renameRequest(occurrence) : undefined;
              if (request) setRenameSymbol(request);
              setSymbolMenu(undefined);
            }}
          >
            Rename…
          </button>
          <button
            role="menuitem"
            onClick={() => {
              const occurrence =
                symbolMenu.occurrence ??
                (symbolMenu.position !== undefined ? symbolAt(symbolMenu.position) : undefined);
              if (occurrence)
                setReferenceSymbol({ kind: occurrence.kind, key: occurrence.key, label: occurrence.value });
              setSymbolMenu(undefined);
            }}
          >
            Find references
          </button>
          <button
            role="menuitem"
            onClick={() => {
              const occurrence =
                symbolMenu.occurrence ??
                (symbolMenu.position !== undefined ? symbolAt(symbolMenu.position) : undefined);
              const declaration = occurrence
                ? (occurrencesFor(occurrence).find((item) => item.role === "declaration") ?? occurrence)
                : undefined;
              if (declaration) {
                if (workspace.viewMode === "diagram") update("viewMode", "split");
                setSelectionRequest({ ...declaration.range });
              }
              setSymbolMenu(undefined);
            }}
          >
            Reveal declaration
          </button>
          <button
            role="menuitem"
            onClick={() => {
              const occurrence =
                symbolMenu.occurrence ??
                (symbolMenu.position !== undefined ? symbolAt(symbolMenu.position) : undefined);
              if (occurrence) navigateOccurrence(occurrence, -1);
              setSymbolMenu(undefined);
            }}
          >
            Previous reference
          </button>
          <button
            role="menuitem"
            onClick={() => {
              const occurrence =
                symbolMenu.occurrence ??
                (symbolMenu.position !== undefined ? symbolAt(symbolMenu.position) : undefined);
              if (occurrence) navigateOccurrence(occurrence, 1);
              setSymbolMenu(undefined);
            }}
          >
            Next reference
          </button>
        </div>
      )}
      {referenceSymbol && (
        <SymbolReferencesPanel
          label={referenceSymbol.label}
          source={workspace.source}
          occurrences={occurrencesFor(referenceSymbol)}
          onSelect={(occurrence) => {
            if (workspace.viewMode === "diagram") update("viewMode", "split");
            setSelectionRequest({ ...occurrence.range });
          }}
          onClose={() => setReferenceSymbol(undefined)}
        />
      )}
      {renameSymbol && (
        <RenameSymbolDialog
          kind={renameSymbol.mode}
          value={renameSymbol.occurrence.value}
          validate={(value) => symbolProvider.validateRename(renameSymbol, value)}
          occurrenceCount={symbolProvider.renameOccurrenceCount(renameSymbol)}
          occurrences={symbolProvider.renameOccurrences(renameSymbol)}
          source={workspace.source}
          onRename={(nextValue) => {
            const target = renameSymbol;
            const result = symbolProvider.rename(target, nextValue);
            if (result.error || !result.source) {
              setInteractionMessage(result.error ?? "Rename made no changes");
              return;
            }
            if (result.validateGenerated) {
              if (!commitGeneratedSource(result.source, `Rename ${target.mode}`)) return;
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
            setRenameSymbol(undefined);
            setInteractionMessage(`Renamed ${target.occurrence.value} to ${nextValue.trim()}`);
            restoreRenamedDiagramFocus(target.occurrence.kind, result.nextKey);
          }}
          onClose={() => {
            setRenameSymbol(undefined);
            restorePreviousFocus(renameReturnFocus.current);
          }}
        />
      )}
    </div>
  );
}
