import { deleteTask, type GanttDocument, type GanttTask, type MoveTaskResult } from "@plantuml-studio/diagram-gantt";
import { parseGanttCalendar } from "./gantt-calendar";
import { resolveTaskDates } from "./gantt-schedule";

/**
 * Deletes a task from the editor. Tasks that were scheduled only relative to it keep the dates they
 * were drawn on, instead of jumping back to the project start.
 */
export function deleteGanttTaskKeepingDates(source: string, document: GanttDocument, task: GanttTask): MoveTaskResult {
  const dates = resolveTaskDates(
    document.tasks,
    document.dependencies,
    document.projectStart?.resolved ? document.projectStart.value : undefined,
    parseGanttCalendar(source),
  );
  const pinnedDates = new Map(
    [...dates].flatMap(([id, value]) =>
      value.issue
        ? []
        : [[id, { ...(value.start ? { start: value.start } : {}), ...(value.end ? { end: value.end } : {}) }] as const],
    ),
  );
  return deleteTask(source, document, task, { pinnedDates });
}
