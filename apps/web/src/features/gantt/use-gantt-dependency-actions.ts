import { useCallback } from "react";
import {
  applySourceEdits,
  deleteDivider,
  deleteVerticalSeparator,
  insertDivider,
  insertVerticalSeparator,
  moveDivider,
  parseGantt,
  setNote,
  updateDependency,
  updateDivider,
  updateVerticalSeparator,
  type GanttDependency,
  type GanttDocument,
} from "@plantuml-studio/diagram-gantt";
import type { AddSeparatorValue } from "../../AddDividerDialog";
import type { DependencyInspectorValue } from "../../DependencyInspector";
import type { VerticalSeparatorValue } from "../../VerticalSeparatorInspector";
import { applicationGanttAdapter } from "../../diagram-adapters";

interface Options {
  source: string;
  document: GanttDocument;
  selectedDependency: GanttDependency | undefined;
  selectedDependencyIndex: number | undefined;
  selectedDividerIndex: number | undefined;
  selectedVerticalSeparatorIndex: number | undefined;
  commit(source: string, description: string): boolean;
  closeAddDivider(): void;
  selectDependency(index: number | undefined): void;
  selectDivider(index: number | undefined): void;
  selectVerticalSeparator(index: number | undefined): void;
  report(message: string): void;
  confirmDelete(message: string): boolean;
}

export function useGanttDependencyActions(options: Options) {
  const {
    source,
    document,
    selectedDependency,
    selectedDependencyIndex,
    selectedDividerIndex,
    selectedVerticalSeparatorIndex,
    commit,
    closeAddDivider,
    selectDependency,
    selectDivider,
    selectVerticalSeparator,
    report,
    confirmDelete,
  } = options;
  const selectedVerticalSeparator =
    selectedVerticalSeparatorIndex === undefined
      ? undefined
      : document.verticalSeparators[selectedVerticalSeparatorIndex];
  const apply = useCallback(
    (operation: { edits: import("@plantuml-studio/diagram-gantt").SourceEdit[] }, description: string) =>
      commit(applySourceEdits(source, operation.edits), description),
    [commit, source],
  );

  const addDivider = useCallback(
    (value: AddSeparatorValue) => {
      if (value.kind === "vertical") {
        const operation = insertVerticalSeparator(source, value);
        if (operation.unavailableReason) return report(operation.unavailableReason);
        if (!apply(operation, "Add vertical separator")) return;
        closeAddDivider();
        report("Added vertical separator");
        return;
      }
      const beforeTask = value.beforeTaskId
        ? parseGantt(source).document.symbols.tasks.get(value.beforeTaskId)
        : undefined;
      const beforeRange = beforeTask?.declarations.map((item) => item.range).sort((a, b) => a.from - b.from)[0];
      const operation = insertDivider(source, value.label, beforeRange);
      if (operation.unavailableReason) return report(operation.unavailableReason);
      if (!apply(operation, `Add divider ${value.label.trim()}`)) return;
      closeAddDivider();
      report(`Added divider ${value.label.trim()}`);
    },
    [apply, closeAddDivider, report, source],
  );

  const reorderDiagramDivider = useCallback(
    (dividerIndex: number, beforeTaskId?: string) => {
      const divider = document.dividers[dividerIndex];
      const beforeTask = beforeTaskId ? document.symbols.tasks.get(beforeTaskId) : undefined;
      if (!divider) return;
      const operation = moveDivider(source, divider.sourceRange, beforeTask?.sourceRange);
      if (operation.unavailableReason) return report(operation.unavailableReason);
      if (!apply(operation, `Move divider ${divider.label}`)) return;
      report(beforeTask ? `Moved ${divider.label} before ${beforeTask.label}` : `Moved ${divider.label} to the end`);
    },
    [apply, document, report, source],
  );

  const applyDividerInspector = useCallback(
    (label: string) => {
      if (selectedDividerIndex === undefined) return;
      const divider = document.dividers[selectedDividerIndex];
      if (!divider) return;
      const operation = updateDivider(source, divider.sourceRange, label);
      if (operation.unavailableReason) return report(operation.unavailableReason);
      if (apply(operation, `Rename divider ${divider.label}`)) report(`Renamed divider to ${label.trim()}`);
    },
    [apply, document.dividers, report, selectedDividerIndex, source],
  );

  const deleteSelectedDivider = useCallback(() => {
    if (selectedDividerIndex === undefined) return;
    const divider = document.dividers[selectedDividerIndex];
    if (!divider || !confirmDelete(`Delete divider “${divider.label}”?`)) return;
    if (!apply(deleteDivider(source, divider.sourceRange), `Delete divider ${divider.label}`)) return;
    selectDivider(undefined);
    report(`Deleted divider ${divider.label}`);
  }, [apply, confirmDelete, document.dividers, report, selectDivider, selectedDividerIndex, source]);

  const connectTasks = useCallback(
    (
      predecessorTaskId: string,
      successorTaskId: string,
      predecessorAnchor: "start" | "end",
      successorAnchor: "start" | "end",
    ) => {
      const predecessor = document.symbols.tasks.get(predecessorTaskId);
      const successor = document.symbols.tasks.get(successorTaskId);
      if (!predecessor || !successor) return;
      const operation = applicationGanttAdapter.applyVisualOperation(
        { kind: "create-dependency", predecessorTaskId, successorTaskId, predecessorAnchor, successorAnchor },
        document,
        source,
      );
      if (operation.unavailableReason) return report(operation.unavailableReason);
      apply(
        operation,
        `Connect ${predecessor.label}'s ${predecessorAnchor} to ${successor.label}'s ${successorAnchor}`,
      );
    },
    [apply, document, report, source],
  );

  const deleteDependency = useCallback(() => {
    if (selectedDependencyIndex === undefined || !selectedDependency) return;
    const operation = applicationGanttAdapter.applyVisualOperation(
      { kind: "remove-dependency", dependencyIndex: selectedDependencyIndex },
      document,
      source,
    );
    if (!apply(operation, "Delete dependency")) return;
    selectDependency(undefined);
  }, [apply, document, selectDependency, selectedDependency, selectedDependencyIndex, source]);

  const applyDependencyInspector = useCallback(
    (value: DependencyInspectorValue) => {
      if (!selectedDependency) return;
      const predecessor = document.symbols.tasks.get(value.predecessorId);
      const successor = document.symbols.tasks.get(value.successorId);
      if (!predecessor || !successor) return;
      const operation = updateDependency(source, selectedDependency, {
        predecessorLabel: predecessor.alias?.value ?? predecessor.label,
        successorLabel: successor.alias?.value ?? successor.label,
        relation: value.relation,
        offset: value.offset,
        direction: value.direction,
        ...(value.color.trim() ? { color: value.color.trim() } : {}),
        lineStyle: value.lineStyle,
      });
      if (operation.unavailableReason) return report(operation.unavailableReason);
      const note = setNote(
        source,
        selectedDependency.sourceRange,
        selectedDependency.notes,
        value.note,
        value.notePosition,
      );
      if (note.unavailableReason) return report(note.unavailableReason);
      if (!commit(applySourceEdits(source, [...operation.edits, ...note.edits]), "Update dependency")) return;
      report("Updated dependency");
    },
    [commit, document.symbols.tasks, report, selectedDependency, source],
  );

  const applyVerticalSeparatorInspector = useCallback(
    (value: VerticalSeparatorValue) => {
      if (!selectedVerticalSeparator) return;
      const operation = updateVerticalSeparator(selectedVerticalSeparator, value);
      if (operation.unavailableReason) return report(operation.unavailableReason);
      if (apply(operation, "Update vertical separator")) report("Updated vertical separator");
    },
    [apply, report, selectedVerticalSeparator],
  );

  const deleteSelectedVerticalSeparator = useCallback(() => {
    if (!selectedVerticalSeparator || !confirmDelete("Delete this vertical separator?")) return;
    if (!apply(deleteVerticalSeparator(source, selectedVerticalSeparator), "Delete vertical separator")) return;
    selectVerticalSeparator(undefined);
    report("Deleted vertical separator");
  }, [apply, confirmDelete, report, selectVerticalSeparator, selectedVerticalSeparator, source]);

  return {
    addDivider,
    reorderDiagramDivider,
    applyDividerInspector,
    deleteSelectedDivider,
    connectTasks,
    deleteDependency,
    applyDependencyInspector,
    applyVerticalSeparatorInspector,
    deleteSelectedVerticalSeparator,
  };
}
