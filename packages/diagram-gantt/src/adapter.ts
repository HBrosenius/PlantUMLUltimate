import type {
  CompletionRequest,
  DiagramAdapter,
  InteractiveObject,
  LanguageCompletion,
  VisualOperation,
} from "@plantuml-studio/language-core";
import { detectPlantUmlDiagramType } from "@plantuml-studio/language-plantuml";
import type { GanttDocument } from "./model";
import { parseGantt } from "./parser";
import { createDependency, moveTaskByDays, removeDependency, reorderTask, resizeTaskByDays } from "./operations";

export type GanttVisualOperation = VisualOperation &
  (
    | { kind: "move-task"; taskId: string; days: number }
    | { kind: "resize-task"; taskId: string; days: number }
    | { kind: "reorder-task"; taskId: string; beforeTaskId?: string }
    | { kind: "create-dependency"; predecessorTaskId: string; successorTaskId: string }
    | { kind: "remove-dependency"; dependencyIndex: number }
  );

function completions(request: CompletionRequest, model: GanttDocument): LanguageCompletion[] {
  const before = request.source.slice(0, request.position);
  if (!/(?:^|\n)\s*\[[^\]]*$/.test(before)) return [];
  return model.tasks.map((task) => ({
    label: task.label,
    insertText: `${task.alias?.value ?? task.label}] `,
    detail: "Existing Gantt task",
    kind: "task",
  }));
}

export const ganttAdapter: DiagramAdapter<GanttDocument, GanttVisualOperation> = {
  id: "gantt",
  displayName: "Gantt",
  capabilities: { visualSelection: true, visualMove: true, visualResize: true, visualDependencies: true },
  detect: (source) => detectPlantUmlDiagramType(source) === "gantt",
  parse: parseGantt,
  completions,
  diagnostics: () => [],
  interactiveObjects: (model): InteractiveObject[] => [
    ...model.tasks.map((task) => ({
      id: task.id,
      kind: task.milestone ? "milestone" : "task",
      label: task.label,
      sourceRange: task.sourceRange,
    })),
    ...model.dividers.map((divider, index) => ({
      id: `divider-${index}`,
      kind: "divider",
      label: divider.label,
      sourceRange: divider.sourceRange,
    })),
    ...model.verticalSeparators.map((separator, index) => ({
      id: `vertical-separator-${index}`,
      kind: "divider",
      label: `Vertical separator at ${separator.taskLabel}'s ${separator.anchor}`,
      sourceRange: separator.sourceRange,
    })),
  ],
  applyVisualOperation: (operation, model, source) => {
    if (operation.kind === "move-task") {
      const task = model.symbols.tasks.get(operation.taskId);
      return task ? moveTaskByDays(task, operation.days) : { edits: [], unavailableReason: "Task not found" };
    }
    if (operation.kind === "resize-task") {
      const task = model.symbols.tasks.get(operation.taskId);
      return task ? resizeTaskByDays(task, operation.days) : { edits: [], unavailableReason: "Task not found" };
    }
    if (operation.kind === "reorder-task") {
      const task = model.symbols.tasks.get(operation.taskId);
      const before = operation.beforeTaskId ? model.symbols.tasks.get(operation.beforeTaskId) : undefined;
      return task ? reorderTask(source, model, task, before) : { edits: [], unavailableReason: "Task not found" };
    }
    if (operation.kind === "create-dependency") {
      const predecessor = model.symbols.tasks.get(operation.predecessorTaskId);
      const successor = model.symbols.tasks.get(operation.successorTaskId);
      return predecessor && successor
        ? createDependency(source, predecessor, successor)
        : { edits: [], unavailableReason: "Task not found" };
    }
    const dependency = model.dependencies[operation.dependencyIndex];
    return dependency
      ? removeDependency(source, dependency.sourceRange, dependency.notes)
      : { edits: [], unavailableReason: "Dependency not found" };
  },
};
