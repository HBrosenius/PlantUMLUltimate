import { normalizeTaskId, type GanttDependency, type GanttTask } from "@plantuml-studio/diagram-gantt";
import { taskPauses, isWorkingDate, shiftDate, type GanttCalendar } from "./gantt-calendar";
import { dependencyDate, taskElapsedDays, type ResolvedTaskDates } from "./gantt-schedule";

export interface ForecastTask {
  taskId: string;
  plannedStart?: string | undefined;
  plannedEnd?: string | undefined;
  start?: string | undefined;
  end?: string | undefined;
  completion: number;
  missingCompletion: boolean;
  remainingDays?: number | undefined;
  automaticRemainingDays?: number | undefined;
  manualEstimate: boolean;
  causeTaskIds: string[];
  issue?: string | undefined;
}

export interface ProgressForecast {
  tasks: ReadonlyMap<string, ForecastTask>;
  plannedFinish?: string | undefined;
  forecastFinish?: string | undefined;
  missingProgress: number;
  unavailable: number;
}

export function hasDelayedForecastTask(forecast: ProgressForecast): boolean {
  return [...forecast.tasks.values()].some((task) => task.end && task.plannedEnd && task.end > task.plannedEnd);
}

function available(date: string, calendar: GanttCalendar, pauses: Pick<ReadonlySet<string>, "has">): boolean {
  return isWorkingDate(date, calendar) && !pauses.has(date);
}

function nextAvailable(
  date: string,
  calendar: GanttCalendar,
  pauses: Pick<ReadonlySet<string>, "has">,
): string | undefined {
  let result = date;
  for (let step = 0; step < 10_000; step += 1) {
    if (available(result, calendar, pauses)) return result;
    result = shiftDate(result, 1)!;
  }
  return undefined;
}

function workEnd(
  start: string,
  days: number,
  calendar: GanttCalendar,
  pauses: Pick<ReadonlySet<string>, "has">,
): string | undefined {
  let date = nextAvailable(start, calendar, pauses);
  if (!date) return undefined;
  let remaining = days;
  for (let step = 0; step < 10_000; step += 1) {
    if (available(date, calendar, pauses) && --remaining <= 0) return date;
    date = shiftDate(date, 1)!;
  }
  return undefined;
}

function workStart(
  end: string,
  days: number,
  calendar: GanttCalendar,
  pauses: Pick<ReadonlySet<string>, "has">,
): string | undefined {
  let date = end;
  let remaining = days;
  for (let step = 0; step < 10_000; step += 1) {
    if (available(date, calendar, pauses) && --remaining <= 0) return date;
    date = shiftDate(date, -1)!;
  }
  return undefined;
}

function pausedWorkingDays(
  start: string,
  end: string,
  calendar: GanttCalendar,
  pauses: Pick<ReadonlySet<string>, "has">,
): number | undefined {
  let date = start;
  let days = 0;
  for (let step = 0; step < 10_000 && date <= end; step++) {
    if (available(date, calendar, pauses)) days++;
    date = shiftDate(date, 1)!;
  }
  return date > end && days > 0 ? days : undefined;
}

export function forecastWorkingDaysBetween(start: string, end: string, calendar: GanttCalendar): number {
  if (end <= start) return 0;
  let date = start;
  let days = 0;
  for (let step = 0; step < 10_000 && date < end; step += 1) {
    date = shiftDate(date, 1)!;
    if (isWorkingDate(date, calendar)) days += 1;
  }
  return days;
}

/** Calculates a read-only forecast from the current plan and today's reported completion. */
export function calculateProgressForecast(
  tasks: readonly GanttTask[],
  dependencies: readonly GanttDependency[],
  plan: ReadonlyMap<string, ResolvedTaskDates>,
  calendar: GanttCalendar,
  asOf: string,
  remainingOverrides: Readonly<Record<string, number>> = {},
): ProgressForecast {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  for (const task of tasks) if (task.alias) byId.set(normalizeTaskId(task.alias.value), task);
  const forecast = new Map<string, ForecastTask>();
  const visiting = new Set<string>();

  const solve = (task: GanttTask): ForecastTask => {
    const cached = forecast.get(task.id);
    if (cached) return cached;
    const planned = plan.get(task.id);
    const completion = task.completion?.value ?? 0;
    const base = {
      taskId: task.id,
      plannedStart: planned?.start,
      plannedEnd: planned?.end,
      completion,
      missingCompletion: false,
      manualEstimate: !task.milestone && completion < 100 && remainingOverrides[task.id] !== undefined,
      causeTaskIds: [] as string[],
    };
    if (visiting.has(task.id)) return { ...base, issue: "Dependency cycle" };
    if (!planned?.start || !planned.end) {
      const result = { ...base, issue: planned?.issue ?? "Task dates cannot be resolved" };
      forecast.set(task.id, result);
      return result;
    }
    if (completion >= 100) {
      const result = { ...base, start: planned.start, end: planned.end, remainingDays: 0, automaticRemainingDays: 0 };
      forecast.set(task.id, result);
      return result;
    }
    // Match the apply-forecast definition: a one-day task that starts and ends on the same date still has work.
    const milestone = Boolean(task.milestone && !task.duration);
    const pauses = taskPauses(task);
    // Without `lasts`, the work is the planned window's working days minus pauses, as workEnd skips them.
    const elapsed = milestone
      ? 0
      : (taskElapsedDays(task) ?? pausedWorkingDays(planned.start, planned.end, calendar, pauses));
    const override = remainingOverrides[task.id];
    const automaticRemainingDays =
      elapsed === undefined ? undefined : Math.max(1, Math.ceil((elapsed * (100 - completion)) / 100));
    const remainingDays = milestone ? 0 : (override ?? automaticRemainingDays);
    if (remainingDays === undefined || !Number.isSafeInteger(remainingDays) || remainingDays < 0) {
      const result = { ...base, issue: "Task duration cannot be resolved" };
      forecast.set(task.id, result);
      return result;
    }
    visiting.add(task.id);
    let start = planned.start > asOf ? planned.start : asOf;
    const causes: string[] = [];
    let issue: string | undefined;
    const upperBounds: Array<{ anchor: "start" | "end"; date: string }> = [];
    for (const dependency of dependencies.filter((item) => item.successorTaskId === task.id)) {
      if (dependency.relation === "other") continue;
      const predecessor = byId.get(dependency.predecessorTaskId);
      if (!predecessor) continue;
      const prior = solve(predecessor);
      if (!prior.start || !prior.end) {
        issue = prior.issue ?? "Predecessor cannot be forecast";
        continue;
      }
      const anchor = dependency.relation.endsWith("after-start") ? prior.start : prior.end;
      const constraint = dependencyDate(anchor, dependency, calendar);
      if (!constraint) continue;
      if (dependency.direction === "before") {
        upperBounds.push({ anchor: dependency.relation.startsWith("start-") ? "start" : "end", date: constraint });
        continue;
      }
      const candidate = dependency.relation.startsWith("end-")
        ? remainingDays > 0
          ? workStart(constraint, remainingDays, calendar, pauses)
          : constraint
        : constraint;
      if (candidate && candidate > start) {
        start = candidate;
        causes.length = 0;
        causes.push(predecessor.id);
      } else if (candidate === start && prior.end > (plan.get(predecessor.id)?.end ?? "")) {
        causes.push(predecessor.id);
      }
    }
    if (task.milestone && !("resolved" in task.milestone)) {
      const reference = byId.get(normalizeTaskId(task.milestone.value));
      const prior = reference ? solve(reference) : undefined;
      const anchor = prior?.[task.milestoneAnchor ?? "end"];
      if (!anchor) issue = prior?.issue ?? "Milestone predecessor cannot be forecast";
      else if (anchor > start) {
        start = anchor;
        causes.length = 0;
        causes.push(reference!.id);
      } else if (anchor === start && anchor > planned.start) {
        causes.push(reference!.id);
      }
    }
    visiting.delete(task.id);
    const missingCompletion = task.completion === undefined && planned.start <= asOf && start <= asOf;
    if (issue) {
      const result = { ...base, missingCompletion, remainingDays, automaticRemainingDays, issue };
      forecast.set(task.id, result);
      return result;
    }
    // A milestone is a dated event, so an overdue one can land exactly on the status date,
    // including a day closed for scheduled work.
    start = milestone ? start : (nextAvailable(start, calendar, pauses) ?? start);
    const computedEnd = remainingDays > 0 ? workEnd(start, remainingDays, calendar, pauses) : start;
    if (!computedEnd) {
      const result = {
        ...base,
        missingCompletion,
        remainingDays,
        automaticRemainingDays,
        issue: "No working date available",
      };
      forecast.set(task.id, result);
      return result;
    }
    const end = computedEnd > planned.end ? computedEnd : planned.end;
    if (upperBounds.some((bound) => (bound.anchor === "start" ? start : end) > bound.date)) {
      const result = {
        ...base,
        remainingDays,
        automaticRemainingDays,
        missingCompletion,
        issue: "Forecast dates conflict with a before relationship",
      };
      forecast.set(task.id, result);
      return result;
    }
    const result = {
      ...base,
      missingCompletion,
      start,
      end,
      remainingDays,
      automaticRemainingDays,
      causeTaskIds: [...new Set(causes)],
    };
    forecast.set(task.id, result);
    return result;
  };

  tasks.forEach(solve);
  const ends = tasks.map((task) => forecast.get(task.id)?.end).filter((date): date is string => Boolean(date));
  const plannedEnds = tasks.map((task) => plan.get(task.id)?.end).filter((date): date is string => Boolean(date));
  return {
    tasks: forecast,
    plannedFinish: plannedEnds.sort().at(-1),
    forecastFinish: ends.sort().at(-1),
    missingProgress: [...forecast.values()].filter((task) => task.missingCompletion).length,
    unavailable: [...forecast.values()].filter((task) => task.issue).length,
  };
}
