import { isWorkingDate, shiftDate, taskPauses, type GanttCalendar } from "./gantt-calendar";
import type { GanttDependency, GanttTask } from "@plantuml-studio/diagram-gantt";
import type { ResolvedTaskDates } from "./gantt-schedule";

export interface DependencyChange {
  kind: "added" | "removed" | "changed";
  before?: GanttDependency;
  after?: GanttDependency;
  currentIndex?: number;
}

// Match exact constraints first. Multiple unmatched constraints between the same
// tasks are reported as additions/removals rather than guessing their identity.
export function compareBaselineDependencies(current: readonly GanttDependency[], baseline: readonly GanttDependency[]) {
  const pair = (item: GanttDependency) => JSON.stringify([item.predecessorTaskId, item.successorTaskId]);
  const signature = (item: GanttDependency) =>
    JSON.stringify([item.relation, item.offset?.value ?? 0, item.direction ?? "after"]);
  const result: DependencyChange[] = [];
  const pairs = new Set([...current, ...baseline].map(pair));
  for (const key of pairs) {
    const now = current.map((item, index) => ({ item, index })).filter(({ item }) => pair(item) === key);
    const old = baseline.filter((item) => pair(item) === key);
    for (let i = old.length - 1; i >= 0; i--) {
      const match = now.findIndex(({ item }) => signature(item) === signature(old[i]!));
      if (match >= 0) {
        now.splice(match, 1);
        old.splice(i, 1);
      }
    }
    if (now.length === 1 && old.length === 1) {
      result.push({ kind: "changed", before: old[0]!, after: now[0]!.item, currentIndex: now[0]!.index });
    } else {
      result.push(
        ...old.map((before) => ({ kind: "removed" as const, before })),
        ...now.map(({ item: after, index: currentIndex }) => ({ kind: "added" as const, after, currentIndex })),
      );
    }
  }
  return result;
}

export function dependencyDescription(item: GanttDependency) {
  const relations = {
    "start-after-end": "End → start",
    "start-after-start": "Start → start",
    "end-after-end": "End → end",
    "end-after-start": "Start → end",
    other: "Other relationship",
  };
  const offset = item.offset?.value ?? 0;
  return `${relations[item.relation]} · ${offset} ${offset === 1 ? "day" : "days"} ${item.direction ?? "after"}`;
}

function validDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const stamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value;
}

export function scheduleFinish(tasks: readonly GanttTask[], dates: ReadonlyMap<string, ResolvedTaskDates>) {
  if (!tasks.length) return undefined;
  const ends = tasks.map((task) => dates.get(task.id));
  if (ends.some((item) => !item?.end || item.issue || item.conflict || !validDate(item.end))) return undefined;
  return ends
    .map((item) => item!.end!)
    .sort()
    .at(-1);
}

export function finishDateShift(current?: string, baseline?: string) {
  if (!validDate(current) || !validDate(baseline)) return "Comparison unavailable";
  const days = Math.round((Date.parse(`${current}T00:00:00Z`) - Date.parse(`${baseline}T00:00:00Z`)) / 86400000);
  return days === 0
    ? "Unchanged"
    : `${Math.abs(days)} calendar ${Math.abs(days) === 1 ? "day" : "days"} ${days > 0 ? "later" : "earlier"}`;
}

export function effectiveBaselineDates(
  tasks: readonly GanttTask[],
  dates: ReadonlyMap<string, ResolvedTaskDates>,
  calendar: GanttCalendar,
) {
  const result = new Map(dates);
  for (const task of tasks) {
    const resolved = dates.get(task.id);
    if (resolved?.issue || resolved?.conflict) {
      result.set(task.id, { derived: resolved.derived, issue: resolved.issue ?? "Conflicting schedule constraints" });
      continue;
    }
    if (!resolved?.start || !(task.duration && task.duration.value > 0)) continue;
    let start: string | undefined = resolved.start;
    const pauses = taskPauses(task);
    for (let attempt = 0; start && attempt < 10000; attempt++) {
      if (isWorkingDate(start, calendar) && !pauses.has(start)) break;
      start = shiftDate(start, 1);
    }
    if (!start || !isWorkingDate(start, calendar) || pauses.has(start))
      result.set(task.id, { derived: resolved.derived, issue: "No working start available" });
    else result.set(task.id, { ...resolved, start });
  }
  return result;
}
