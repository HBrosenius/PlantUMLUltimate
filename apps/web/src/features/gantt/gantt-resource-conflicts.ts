import type { GanttTask } from "@plantuml-studio/diagram-gantt";

export function findResourceConflicts(task: GanttTask, tasks: readonly GanttTask[]): string[] {
  if (!task.start?.resolved || !task.duration || !task.resources?.length) return [];
  const start = Date.parse(`${task.start.value}T00:00:00Z`);
  const end = start + task.duration.value * durationUnitDays(task.duration.unit) * 86_400_000;
  const names = new Set(task.resources.map((item) => item.value.toLocaleLowerCase()));
  return tasks
    .filter(
      (other) =>
        other.id !== task.id &&
        other.start?.resolved &&
        other.duration &&
        other.resources?.some((item) => names.has(item.value.toLocaleLowerCase())),
    )
    .filter((other) => {
      const otherStart = Date.parse(`${other.start!.value}T00:00:00Z`);
      const otherEnd = otherStart + other.duration!.value * durationUnitDays(other.duration!.unit) * 86_400_000;
      return start < otherEnd && otherStart < end;
    })
    .map((other) => other.label);
}

function durationUnitDays(unit: "day" | "week" | "month"): number {
  return unit === "month" ? 30 : unit === "week" ? 7 : 1;
}
