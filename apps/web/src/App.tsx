import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CodeEditor } from "./CodeEditor";
import { DiagramPreview } from "./DiagramPreview";
import { SequenceDiagramPreview } from "./SequenceDiagramPreview";
import { AddTaskDialog, type AddTaskValue } from "./AddTaskDialog";
import { AddDividerDialog, type AddSeparatorValue } from "./AddDividerDialog";
import { AddMilestoneDialog, type AddMilestoneValue } from "./AddMilestoneDialog";
import { CommandPalette } from "./CommandPalette";
import { TaskInspector, type TaskInspectorValue } from "./TaskInspector";
import { MilestoneInspector, type MilestoneInspectorValue } from "./MilestoneInspector";
import { DependencyInspector, type DependencyInspectorValue } from "./DependencyInspector";
import { DividerInspector } from "./DividerInspector";
import { LegendInspector } from "./LegendInspector";
import { VerticalSeparatorInspector, type VerticalSeparatorValue } from "./VerticalSeparatorInspector";
import { parseLegendEntries, removeLegend, synchronizeLegend, usedLegendColors } from "./legend";
import { ProjectInspector } from "./ProjectInspector";
import { SchedulePreviewDialog, type SchedulePreview } from "./SchedulePreviewDialog";
import { buildResourceOverAllocations, ResourceWorkloadPanel } from "./ResourceWorkloadPanel";
import { HelpDialog } from "./HelpDialog";
import { HighlightDateDialog } from "./HighlightDateDialog";
import { DateActionMenu } from "./DateActionMenu";
import { FileMenu } from "./FileMenu";
import { VersionHistoryDialog } from "./VersionHistoryDialog";
import { AddMenu } from "./AddMenu";
import { NewDocumentDialog } from "./NewDocumentDialog";
import { AddSequenceParticipantDialog, type AddSequenceParticipantValue } from "./AddSequenceParticipantDialog";
import { AddSequenceMessageDialog, type AddSequenceMessageValue } from "./AddSequenceMessageDialog";
import { SequenceParticipantInspector, type SequenceParticipantInspectorValue } from "./SequenceParticipantInspector";
import { SequenceMessageInspector, type SequenceMessageInspectorValue } from "./SequenceMessageInspector";
import { AddSequenceStructureDialog, type SequenceStructureKind } from "./AddSequenceStructureDialog";
import { SequenceStructureInspector } from "./SequenceStructureInspector";
import { SequenceSettingsInspector } from "./SequenceSettingsInspector";
import { parseSequenceSettings, updateSequenceSettings, type SequenceSettings } from "./sequence-settings";
import { detectDiagramKind } from "./diagram-kind";
import { resolveTaskDates } from "./gantt-schedule";
import { optionShortcut } from "./platform-shortcuts";
import { parseGanttCalendar } from "./gantt-calendar";
import { parseProjectSettings, updateProjectSettings } from "./project-settings";
import type { DiagramKind, Theme, ViewMode } from "./model";
import { useRenderer } from "./render/use-renderer";
import { usePersistedWorkspace } from "./use-persisted-workspace";
import {
  createDocumentVersion,
  deleteDocumentVersion,
  documentDisplayNames,
  importDocumentVersions,
  loadDocumentVersions,
  updateDocumentVersion,
  type DocumentVersion,
  type DocumentVersionReason,
} from "./workspace-storage";
import {
  applySourceEdits,
  deleteTask,
  deleteDivider,
  deleteVerticalSeparator,
  findTaskAt,
  ganttAdapter,
  insertDivider,
  insertVerticalSeparator,
  insertMilestone,
  insertTask,
  moveDependentTasksByDays,
  moveDivider,
  moveVerticalSeparatorByDays,
  normalizeTaskId,
  parseGantt,
  renameResource,
  renameTask,
  setNote,
  setTaskDeclaration,
  setTaskPauses,
  setTaskLinks,
  setTaskResources,
  updateDependency,
  updateDivider,
  updateVerticalSeparator,
} from "@plantuml-studio/diagram-gantt";
import type { Command } from "@plantuml-studio/editor-core";
import {
  downloadSvgAsPng,
  downloadText,
  openPlantUmlDocument,
  openWorkspaceBackupFile,
  savePlantUmlDocumentAs,
  svgFileName,
  writePlantUmlDocument,
  type WritableFileHandle,
} from "./file-service";
import { DEFAULT_SEQUENCE_SOURCE, DEFAULT_SOURCE } from "./model";
import {
  deleteSequenceMessage,
  deleteSequenceParticipant,
  deleteSequenceStructure,
  findSequenceObjectAt,
  insertSequenceMessage,
  insertSequenceParticipant,
  insertSequenceParticipantBox,
  insertSequenceStructure,
  parseSequence,
  reconnectSequenceStructure,
  reorderSequenceStatement,
  updateSequenceMessage,
  updateSequenceParticipant,
  updateSequenceStructure,
} from "@plantuml-studio/diagram-sequence";
import { validateGeneratedSource } from "./generated-source-validation";
import { UnsupportedSyntaxPanel } from "./UnsupportedSyntaxPanel";
import { useDocumentHistory } from "./use-document-history";
import { useResourceCapacities } from "./use-resource-capacities";
import { parseWorkspaceBackupBundle, serializeWorkspaceBackup } from "./workspace-backup";

export function App() {
  const [workspace, setWorkspace, hydrated, tabs] = usePersistedWorkspace();
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [focusNoteTaskId, setFocusNoteTaskId] = useState<string>();
  const [selectionRequest, setSelectionRequest] = useState<{ from: number; to: number }>();
  const [interactionMessage, setInteractionMessage] = useState<string>();
  const [selectedDependencyIndex, setSelectedDependencyIndex] = useState<number>();
  const [selectedDividerIndex, setSelectedDividerIndex] = useState<number>();
  const [selectedVerticalSeparatorIndex, setSelectedVerticalSeparatorIndex] = useState<number>();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [addDividerOpen, setAddDividerOpen] = useState(false);
  const [addMilestoneOpen, setAddMilestoneOpen] = useState(false);
  const [newDocumentOpen, setNewDocumentOpen] = useState(false);
  const [replaceActiveDocumentOnCreate, setReplaceActiveDocumentOnCreate] = useState(false);
  const [addSequenceParticipantOpen, setAddSequenceParticipantOpen] = useState(false);
  const [addSequenceMessageOpen, setAddSequenceMessageOpen] = useState(false);
  const [addSequenceStructureKind, setAddSequenceStructureKind] = useState<SequenceStructureKind>();
  const [selectedSequenceParticipantId, setSelectedSequenceParticipantId] = useState<string>();
  const [selectedSequenceMessageId, setSelectedSequenceMessageId] = useState<string>();
  const [selectedSequenceStructureId, setSelectedSequenceStructureId] = useState<string>();
  const [sequenceSettingsOpen, setSequenceSettingsOpen] = useState(false);
  const [projectInspectorOpen, setProjectInspectorOpen] = useState(false);
  const [legendInspectorOpen, setLegendInspectorOpen] = useState(false);
  const [legendFocusColor, setLegendFocusColor] = useState<string>();
  const [highlightDate, setHighlightDate] = useState<string>();
  const [dateMenuFor, setDateMenuFor] = useState<string>();
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [documentVersions, setDocumentVersions] = useState<DocumentVersion[]>([]);
  const [baselineVersion, setBaselineVersion] = useState<DocumentVersion>();
  const [draggedTabId, setDraggedTabId] = useState<string>();
  const [tabMenu, setTabMenu] = useState<{ id: string; x: number; y: number }>();
  const [resourceFilter, setResourceFilter] = useState("");
  const [schedulePreview, setSchedulePreview] = useState<SchedulePreview>();
  const [scheduleMode, setScheduleMode] = useState<"ask" | "single" | "cascade">(
    () => (localStorage.getItem("plantuml-studio.schedule-mode") as "ask" | "single" | "cascade" | null) ?? "ask",
  );
  const [resourcePanelOpen, setResourcePanelOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [unsupportedOpen, setUnsupportedOpen] = useState(false);
  const fileHandles = useRef(new Map<string, WritableFileHandle>());
  const startupSplashShown = useRef(false);
  const selectedTasksByDocument = useRef(new Map<string, string>());
  const { activeHistory, refreshHistoryControls, removeHistory, retainHistories } = useDocumentHistory(tabs.activeId);
  const {
    capacities: resourceCapacities,
    updateCapacities: updateResourceCapacities,
    renameCapacity,
  } = useResourceCapacities(tabs.activeId);
  const { status, result, retry: retryRender } = useRenderer(workspace.source, workspace.viewMode !== "code");
  const parsed = useMemo(() => {
    const started = performance.now();
    const value = ganttAdapter.parse(workspace.source);
    return { value, durationMs: performance.now() - started };
  }, [workspace.source]);
  const parseResult = parsed.value;
  const activeDocument = tabs.documents.find((document) => document.id === tabs.activeId)!;
  useEffect(() => {
    if (!hydrated || startupSplashShown.current) return;
    startupSplashShown.current = true;
    setReplaceActiveDocumentOnCreate(activeDocument.historyId === "history-welcome");
    setNewDocumentOpen(true);
  }, [activeDocument.historyId, hydrated]);
  useEffect(() => {
    let cancelled = false;
    if (!activeDocument.baselineVersionId) {
      setBaselineVersion(undefined);
      return;
    }
    void loadDocumentVersions(activeDocument.historyId).then((versions) => {
      if (!cancelled) setBaselineVersion(versions.find((version) => version.id === activeDocument.baselineVersionId));
    });
    return () => {
      cancelled = true;
    };
  }, [activeDocument.baselineVersionId, activeDocument.historyId]);
  const baselineParseResult = useMemo(
    () => (baselineVersion ? parseGantt(baselineVersion.source) : undefined),
    [baselineVersion],
  );
  const sequenceDocument = useMemo(() => parseSequence(workspace.source), [workspace.source]);
  const selectedSequenceParticipant = sequenceDocument.participants.find(
    (item) => item.id === selectedSequenceParticipantId,
  );
  const selectedSequenceMessage = sequenceDocument.messages.find((item) => item.id === selectedSequenceMessageId);
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
  const selectedSequenceStructure = sequenceStructures.find((item) => item.id === selectedSequenceStructureId);
  const sequenceParticipantNames = sequenceDocument.participants.map(
    (participant) => participant.alias ?? participant.label,
  );
  const diagnosticCount =
    workspace.diagramKind === "gantt"
      ? parseResult.diagnostics.filter((item) => item.code !== "unsupported-syntax").length
      : 0;
  const unsupportedCount = workspace.diagramKind === "gantt" ? parseResult.document.unknown.length : 0;
  const selectedTask = selectedTaskId ? parseResult.document.symbols.tasks.get(selectedTaskId) : undefined;
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
  const resolvedTaskDates = useMemo(
    () =>
      resolveTaskDates(
        parseResult.document.tasks,
        parseResult.document.dependencies,
        parseResult.document.projectStart?.resolved ? parseResult.document.projectStart.value : undefined,
        ganttCalendar,
      ),
    [ganttCalendar, parseResult.document],
  );
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

  useEffect(() => {
    if (workspace.diagramKind !== "gantt") return;
    const timer = window.setTimeout(() => {
      const next = parseProjectSettings(workspace.source).showLegend
        ? synchronizeLegend(workspace.source, parseResult.document.tasks)
        : removeLegend(workspace.source);
      if (next !== workspace.source) commitSource(next, "Synchronize legend");
    }, 400);
    return () => window.clearTimeout(timer);
    // The effect already tracks the source used by commitSource; the callback is declared later in this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parseResult.document.tasks, workspace.diagramKind, workspace.source]);
  const openSourceBytes = useMemo(
    () => tabs.documents.reduce((total, document) => total + document.source.length * 2, 0),
    [tabs.documents],
  );

  useEffect(() => {
    if (!hydrated) return;
    const lines = workspace.source.split(/\n/);
    const lineIndex = Math.min(Math.max(0, workspace.cursor.line - 1), lines.length - 1);
    let position = 0;
    for (let index = 0; index < lineIndex; index += 1) position += (lines[index]?.length ?? 0) + 1;
    position += Math.min(Math.max(0, workspace.cursor.column - 1), lines[lineIndex]?.length ?? 0);
    setSelectionRequest({ from: position, to: position });
    // Restore the saved cursor only when hydration or the active tab changes; source edits must not steal selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, tabs.activeId]);

  useEffect(() => {
    if (!tabs.documents.some((document) => document.dirty)) return;
    const protectUnsavedDocuments = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectUnsavedDocuments);
    return () => window.removeEventListener("beforeunload", protectUnsavedDocuments);
  }, [tabs.documents]);

  const activateTab = useCallback(
    (id: string) => {
      if (selectedTaskId) selectedTasksByDocument.current.set(tabs.activeId, selectedTaskId);
      tabs.activateDocument(id);
      setSelectedTaskId(selectedTasksByDocument.current.get(id));
      setSelectedDependencyIndex(undefined);
      setSelectedSequenceParticipantId(undefined);
      setSelectedSequenceMessageId(undefined);
      setInteractionMessage(undefined);
    },
    [selectedTaskId, tabs],
  );

  const closeTab = useCallback(
    (id: string) => {
      const document = tabs.documents.find((item) => item.id === id);
      if (!document) return;
      if (document.dirty && !window.confirm(`Close “${document.fileName}” without saving?`)) return;
      const closingLastDocument = tabs.documents.length === 1;
      tabs.closeDocument(id);
      removeHistory(id);
      fileHandles.current.delete(id);
      setSelectedTaskId(undefined);
      setSelectedDependencyIndex(undefined);
      if (closingLastDocument) {
        setReplaceActiveDocumentOnCreate(true);
        setNewDocumentOpen(true);
      }
    },
    [removeHistory, tabs],
  );

  const duplicateTab = useCallback(
    (id: string) => {
      tabs.duplicateDocument(id);
      setSelectedTaskId(undefined);
      setSelectedDependencyIndex(undefined);
      setTabMenu(undefined);
      setInteractionMessage("Duplicated document");
    },
    [tabs],
  );

  const closeOtherTabs = useCallback(
    (id: string) => {
      const dirtyOthers = tabs.documents.filter((item) => item.id !== id && item.dirty);
      if (
        dirtyOthers.length &&
        !window.confirm(
          `Close ${tabs.documents.length - 1} other tab${tabs.documents.length === 2 ? "" : "s"}? ${dirtyOthers.length} contain unsaved changes.`,
        )
      )
        return;
      tabs.closeOtherDocuments(id);
      retainHistories([id]);
      for (const documentId of [...fileHandles.current.keys()])
        if (documentId !== id) fileHandles.current.delete(documentId);
      setTabMenu(undefined);
    },
    [retainHistories, tabs],
  );

  const tabLabels = useMemo(() => {
    return documentDisplayNames(tabs.documents);
  }, [tabs.documents]);

  useEffect(() => {
    if (!tabMenu) return;
    const dismiss = () => setTabMenu(undefined);
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [tabMenu]);

  useEffect(() => {
    if (
      !selectedTaskId &&
      selectedDependencyIndex === undefined &&
      selectedDividerIndex === undefined &&
      selectedVerticalSeparatorIndex === undefined &&
      !selectedSequenceParticipantId &&
      !selectedSequenceMessageId &&
      !selectedSequenceStructureId &&
      !projectInspectorOpen
    )
      return;
    const dismissInspector = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".task-inspector")) return;
      if (event.composedPath().some((item) => item instanceof Element && item.matches(".task-inspector"))) return;
      if (
        target instanceof Element &&
        target.closest(
          "[data-inspector-trigger], [data-task-id], [data-dependency-index], [data-divider-index], [data-vertical-separator-index], [data-sequence-participant-id], [data-sequence-message-id], [data-sequence-message-endpoint], [data-sequence-structure-id], [data-sequence-structure-endpoint]",
        )
      )
        return;
      setSelectedTaskId(undefined);
      setSelectedDependencyIndex(undefined);
      setSelectedDividerIndex(undefined);
      setSelectedVerticalSeparatorIndex(undefined);
      setSelectedSequenceParticipantId(undefined);
      setSelectedSequenceMessageId(undefined);
      setSelectedSequenceStructureId(undefined);
      setProjectInspectorOpen(false);
      setFocusNoteTaskId(undefined);
    };
    document.addEventListener("click", dismissInspector);
    return () => document.removeEventListener("click", dismissInspector);
  }, [
    projectInspectorOpen,
    selectedDependencyIndex,
    selectedDividerIndex,
    selectedSequenceMessageId,
    selectedSequenceParticipantId,
    selectedSequenceStructureId,
    selectedTaskId,
    selectedVerticalSeparatorIndex,
  ]);

  const selectTask = (taskId: string) => {
    const task = parseResult.document.symbols.tasks.get(taskId);
    if (!task) return;
    setResourcePanelOpen(false);
    setProjectInspectorOpen(false);
    setSelectedTaskId(task.id);
    setSelectedDividerIndex(undefined);
    setFocusNoteTaskId(undefined);
    selectedTasksByDocument.current.set(tabs.activeId, task.id);
    const declaration = task.declarations[0];
    setSelectionRequest(declaration ? { ...declaration.range } : { ...task.sourceRange });
  };

  const openProjectInspector = useCallback(() => {
    setSelectedTaskId(undefined);
    setSelectedDependencyIndex(undefined);
    setProjectInspectorOpen(true);
  }, []);

  const openDateActionMenu = useCallback((date: string) => {
    setSelectedTaskId(undefined);
    setSelectedDependencyIndex(undefined);
    setProjectInspectorOpen(false);
    setResourcePanelOpen(false);
    setDateMenuFor(date);
  }, []);

  const openResourcePanel = useCallback(() => {
    setSelectedTaskId(undefined);
    setSelectedDependencyIndex(undefined);
    setProjectInspectorOpen(false);
    setResourcePanelOpen(true);
  }, []);

  const moveTask = (taskId: string, days: number) => {
    const task = parseResult.document.symbols.tasks.get(taskId);
    if (!task) return;
    let operation = ganttAdapter.applyVisualOperation(
      { kind: "move-task", taskId, days },
      parseResult.document,
      workspace.source,
    );
    if (operation.unavailableReason) {
      const dependency = parseResult.document.dependencies.find((item) => item.successorTaskId === task.id);
      const predecessor = dependency ? parseResult.document.symbols.tasks.get(dependency.predecessorTaskId) : undefined;
      if (dependency && predecessor) {
        const currentOffset = (dependency.direction === "before" ? -1 : 1) * (dependency.offset?.value ?? 0);
        const nextOffset = currentOffset + days;
        operation = updateDependency(workspace.source, dependency, {
          predecessorLabel: predecessor.alias?.value ?? predecessor.label,
          successorLabel: task.alias?.value ?? task.label,
          relation: dependency.relation,
          offset: Math.abs(nextOffset),
          direction: nextOffset < 0 ? "before" : "after",
          ...(dependency.color?.value ? { color: dependency.color.value } : {}),
          lineStyle: dependency.lineStyle?.value ?? "solid",
        });
      }
    }
    if (operation.unavailableReason) {
      setInteractionMessage(operation.unavailableReason);
      return;
    }
    stageScheduleChange(task.id, task.label, days, "Move", operation.edits);
  };

  const resizeTask = (taskId: string, days: number, calendarDays = days) => {
    const task = parseResult.document.symbols.tasks.get(taskId);
    if (!task) return;
    const operation = ganttAdapter.applyVisualOperation(
      { kind: "resize-task", taskId, days },
      parseResult.document,
      workspace.source,
    );
    if (operation.unavailableReason) {
      setInteractionMessage(operation.unavailableReason);
      return;
    }
    stageScheduleChange(task.id, task.label, calendarDays, "Resize", operation.edits);
  };

  const reorderDiagramTask = (taskId: string, beforeTaskId?: string) => {
    const task = parseResult.document.symbols.tasks.get(taskId);
    const beforeTask = beforeTaskId ? parseResult.document.symbols.tasks.get(beforeTaskId) : undefined;
    if (!task) return;
    const operation = ganttAdapter.applyVisualOperation(
      { kind: "reorder-task", taskId, ...(beforeTaskId ? { beforeTaskId } : {}) },
      parseResult.document,
      workspace.source,
    );
    if (operation.unavailableReason) {
      setInteractionMessage(operation.unavailableReason);
      return;
    }
    const reorderedSource = applySourceEdits(workspace.source, operation.edits);
    if (!commitGeneratedSource(reorderedSource, `Reorder ${task.label}`)) return;
    setInteractionMessage(
      beforeTask ? `Moved ${task.label} before ${beforeTask.label}` : `Moved ${task.label} to the end`,
    );
  };

  const reorderDiagramDivider = (dividerIndex: number, beforeTaskId?: string) => {
    const divider = parseResult.document.dividers[dividerIndex];
    const beforeTask = beforeTaskId ? parseResult.document.symbols.tasks.get(beforeTaskId) : undefined;
    if (!divider) return;
    const beforeRange = beforeTask?.declarations.map((item) => item.range).sort((a, b) => a.from - b.from)[0];
    const operation = moveDivider(workspace.source, divider.sourceRange, beforeRange);
    if (operation.unavailableReason) {
      setInteractionMessage(operation.unavailableReason);
      return;
    }
    const reorderedSource = applySourceEdits(workspace.source, operation.edits);
    if (!commitGeneratedSource(reorderedSource, `Move divider ${divider.label}`)) return;
    setInteractionMessage(
      beforeTask ? `Moved ${divider.label} before ${beforeTask.label}` : `Moved ${divider.label} to the end`,
    );
  };

  const applyDividerInspector = (label: string) => {
    if (selectedDividerIndex === undefined) return;
    const divider = parseResult.document.dividers[selectedDividerIndex];
    if (!divider) return;
    const operation = updateDivider(workspace.source, divider.sourceRange, label);
    if (operation.unavailableReason) {
      setInteractionMessage(operation.unavailableReason);
      return;
    }
    if (commitGeneratedSource(applySourceEdits(workspace.source, operation.edits), `Rename divider ${divider.label}`))
      setInteractionMessage(`Renamed divider to ${label.trim()}`);
  };

  const deleteSelectedDivider = () => {
    if (selectedDividerIndex === undefined) return;
    const divider = parseResult.document.dividers[selectedDividerIndex];
    if (!divider || !window.confirm(`Delete divider “${divider.label}”?`)) return;
    if (
      !commitGeneratedSource(
        applySourceEdits(workspace.source, deleteDivider(workspace.source, divider.sourceRange).edits),
        `Delete divider ${divider.label}`,
      )
    )
      return;
    setSelectedDividerIndex(undefined);
    setInteractionMessage(`Deleted divider ${divider.label}`);
  };

  const stageScheduleChange = (
    taskId: string,
    taskLabel: string,
    days: number,
    action: "Move" | "Resize",
    taskEdits: import("@plantuml-studio/diagram-gantt").SourceEdit[],
  ) => {
    const dependents = moveDependentTasksByDays(parseResult.document, taskId, days);
    const singleSource = applySourceEdits(workspace.source, taskEdits);
    if (dependents.unavailableReason) {
      setInteractionMessage(dependents.unavailableReason);
      return;
    }
    if (!dependents.affectedLabels.length) {
      commitGeneratedSource(singleSource, `${action} ${taskLabel} ${days} days`);
      return;
    }
    const cascadeSource = applySourceEdits(workspace.source, [...taskEdits, ...dependents.edits]);
    if (scheduleMode !== "ask") {
      commitGeneratedSource(
        scheduleMode === "cascade" ? cascadeSource : singleSource,
        `${action} ${taskLabel}${scheduleMode === "cascade" ? " with dependents" : ""}`,
      );
      return;
    }
    const cascadeDocument = parseGantt(cascadeSource).document;
    const affected = dependents.affectedTaskIds.map((id, index) => {
      const before = parseResult.document.symbols.tasks.get(id);
      const after = cascadeDocument.symbols.tasks.get(id);
      return {
        id,
        label: dependents.affectedLabels[index]!,
        oldDate: before?.start?.value ?? before?.end?.value ?? "",
        newDate: after?.start?.value ?? after?.end?.value ?? "",
      };
    });
    const conflicts = [
      ...new Set(
        dependents.affectedTaskIds.flatMap((id) => {
          const task = cascadeDocument.symbols.tasks.get(id);
          return task
            ? findResourceConflicts(task, cascadeDocument.tasks).map((label) => `${task.label} ↔ ${label}`)
            : [];
        }),
      ),
    ];
    setSchedulePreview({ taskLabel, days, action, singleSource, cascadeSource, affected, conflicts });
  };

  useEffect(() => {
    localStorage.setItem("plantuml-studio.schedule-mode", scheduleMode);
  }, [scheduleMode]);

  const connectTasks = (predecessorTaskId: string, successorTaskId: string) => {
    const predecessor = parseResult.document.symbols.tasks.get(predecessorTaskId);
    const successor = parseResult.document.symbols.tasks.get(successorTaskId);
    if (!predecessor || !successor) return;
    const operation = ganttAdapter.applyVisualOperation(
      { kind: "create-dependency", predecessorTaskId, successorTaskId },
      parseResult.document,
      workspace.source,
    );
    if (operation.unavailableReason) {
      setInteractionMessage(operation.unavailableReason);
      return;
    }
    commitGeneratedSource(
      applySourceEdits(workspace.source, operation.edits),
      `Connect ${predecessor.label} to ${successor.label}`,
    );
  };

  const deleteDependency = () => {
    if (selectedDependencyIndex === undefined) return;
    const dependency = parseResult.document.dependencies[selectedDependencyIndex];
    if (!dependency) return;
    const operation = ganttAdapter.applyVisualOperation(
      { kind: "remove-dependency", dependencyIndex: selectedDependencyIndex },
      parseResult.document,
      workspace.source,
    );
    if (!commitGeneratedSource(applySourceEdits(workspace.source, operation.edits), "Delete dependency")) return;
    setSelectedDependencyIndex(undefined);
  };

  const applyDependencyInspector = (value: DependencyInspectorValue) => {
    if (!selectedDependency) return;
    const predecessor = parseResult.document.symbols.tasks.get(value.predecessorId);
    const successor = parseResult.document.symbols.tasks.get(value.successorId);
    if (!predecessor || !successor) return;
    const operation = updateDependency(workspace.source, selectedDependency, {
      predecessorLabel: predecessor.alias?.value ?? predecessor.label,
      successorLabel: successor.alias?.value ?? successor.label,
      relation: value.relation,
      offset: value.offset,
      direction: value.direction,
      ...(value.color.trim() ? { color: value.color.trim() } : {}),
      lineStyle: value.lineStyle,
    });
    if (operation.unavailableReason) {
      setInteractionMessage(operation.unavailableReason);
      return;
    }
    const noteOperation = setNote(
      workspace.source,
      selectedDependency.sourceRange,
      selectedDependency.notes,
      value.note,
      value.notePosition,
    );
    if (noteOperation.unavailableReason) {
      setInteractionMessage(noteOperation.unavailableReason);
      return;
    }
    if (
      !commitGeneratedSource(
        applySourceEdits(workspace.source, [...operation.edits, ...noteOperation.edits]),
        "Update dependency",
      )
    )
      return;
    setInteractionMessage("Updated dependency");
  };

  const update = useCallback(
    <K extends keyof typeof workspace>(key: K, value: (typeof workspace)[K]) => {
      setWorkspace((current) => ({ ...current, [key]: value }));
    },
    [setWorkspace],
  );

  const commitSource = useCallback(
    (source: string, description: string) => {
      if (source === workspace.source) return;
      activeHistory.record(workspace.source, source, description);
      setWorkspace((current) => ({ ...current, source, dirty: true }));
      refreshHistoryControls();
    },
    [activeHistory, refreshHistoryControls, setWorkspace, workspace.source],
  );

  const commitGeneratedSource = useCallback(
    (source: string, description: string): boolean => {
      const validation = validateGeneratedSource(workspace.source, source);
      if (!validation.valid) {
        setInteractionMessage(
          `Cancelled ${description.toLowerCase()}: ${validation.message ?? "the operation would produce invalid PlantUML"}`,
        );
        return false;
      }
      commitSource(source, description);
      return true;
    },
    [commitSource, workspace.source],
  );

  const applyTimelineDateHighlight = useCallback(
    (color: string) => {
      if (!highlightDate) return;
      const settings = parseProjectSettings(workspace.source);
      const existing = settings.dateRules.find(
        (rule) => rule.state === "colored" && rule.from === highlightDate && rule.to === highlightDate,
      );
      settings.dateRules = existing
        ? settings.dateRules.map((rule) => (rule.id === existing.id ? { ...rule, color } : rule))
        : [
            ...settings.dateRules,
            {
              id: `highlight-${highlightDate}`,
              from: highlightDate,
              to: highlightDate,
              state: "colored",
              color,
            },
          ];
      if (!commitGeneratedSource(updateProjectSettings(workspace.source, settings), `Highlight ${highlightDate}`))
        return;
      setHighlightDate(undefined);
      setInteractionMessage(`Highlighted ${highlightDate}`);
    },
    [commitGeneratedSource, highlightDate, workspace.source],
  );

  const clearTimelineDateHighlight = useCallback(() => {
    if (!highlightDate) return;
    const settings = parseProjectSettings(workspace.source);
    const remaining = settings.dateRules.filter(
      (rule) => !(rule.state === "colored" && rule.from === highlightDate && rule.to === highlightDate),
    );
    if (remaining.length === settings.dateRules.length) {
      setHighlightDate(undefined);
      return;
    }
    settings.dateRules = remaining;
    if (!commitGeneratedSource(updateProjectSettings(workspace.source, settings), `Clear highlight ${highlightDate}`))
      return;
    setHighlightDate(undefined);
    setInteractionMessage(`Cleared highlight for ${highlightDate}`);
  }, [commitGeneratedSource, highlightDate, workspace.source]);

  const applyTimelineDateClosed = useCallback(
    (date: string) => {
      const settings = parseProjectSettings(workspace.source);
      const existing = settings.dateRules.find(
        (rule) => rule.from === date && rule.to === date && rule.state !== "colored",
      );
      settings.dateRules = existing
        ? settings.dateRules.map((rule) => (rule.id === existing.id ? { ...rule, state: "closed" } : rule))
        : [...settings.dateRules, { id: `closed-${date}`, from: date, to: date, state: "closed" as const }];
      if (!commitGeneratedSource(updateProjectSettings(workspace.source, settings), `Close ${date}`)) return;
      setDateMenuFor(undefined);
      setInteractionMessage(`Marked ${date} as a closed day`);
    },
    [commitGeneratedSource, workspace.source],
  );

  const clearTimelineDateSetting = useCallback(
    (date: string) => {
      const settings = parseProjectSettings(workspace.source);
      const remaining = settings.dateRules.filter((rule) => !(rule.from === date && rule.to === date));
      if (remaining.length === settings.dateRules.length) {
        setDateMenuFor(undefined);
        return;
      }
      settings.dateRules = remaining;
      if (!commitGeneratedSource(updateProjectSettings(workspace.source, settings), `Clear date setting ${date}`))
        return;
      setDateMenuFor(undefined);
      setInteractionMessage(`Cleared the date setting for ${date}`);
    },
    [commitGeneratedSource, workspace.source],
  );

  const undo = useCallback(() => {
    const source = activeHistory.undo(workspace.source);
    if (source === undefined) return;
    setWorkspace((current) => ({ ...current, source, dirty: true }));
    refreshHistoryControls();
  }, [activeHistory, refreshHistoryControls, setWorkspace, workspace.source]);

  const redo = useCallback(() => {
    const source = activeHistory.redo(workspace.source);
    if (source === undefined) return;
    setWorkspace((current) => ({ ...current, source, dirty: true }));
    refreshHistoryControls();
  }, [activeHistory, refreshHistoryControls, setWorkspace, workspace.source]);

  const reportFileError = useCallback((error: unknown) => {
    setInteractionMessage(error instanceof Error ? error.message : "File operation failed");
  }, []);

  const recordDocumentVersion = useCallback(
    async (
      reason: DocumentVersionReason,
      label?: string,
      override?: { historyId?: string; source?: string; fileName?: string; diagramKind?: DiagramKind },
    ) => {
      const historyId = override?.historyId ?? activeDocument.historyId;
      const existing = await loadDocumentVersions(historyId);
      const version = await createDocumentVersion({
        historyId,
        ...(existing[0] ? { parentVersionId: existing[0].id } : {}),
        source: override?.source ?? workspace.source,
        fileName: override?.fileName ?? workspace.fileName,
        diagramKind: override?.diagramKind ?? workspace.diagramKind,
        reason,
        ...(label?.trim() ? { label: label.trim() } : {}),
        pinned: reason === "manual" || reason === "before-restore",
      });
      setDocumentVersions(await loadDocumentVersions(historyId));
      return version;
    },
    [activeDocument.historyId, workspace.diagramKind, workspace.fileName, workspace.source],
  );

  const openVersionHistory = useCallback(async () => {
    try {
      let versions = await loadDocumentVersions(activeDocument.historyId);
      if (!versions.length) {
        await recordDocumentVersion("opened", "Initial version");
        versions = await loadDocumentVersions(activeDocument.historyId);
      }
      setDocumentVersions(versions);
      setVersionHistoryOpen(true);
    } catch (error) {
      reportFileError(error);
    }
  }, [activeDocument.historyId, recordDocumentVersion, reportFileError]);

  const openDocument = useCallback(async () => {
    try {
      const opened = await openPlantUmlDocument();
      if (!opened) return;
      const historyId = `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const id = tabs.addDocument({
        historyId,
        diagramKind: detectDiagramKind(opened.source) ?? "gantt",
        source: opened.source,
        fileName: opened.fileName,
        dirty: false,
        cursor: { line: 1, column: 1 },
      });
      if (opened.handle) fileHandles.current.set(id, opened.handle);
      await recordDocumentVersion("opened", "Opened file", {
        historyId,
        source: opened.source,
        fileName: opened.fileName,
        diagramKind: detectDiagramKind(opened.source) ?? "gantt",
      });
      refreshHistoryControls();
      setSelectedTaskId(undefined);
      setSelectedDependencyIndex(undefined);
      setInteractionMessage(`Opened ${opened.fileName}`);
    } catch (error) {
      reportFileError(error);
    }
  }, [recordDocumentVersion, refreshHistoryControls, reportFileError, tabs]);

  const saveDocumentAs = useCallback(async () => {
    try {
      const saved = await savePlantUmlDocumentAs(workspace.source, workspace.fileName);
      if (!saved) return;
      if (saved.handle) fileHandles.current.set(tabs.activeId, saved.handle);
      else fileHandles.current.delete(tabs.activeId);
      const historyId = `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      tabs.setDocumentHistoryId(tabs.activeId, historyId);
      tabs.setDocumentBaselineVersionId(tabs.activeId, undefined);
      setBaselineVersion(undefined);
      setWorkspace((current) => ({ ...current, fileName: saved.fileName, dirty: false }));
      await recordDocumentVersion("saved", "Saved as new file", { historyId, fileName: saved.fileName });
      setInteractionMessage(`Saved ${saved.fileName}`);
    } catch (error) {
      reportFileError(error);
    }
  }, [recordDocumentVersion, reportFileError, setWorkspace, tabs, workspace.fileName, workspace.source]);

  const editDocumentVersion = useCallback(
    async (version: DocumentVersion, patch: { label?: string; pinned?: boolean }) => {
      try {
        await updateDocumentVersion(version.id, patch);
        setDocumentVersions(await loadDocumentVersions(activeDocument.historyId));
        setInteractionMessage("Updated document version");
      } catch (error) {
        reportFileError(error);
      }
    },
    [activeDocument.historyId, reportFileError],
  );

  const removeDocumentVersion = useCallback(
    async (version: DocumentVersion) => {
      if (!window.confirm(`Delete version “${version.label || new Date(version.createdAt).toLocaleString()}”?`)) return;
      try {
        await deleteDocumentVersion(version.id);
        if (version.id === activeDocument.baselineVersionId) {
          tabs.setDocumentBaselineVersionId(tabs.activeId, undefined);
          setBaselineVersion(undefined);
        }
        setDocumentVersions(await loadDocumentVersions(activeDocument.historyId));
        setInteractionMessage("Deleted document version");
      } catch (error) {
        reportFileError(error);
      }
    },
    [activeDocument.baselineVersionId, activeDocument.historyId, reportFileError, tabs],
  );

  const saveDocument = useCallback(async () => {
    const handle = fileHandles.current.get(tabs.activeId);
    if (!handle) {
      await saveDocumentAs();
      return;
    }
    try {
      await writePlantUmlDocument(handle, workspace.source);
      setWorkspace((current) => ({ ...current, fileName: handle.name, dirty: false }));
      await recordDocumentVersion("saved", undefined, { fileName: handle.name });
      setInteractionMessage(`Saved ${handle.name}`);
    } catch (error) {
      reportFileError(error);
    }
  }, [recordDocumentVersion, reportFileError, saveDocumentAs, setWorkspace, tabs.activeId, workspace.source]);

  const restoreDocumentVersion = useCallback(
    async (version: DocumentVersion) => {
      try {
        await recordDocumentVersion("before-restore", "Before restore");
        commitSource(version.source, `Restore version from ${new Date(version.createdAt).toLocaleString()}`);
        setInteractionMessage(`Restored ${version.label || new Date(version.createdAt).toLocaleString()}`);
        setVersionHistoryOpen(false);
      } catch (error) {
        reportFileError(error);
      }
    },
    [commitSource, recordDocumentVersion, reportFileError],
  );

  const exportSource = useCallback(
    () => downloadText(workspace.source, workspace.fileName, "text/plain;charset=utf-8"),
    [workspace.fileName, workspace.source],
  );
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
      reportFileError(error);
    }
  }, [reportFileError, tabs.documents, tabs.session]);
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
      retainHistories(restored.session.documents.map((document) => document.id));
      setSelectedTaskId(undefined);
      setSelectedDependencyIndex(undefined);
      setInteractionMessage(
        `Restored ${restored.session.documents.length} document${restored.session.documents.length === 1 ? "" : "s"}`,
      );
    } catch (error) {
      reportFileError(error);
    }
  }, [reportFileError, retainHistories, tabs]);
  const exportSvg = useCallback(() => {
    if (!result?.svg) {
      setInteractionMessage("Render a valid diagram before exporting SVG");
      return;
    }
    downloadText(result.svg, svgFileName(workspace.fileName), "image/svg+xml;charset=utf-8");
  }, [result?.svg, workspace.fileName]);
  const exportPng = useCallback(async () => {
    if (!result?.svg) {
      setInteractionMessage("Render a valid diagram before exporting PNG");
      return;
    }
    try {
      await downloadSvgAsPng(result.svg, workspace.fileName);
    } catch (error) {
      reportFileError(error);
    }
  }, [reportFileError, result?.svg, workspace.fileName]);

  const createDocument = useCallback(
    (diagramKind: DiagramKind) => {
      const replacedDocumentId = replaceActiveDocumentOnCreate ? tabs.activeId : undefined;
      tabs.addDocument({
        diagramKind,
        source: diagramKind === "sequence" ? DEFAULT_SEQUENCE_SOURCE : DEFAULT_SOURCE,
        fileName: "untitled.puml",
        dirty: false,
        cursor: { line: 1, column: 1 },
      });
      if (replacedDocumentId) {
        tabs.closeDocument(replacedDocumentId);
        removeHistory(replacedDocumentId);
        fileHandles.current.delete(replacedDocumentId);
      }
      setSelectedTaskId(undefined);
      setSelectedDependencyIndex(undefined);
      refreshHistoryControls();
      setReplaceActiveDocumentOnCreate(false);
      setNewDocumentOpen(false);
      setInteractionMessage(`Created a new ${diagramKind === "sequence" ? "Sequence" : "Gantt"} diagram`);
    },
    [refreshHistoryControls, removeHistory, replaceActiveDocumentOnCreate, tabs],
  );

  const newDocument = useCallback(() => {
    setReplaceActiveDocumentOnCreate(false);
    setNewDocumentOpen(true);
  }, []);

  const addSequenceParticipant = useCallback(
    (value: AddSequenceParticipantValue) => {
      commitSource(insertSequenceParticipant(workspace.source, value), `Add ${value.kind} ${value.label.trim()}`);
      setAddSequenceParticipantOpen(false);
      setInteractionMessage(`Added ${value.kind} ${value.label.trim()}`);
    },
    [commitSource, workspace.source],
  );

  const addSequenceMessage = useCallback(
    (value: AddSequenceMessageValue) => {
      commitSource(insertSequenceMessage(workspace.source, value), `Add message ${value.from} to ${value.to}`);
      setAddSequenceMessageOpen(false);
      setInteractionMessage(`Added message from ${value.from} to ${value.to}`);
    },
    [commitSource, workspace.source],
  );

  const addSequenceStructure = useCallback(
    (value: import("@plantuml-studio/diagram-sequence").SequenceStructureInput) => {
      const nextSource =
        value.kind === "box"
          ? insertSequenceParticipantBox(workspace.source, sequenceDocument, value)
          : insertSequenceStructure(workspace.source, value);
      commitSource(nextSource, `Add Sequence ${value.kind}`);
      setAddSequenceStructureKind(undefined);
      setInteractionMessage(`Added Sequence ${value.kind}`);
    },
    [commitSource, sequenceDocument, workspace.source],
  );

  const selectSequenceParticipant = useCallback(
    (id: string, revealSource = true) => {
      setSelectedSequenceParticipantId(id);
      setSelectedSequenceMessageId(undefined);
      setSelectedSequenceStructureId(undefined);
      if (revealSource) {
        const participant = sequenceDocument.participants.find((item) => item.id === id);
        if (participant) setSelectionRequest({ ...participant.sourceRange });
      }
    },
    [sequenceDocument],
  );

  const selectSequenceMessage = useCallback(
    (id: string, revealSource = true) => {
      setSelectedSequenceMessageId(id);
      setSelectedSequenceParticipantId(undefined);
      setSelectedSequenceStructureId(undefined);
      if (revealSource) {
        const message = sequenceDocument.messages.find((item) => item.id === id);
        if (message) setSelectionRequest({ ...message.sourceRange });
      }
    },
    [sequenceDocument],
  );

  const selectSequenceStructure = useCallback(
    (id: string, revealSource = true) => {
      setSelectedSequenceStructureId(id);
      setSelectedSequenceParticipantId(undefined);
      setSelectedSequenceMessageId(undefined);
      if (revealSource) {
        const structure = sequenceStructures.find((item) => item.id === id);
        if (structure) setSelectionRequest({ ...structure.sourceRange });
      }
    },
    [sequenceStructures],
  );

  const applySequenceParticipant = useCallback(
    (value: SequenceParticipantInspectorValue) => {
      if (!selectedSequenceParticipant) return;
      const { order, ...presentation } = value;
      const next = updateSequenceParticipant(workspace.source, sequenceDocument, selectedSequenceParticipant, {
        ...presentation,
        ...(order !== undefined ? { order } : {}),
      });
      commitSource(next, `Update participant ${selectedSequenceParticipant.label}`);
      setSelectedSequenceParticipantId((value.alias.trim() || value.label.trim()).toLowerCase());
      setInteractionMessage(`Updated participant ${value.label.trim()}`);
    },
    [commitSource, selectedSequenceParticipant, sequenceDocument, workspace.source],
  );

  const removeSequenceParticipant = useCallback(() => {
    if (!selectedSequenceParticipant) return;
    const reference = selectedSequenceParticipant.alias ?? selectedSequenceParticipant.label;
    const attached = sequenceDocument.messages.filter(
      (message) => message.from === reference || message.to === reference,
    ).length;
    if (
      !window.confirm(
        `Delete “${selectedSequenceParticipant.label}”${attached ? ` and ${attached} connected message${attached === 1 ? "" : "s"}` : ""}?`,
      )
    )
      return;
    commitSource(
      deleteSequenceParticipant(workspace.source, sequenceDocument, selectedSequenceParticipant),
      `Delete participant ${selectedSequenceParticipant.label}`,
    );
    setSelectedSequenceParticipantId(undefined);
    setInteractionMessage(`Deleted participant ${selectedSequenceParticipant.label}`);
  }, [commitSource, selectedSequenceParticipant, sequenceDocument, workspace.source]);

  const applySequenceMessage = useCallback(
    (value: SequenceMessageInspectorValue) => {
      if (!selectedSequenceMessage) return;
      commitSource(updateSequenceMessage(workspace.source, selectedSequenceMessage, value), "Update Sequence message");
      setInteractionMessage("Updated message");
    },
    [commitSource, selectedSequenceMessage, workspace.source],
  );

  const removeSequenceMessage = useCallback(() => {
    if (!selectedSequenceMessage || !window.confirm("Delete this message?")) return;
    commitSource(deleteSequenceMessage(workspace.source, selectedSequenceMessage), "Delete Sequence message");
    setSelectedSequenceMessageId(undefined);
    setInteractionMessage("Deleted message");
  }, [commitSource, selectedSequenceMessage, workspace.source]);

  const applySequenceStructure = useCallback(
    (value: import("@plantuml-studio/diagram-sequence").SequenceStructureInput) => {
      if (!selectedSequenceStructure) return;
      commitSource(
        updateSequenceStructure(workspace.source, selectedSequenceStructure, value),
        `Update Sequence ${value.kind}`,
      );
      setInteractionMessage(`Updated Sequence ${value.kind}`);
    },
    [commitSource, selectedSequenceStructure, workspace.source],
  );

  const removeSequenceStructure = useCallback(() => {
    if (!selectedSequenceStructure || !window.confirm("Delete this Sequence structure?")) return;
    commitSource(deleteSequenceStructure(workspace.source, selectedSequenceStructure), "Delete Sequence structure");
    setSelectedSequenceStructureId(undefined);
    setInteractionMessage("Deleted Sequence structure");
  }, [commitSource, selectedSequenceStructure, workspace.source]);

  const reorderSequenceParticipant = useCallback(
    (id: string, targetId: string, placement: "before" | "after" = "before") => {
      const moved = sequenceDocument.participants.find((item) => item.id === id);
      const target = sequenceDocument.participants.find((item) => item.id === targetId);
      if (!moved || !target) return;
      commitSource(
        reorderSequenceStatement(workspace.source, moved, target, placement),
        `Reorder participant ${moved.label}`,
      );
      setInteractionMessage(`Moved ${moved.label} ${placement} ${target.label}`);
    },
    [commitSource, sequenceDocument.participants, workspace.source],
  );

  const reorderSequenceMessage = useCallback(
    (id: string, targetId: string, placement: "before" | "after" = "before") => {
      const moved = sequenceDocument.messages.find((item) => item.id === id);
      const target = sequenceDocument.messages.find((item) => item.id === targetId);
      if (!moved || !target) return;
      commitSource(reorderSequenceStatement(workspace.source, moved, target, placement), "Reorder Sequence message");
      setSelectedSequenceMessageId(undefined);
      setInteractionMessage("Reordered message");
    },
    [commitSource, sequenceDocument.messages, workspace.source],
  );

  const reorderSequenceTimeline = useCallback(
    (id: string, targetId: string, placement: "before" | "after" = "before") => {
      const timeline = [...sequenceDocument.messages, ...sequenceStructures];
      const moved = timeline.find((item) => item.id === id);
      const target = timeline.find((item) => item.id === targetId);
      if (!moved || !target) return;
      const next = reorderSequenceStatement(workspace.source, moved, target, placement);
      if (next === workspace.source) return;
      commitSource(next, "Reorder Sequence element");
      setSelectedSequenceMessageId(undefined);
      setSelectedSequenceStructureId(undefined);
      setInteractionMessage(`Moved Sequence element ${placement} target`);
    },
    [commitSource, sequenceDocument.messages, sequenceStructures, workspace.source],
  );

  const reconnectSequenceElement = useCallback(
    (structureId: string, endpoint: number, participantId: string) => {
      const structure = sequenceStructures.find((item) => item.id === structureId);
      const participant = sequenceDocument.participants.find((item) => item.id === participantId);
      if (!structure || !participant) return;
      const next = reconnectSequenceStructure(
        workspace.source,
        structure,
        endpoint,
        participant.alias ?? participant.label,
      );
      if (next === workspace.source) return;
      commitSource(next, "Reconnect Sequence element");
      setInteractionMessage(`Attached Sequence element to ${participant.label}`);
    },
    [commitSource, sequenceDocument.participants, sequenceStructures, workspace.source],
  );

  const reconnectSequenceMessage = useCallback(
    (messageId: string, endpoint: "from" | "to", participantId: string) => {
      const message = sequenceDocument.messages.find((item) => item.id === messageId);
      const participant = sequenceDocument.participants.find((item) => item.id === participantId);
      if (!message || !participant) return;
      const reference = participant.alias ?? participant.label;
      const next = updateSequenceMessage(workspace.source, message, { ...message, [endpoint]: reference });
      commitSource(next, `Reconnect message ${endpoint}`);
      setInteractionMessage(`Changed message ${endpoint === "from" ? "sender" : "recipient"} to ${participant.label}`);
    },
    [commitSource, sequenceDocument, workspace.source],
  );

  const externalizeSequenceMessage = useCallback(
    (messageId: string, endpoint: "from" | "to", marker: "[" | "]" | "?") => {
      const message = sequenceDocument.messages.find((item) => item.id === messageId);
      if (!message) return;
      commitSource(
        updateSequenceMessage(workspace.source, message, { ...message, [endpoint]: marker }),
        "Reconnect message to diagram edge",
      );
      setInteractionMessage(marker === "?" ? "Marked message as lost" : "Connected message to diagram edge");
    },
    [commitSource, sequenceDocument.messages, workspace.source],
  );

  const createSequenceMessageByDrag = useCallback(
    (fromId: string, toId: string) => {
      const from = sequenceDocument.participants.find((item) => item.id === fromId);
      const to = sequenceDocument.participants.find((item) => item.id === toId);
      if (!from || !to) return;
      const source = insertSequenceMessage(workspace.source, {
        from: from.alias ?? from.label,
        to: to.alias ?? to.label,
        arrow: "->",
        label: "New message",
      });
      commitSource(source, `Connect ${from.label} to ${to.label}`);
      setInteractionMessage(`Added message from ${from.label} to ${to.label}`);
    },
    [commitSource, sequenceDocument.participants, workspace.source],
  );

  const addTask = useCallback(
    (value: AddTaskValue) => {
      const operation = insertTask(workspace.source, value);
      if (operation.unavailableReason) {
        setInteractionMessage(operation.unavailableReason);
        return;
      }
      if (!commitGeneratedSource(applySourceEdits(workspace.source, operation.edits), `Add ${value.label.trim()}`))
        return;
      setAddTaskOpen(false);
      setInteractionMessage(`Added ${value.label.trim()}`);
    },
    [commitGeneratedSource, workspace.source],
  );

  const addDivider = useCallback(
    (value: AddSeparatorValue) => {
      if (value.kind === "vertical") {
        const operation = insertVerticalSeparator(workspace.source, value);
        if (operation.unavailableReason) {
          setInteractionMessage(operation.unavailableReason);
          return;
        }
        if (!commitGeneratedSource(applySourceEdits(workspace.source, operation.edits), "Add vertical separator"))
          return;
        setAddDividerOpen(false);
        setInteractionMessage("Added vertical separator");
        return;
      }
      const beforeTask = value.beforeTaskId
        ? parseGantt(workspace.source).document.symbols.tasks.get(value.beforeTaskId)
        : undefined;
      const beforeRange = beforeTask?.declarations.map((item) => item.range).sort((a, b) => a.from - b.from)[0];
      const operation = insertDivider(workspace.source, value.label, beforeRange);
      if (operation.unavailableReason) {
        setInteractionMessage(operation.unavailableReason);
        return;
      }
      if (
        !commitGeneratedSource(applySourceEdits(workspace.source, operation.edits), `Add divider ${value.label.trim()}`)
      )
        return;
      setAddDividerOpen(false);
      setInteractionMessage(`Added divider ${value.label.trim()}`);
    },
    [commitGeneratedSource, workspace.source],
  );

  const addMilestone = useCallback(
    (value: AddMilestoneValue) => {
      const operation = insertMilestone(workspace.source, {
        label: value.label,
        ...(value.mode === "fixed"
          ? { date: value.date ?? "" }
          : { referenceLabel: value.referenceLabel ?? "", referenceAnchor: value.referenceAnchor ?? "end" }),
      });
      if (operation.unavailableReason) {
        setInteractionMessage(operation.unavailableReason);
        return;
      }
      if (!commitGeneratedSource(applySourceEdits(workspace.source, operation.edits), `Add ${value.label.trim()}`))
        return;
      setAddMilestoneOpen(false);
      setInteractionMessage(`Added milestone ${value.label.trim()}`);
    },
    [commitGeneratedSource, workspace.source],
  );

  const applyTaskInspector = useCallback(
    (value: TaskInspectorValue) => {
      if (!selectedTaskId) return;
      const duration = value.duration === "" ? undefined : Number(value.duration);
      const completion = value.completion === "" ? undefined : Number(value.completion);
      if (duration !== undefined && (!Number.isInteger(duration) || duration < 1)) {
        setInteractionMessage("Duration must be a positive whole number");
        return;
      }
      if (completion !== undefined && (!Number.isInteger(completion) || completion < 0 || completion > 100)) {
        setInteractionMessage("Completion must be between 0 and 100");
        return;
      }

      let source = workspace.source;
      let currentId = selectedTaskId;
      const current = () => parseGantt(source).document.symbols.tasks.get(currentId);
      const original = current();
      if (!original) return;
      const renamed = renameTask(source, parseGantt(source).document, original, value.label);
      if (renamed.unavailableReason) {
        setInteractionMessage(renamed.unavailableReason);
        return;
      }
      source = applySourceEdits(source, renamed.edits);
      currentId = original.alias ? original.id : normalizeTaskId(value.label);

      const applyDeclaration = (
        kind: "start" | "end" | "duration" | "completion" | "color" | "same-row",
        statement?: string,
      ) => {
        const task = current();
        if (task) source = applySourceEdits(source, setTaskDeclaration(source, task, kind, statement).edits);
      };
      const predecessor = value.predecessorId
        ? parseGantt(source).document.symbols.tasks.get(value.predecessorId)
        : undefined;
      const derivedStart = resolvedTaskDates.get(selectedTaskId)?.start ?? "";
      const derivedEnd = resolvedTaskDates.get(selectedTaskId)?.end ?? "";
      if (predecessor) {
        const endsTask = value.dependencyRelation.startsWith("end-");
        const linkedAnchor = value.dependencyRelation.endsWith("-start") ? "start" : "end";
        const linkedStatement = `${endsTask ? "ends" : "starts"} at [${predecessor.alias?.value ?? predecessor.label}]'s ${linkedAnchor}`;
        applyDeclaration(
          "start",
          endsTask
            ? value.startDate && value.startDate !== derivedStart
              ? `starts ${value.startDate}`
              : undefined
            : linkedStatement,
        );
        applyDeclaration(
          "end",
          endsTask
            ? linkedStatement
            : value.endDate && value.endDate !== derivedEnd
              ? `ends ${value.endDate}`
              : undefined,
        );
      } else {
        applyDeclaration("start", value.startDate ? `starts ${value.startDate}` : undefined);
        applyDeclaration("end", value.endDate ? `ends ${value.endDate}` : undefined);
      }
      applyDeclaration(
        "duration",
        duration !== undefined ? `lasts ${duration} ${value.durationUnit}${duration === 1 ? "" : "s"}` : undefined,
      );
      applyDeclaration("completion", completion !== undefined ? `is ${completion}% completed` : undefined);
      applyDeclaration("color", value.color.trim() ? `is colored in ${value.color.trim()}` : undefined);
      const sameRowTask = value.sameRowTaskId
        ? parseGantt(source).document.symbols.tasks.get(value.sameRowTaskId)
        : undefined;
      applyDeclaration(
        "same-row",
        sameRowTask ? `displays on same row as [${sameRowTask.alias?.value ?? sameRowTask.label}]` : undefined,
      );
      const pauseDates = value.pauses.map((pause) => pause.value.trim()).filter(Boolean);
      const pauseOperation = current()
        ? setTaskPauses(source, current()!, pauseDates)
        : { edits: [], unavailableReason: "Task not found" };
      if (pauseOperation.unavailableReason) {
        setInteractionMessage(pauseOperation.unavailableReason);
        return;
      }
      source = applySourceEdits(source, pauseOperation.edits);
      const links = value.links
        .filter((link) => link.url.trim())
        .map((link) => ({
          url: link.url.trim(),
          ...(link.label.trim() ? { label: link.label.trim() } : {}),
        }));
      const linkOperation = current()
        ? setTaskLinks(source, current()!, links)
        : { edits: [], unavailableReason: "Task not found" };
      if (linkOperation.unavailableReason) {
        setInteractionMessage(linkOperation.unavailableReason);
        return;
      }
      source = applySourceEdits(source, linkOperation.edits);
      const resources = value.resources.map((item) => ({
        name: item.name.trim(),
        allocation: Number(item.allocation),
      }));
      const resourceOperation = current()
        ? setTaskResources(source, current()!, resources)
        : { edits: [], unavailableReason: "Task not found" };
      if (resourceOperation.unavailableReason) {
        setInteractionMessage(resourceOperation.unavailableReason);
        return;
      }
      source = applySourceEdits(source, resourceOperation.edits);
      const taskForNote = current();
      if (taskForNote) {
        const noteOperation = setNote(
          source,
          taskForNote.sourceRange,
          taskForNote.notes,
          value.note,
          value.notePosition,
        );
        if (noteOperation.unavailableReason) {
          setInteractionMessage(noteOperation.unavailableReason);
          return;
        }
        source = applySourceEdits(source, noteOperation.edits);
      }
      setSelectedTaskId(currentId);
      selectedTasksByDocument.current.set(tabs.activeId, currentId);
      if (!commitGeneratedSource(source, `Update ${value.label.trim()}`)) {
        setSelectedTaskId(selectedTaskId);
        selectedTasksByDocument.current.set(tabs.activeId, selectedTaskId);
        return;
      }
      setInteractionMessage(`Updated ${value.label.trim()}`);
    },
    [commitGeneratedSource, resolvedTaskDates, selectedTaskId, tabs.activeId, workspace.source],
  );

  const applyMilestoneInspector = useCallback(
    (value: MilestoneInspectorValue) => {
      if (!selectedTaskId) return;
      if (value.mode === "fixed" && !value.date) {
        setInteractionMessage("Milestone date is required");
        return;
      }
      if (value.mode === "relative" && !value.referenceLabel) {
        setInteractionMessage("Choose a relative task or milestone");
        return;
      }
      let source = workspace.source;
      let currentId = selectedTaskId;
      const current = () => parseGantt(source).document.symbols.tasks.get(currentId);
      const original = current();
      if (!original) return;
      const renamed = renameTask(source, parseGantt(source).document, original, value.label);
      if (renamed.unavailableReason) {
        setInteractionMessage(renamed.unavailableReason);
        return;
      }
      source = applySourceEdits(source, renamed.edits);
      currentId = original.alias ? original.id : normalizeTaskId(value.label);
      const task = current();
      if (!task) return;
      const milestoneStatement =
        value.mode === "fixed"
          ? `happens ${value.date}`
          : `happens at [${value.referenceLabel}]'s ${value.referenceAnchor}`;
      source = applySourceEdits(source, setTaskDeclaration(source, task, "milestone", milestoneStatement).edits);
      const colored = current();
      if (colored)
        source = applySourceEdits(
          source,
          setTaskDeclaration(
            source,
            colored,
            "color",
            value.color.trim() ? `is colored in ${value.color.trim()}` : undefined,
          ).edits,
        );
      const noted = current();
      if (noted) {
        const noteOperation = setNote(source, noted.sourceRange, noted.notes, value.note, value.notePosition);
        if (noteOperation.unavailableReason) {
          setInteractionMessage(noteOperation.unavailableReason);
          return;
        }
        source = applySourceEdits(source, noteOperation.edits);
      }
      if (!commitGeneratedSource(source, `Update ${value.label.trim()}`)) return;
      setSelectedTaskId(currentId);
      setInteractionMessage(`Updated milestone ${value.label.trim()}`);
    },
    [commitGeneratedSource, selectedTaskId, workspace.source],
  );

  const deleteSelectedTask = useCallback(() => {
    if (!selectedTask) return;
    const kind = selectedTask.milestone ? "milestone" : "task";
    if (!window.confirm(`Delete ${kind} “${selectedTask.label}” and its dependency links?`)) return;
    const operation = deleteTask(workspace.source, parseResult.document, selectedTask);
    if (!commitGeneratedSource(applySourceEdits(workspace.source, operation.edits), `Delete ${selectedTask.label}`))
      return;
    setSelectedTaskId(undefined);
    setSelectedDependencyIndex(undefined);
    setInteractionMessage(`Deleted ${selectedTask.label}`);
  }, [commitGeneratedSource, parseResult.document, selectedTask, workspace.source]);

  const applyProjectSettings = useCallback(
    (value: ReturnType<typeof parseProjectSettings>) => {
      const zoom = value.scaleZoom === "" ? undefined : Number(value.scaleZoom);
      if (zoom !== undefined && (!Number.isInteger(zoom) || zoom < 1)) {
        setInteractionMessage("Scale zoom must be a positive whole number");
        return;
      }
      if (value.highlightToday && (!value.todayColor.trim() || /\s/.test(value.todayColor.trim()))) {
        setInteractionMessage("Today color must be a PlantUML color name or hex value");
        return;
      }
      if (value.dateRules.some((rule) => !rule.from || !rule.to || rule.to < rule.from)) {
        setInteractionMessage("Calendar dates need a valid start and end date");
        return;
      }
      if (
        value.dateRules.some(
          (rule) => rule.state === "colored" && (!rule.color?.trim() || /\s/.test(rule.color.trim())),
        )
      ) {
        setInteractionMessage("Highlighted dates need a PlantUML color name or hex value");
        return;
      }
      const settingsSource = updateProjectSettings(workspace.source, value);
      const nextSource = value.showLegend
        ? synchronizeLegend(settingsSource, parseGantt(settingsSource).document.tasks)
        : removeLegend(settingsSource);
      if (!commitGeneratedSource(nextSource, "Update project calendar")) return;
      setProjectInspectorOpen(false);
      setInteractionMessage("Updated project calendar");
    },
    [commitGeneratedSource, workspace.source],
  );

  const applySequenceSettings = useCallback(
    (value: SequenceSettings) => {
      commitSource(updateSequenceSettings(workspace.source, value), "Update Sequence settings");
      setSequenceSettingsOpen(false);
      setInteractionMessage("Updated Sequence settings");
    },
    [commitSource, workspace.source],
  );

  const commands = useMemo<Command[]>(() => {
    const diagramCommands: Command[] =
      workspace.diagramKind === "gantt"
        ? [
            {
              id: "edit.add-task",
              label: "Add task…",
              category: "Edit",
              shortcut: optionShortcut("T"),
              run: () => setAddTaskOpen(true),
            },
            {
              id: "edit.add-milestone",
              label: "Add milestone…",
              category: "Edit",
              shortcut: optionShortcut("M"),
              run: () => setAddMilestoneOpen(true),
            },
            {
              id: "edit.add-divider",
              label: "Add divider…",
              category: "Edit",
              shortcut: optionShortcut("D"),
              run: () => setAddDividerOpen(true),
            },
            { id: "edit.project-calendar", label: "Project & calendar…", category: "Edit", run: openProjectInspector },
            { id: "edit.legend", label: "Legend labels…", category: "Edit", run: () => setLegendInspectorOpen(true) },
            { id: "view.resource-workload", label: "Resource workload…", category: "View", run: openResourcePanel },
          ]
        : [
            {
              id: "edit.add-participant",
              label: "Add participant…",
              category: "Edit",
              shortcut: optionShortcut("P"),
              run: () => setAddSequenceParticipantOpen(true),
            },
            {
              id: "edit.add-message",
              label: "Add message…",
              category: "Edit",
              shortcut: optionShortcut("M"),
              run: () => setAddSequenceMessageOpen(true),
            },
            {
              id: "edit.add-fragment",
              label: "Add combined fragment…",
              category: "Edit",
              run: () => setAddSequenceStructureKind("fragment"),
            },
            {
              id: "edit.add-activation",
              label: "Add activation…",
              category: "Edit",
              run: () => setAddSequenceStructureKind("activation"),
            },
            {
              id: "edit.add-note",
              label: "Add Sequence note…",
              category: "Edit",
              run: () => setAddSequenceStructureKind("note"),
            },
          ];
    return [
      { id: "file.new", label: "New document", category: "File", shortcut: "⌘N", run: newDocument },
      { id: "file.open", label: "Open…", category: "File", shortcut: "⌘O", run: openDocument },
      { id: "file.save", label: "Save", category: "File", shortcut: "⌘S", run: saveDocument },
      { id: "file.save-as", label: "Save As…", category: "File", run: saveDocumentAs },
      { id: "file.backup", label: "Back up workspace", category: "File", run: backupWorkspace },
      { id: "file.restore", label: "Restore workspace…", category: "File", run: () => void restoreWorkspace() },
      ...diagramCommands,
      {
        id: "help.reference",
        label: "Help & keyboard shortcuts",
        category: "Help",
        shortcut: "?",
        run: () => setHelpOpen(true),
      },
      { id: "edit.undo", label: "Undo", category: "Edit", shortcut: "⌘Z", enabled: activeHistory.canUndo, run: undo },
      { id: "edit.redo", label: "Redo", category: "Edit", shortcut: "⇧⌘Z", enabled: activeHistory.canRedo, run: redo },
      ...(["code", "split", "diagram"] as ViewMode[]).map((mode, index) => ({
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
        run: () => update("zoom", Math.min(2, workspace.zoom + 0.1)),
      },
      {
        id: "view.zoom-out",
        label: "Zoom out",
        category: "View",
        run: () => update("zoom", Math.max(0.5, workspace.zoom - 0.1)),
      },
      { id: "export.source", label: "Export source", category: "Export", run: exportSource },
      { id: "export.svg", label: "Export SVG", category: "Export", enabled: Boolean(result?.svg), run: exportSvg },
      { id: "export.png", label: "Export PNG", category: "Export", enabled: Boolean(result?.svg), run: exportPng },
    ];
  }, [
    activeHistory,
    backupWorkspace,
    exportPng,
    exportSource,
    exportSvg,
    newDocument,
    openDocument,
    openProjectInspector,
    openResourcePanel,
    redo,
    restoreWorkspace,
    result?.svg,
    saveDocument,
    saveDocumentAs,
    undo,
    update,
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
      if (event.key === "?" && !event.metaKey && !event.ctrlKey && !event.altKey && !editing) {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (
        event.altKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !editingOutsideCodeEditor &&
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
                  : "";
        if (workspace.diagramKind === "sequence" && (creation === "p" || creation === "m")) {
          event.preventDefault();
          if (creation === "p") setAddSequenceParticipantOpen(true);
          else setAddSequenceMessageOpen(true);
          return;
        }
        if (workspace.diagramKind === "gantt" && (creation === "t" || creation === "m" || creation === "d")) {
          event.preventDefault();
          if (creation === "t") setAddTaskOpen(true);
          else if (creation === "m") setAddMilestoneOpen(true);
          else setAddDividerOpen(true);
          return;
        }
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
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
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveDocument();
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
  }, [closeTab, newDocument, openDocument, redo, saveDocument, tabs.activeId, undo, update, workspace.diagramKind]);

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

  return (
    <div
      className={`app${selectedTask || selectedDependency || selectedSequenceParticipant || selectedSequenceMessage || selectedSequenceStructure || sequenceSettingsOpen || resourcePanelOpen || unsupportedOpen ? " has-side-inspector" : ""}${projectInspectorOpen ? " has-project-inspector" : ""}`}
      data-theme={workspace.theme}
    >
      <header className="toolbar">
        <strong>PlantUML Ultimate</strong>
        <div className="file-tools" aria-label="File controls">
          <FileMenu
            canExport={Boolean(result?.svg)}
            onNew={newDocument}
            onOpen={() => void openDocument()}
            onSave={() => void saveDocument()}
            onSaveAs={() => void saveDocumentAs()}
            onVersionHistory={() => void openVersionHistory()}
            onBackup={backupWorkspace}
            onRestore={() => void restoreWorkspace()}
            onExportSource={exportSource}
            onExportSvg={exportSvg}
            onExportPng={() => void exportPng()}
          />
          <AddMenu
            diagramKind={workspace.diagramKind}
            onTask={() => setAddTaskOpen(true)}
            onMilestone={() => setAddMilestoneOpen(true)}
            onDivider={() => setAddDividerOpen(true)}
            onParticipant={() => setAddSequenceParticipantOpen(true)}
            onMessage={() => setAddSequenceMessageOpen(true)}
            onFragment={() => setAddSequenceStructureKind("fragment")}
            onActivation={() => setAddSequenceStructureKind("activation")}
            onNote={() => setAddSequenceStructureKind("note")}
            onSequenceSpacing={() => setAddSequenceStructureKind("separator")}
            onReference={() => setAddSequenceStructureKind("reference")}
            onParticipantBox={() => setAddSequenceStructureKind("box")}
          />
          {workspace.diagramKind === "gantt" && (
            <>
              <button data-inspector-trigger onClick={openProjectInspector}>
                Project
              </button>
              <button data-inspector-trigger onClick={openResourcePanel}>
                Resources
              </button>
            </>
          )}
          {workspace.diagramKind === "sequence" && (
            <button data-inspector-trigger onClick={() => setSequenceSettingsOpen(true)}>
              Sequence
            </button>
          )}
          <button onClick={() => setPaletteOpen(true)} title="Command palette (Cmd/Ctrl+Shift+P)">
            ⌘
          </button>
          <button onClick={() => setHelpOpen(true)}>Help</button>
        </div>
        <nav aria-label="View mode">
          {(["code", "split", "diagram"] as ViewMode[]).map((mode, index) => (
            <button
              className={workspace.viewMode === mode ? "active" : ""}
              onClick={() => update("viewMode", mode)}
              key={mode}
            >
              {index + 1} · {mode}
            </button>
          ))}
        </nav>
        <div className="history-tools" aria-label="History controls">
          <button onClick={undo} disabled={!activeHistory.canUndo} aria-label="Undo">
            ↶
          </button>
          <button onClick={redo} disabled={!activeHistory.canRedo} aria-label="Redo">
            ↷
          </button>
        </div>
        {workspace.diagramKind === "gantt" && (
          <label className="resource-filter">
            Resource{" "}
            <select value={resourceFilter} onChange={(event) => setResourceFilter(event.target.value)}>
              <option value="">All</option>
              {resourceNames.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
        )}
        {workspace.diagramKind === "gantt" && (
          <label className="schedule-mode">
            Schedule{" "}
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
        <label>
          Theme{" "}
          <select value={workspace.theme} onChange={(event) => update("theme", event.target.value as Theme)}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
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
            title={`${document.fileName}${document.dirty ? " — unsaved changes" : ""}`}
          >
            <span className="tab-label">
              <span className={`dirty-dot${document.dirty ? " visible" : ""}`} aria-hidden="true">
                ●
              </span>
              {tabLabels.get(document.id)}
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
        <button className="new-tab" onClick={newDocument} aria-label="New document tab">
          +
        </button>
      </nav>
      {tabMenu && (
        <div
          className="tab-menu"
          role="menu"
          aria-label="Tab actions"
          style={{ left: tabMenu.x, top: tabMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
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
        className={`workspace mode-${workspace.viewMode}`}
        style={{
          gridTemplateColumns: workspace.viewMode === "split" ? `${workspace.splitPercent}% 5px 1fr` : undefined,
        }}
      >
        {workspace.viewMode !== "diagram" && (
          <CodeEditor
            diagramKind={workspace.diagramKind}
            value={workspace.source}
            onChange={(source) => commitSource(source, "Edit source")}
            selectedRange={selectionRequest}
            onCursorChange={(line, column, position) => {
              update("cursor", { line, column });
              if (workspace.diagramKind === "gantt") {
                setSelectedTaskId(findTaskAt(parseResult.document, position)?.id);
              } else {
                const object = findSequenceObjectAt(sequenceDocument, position);
                if (
                  object &&
                  sequenceDocument.participants.includes(object as (typeof sequenceDocument.participants)[number])
                )
                  selectSequenceParticipant(object.id, false);
                else if (object && "from" in object) selectSequenceMessage(object.id, false);
                else if (object) selectSequenceStructure(object.id, false);
                else {
                  setSelectedSequenceParticipantId(undefined);
                  setSelectedSequenceMessageId(undefined);
                  setSelectedSequenceStructureId(undefined);
                }
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
              onTaskSelect={selectTask}
              onNoteSelect={(taskId) => {
                selectTask(taskId);
                setFocusNoteTaskId(taskId);
              }}
              onBackgroundSelect={() => {
                setSelectedTaskId(undefined);
                setSelectedDependencyIndex(undefined);
                setFocusNoteTaskId(undefined);
              }}
              onTaskMove={moveTask}
              onTaskReorder={reorderDiagramTask}
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
              }}
              onTaskResize={resizeTask}
              onDependencyCreate={connectTasks}
              selectedDependencyIndex={selectedDependencyIndex}
              onDependencySelect={setSelectedDependencyIndex}
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
              onClearBaseline={() => {
                tabs.setDocumentBaselineVersionId(tabs.activeId, undefined);
                setBaselineVersion(undefined);
                setInteractionMessage("Baseline cleared");
              }}
            />
          ) : (
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
              selectedParticipantId={selectedSequenceParticipantId}
              selectedMessageId={selectedSequenceMessageId}
              selectedStructureId={selectedSequenceStructureId}
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
          ))}
      </main>
      <footer className="statusbar">
        <span role="status" aria-live="polite">
          {interactionMessage ??
            (result?.error
              ? `⚠ ${result.error}`
              : diagnosticCount
                ? `⚠ ${diagnosticCount} problem${diagnosticCount === 1 ? "" : "s"}`
                : "✓ Valid")}
        </span>
        {unsupportedCount > 0 && (
          <button
            type="button"
            className="unsupported-count"
            onClick={() => {
              setUnsupportedOpen(true);
              setSelectedTaskId(undefined);
              setSelectedDependencyIndex(undefined);
              setProjectInspectorOpen(false);
              setResourcePanelOpen(false);
            }}
          >
            {unsupportedCount} preserved line{unsupportedCount === 1 ? "" : "s"}
          </button>
        )}
        <span>{workspace.diagramKind === "sequence" ? "Sequence" : "Gantt"}</span>
        <span>
          {workspace.viewMode === "code"
            ? "Preview paused"
            : status === "rendering"
              ? "Rendering…"
              : `Render ${Math.round(result?.durationMs ?? 0)} ms`}
        </span>
        <span>
          Ln {workspace.cursor.line}, Col {workspace.cursor.column}
        </span>
        <span>{hydrated ? "IndexedDB" : "Restoring…"}</span>
      </footer>
      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
      {newDocumentOpen && <NewDocumentDialog onChoose={createDocument} onClose={() => setNewDocumentOpen(false)} />}
      {addSequenceParticipantOpen && (
        <AddSequenceParticipantDialog
          onAdd={addSequenceParticipant}
          onClose={() => setAddSequenceParticipantOpen(false)}
        />
      )}
      {addSequenceMessageOpen && (
        <AddSequenceMessageDialog
          participants={sequenceDocument.participants.map((participant) => participant.alias ?? participant.label)}
          onAdd={addSequenceMessage}
          onClose={() => setAddSequenceMessageOpen(false)}
        />
      )}
      {addSequenceStructureKind && (
        <AddSequenceStructureDialog
          initialKind={addSequenceStructureKind}
          participants={sequenceParticipantNames}
          onAdd={addSequenceStructure}
          onClose={() => setAddSequenceStructureKind(undefined)}
        />
      )}
      {addTaskOpen && (
        <AddTaskDialog
          taskLabels={parseResult.document.tasks.map((task) => task.label)}
          defaultStartDate={
            parseResult.document.projectStart?.resolved ? parseResult.document.projectStart.value : undefined
          }
          onAdd={addTask}
          onClose={() => setAddTaskOpen(false)}
        />
      )}
      {addDividerOpen && (
        <AddDividerDialog
          tasks={parseResult.document.tasks}
          onAdd={addDivider}
          onClose={() => setAddDividerOpen(false)}
        />
      )}
      {addMilestoneOpen && (
        <AddMilestoneDialog
          taskLabels={parseResult.document.tasks.map((task) => task.label)}
          onAdd={addMilestone}
          onClose={() => setAddMilestoneOpen(false)}
        />
      )}
      {projectInspectorOpen && (
        <ProjectInspector
          settings={parseProjectSettings(workspace.source)}
          onApply={applyProjectSettings}
          onClose={() => setProjectInspectorOpen(false)}
        />
      )}
      {sequenceSettingsOpen && (
        <SequenceSettingsInspector
          settings={parseSequenceSettings(workspace.source)}
          onApply={applySequenceSettings}
          onClose={() => setSequenceSettingsOpen(false)}
        />
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
            await recordDocumentVersion("manual", label || "Manual version");
            setInteractionMessage("Created document version");
          }}
          onRestore={restoreDocumentVersion}
          onUpdate={editDocumentVersion}
          onDelete={removeDocumentVersion}
          baselineVersionId={activeDocument.baselineVersionId}
          onSetBaseline={async (version) => {
            if (version) await updateDocumentVersion(version.id, { pinned: true });
            tabs.setDocumentBaselineVersionId(tabs.activeId, version?.id);
            setBaselineVersion(version ? { ...version, pinned: true } : undefined);
            setDocumentVersions(await loadDocumentVersions(activeDocument.historyId));
            setInteractionMessage(version ? "Baseline version selected" : "Baseline cleared");
          }}
          onClose={() => setVersionHistoryOpen(false)}
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
      {selectedSequenceParticipant && (
        <SequenceParticipantInspector
          key={`${selectedSequenceParticipant.id}:${selectedSequenceParticipant.sourceRange.to}`}
          participant={selectedSequenceParticipant}
          onApply={applySequenceParticipant}
          onDelete={removeSequenceParticipant}
          onClose={() => setSelectedSequenceParticipantId(undefined)}
        />
      )}
      {selectedSequenceMessage && (
        <SequenceMessageInspector
          key={`${selectedSequenceMessage.id}:${selectedSequenceMessage.sourceRange.to}`}
          message={selectedSequenceMessage}
          participants={sequenceParticipantNames}
          onApply={applySequenceMessage}
          onDelete={removeSequenceMessage}
          onClose={() => setSelectedSequenceMessageId(undefined)}
        />
      )}
      {selectedSequenceStructure && (
        <SequenceStructureInspector
          key={`${selectedSequenceStructure.id}:${selectedSequenceStructure.sourceRange.to}`}
          structure={selectedSequenceStructure}
          participants={sequenceParticipantNames}
          onApply={applySequenceStructure}
          onDelete={removeSequenceStructure}
          onClose={() => setSelectedSequenceStructureId(undefined)}
        />
      )}
      {selectedTask?.milestone && (
        <MilestoneInspector
          key={`${selectedTask.id}:${selectedTask.sourceRange.to}:${selectedTaskDependency?.predecessorTaskId ?? ""}:${selectedTaskDependency?.relation ?? ""}`}
          milestone={selectedTask}
          tasks={parseResult.document.tasks}
          relativeAnchor={
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
          onApply={applyMilestoneInspector}
          onDelete={deleteSelectedTask}
          onClose={() => setSelectedTaskId(undefined)}
        />
      )}
      {selectedTask && !selectedTask.milestone && (
        <TaskInspector
          key={selectedTask.id}
          task={selectedTask}
          tasks={parseResult.document.tasks}
          predecessorId={selectedPredecessorId}
          dependencyRelation={selectedTaskDependency?.relation ?? "start-after-end"}
          effectiveStart={resolvedTaskDates.get(selectedTask.id)?.start ?? ""}
          effectiveEnd={resolvedTaskDates.get(selectedTask.id)?.end ?? ""}
          calendar={ganttCalendar}
          resourceNames={resourceNames}
          conflicts={selectedResourceConflicts}
          focusNote={focusNoteTaskId === selectedTask.id}
          onApply={applyTaskInspector}
          onDelete={deleteSelectedTask}
          onClose={() => setSelectedTaskId(undefined)}
        />
      )}
      {selectedDependency && (
        <DependencyInspector
          key={`${selectedDependency.sourceRange.from}:${selectedDependency.sourceRange.to}`}
          dependency={selectedDependency}
          tasks={parseResult.document.tasks}
          onApply={applyDependencyInspector}
          onDelete={deleteDependency}
          onClose={() => setSelectedDependencyIndex(undefined)}
        />
      )}
      {selectedDividerIndex !== undefined && parseResult.document.dividers[selectedDividerIndex] && (
        <DividerInspector
          divider={parseResult.document.dividers[selectedDividerIndex]!}
          onApply={applyDividerInspector}
          onDelete={deleteSelectedDivider}
          onClose={() => setSelectedDividerIndex(undefined)}
        />
      )}
      {selectedVerticalSeparatorIndex !== undefined &&
        parseResult.document.verticalSeparators[selectedVerticalSeparatorIndex] && (
          <VerticalSeparatorInspector
            separator={parseResult.document.verticalSeparators[selectedVerticalSeparatorIndex]!}
            tasks={parseResult.document.tasks}
            onApply={(value: VerticalSeparatorValue) => {
              const separator = parseResult.document.verticalSeparators[selectedVerticalSeparatorIndex];
              if (!separator) return;
              const operation = updateVerticalSeparator(separator, value);
              if (operation.unavailableReason) {
                setInteractionMessage(operation.unavailableReason);
                return;
              }
              if (
                commitGeneratedSource(applySourceEdits(workspace.source, operation.edits), "Update vertical separator")
              )
                setInteractionMessage("Updated vertical separator");
            }}
            onDelete={() => {
              const separator = parseResult.document.verticalSeparators[selectedVerticalSeparatorIndex];
              if (!separator || !window.confirm("Delete this vertical separator?")) return;
              if (
                commitGeneratedSource(
                  applySourceEdits(workspace.source, deleteVerticalSeparator(workspace.source, separator).edits),
                  "Delete vertical separator",
                )
              ) {
                setSelectedVerticalSeparatorIndex(undefined);
                setInteractionMessage("Deleted vertical separator");
              }
            }}
            onClose={() => setSelectedVerticalSeparatorIndex(undefined)}
          />
        )}
      {legendInspectorOpen && (
        <LegendInspector
          entries={legendEntries}
          focusColor={legendFocusColor}
          onApply={(entries) => {
            const labels = new Map(entries.map((entry) => [entry.color.toLowerCase(), entry.label]));
            const source = synchronizeLegend(workspace.source, parseResult.document.tasks, labels);
            if (commitGeneratedSource(source, "Update legend labels")) {
              setLegendInspectorOpen(false);
              setLegendFocusColor(undefined);
              setInteractionMessage("Updated legend labels");
            }
          }}
          onClose={() => {
            setLegendInspectorOpen(false);
            setLegendFocusColor(undefined);
          }}
        />
      )}
      {resourcePanelOpen && (
        <ResourceWorkloadPanel
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
            const operation = renameResource(parseResult.document, currentName, nextName);
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
      {unsupportedOpen && (
        <UnsupportedSyntaxPanel
          items={parseResult.document.unknown}
          onReveal={(item) => {
            if (workspace.viewMode === "diagram") update("viewMode", "split");
            setSelectionRequest({ ...item.range });
            setUnsupportedOpen(false);
          }}
          onClose={() => setUnsupportedOpen(false)}
        />
      )}
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
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

function findResourceConflicts(
  task: import("@plantuml-studio/diagram-gantt").GanttTask,
  tasks: readonly import("@plantuml-studio/diagram-gantt").GanttTask[],
): string[] {
  if (!task.start?.resolved || !task.duration || !task.resources?.length) return [];
  const start = Date.parse(`${task.start.value}T00:00:00Z`);
  const end =
    start +
    task.duration.value * (task.duration.unit === "month" ? 30 : task.duration.unit === "week" ? 7 : 1) * 86_400_000;
  const names = new Set(task.resources.map((item) => item.value.toLocaleLowerCase()));
  return tasks
    .filter(
      (other) =>
        other.id !== task.id &&
        other.start?.resolved &&
        other.duration &&
        other.resources?.some((item) => names.has(item.value.toLocaleLowerCase())),
    )
    .filter((other) => {
      const otherStart = Date.parse(`${other.start!.value}T00:00:00Z`);
      const otherEnd =
        otherStart +
        other.duration!.value *
          (other.duration!.unit === "month" ? 30 : other.duration!.unit === "week" ? 7 : 1) *
          86_400_000;
      return start < otherEnd && otherStart < end;
    })
    .map((other) => other.label);
}
