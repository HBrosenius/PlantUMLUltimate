import { useCallback } from "react";
import {
  applySourceEdits,
  deleteTask,
  duplicateTask,
  insertMilestone,
  insertTask,
  type GanttDocument,
  type GanttTask,
} from "@plantuml-studio/diagram-gantt";
import type { SemanticSymbolOccurrence } from "../../semantic-symbol-provider";
import type { AddTaskValue } from "../../AddTaskDialog";
import type { AddMilestoneValue } from "../../AddMilestoneDialog";

interface UseGanttTaskActionsOptions {
  source: string;
  document: GanttDocument;
  selectedTask: GanttTask | undefined;
  diagramKind: string;
  commitGeneratedSource(source: string, description: string): boolean;
  closeDialog(kind: "task" | "milestone"): void;
  selectTask(id: string | undefined): void;
  selectDependency(index: number | undefined): void;
  reportMessage(message: string): void;
  confirmDelete(message: string): boolean;
}

export function useGanttTaskActions(options: UseGanttTaskActionsOptions) {
  const {
    source,
    document,
    selectedTask,
    diagramKind,
    commitGeneratedSource,
    closeDialog,
    selectTask,
    selectDependency,
    reportMessage,
    confirmDelete,
  } = options;

  const addTask = useCallback(
    (value: AddTaskValue) => {
      const operation = insertTask(source, value);
      if (operation.unavailableReason) {
        reportMessage(operation.unavailableReason);
        return;
      }
      if (!commitGeneratedSource(applySourceEdits(source, operation.edits), `Add ${value.label.trim()}`)) return;
      closeDialog("task");
      reportMessage(`Added ${value.label.trim()}`);
    },
    [closeDialog, commitGeneratedSource, reportMessage, source],
  );

  const addMilestone = useCallback(
    (value: AddMilestoneValue) => {
      const operation = insertMilestone(source, {
        label: value.label,
        ...(value.mode === "fixed"
          ? { date: value.date ?? "" }
          : { referenceLabel: value.referenceLabel ?? "", referenceAnchor: value.referenceAnchor ?? "end" }),
      });
      if (operation.unavailableReason) {
        reportMessage(operation.unavailableReason);
        return;
      }
      if (!commitGeneratedSource(applySourceEdits(source, operation.edits), `Add ${value.label.trim()}`)) return;
      closeDialog("milestone");
      reportMessage(`Added milestone ${value.label.trim()}`);
    },
    [closeDialog, commitGeneratedSource, reportMessage, source],
  );

  const deleteSelectedTask = useCallback(() => {
    if (!selectedTask) return;
    const kind = selectedTask.milestone ? "milestone" : "task";
    if (!confirmDelete(`Delete ${kind} “${selectedTask.label}” and its dependency links?`)) return;
    const operation = deleteTask(source, document, selectedTask);
    if (!commitGeneratedSource(applySourceEdits(source, operation.edits), `Delete ${selectedTask.label}`)) return;
    selectTask(undefined);
    selectDependency(undefined);
    reportMessage(`Deleted ${selectedTask.label}`);
  }, [
    commitGeneratedSource,
    confirmDelete,
    document,
    reportMessage,
    selectDependency,
    selectedTask,
    selectTask,
    source,
  ]);

  const duplicateTaskOccurrence = useCallback(
    (occurrence: SemanticSymbolOccurrence) => {
      if (diagramKind !== "gantt" || occurrence.kind !== "task") return;
      const task = document.symbols.tasks.get(occurrence.key);
      if (!task) return;
      const operation = duplicateTask(source, document, task);
      if (operation.unavailableReason) {
        reportMessage(operation.unavailableReason);
        return;
      }
      if (!commitGeneratedSource(applySourceEdits(source, operation.edits), `Duplicate ${task.label}`)) return;
      selectTask(operation.taskId);
      selectDependency(undefined);
      reportMessage(`Duplicated ${task.label} as ${operation.label}`);
    },
    [commitGeneratedSource, diagramKind, document, reportMessage, selectDependency, selectTask, source],
  );

  return { addTask, addMilestone, deleteSelectedTask, duplicateTaskOccurrence };
}
