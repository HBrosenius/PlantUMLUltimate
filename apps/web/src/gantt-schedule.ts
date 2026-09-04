import type { GanttDependency, GanttTask } from "@plantuml-studio/diagram-gantt";
import { isWorkingDate, shiftDate, type GanttCalendar } from "./gantt-calendar";

export interface ResolvedTaskDates {
  start?: string;
  end?: string;
  derived: boolean;
}

export function taskWorkloadDays(task: GanttTask): number | undefined {
  if (!task.duration) return undefined;
  return task.duration.value * (task.duration.unit === "month" ? 30 : task.duration.unit === "week" ? 7 : 1);
}

export function taskElapsedDays(task: GanttTask): number | undefined {
  const workload = taskWorkloadDays(task);
  if (!workload) return undefined;
  const allocation = Math.max(
    1,
    (task.resources ?? []).reduce((total, resource) => total + Math.max(1, resource.allocation ?? 100), 0) || 100,
  );
  return Math.ceil((workload * 100) / allocation);
}

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function resolveDateExpression(value: string, projectStart?: string): string | undefined {
  const normalized = value.replaceAll("/", "-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return shiftDate(normalized, 0);
  const relative = value.match(/^(D|today)(?:([+-])(\d+))?$/i);
  if (!relative) return undefined;
  const anchor = relative[1]?.toLowerCase() === "today" ? localToday() : projectStart;
  if (!anchor) return undefined;
  const amount = Number(relative[3] ?? 0) * (relative[2] === "-" ? -1 : 1);
  return shiftDate(anchor, amount);
}

export function resolveTaskDates(
  tasks: readonly GanttTask[],
  dependencies: readonly GanttDependency[],
  projectStart: string | undefined,
  calendar: GanttCalendar,
): Map<string, ResolvedTaskDates> {
  const resolved = new Map<string, ResolvedTaskDates>();
  const visiting = new Set<string>();
  const workingEnd = (start: string, days: number, pauses: readonly string[]) => {
    let value = start;
    let remaining = Math.max(0, days);
    const paused = new Set(pauses);
    while (remaining > 0) {
      if (isWorkingDate(value, calendar) && !paused.has(value)) remaining -= 1;
      if (remaining > 0) value = shiftDate(value, 1)!;
    }
    return value;
  };
  const workingStart = (end: string, days: number, pauses: readonly string[]) => {
    let value = end;
    let remaining = Math.max(0, days);
    const paused = new Set(pauses);
    while (remaining > 0) {
      if (isWorkingDate(value, calendar) && !paused.has(value)) remaining -= 1;
      if (remaining > 0) value = shiftDate(value, -1)!;
    }
    return value;
  };
  const solve = (task: GanttTask): ResolvedTaskDates => {
    const cached = resolved.get(task.id);
    if (cached) return cached;
    if (visiting.has(task.id)) return { derived: true };
    visiting.add(task.id);
    let start = task.start ? resolveDateExpression(task.start.value, projectStart) : undefined;
    let end = task.end ? resolveDateExpression(task.end.value, projectStart) : undefined;
    if (!start && !end && task.milestone && "resolved" in task.milestone && task.milestone.resolved) {
      const milestoneDate = resolveDateExpression(task.milestone.value, projectStart);
      if (milestoneDate) {
        start = milestoneDate;
        end = milestoneDate;
      }
    }
    const derived = !start || !end;
    const taskDependencies = dependencies.filter((item) => item.successorTaskId === task.id);
    const dependencyStarts: string[] = [];
    const dependencyEnds: string[] = [];
    for (const dependency of taskDependencies) {
      const predecessor = tasks.find((item) => item.id === dependency.predecessorTaskId);
      const predecessorDates = predecessor ? solve(predecessor) : undefined;
      const anchor =
        dependency.relation === "start-after-start" || dependency.relation === "end-after-start"
          ? predecessorDates?.start
          : predecessorDates?.end;
      if (anchor) {
        const direction = dependency.direction === "before" ? -1 : 1;
        let dependencyAnchor = shiftDate(anchor, (dependency.offset?.value ?? 0) * direction);
        if (dependency.relation === "start-after-end" && (dependency.offset?.value ?? 0) === 0 && dependencyAnchor) {
          do {
            dependencyAnchor = shiftDate(dependencyAnchor, 1);
          } while (dependencyAnchor && !isWorkingDate(dependencyAnchor, calendar));
        }
        if (dependencyAnchor) {
          if (dependency.relation.startsWith("start-")) dependencyStarts.push(dependencyAnchor);
          else dependencyEnds.push(dependencyAnchor);
        }
      }
    }
    const duration = taskElapsedDays(task);
    const pauses = (task.pauses ?? []).filter((pause) => pause.resolved).map((pause) => pause.value);
    if (!start && dependencyStarts.length) start = dependencyStarts.sort().at(-1);
    if (!end && dependencyEnds.length) end = dependencyEnds.sort().at(-1);
    if (!start && end && duration) start = workingStart(end, duration, pauses);
    if (!start) {
      start ??= projectStart;
    }
    end = end ? end : start && duration ? workingEnd(start, duration, pauses) : undefined;
    const value = { ...(start ? { start } : {}), ...(end ? { end } : {}), derived };
    resolved.set(task.id, value);
    visiting.delete(task.id);
    return value;
  };
  tasks.forEach(solve);
  return resolved;
}
