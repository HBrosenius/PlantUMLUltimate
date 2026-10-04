import type { GanttDependency, GanttTask } from "@plantuml-studio/diagram-gantt";
import { normalizeTaskId } from "@plantuml-studio/diagram-gantt";
import { taskPauses, isWorkingDate, shiftDate, type GanttCalendar } from "./gantt-calendar";
import { forecastToday } from "./forecast-date";

export interface ResolvedTaskDates {
  start?: string;
  end?: string;
  derived: boolean;
  issue?: string;
  conflictRanges?: Array<{ from: number; to: number }>;
  conflict?: { anchor: "start" | "end"; expected: string };
}

export function taskWorkloadDays(task: GanttTask): number | undefined {
  if (!task.duration) return undefined;
  return task.duration.value * (task.duration.unit === "month" ? 30 : task.duration.unit === "week" ? 7 : 1);
}

export function taskAllocationPercent(task: GanttTask): number {
  return Math.max(
    1,
    (task.resources ?? []).reduce((total, resource) => total + Math.max(1, resource.allocation ?? 100), 0) || 100,
  );
}

export function taskElapsedDays(task: GanttTask): number | undefined {
  const workload = taskWorkloadDays(task);
  if (!workload) return undefined;
  return Math.ceil((workload * 100) / taskAllocationPercent(task));
}

/**
 * Resolves `today` in `timeZone` when given (pass the document's forecast time zone so source
 * `today±N` agrees with the forecast status date); otherwise in the browser's local time zone.
 */
function sourceToday(timeZone?: string): string {
  if (timeZone) return forecastToday(timeZone);
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function resolveDateExpression(value: string, projectStart?: string, timeZone?: string): string | undefined {
  const normalized = value.replaceAll("/", "-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return shiftDate(normalized, 0);
  const relative = value.match(/^(D|today)(?:([+-])(\d+))?$/i);
  if (!relative) return undefined;
  const anchor = relative[1]?.toLowerCase() === "today" ? sourceToday(timeZone) : projectStart;
  if (!anchor) return undefined;
  const amount = Number(relative[3] ?? 0) * (relative[2] === "-" ? -1 : 1);
  return shiftDate(anchor, amount);
}

/** Offsets are calendar days; zero start/end links advance to the next eligible weekday. */
export function dependencyDate(
  anchor: string,
  dependency: GanttDependency,
  calendar: GanttCalendar,
): string | undefined {
  const direction = dependency.direction === "before" ? -1 : 1;
  let date = shiftDate(anchor, (dependency.offset?.value ?? 0) * direction);
  if (dependency.relation === "start-after-end" && (dependency.offset?.value ?? 0) === 0) {
    for (let step = 0; date && step < 10_000; step++) {
      date = shiftDate(date, direction);
      if (date && isWorkingDate(date, calendar)) return date;
    }
    return undefined;
  }
  return date;
}

export function resolveTaskDates(
  tasks: readonly GanttTask[],
  dependencies: readonly GanttDependency[],
  projectStart: string | undefined,
  calendar: GanttCalendar,
  timeZone?: string,
): Map<string, ResolvedTaskDates> {
  const resolved = new Map<string, ResolvedTaskDates>();
  const visiting = new Set<string>();
  const workingEnd = (start: string, days: number, paused: Pick<ReadonlySet<string>, "has">) => {
    let value = start;
    let remaining = Math.max(0, days);
    for (let step = 0; step < 10_000 && remaining > 0; step++) {
      if (isWorkingDate(value, calendar) && !paused.has(value)) remaining -= 1;
      if (remaining > 0) value = shiftDate(value, 1)!;
    }
    return remaining === 0 ? value : undefined;
  };
  const workingStart = (end: string, days: number, paused: Pick<ReadonlySet<string>, "has">) => {
    let value = end;
    let remaining = Math.max(0, days);
    for (let step = 0; step < 10_000 && remaining > 0; step++) {
      if (isWorkingDate(value, calendar) && !paused.has(value)) remaining -= 1;
      if (remaining > 0) value = shiftDate(value, -1)!;
    }
    return remaining === 0 ? value : undefined;
  };
  const solve = (task: GanttTask): ResolvedTaskDates => {
    const cached = resolved.get(task.id);
    if (cached) return cached;
    if (visiting.has(task.id)) return { derived: true, issue: "Dependency cycle" };
    visiting.add(task.id);
    const unavailable = (issue: string, conflictRanges?: Array<{ from: number; to: number }>): ResolvedTaskDates => {
      const value = { derived: true, issue, ...(conflictRanges ? { conflictRanges } : {}) };
      resolved.set(task.id, value);
      visiting.delete(task.id);
      return value;
    };
    let start = task.start ? resolveDateExpression(task.start.value, projectStart, timeZone) : undefined;
    let end = task.end ? resolveDateExpression(task.end.value, projectStart, timeZone) : undefined;
    if (task.start && !start) return unavailable(`Start date cannot be resolved: ${task.start.value}`);
    if (task.end && !end) return unavailable(`End date cannot be resolved: ${task.end.value}`);
    if (!start && !end && task.milestone && "resolved" in task.milestone) {
      const milestoneDate = resolveDateExpression(task.milestone.value, projectStart, timeZone);
      if (!milestoneDate) return unavailable(`Milestone date cannot be resolved: ${task.milestone.value}`);
      if (milestoneDate) {
        start = milestoneDate;
        end = milestoneDate;
      }
    }
    if (!start && !end && task.milestone && !("resolved" in task.milestone)) {
      const referenceId = normalizeTaskId(task.milestone.value);
      const reference = tasks.find(
        (item) => item.id === referenceId || normalizeTaskId(item.alias?.value ?? "") === referenceId,
      );
      const anchor = reference ? solve(reference)[task.milestoneAnchor ?? "end"] : undefined;
      if (!anchor) return unavailable(`Milestone reference cannot be resolved: ${task.milestone.value}`);
      if (anchor) {
        start = anchor;
        end = anchor;
      }
    }
    const derived = !start || !end;
    const taskDependencies = dependencies.filter((item) => item.successorTaskId === task.id);

    const constraints: Array<{ dependency: GanttDependency; expected: string }> = [];
    for (const dependency of taskDependencies) {
      if (dependency.relation === "other") continue;
      const predecessor = tasks.find((item) => item.id === dependency.predecessorTaskId);
      const predecessorDates = predecessor ? solve(predecessor) : undefined;
      const anchor =
        dependency.relation === "start-after-start" || dependency.relation === "end-after-start"
          ? predecessorDates?.start
          : predecessorDates?.end;
      if (!anchor)
        return unavailable(
          predecessorDates?.issue ?? `Predecessor date cannot be resolved: ${dependency.predecessor.value}`,
        );
      if (anchor) {
        const dependencyAnchor = dependencyDate(anchor, dependency, calendar);
        if (!dependencyAnchor) return unavailable("No working date can be found for the dependency");
        constraints.push({ dependency, expected: dependencyAnchor });
      }
    }
    const duration = taskElapsedDays(task);
    const pauses = taskPauses(task);
    const choose = (anchor: "start" | "end") => {
      const matching = constraints.filter(({ dependency }) => dependency.relation.startsWith(`${anchor}-`));
      const lower = matching
        .filter(({ dependency }) => dependency.direction !== "before")
        .map(({ expected }) => expected)
        .sort()
        .at(-1);
      const upper = matching
        .filter(({ dependency }) => dependency.direction === "before")
        .map(({ expected }) => expected)
        .sort()[0];
      return lower ?? upper;
    };
    if (!start) start = choose("start");
    if (!end) end = choose("end");
    if (!start && end && duration) start = workingStart(end, duration, pauses);
    if (!start) {
      start ??= projectStart;
    }
    end = end ? end : start && duration ? workingEnd(start, duration, pauses) : undefined;
    for (const { dependency, expected } of constraints) {
      const anchor = dependency.relation.startsWith("start-") ? "start" : "end";
      const actual = anchor === "start" ? start : end;
      if (actual && (dependency.direction === "before" ? actual > expected : actual < expected)) {
        const expression = anchor === "start" ? task.start : task.end;
        const result = unavailable(
          `Task '${task.label}' ${anchor} ${actual} conflicts with '${dependency.predecessor.value}': its relationship requires ${anchor} ${dependency.direction === "before" ? "on or before" : "on or after"} ${expected}.`,
          [dependency.sourceRange, ...(expression ? [expression.range] : [])],
        );
        result.conflict = { anchor, expected };
        return result;
      }
    }
    const value = { ...(start ? { start } : {}), ...(end ? { end } : {}), derived };
    resolved.set(task.id, value);
    visiting.delete(task.id);
    return value;
  };
  tasks.forEach(solve);
  return resolved;
}
