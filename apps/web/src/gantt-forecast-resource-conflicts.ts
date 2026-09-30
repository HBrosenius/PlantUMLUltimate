import type { GanttTask } from "@plantuml-studio/diagram-gantt";
import { isWorkingDate, shiftDate, type GanttCalendar } from "./gantt-calendar";
import type { ProgressForecast } from "./gantt-progress-forecast";
import type { ResolvedTaskDates } from "./gantt-schedule";
import { buildResourceWorkloads, type ResourceCapacity, type ResourceWorkWindow } from "./ResourceWorkloadPanel";

export interface ForecastResourceConflict {
  resource: string;
  date: string;
  capacity: number;
  plannedAllocation: number;
  forecastAllocation: number;
  kind: "new" | "existing";
  tasks: Array<{ id: string; label: string }>;
}

export interface ForecastResourceComparison {
  unavailable: boolean;
  hasAssignments: boolean;
  conflicts: ForecastResourceConflict[];
}

function plannedWorkDays(task: GanttTask, start: string, end: string, calendar: GanttCalendar): number | undefined {
  const pauses = new Set((task.pauses ?? []).filter((pause) => pause.resolved).map((pause) => pause.value));
  let date = start;
  let days = 0;
  for (let step = 0; step < 10_000 && date <= end; step += 1) {
    if (isWorkingDate(date, calendar) && !pauses.has(date)) days += 1;
    date = shiftDate(date, 1)!;
  }
  return date > end ? days : undefined;
}

/** Compares remaining scheduled work from the status date; it never moves tasks. */
export function compareForecastResourceConflicts(
  tasks: readonly GanttTask[],
  forecast: ProgressForecast,
  plannedDates: ReadonlyMap<string, ResolvedTaskDates>,
  calendar: GanttCalendar,
  capacities: ResourceCapacity,
  asOf: string,
): ForecastResourceComparison {
  // Both sides compare remaining work only: completed tasks consume no capacity from the status
  // date on, so they are excluded from the planned AND forecast workloads alike. "existing" thus
  // means the plan already over-allocated the resource with unfinished work on that date.
  const assigned = tasks.filter(
    (task) => (task.resources?.length ?? 0) > 0 && !task.milestone && (task.completion?.value ?? 0) < 100,
  );
  if (!assigned.length) return { unavailable: false, hasAssignments: false, conflicts: [] };
  const plannedWindows = new Map<string, ResourceWorkWindow>();
  const forecastWindows = new Map<string, ResourceWorkWindow>();
  for (const task of assigned) {
    const item = forecast.tasks.get(task.id);
    const plan = plannedDates.get(task.id);
    if (!item?.start || !item.end || item.issue || item.remainingDays === undefined || !plan?.start || !plan.end)
      return { unavailable: true, hasAssignments: true, conflicts: [] };
    const days = plannedWorkDays(task, plan.start, plan.end, calendar);
    if (days === undefined) return { unavailable: true, hasAssignments: true, conflicts: [] };
    plannedWindows.set(task.id, { start: plan.start, days });
    forecastWindows.set(task.id, { start: item.start, days: item.remainingDays });
  }

  const planned = new Map(
    buildResourceWorkloads(assigned, undefined, calendar, plannedWindows).map((resource) => [
      resource.name.toLocaleLowerCase(),
      new Map(resource.days.map((day) => [day.date, day.allocation])),
    ]),
  );
  const predicted = buildResourceWorkloads(assigned, undefined, calendar, forecastWindows);
  const conflicts = predicted.flatMap((resource) => {
    const capacity = capacities[resource.name] ?? 100;
    const plannedDays = planned.get(resource.name.toLocaleLowerCase());
    return resource.days
      .filter((day) => day.date >= asOf && day.allocation > capacity)
      .map((day): ForecastResourceConflict => {
        const plannedAllocation = plannedDays?.get(day.date) ?? 0;
        return {
          resource: resource.name,
          date: day.date,
          capacity,
          plannedAllocation,
          forecastAllocation: day.allocation,
          kind: plannedAllocation > capacity ? "existing" : "new",
          tasks: day.tasks.map((task) => ({ id: task.id, label: task.label })),
        };
      });
  });
  conflicts.sort((left, right) => left.date.localeCompare(right.date) || left.resource.localeCompare(right.resource));
  return { unavailable: false, hasAssignments: true, conflicts };
}
