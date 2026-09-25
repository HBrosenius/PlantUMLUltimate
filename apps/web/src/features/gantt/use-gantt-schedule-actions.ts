import { useCallback } from "react";
import {
  applySourceEdits,
  moveDependentTasksByDays,
  normalizeTaskId,
  parseGantt,
  removeDependency,
  renameTask,
  setNote,
  setTaskDeclaration,
  setTaskLinks,
  setTaskPauses,
  setTaskResources,
  updateDependency,
  type GanttDocument,
  type SourceEdit,
} from "@plantuml-studio/diagram-gantt";
import type { MilestoneInspectorValue } from "../../MilestoneInspector";
import type { SchedulePreview } from "../../SchedulePreviewDialog";
import type { TaskInspectorValue } from "../../TaskInspector";
import { applicationGanttAdapter } from "../../diagram-adapters";
import { applyJiraScheduleChange, isJiraTaskAlias } from "../../jira-schedule-edits";
import { explicitTaskStartStatement } from "../../task-inspector-schedule";
import { findResourceConflicts } from "./gantt-resource-conflicts";

interface Options {
  source: string;
  document: GanttDocument;
  selectedTaskId: string | undefined;
  resolvedTaskDates: ReadonlyMap<string, { start?: string; end?: string }>;
  scheduleMode: "ask" | "cascade" | "single";
  commit(source: string, description: string): boolean;
  showSchedulePreview(preview: SchedulePreview): void;
  selectTask(id: string | undefined): void;
  rememberSelectedTask(id: string): void;
  mapProjectRename(
    kind: "gantt-task",
    from: number,
    declaration: { symbolKey: string; from: number; to: number },
    source: string,
  ): Promise<void>;
  report(message: string): void;
}

export function useGanttScheduleActions(options: Options) {
  const {
    source,
    document,
    selectedTaskId,
    resolvedTaskDates,
    scheduleMode,
    commit,
    showSchedulePreview,
    selectTask,
    rememberSelectedTask,
    mapProjectRename,
    report,
  } = options;

  const stageScheduleChange = useCallback(
    (
      taskId: string,
      taskLabel: string,
      days: number,
      action: "Move" | "Resize",
      taskEdits: SourceEdit[],
      applyRoot?: (currentSource: string) => string,
    ) => {
      const dependents = moveDependentTasksByDays(document, taskId, days);
      const singleSource = applyRoot ? applyRoot(source) : applySourceEdits(source, taskEdits);
      if (dependents.unavailableReason) return report(dependents.unavailableReason);
      if (!dependents.affectedLabels.length) {
        commit(singleSource, `${action} ${taskLabel} ${days} days`);
        return;
      }
      const cascadeSource = applyRoot
        ? applyRoot(applySourceEdits(source, dependents.edits))
        : applySourceEdits(source, [...taskEdits, ...dependents.edits]);
      if (scheduleMode !== "ask") {
        commit(
          scheduleMode === "cascade" ? cascadeSource : singleSource,
          `${action} ${taskLabel}${scheduleMode === "cascade" ? " with dependents" : ""}`,
        );
        return;
      }
      const cascadeDocument = parseGantt(cascadeSource).document;
      const affected = dependents.affectedTaskIds.map((id, index) => {
        const before = document.symbols.tasks.get(id);
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
      showSchedulePreview({ taskLabel, days, action, singleSource, cascadeSource, affected, conflicts });
    },
    [commit, document, report, scheduleMode, showSchedulePreview, source],
  );

  const moveTask = useCallback(
    (taskId: string, days: number) => {
      const task = document.symbols.tasks.get(taskId);
      if (!task) return;
      if (isJiraTaskAlias(task.alias?.value)) {
        const applyRoot = (currentSource: string) =>
          applyJiraScheduleChange(currentSource, taskId, "Move", days).source;
        const result = applyJiraScheduleChange(source, taskId, "Move", days);
        if (result.unavailableReason) return report(result.unavailableReason);
        stageScheduleChange(task.id, task.label, days, "Move", [], applyRoot);
        return;
      }
      let operation = applicationGanttAdapter.applyVisualOperation(
        { kind: "move-task", taskId, days },
        document,
        source,
      );
      if (operation.unavailableReason) {
        const dependency = document.dependencies.find((item) => item.successorTaskId === task.id);
        const predecessor = dependency ? document.symbols.tasks.get(dependency.predecessorTaskId) : undefined;
        if (dependency && predecessor) {
          const currentOffset = (dependency.direction === "before" ? -1 : 1) * (dependency.offset?.value ?? 0);
          const nextOffset = currentOffset + days;
          operation = updateDependency(source, dependency, {
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
      if (operation.unavailableReason) return report(operation.unavailableReason);
      stageScheduleChange(task.id, task.label, days, "Move", operation.edits);
    },
    [document, report, source, stageScheduleChange],
  );

  const resizeTask = useCallback(
    (taskId: string, days: number, calendarDays = days) => {
      const task = document.symbols.tasks.get(taskId);
      if (!task) return;
      if (isJiraTaskAlias(task.alias?.value)) {
        const applyRoot = (currentSource: string) =>
          applyJiraScheduleChange(currentSource, taskId, "Resize", days, calendarDays).source;
        const result = applyJiraScheduleChange(source, taskId, "Resize", days, calendarDays);
        if (result.unavailableReason) return report(result.unavailableReason);
        stageScheduleChange(task.id, task.label, calendarDays, "Resize", [], applyRoot);
        return;
      }
      const operation = applicationGanttAdapter.applyVisualOperation(
        { kind: "resize-task", taskId, days },
        document,
        source,
      );
      if (operation.unavailableReason) return report(operation.unavailableReason);
      stageScheduleChange(task.id, task.label, calendarDays, "Resize", operation.edits);
    },
    [document, report, source, stageScheduleChange],
  );

  const reorderDiagramTask = useCallback(
    (taskId: string, beforeTaskId?: string) => {
      const task = document.symbols.tasks.get(taskId);
      const beforeTask = beforeTaskId ? document.symbols.tasks.get(beforeTaskId) : undefined;
      if (!task) return;
      const operation = applicationGanttAdapter.applyVisualOperation(
        { kind: "reorder-task", taskId, ...(beforeTaskId ? { beforeTaskId } : {}) },
        document,
        source,
      );
      if (operation.unavailableReason) return report(operation.unavailableReason);
      if (!commit(applySourceEdits(source, operation.edits), `Reorder ${task.label}`)) return;
      report(beforeTask ? `Moved ${task.label} before ${beforeTask.label}` : `Moved ${task.label} to the end`);
    },
    [commit, document, report, source],
  );

  const applyTaskInspector = useCallback(
    (value: TaskInspectorValue) => {
      if (!selectedTaskId) return;
      const duration = value.scheduleMode === "duration" && value.duration !== "" ? Number(value.duration) : undefined;
      const completion = value.completion === "" ? undefined : Number(value.completion);
      if (duration !== undefined && (!Number.isInteger(duration) || duration < 1))
        return report("Duration must be a positive whole number");
      if (completion !== undefined && (!Number.isInteger(completion) || completion < 0 || completion > 100))
        return report("Completion must be between 0 and 100");

      let nextSource = source;
      let currentId = selectedTaskId;
      const current = () => parseGantt(nextSource).document.symbols.tasks.get(currentId);
      const original = current();
      if (!original) return;
      const renamed = renameTask(nextSource, parseGantt(nextSource).document, original, value.label);
      if (renamed.unavailableReason) return report(renamed.unavailableReason);
      nextSource = applySourceEdits(nextSource, renamed.edits);
      currentId = original.alias ? original.id : normalizeTaskId(value.label);

      const existingDependency = parseGantt(nextSource).document.dependencies.find(
        (item) => item.successorTaskId === currentId,
      );
      const selectedSameRowTask = value.sameRowTaskId
        ? parseGantt(nextSource).document.symbols.tasks.get(value.sameRowTaskId)
        : undefined;
      const selectedDates = resolvedTaskDates.get(selectedTaskId);
      const sameRowDates = selectedSameRowTask ? resolvedTaskDates.get(selectedSameRowTask.id) : undefined;
      const sameRowOverlap = Boolean(
        selectedDates?.start &&
        selectedDates.end &&
        sameRowDates?.start &&
        sameRowDates.end &&
        selectedDates.start <= sameRowDates.end &&
        sameRowDates.start <= selectedDates.end,
      );
      const predecessor = value.predecessorId
        ? parseGantt(nextSource).document.symbols.tasks.get(value.predecessorId)
        : !existingDependency && sameRowOverlap
          ? selectedSameRowTask
          : undefined;
      const dependencyRelation = value.predecessorId ? value.dependencyRelation : "start-after-end";
      if (
        existingDependency &&
        predecessor &&
        (existingDependency.predecessorTaskId !== predecessor.id || existingDependency.relation !== dependencyRelation)
      ) {
        const dependencyOperation = updateDependency(nextSource, existingDependency, {
          predecessorLabel: predecessor.alias?.value ?? predecessor.label,
          successorLabel: current()?.alias?.value ?? current()?.label ?? value.label,
          relation: dependencyRelation,
          offset: existingDependency.offset?.value ?? 0,
          direction: existingDependency.direction ?? "after",
          ...(existingDependency.color?.value ? { color: existingDependency.color.value } : {}),
          lineStyle: existingDependency.lineStyle?.value ?? "solid",
        });
        if (dependencyOperation.unavailableReason) return report(dependencyOperation.unavailableReason);
        nextSource = applySourceEdits(nextSource, dependencyOperation.edits);
      } else if (existingDependency && !predecessor) {
        nextSource = applySourceEdits(
          nextSource,
          removeDependency(nextSource, existingDependency.sourceRange, existingDependency.notes).edits,
        );
      }

      const applyDeclaration = (
        kind: "start" | "end" | "duration" | "completion" | "color" | "same-row",
        statement?: string,
      ) => {
        const task = current();
        if (task)
          nextSource = applySourceEdits(nextSource, setTaskDeclaration(nextSource, task, kind, statement).edits);
      };
      const derivedStart = resolvedTaskDates.get(selectedTaskId)?.start ?? "";
      if (predecessor) {
        const endsTask = dependencyRelation.startsWith("end-");
        const linkedAnchor = dependencyRelation.endsWith("-start") ? "start" : "end";
        const linkedStatement = `${endsTask ? "ends" : "starts"} at [${predecessor.alias?.value ?? predecessor.label}]'s ${linkedAnchor}`;
        if (existingDependency) {
          applyDeclaration(
            endsTask ? "start" : "end",
            endsTask
              ? value.startDate && value.startDate !== derivedStart
                ? `starts ${value.startDate}`
                : undefined
              : value.scheduleMode === "end" && value.endDate
                ? `ends ${value.endDate}`
                : undefined,
          );
        } else {
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
              : value.scheduleMode === "end" && value.endDate
                ? `ends ${value.endDate}`
                : undefined,
          );
        }
      } else {
        applyDeclaration("start", explicitTaskStartStatement(value.startDate, derivedStart, Boolean(original.start)));
        applyDeclaration("end", value.scheduleMode === "end" && value.endDate ? `ends ${value.endDate}` : undefined);
      }
      applyDeclaration(
        "duration",
        duration !== undefined ? `lasts ${duration} ${value.durationUnit}${duration === 1 ? "" : "s"}` : undefined,
      );
      applyDeclaration("completion", completion !== undefined ? `is ${completion}% completed` : undefined);
      applyDeclaration("color", value.color.trim() ? `is colored in ${value.color.trim()}` : undefined);
      applyDeclaration(
        "same-row",
        selectedSameRowTask
          ? `displays on same row as [${selectedSameRowTask.alias?.value ?? selectedSameRowTask.label}]`
          : undefined,
      );
      const pauseOperation = current()
        ? setTaskPauses(nextSource, current()!, value.pauses.map((pause) => pause.value.trim()).filter(Boolean))
        : { edits: [], unavailableReason: "Task not found" };
      if (pauseOperation.unavailableReason) return report(pauseOperation.unavailableReason);
      nextSource = applySourceEdits(nextSource, pauseOperation.edits);
      const linkOperation = current()
        ? setTaskLinks(
            nextSource,
            current()!,
            value.links
              .filter((link) => link.url.trim())
              .map((link) => ({ url: link.url.trim(), ...(link.label.trim() ? { label: link.label.trim() } : {}) })),
          )
        : { edits: [], unavailableReason: "Task not found" };
      if (linkOperation.unavailableReason) return report(linkOperation.unavailableReason);
      nextSource = applySourceEdits(nextSource, linkOperation.edits);
      const resourceOperation = current()
        ? setTaskResources(
            nextSource,
            current()!,
            value.resources.map((item) => ({ name: item.name.trim(), allocation: Number(item.allocation) })),
          )
        : { edits: [], unavailableReason: "Task not found" };
      if (resourceOperation.unavailableReason) return report(resourceOperation.unavailableReason);
      nextSource = applySourceEdits(nextSource, resourceOperation.edits);
      const taskForNote = current();
      if (taskForNote) {
        const noteOperation = setNote(
          nextSource,
          taskForNote.sourceRange,
          taskForNote.notes,
          value.note,
          value.notePosition,
        );
        if (noteOperation.unavailableReason) return report(noteOperation.unavailableReason);
        nextSource = applySourceEdits(nextSource, noteOperation.edits);
      }
      if (predecessor) {
        const nextDocument = parseGantt(nextSource).document;
        if (!nextDocument.dependencies.some((item) => item.successorTaskId === currentId)) {
          const task = nextDocument.symbols.tasks.get(currentId);
          if (task) {
            const endsTask = value.dependencyRelation.startsWith("end-");
            const linkedAnchor = value.dependencyRelation.endsWith("-start") ? "start" : "end";
            nextSource = applySourceEdits(
              nextSource,
              setTaskDeclaration(
                nextSource,
                task,
                endsTask ? "end" : "start",
                `${endsTask ? "ends" : "starts"} at [${predecessor.alias?.value ?? predecessor.label}]'s ${linkedAnchor}`,
              ).edits,
            );
          }
        }
      }
      selectTask(currentId);
      rememberSelectedTask(currentId);
      const updatedTask = parseGantt(nextSource).document.symbols.tasks.get(currentId);
      if (updatedTask)
        void mapProjectRename(
          "gantt-task",
          original.sourceRange.from,
          { symbolKey: updatedTask.alias?.value ?? updatedTask.label, ...updatedTask.sourceRange },
          nextSource,
        );
      if (!commit(nextSource, `Update ${value.label.trim()}`)) {
        selectTask(selectedTaskId);
        rememberSelectedTask(selectedTaskId);
        return;
      }
      report(`Updated ${value.label.trim()}`);
    },
    [commit, mapProjectRename, rememberSelectedTask, report, resolvedTaskDates, selectTask, selectedTaskId, source],
  );

  const applyMilestoneInspector = useCallback(
    (value: MilestoneInspectorValue) => {
      if (!selectedTaskId) return;
      if (value.mode === "fixed" && !value.date) return report("Milestone date is required");
      if (value.mode === "relative" && !value.referenceLabel) return report("Choose a relative task or milestone");
      let nextSource = source;
      let currentId = selectedTaskId;
      const current = () => parseGantt(nextSource).document.symbols.tasks.get(currentId);
      const original = current();
      if (!original) return;
      const renamed = renameTask(nextSource, parseGantt(nextSource).document, original, value.label);
      if (renamed.unavailableReason) return report(renamed.unavailableReason);
      nextSource = applySourceEdits(nextSource, renamed.edits);
      currentId = original.alias ? original.id : normalizeTaskId(value.label);
      const task = current();
      if (!task) return;
      const milestoneStatement =
        value.mode === "fixed"
          ? `happens ${value.date}`
          : `happens at [${value.referenceLabel}]'s ${value.referenceAnchor}`;
      nextSource = applySourceEdits(
        nextSource,
        setTaskDeclaration(nextSource, task, "milestone", milestoneStatement).edits,
      );
      const colored = current();
      if (colored)
        nextSource = applySourceEdits(
          nextSource,
          setTaskDeclaration(
            nextSource,
            colored,
            "color",
            value.color.trim() ? `is colored in ${value.color.trim()}` : undefined,
          ).edits,
        );
      const noted = current();
      if (noted) {
        const noteOperation = setNote(nextSource, noted.sourceRange, noted.notes, value.note, value.notePosition);
        if (noteOperation.unavailableReason) return report(noteOperation.unavailableReason);
        nextSource = applySourceEdits(nextSource, noteOperation.edits);
      }
      if (!commit(nextSource, `Update ${value.label.trim()}`)) return;
      selectTask(currentId);
      report(`Updated milestone ${value.label.trim()}`);
    },
    [commit, report, selectTask, selectedTaskId, source],
  );

  return { moveTask, resizeTask, reorderDiagramTask, applyTaskInspector, applyMilestoneInspector };
}
