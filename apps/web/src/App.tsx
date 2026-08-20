import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CodeEditor } from "./CodeEditor";
import { DiagramPreview } from "./DiagramPreview";
import { AddTaskDialog, type AddTaskValue } from "./AddTaskDialog";
import { AddDividerDialog } from "./AddDividerDialog";
import { AddMilestoneDialog, type AddMilestoneValue } from "./AddMilestoneDialog";
import { CommandPalette } from "./CommandPalette";
import { TaskInspector, type TaskInspectorValue } from "./TaskInspector";
import { MilestoneInspector, type MilestoneInspectorValue } from "./MilestoneInspector";
import { DependencyInspector, type DependencyInspectorValue } from "./DependencyInspector";
import { ProjectInspector } from "./ProjectInspector";
import { SchedulePreviewDialog, type SchedulePreview } from "./SchedulePreviewDialog";
import { buildResourceOverAllocations, ResourceWorkloadPanel } from "./ResourceWorkloadPanel";
import { HelpDialog } from "./HelpDialog";
import { FileMenu } from "./FileMenu";
import { AddMenu } from "./AddMenu";
import { resolveTaskDates } from "./gantt-schedule";
import { parseGanttCalendar } from "./gantt-calendar";
import { parseProjectSettings, updateProjectSettings } from "./project-settings";
import type { Theme, ViewMode } from "./model";
import { useRenderer } from "./render/use-renderer";
import { usePersistedWorkspace } from "./use-persisted-workspace";
import { documentDisplayNames } from "./workspace-storage";
import {
  applySourceEdits,
  deleteTask,
  findTaskAt,
  ganttAdapter,
  insertDivider,
  insertMilestone,
  insertTask,
  moveDependentTasksByDays,
  moveDivider,
  normalizeTaskId,
  parseGantt,
  renameResource,
  renameTask,
  setNote,
  setTaskDeclaration,
  setTaskPauses,
  setTaskResources,
  updateDependency,
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
import { DEFAULT_SOURCE } from "./model";
import { validateGeneratedSource } from "./generated-source-validation";
import { UnsupportedSyntaxPanel } from "./UnsupportedSyntaxPanel";
import { useDocumentHistory } from "./use-document-history";
import { useResourceCapacities } from "./use-resource-capacities";
import { parseWorkspaceBackup, serializeWorkspaceBackup } from "./workspace-backup";

export function App() {
  const [workspace, setWorkspace, hydrated, tabs] = usePersistedWorkspace();
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [selectionRequest, setSelectionRequest] = useState<{ from: number; to: number }>();
  const [interactionMessage, setInteractionMessage] = useState<string>();
  const [selectedDependencyIndex, setSelectedDependencyIndex] = useState<number>();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [addDividerOpen, setAddDividerOpen] = useState(false);
  const [addMilestoneOpen, setAddMilestoneOpen] = useState(false);
  const [projectInspectorOpen, setProjectInspectorOpen] = useState(false);
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
  const diagnosticCount = parseResult.diagnostics.filter((item) => item.code !== "unsupported-syntax").length;
  const unsupportedCount = parseResult.document.unknown.length;
  const selectedTask = selectedTaskId ? parseResult.document.symbols.tasks.get(selectedTaskId) : undefined;
  const selectedPredecessorId = selectedTask
    ? (parseResult.document.dependencies.find((item) => item.successorTaskId === selectedTask.id)?.predecessorTaskId ??
      "")
    : "";
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
    () => buildResourceOverAllocations(parseResult.document.tasks, resourceCapacities, resolvedTaskDates),
    [parseResult.document.tasks, resourceCapacities, resolvedTaskDates],
  );
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
      setInteractionMessage(undefined);
    },
    [selectedTaskId, tabs],
  );

  const closeTab = useCallback(
    (id: string) => {
      const document = tabs.documents.find((item) => item.id === id);
      if (!document) return;
      if (document.dirty && !window.confirm(`Close “${document.fileName}” without saving?`)) return;
      tabs.closeDocument(id);
      removeHistory(id);
      fileHandles.current.delete(id);
      setSelectedTaskId(undefined);
      setSelectedDependencyIndex(undefined);
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

  const selectTask = (taskId: string) => {
    const task = parseResult.document.symbols.tasks.get(taskId);
    if (!task) return;
    setResourcePanelOpen(false);
    setProjectInspectorOpen(false);
    setSelectedTaskId(task.id);
    selectedTasksByDocument.current.set(tabs.activeId, task.id);
    const declaration = task.declarations[0];
    setSelectionRequest(declaration ? { ...declaration.range } : { ...task.sourceRange });
  };

  const openProjectInspector = useCallback(() => {
    setSelectedTaskId(undefined);
    setSelectedDependencyIndex(undefined);
    setProjectInspectorOpen(true);
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

  const openDocument = useCallback(async () => {
    try {
      const opened = await openPlantUmlDocument();
      if (!opened) return;
      const id = tabs.addDocument({
        source: opened.source,
        fileName: opened.fileName,
        dirty: false,
        cursor: { line: 1, column: 1 },
      });
      if (opened.handle) fileHandles.current.set(id, opened.handle);
      refreshHistoryControls();
      setSelectedTaskId(undefined);
      setSelectedDependencyIndex(undefined);
      setInteractionMessage(`Opened ${opened.fileName}`);
    } catch (error) {
      reportFileError(error);
    }
  }, [refreshHistoryControls, reportFileError, tabs]);

  const saveDocumentAs = useCallback(async () => {
    try {
      const saved = await savePlantUmlDocumentAs(workspace.source, workspace.fileName);
      if (!saved) return;
      if (saved.handle) fileHandles.current.set(tabs.activeId, saved.handle);
      else fileHandles.current.delete(tabs.activeId);
      setWorkspace((current) => ({ ...current, fileName: saved.fileName, dirty: false }));
      setInteractionMessage(`Saved ${saved.fileName}`);
    } catch (error) {
      reportFileError(error);
    }
  }, [reportFileError, setWorkspace, tabs.activeId, workspace.fileName, workspace.source]);

  const saveDocument = useCallback(async () => {
    const handle = fileHandles.current.get(tabs.activeId);
    if (!handle) {
      await saveDocumentAs();
      return;
    }
    try {
      await writePlantUmlDocument(handle, workspace.source);
      setWorkspace((current) => ({ ...current, fileName: handle.name, dirty: false }));
      setInteractionMessage(`Saved ${handle.name}`);
    } catch (error) {
      reportFileError(error);
    }
  }, [reportFileError, saveDocumentAs, setWorkspace, tabs.activeId, workspace.source]);

  const exportSource = useCallback(
    () => downloadText(workspace.source, workspace.fileName, "text/plain;charset=utf-8"),
    [workspace.fileName, workspace.source],
  );
  const backupWorkspace = useCallback(() => {
    downloadText(
      serializeWorkspaceBackup(tabs.session),
      "plantuml-studio-backup.json",
      "application/json;charset=utf-8",
    );
    setInteractionMessage(`Backed up ${tabs.documents.length} open document${tabs.documents.length === 1 ? "" : "s"}`);
  }, [tabs.documents.length, tabs.session]);
  const restoreWorkspace = useCallback(async () => {
    try {
      const contents = await openWorkspaceBackupFile();
      if (!contents) return;
      const restored = parseWorkspaceBackup(contents);
      if (
        tabs.documents.some((document) => document.dirty) &&
        !window.confirm("Restore this backup and replace all currently open tabs?")
      )
        return;
      tabs.restoreSession(restored);
      fileHandles.current.clear();
      retainHistories(restored.documents.map((document) => document.id));
      setSelectedTaskId(undefined);
      setSelectedDependencyIndex(undefined);
      setInteractionMessage(
        `Restored ${restored.documents.length} document${restored.documents.length === 1 ? "" : "s"}`,
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

  const newDocument = useCallback(() => {
    tabs.addDocument({
      source: DEFAULT_SOURCE,
      fileName: "untitled.puml",
      dirty: false,
      cursor: { line: 1, column: 1 },
    });
    setSelectedTaskId(undefined);
    setSelectedDependencyIndex(undefined);
    refreshHistoryControls();
    setInteractionMessage("Created a new document");
  }, [refreshHistoryControls, tabs]);

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
    (label: string, beforeTaskId: string) => {
      const beforeTask = beforeTaskId
        ? parseGantt(workspace.source).document.symbols.tasks.get(beforeTaskId)
        : undefined;
      const beforeRange = beforeTask?.declarations.map((item) => item.range).sort((a, b) => a.from - b.from)[0];
      const operation = insertDivider(workspace.source, label, beforeRange);
      if (operation.unavailableReason) {
        setInteractionMessage(operation.unavailableReason);
        return;
      }
      if (!commitGeneratedSource(applySourceEdits(workspace.source, operation.edits), `Add divider ${label.trim()}`))
        return;
      setAddDividerOpen(false);
      setInteractionMessage(`Added divider ${label.trim()}`);
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
      applyDeclaration(
        "start",
        predecessor && value.startDate === derivedStart
          ? `starts at [${predecessor.label}]'s end`
          : value.startDate
            ? `starts ${value.startDate}`
            : undefined,
      );
      applyDeclaration("end", value.endDate ? `ends ${value.endDate}` : undefined);
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
      const pauseDates = value.pauseDates
        .split(",")
        .map((date) => date.trim())
        .filter(Boolean);
      const pauseOperation = current()
        ? setTaskPauses(source, current()!, pauseDates)
        : { edits: [], unavailableReason: "Task not found" };
      if (pauseOperation.unavailableReason) {
        setInteractionMessage(pauseOperation.unavailableReason);
        return;
      }
      source = applySourceEdits(source, pauseOperation.edits);
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
      if (!commitGeneratedSource(source, `Update ${value.label.trim()}`)) return;
      setSelectedTaskId(currentId);
      setInteractionMessage(`Updated ${value.label.trim()}`);
    },
    [commitGeneratedSource, resolvedTaskDates, selectedTaskId, workspace.source],
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
        setInteractionMessage("Date exceptions need a valid start and end date");
        return;
      }
      if (!commitGeneratedSource(updateProjectSettings(workspace.source, value), "Update project calendar")) return;
      setProjectInspectorOpen(false);
      setInteractionMessage("Updated project calendar");
    },
    [commitGeneratedSource, workspace.source],
  );

  const commands = useMemo<Command[]>(
    () => [
      { id: "file.new", label: "New document", category: "File", shortcut: "⌘N", run: newDocument },
      { id: "file.open", label: "Open…", category: "File", shortcut: "⌘O", run: openDocument },
      { id: "file.save", label: "Save", category: "File", shortcut: "⌘S", run: saveDocument },
      { id: "file.save-as", label: "Save As…", category: "File", run: saveDocumentAs },
      { id: "file.backup", label: "Back up workspace", category: "File", run: backupWorkspace },
      { id: "file.restore", label: "Restore workspace…", category: "File", run: () => void restoreWorkspace() },
      { id: "edit.add-task", label: "Add task…", category: "Edit", run: () => setAddTaskOpen(true) },
      { id: "edit.add-milestone", label: "Add milestone…", category: "Edit", run: () => setAddMilestoneOpen(true) },
      { id: "edit.add-divider", label: "Add divider…", category: "Edit", run: () => setAddDividerOpen(true) },
      { id: "edit.project-calendar", label: "Project & calendar…", category: "Edit", run: openProjectInspector },
      { id: "view.resource-workload", label: "Resource workload…", category: "View", run: openResourcePanel },
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
    ],
    [
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
    ],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.key === "?" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !(
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement ||
          (event.target as HTMLElement | null)?.isContentEditable
        )
      ) {
        event.preventDefault();
        setHelpOpen(true);
        return;
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
  }, [closeTab, newDocument, openDocument, redo, saveDocument, tabs.activeId, undo, update]);

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
      className={`app${selectedTask || selectedDependency || resourcePanelOpen || unsupportedOpen ? " has-side-inspector" : ""}${projectInspectorOpen ? " has-project-inspector" : ""}`}
      data-theme={workspace.theme}
    >
      <header className="toolbar">
        <strong>PlantUML Studio</strong>
        <div className="file-tools" aria-label="File controls">
          <FileMenu
            canExport={Boolean(result?.svg)}
            onNew={newDocument}
            onOpen={() => void openDocument()}
            onSave={() => void saveDocument()}
            onSaveAs={() => void saveDocumentAs()}
            onBackup={backupWorkspace}
            onRestore={() => void restoreWorkspace()}
            onExportSvg={exportSvg}
            onExportPng={() => void exportPng()}
          />
          <AddMenu
            onTask={() => setAddTaskOpen(true)}
            onMilestone={() => setAddMilestoneOpen(true)}
            onDivider={() => setAddDividerOpen(true)}
          />
          <button onClick={openProjectInspector}>Project</button>
          <button onClick={openResourcePanel}>Resources</button>
          <button onClick={exportSource}>Source</button>
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
        <label className="resource-filter">
          Resource{" "}
          <select value={resourceFilter} onChange={(event) => setResourceFilter(event.target.value)}>
            <option value="">All</option>
            {resourceNames.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="schedule-mode">
          Schedule{" "}
          <select value={scheduleMode} onChange={(event) => setScheduleMode(event.target.value as typeof scheduleMode)}>
            <option value="ask">Always ask</option>
            <option value="single">Only task</option>
            <option value="cascade">Include dependents</option>
          </select>
        </label>
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
            value={workspace.source}
            onChange={(source) => commitSource(source, "Edit source")}
            selectedRange={selectionRequest}
            onCursorChange={(line, column, position) => {
              update("cursor", { line, column });
              setSelectedTaskId(findTaskAt(parseResult.document, position)?.id);
            }}
          />
        )}
        {workspace.viewMode === "split" && (
          <div className="divider" onPointerDown={resize} role="separator" aria-orientation="vertical" />
        )}
        {workspace.viewMode !== "code" && (
          <DiagramPreview
            svg={result?.svg}
            tasks={parseResult.document.tasks}
            dependencies={parseResult.document.dependencies}
            dividers={parseResult.document.dividers}
            source={workspace.source}
            zoom={workspace.zoom}
            onZoomChange={(zoom) => update("zoom", zoom)}
            selectedTaskId={selectedTaskId}
            onTaskSelect={selectTask}
            onTaskMove={moveTask}
            onTaskReorder={reorderDiagramTask}
            onDividerReorder={reorderDiagramDivider}
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
          />
        )}
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
        <span>Gantt</span>
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
      {addTaskOpen && (
        <AddTaskDialog
          taskLabels={parseResult.document.tasks.map((task) => task.label)}
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
      {selectedTask?.milestone && (
        <MilestoneInspector
          key={`${selectedTask.id}:${selectedTask.sourceRange.to}`}
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
          key={`${selectedTask.id}:${selectedTask.sourceRange.to}`}
          task={selectedTask}
          tasks={parseResult.document.tasks}
          predecessorId={selectedPredecessorId}
          effectiveStart={resolvedTaskDates.get(selectedTask.id)?.start ?? ""}
          calendar={ganttCalendar}
          resourceNames={resourceNames}
          conflicts={selectedResourceConflicts}
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
      {resourcePanelOpen && (
        <ResourceWorkloadPanel
          tasks={parseResult.document.tasks}
          resolvedDates={resolvedTaskDates}
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
