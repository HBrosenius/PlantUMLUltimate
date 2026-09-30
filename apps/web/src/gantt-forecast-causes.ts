import type { GanttTask } from "@plantuml-studio/diagram-gantt";
import { forecastWorkingDaysBetween, type ForecastTask, type ProgressForecast } from "./gantt-progress-forecast";
import type { GanttCalendar } from "./gantt-calendar";

export interface FinishCause {
  taskId: string;
  affectedTaskIds: string[];
  affectedMilestoneIds: string[];
}

export interface FinishCauseSummary {
  causes: FinishCause[];
  affectedMilestoneIds: string[];
}

function shifted(task: ForecastTask | undefined): boolean {
  return Boolean(
    task &&
    !task.issue &&
    ((task.plannedStart && task.start && task.start > task.plannedStart) ||
      (task.plannedEnd && task.end && task.end > task.plannedEnd)),
  );
}

/** Traces only the forecast links that actually move the project finish. */
export function summarizeFinishCauses(tasks: readonly GanttTask[], forecast: ProgressForecast): FinishCauseSummary {
  if (!forecast.plannedFinish || !forecast.forecastFinish || forecast.forecastFinish <= forecast.plannedFinish)
    return { causes: [], affectedMilestoneIds: [] };

  const roots = new Set<string>();
  const visit = (id: string, seen = new Set<string>()) => {
    if (seen.has(id)) return;
    seen.add(id);
    const item = forecast.tasks.get(id);
    if (!shifted(item)) return;
    const shiftedPredecessors = item!.causeTaskIds.filter((predecessor) => shifted(forecast.tasks.get(predecessor)));
    if (shiftedPredecessors.length) {
      for (const predecessor of shiftedPredecessors) visit(predecessor, seen);
    } else if (item!.completion < 100) {
      roots.add(id);
    }
  };
  for (const task of tasks) if (forecast.tasks.get(task.id)?.end === forecast.forecastFinish) visit(task.id);

  const successors = new Map<string, string[]>();
  for (const item of forecast.tasks.values()) {
    if (!shifted(item)) continue;
    for (const predecessor of item.causeTaskIds) {
      if (!shifted(forecast.tasks.get(predecessor))) continue;
      successors.set(predecessor, [...(successors.get(predecessor) ?? []), item.taskId]);
    }
  }
  const taskOrder = new Map(tasks.map((task, index) => [task.id, index]));
  const ordered = (ids: Iterable<string>) =>
    [...ids].sort(
      (a, b) => (taskOrder.get(a) ?? Number.POSITIVE_INFINITY) - (taskOrder.get(b) ?? Number.POSITIVE_INFINITY),
    );
  const milestones = new Set<string>();
  const causes = ordered(roots).map((taskId) => {
    const affected = new Set<string>();
    const collect = (id: string) => {
      if (affected.has(id)) return;
      affected.add(id);
      for (const successor of successors.get(id) ?? []) collect(successor);
    };
    collect(taskId);
    const affectedTaskIds = ordered(affected);
    const affectedMilestoneIds = affectedTaskIds.filter((id) => tasks.find((task) => task.id === id)?.milestone);
    for (const id of affectedMilestoneIds) milestones.add(id);
    return { taskId, affectedTaskIds, affectedMilestoneIds };
  });
  return { causes, affectedMilestoneIds: ordered(milestones) };
}

export function formatForecastShareSummary(
  tasks: readonly GanttTask[],
  forecast: ProgressForecast,
  calendar: GanttCalendar,
  asOf: string,
  timeZone = "UTC",
): string {
  const slip =
    forecast.plannedFinish && forecast.forecastFinish
      ? forecastWorkingDaysBetween(forecast.plannedFinish, forecast.forecastFinish, calendar)
      : undefined;
  const labels = new Map(tasks.map((task) => [task.id, task.label]));
  const causes = summarizeFinishCauses(tasks, forecast).causes;
  const delayed = tasks.flatMap((task) => {
    const item = forecast.tasks.get(task.id);
    return item?.plannedEnd && item.end && item.end > item.plannedEnd
      ? [`${task.label}: ${item.plannedEnd} → ${item.end}`]
      : [];
  });
  return [
    `Progress forecast (as of ${asOf})`,
    `Automatic Today time zone: ${timeZone}`,
    `Planned finish: ${forecast.plannedFinish ?? "Unavailable"}`,
    `Projected finish: ${forecast.forecastFinish ?? "Unavailable"}`,
    `Working days from plan: ${slip === undefined ? "Unavailable" : `${slip > 0 ? "+" : ""}${slip}`}`,
    `Delayed tasks: ${delayed.length}`,
    ...delayed.map((item) => `- ${item}`),
    `Finish drivers: ${causes.length ? causes.map((cause) => labels.get(cause.taskId) ?? cause.taskId).join(", ") : "None identified"}`,
  ].join("\n");
}
