import { applySourceEdits, ganttAdapter, parseGantt, setTaskDeclaration } from "@plantuml-studio/diagram-gantt";
import { parseGanttCalendar, shiftDate } from "./gantt-calendar";
import { resolveTaskDates } from "./gantt-schedule";

export interface JiraScheduleChangeResult {
  source: string;
  unavailableReason?: string;
}

export function isJiraTaskAlias(value: string | undefined): boolean {
  return /^jira_[1-9]\d*$/i.test(value ?? "");
}

export function applyJiraScheduleChange(
  source: string,
  taskId: string,
  action: "Move" | "Resize",
  durationDays: number,
  calendarDays = durationDays,
): JiraScheduleChangeResult {
  const document = parseGantt(source).document;
  const task = document.symbols.tasks.get(taskId);
  if (!task || !isJiraTaskAlias(task.alias?.value)) return { source, unavailableReason: "Jira task not found" };
  const dates = resolveTaskDates(
    document.tasks,
    document.dependencies,
    document.projectStart?.resolved ? document.projectStart.value : undefined,
    parseGanttCalendar(source),
  ).get(task.id);
  if (!dates?.start || !dates.end) return { source, unavailableReason: "Task dates could not be resolved" };

  let next = source;
  if (action === "Resize") {
    const resized = ganttAdapter.applyVisualOperation(
      { kind: "resize-task", taskId, days: durationDays },
      document,
      source,
    );
    if (resized.unavailableReason) return { source, unavailableReason: resized.unavailableReason };
    next = applySourceEdits(next, resized.edits);
  }

  const setDate = (kind: "start" | "end", value: string) => {
    const current = parseGantt(next).document.symbols.tasks.get(taskId);
    if (!current) return;
    next = applySourceEdits(
      next,
      setTaskDeclaration(next, current, kind, `${kind === "start" ? "starts" : "ends"} ${value}`).edits,
    );
  };

  if (action === "Move") {
    const start = shiftDate(dates.start, calendarDays);
    const end = shiftDate(dates.end, calendarDays);
    if (!start || !end) return { source, unavailableReason: "Task dates could not be moved safely" };
    setDate("start", start);
    setDate("end", end);
  } else {
    const end = shiftDate(dates.end, calendarDays);
    if (!end) return { source, unavailableReason: "Task due date could not be resized safely" };
    setDate("end", end);
  }
  return { source: next };
}
