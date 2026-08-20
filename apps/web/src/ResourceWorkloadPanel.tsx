import { useMemo, useState } from "react";
import type { GanttTask } from "@plantuml-studio/diagram-gantt";

export interface ResourceCapacity {
  [name: string]: number;
}

interface WorkloadDay {
  date: string;
  allocation: number;
  tasks: GanttTask[];
}
interface ResourceWorkload {
  name: string;
  days: WorkloadDay[];
  tasks: GanttTask[];
}
export interface ResourceOverAllocation {
  name: string;
  capacity: number;
  peak: number;
  days: number;
  tasks: GanttTask[];
}
export interface ResourceResolvedDate {
  start?: string;
}

export function buildResourceWorkloads(
  tasks: readonly GanttTask[],
  resolvedDates?: ReadonlyMap<string, ResourceResolvedDate>,
): ResourceWorkload[] {
  const resources = new Map<string, { name: string; days: Map<string, WorkloadDay>; tasks: Map<string, GanttTask> }>();
  for (const task of tasks) {
    for (const assignment of task.resources ?? []) {
      const key = assignment.value.toLocaleLowerCase();
      const resource = resources.get(key) ?? { name: assignment.value, days: new Map(), tasks: new Map() };
      resource.tasks.set(task.id, task);
      const start = task.start?.resolved ? task.start.value : resolvedDates?.get(task.id)?.start;
      if (start && task.duration) {
        const duration =
          task.duration.value * (task.duration.unit === "month" ? 30 : task.duration.unit === "week" ? 7 : 1);
        const pauses = new Set((task.pauses ?? []).filter((pause) => pause.resolved).map((pause) => pause.value));
        let assignedDays = 0;
        let index = 0;
        while (assignedDays < duration) {
          const date = new Date(`${start}T00:00:00Z`);
          date.setUTCDate(date.getUTCDate() + index);
          const value = date.toISOString().slice(0, 10);
          index += 1;
          if (pauses.has(value)) continue;
          const day = resource.days.get(value) ?? { date: value, allocation: 0, tasks: [] };
          day.allocation += assignment.allocation ?? 100;
          day.tasks.push(task);
          resource.days.set(value, day);
          assignedDays += 1;
        }
      }
      resources.set(key, resource);
    }
  }
  return [...resources.values()]
    .map((item) => ({
      name: item.name,
      days: [...item.days.values()].sort((a, b) => a.date.localeCompare(b.date)),
      tasks: [...item.tasks.values()],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Exported alongside the panel so both views use the exact same workload calculation.
// eslint-disable-next-line react-refresh/only-export-components
export function buildResourceOverAllocations(
  tasks: readonly GanttTask[],
  capacities: ResourceCapacity,
  resolvedDates?: ReadonlyMap<string, ResourceResolvedDate>,
): ResourceOverAllocation[] {
  return buildResourceWorkloads(tasks, resolvedDates).flatMap((resource) => {
    const capacity = capacities[resource.name] ?? 100;
    const conflicts = resource.days.filter((day) => day.allocation > capacity);
    if (!conflicts.length) return [];
    const affectedTasks = new Map<string, GanttTask>();
    conflicts.forEach((day) => day.tasks.forEach((task) => affectedTasks.set(task.id, task)));
    return [
      {
        name: resource.name,
        capacity,
        peak: Math.max(...conflicts.map((day) => day.allocation)),
        days: conflicts.length,
        tasks: [...affectedTasks.values()],
      },
    ];
  });
}

export function ResourceWorkloadPanel({
  tasks,
  resolvedDates,
  capacities,
  onCapacityChange,
  onRename,
  onFilter,
  onTaskSelect,
  onClose,
}: {
  tasks: readonly GanttTask[];
  resolvedDates?: ReadonlyMap<string, ResourceResolvedDate>;
  capacities: ResourceCapacity;
  onCapacityChange(name: string, capacity: number): void;
  onRename(currentName: string, nextName: string): void;
  onFilter(name: string): void;
  onTaskSelect(id: string): void;
  onClose(): void;
}) {
  const [scale, setScale] = useState<"daily" | "weekly">("daily");
  const [renaming, setRenaming] = useState<string>();
  const [renameValue, setRenameValue] = useState("");
  const workloads = useMemo(() => buildResourceWorkloads(tasks, resolvedDates), [tasks, resolvedDates]);
  return (
    <aside className="task-inspector resource-workload" aria-label="Resource workload">
      <header>
        <strong>Resource workload</strong>
        <button onClick={onClose} aria-label="Close resource workload">
          ×
        </button>
      </header>
      <label className="workload-scale">
        Summary
        <select value={scale} onChange={(event) => setScale(event.target.value as "daily" | "weekly")}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </label>
      {workloads.length === 0 && <p className="empty-workload">Assign people to tasks to see workload.</p>}
      {workloads.map((resource) => {
        const capacity = capacities[resource.name] ?? 100;
        const buckets = scale === "daily" ? resource.days : weeklyBuckets(resource.days);
        const peak = Math.max(0, ...buckets.map((item) => item.allocation));
        const conflicts = buckets.filter((item) => item.allocation > capacity);
        return (
          <section className="resource-card" key={resource.name}>
            <div className="resource-title">
              <button className="resource-name" onClick={() => onFilter(resource.name)}>
                {resource.name}
              </button>
              <button
                aria-label={`Rename ${resource.name}`}
                onClick={() => {
                  setRenaming(resource.name);
                  setRenameValue(resource.name);
                }}
              >
                Rename
              </button>
            </div>
            {renaming === resource.name && (
              <form
                className="resource-rename"
                onSubmit={(event) => {
                  event.preventDefault();
                  onRename(resource.name, renameValue);
                  setRenaming(undefined);
                }}
              >
                <input
                  aria-label={`New name for ${resource.name}`}
                  autoFocus
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                />
                <button type="submit">Save</button>
                <button type="button" onClick={() => setRenaming(undefined)}>
                  Cancel
                </button>
              </form>
            )}
            <label>
              Capacity{" "}
              <span>
                <input
                  aria-label={`Capacity for ${resource.name}`}
                  type="number"
                  min="1"
                  max="500"
                  step="5"
                  value={capacity}
                  onChange={(event) => onCapacityChange(resource.name, Number(event.target.value))}
                />
                %
              </span>
            </label>
            <div className={`workload-meter${peak > capacity ? " overloaded" : ""}`}>
              <span style={{ width: `${Math.min(100, (peak / Math.max(1, capacity)) * 100)}%` }} />
            </div>
            <p>
              Peak {peak}% · {resource.tasks.length} task{resource.tasks.length === 1 ? "" : "s"}
            </p>
            <div className="resource-task-links">
              {resource.tasks.map((task) => (
                <button key={task.id} onClick={() => onTaskSelect(task.id)}>
                  {task.label}
                </button>
              ))}
            </div>
            {conflicts.length > 0 && (
              <details open>
                <summary>
                  {conflicts.length} over-allocation{conflicts.length === 1 ? "" : "s"}
                </summary>
                {conflicts.slice(0, 12).map((item) => (
                  <button key={item.date} onClick={() => item.tasks[0] && onTaskSelect(item.tasks[0].id)}>
                    <span>{item.date}</span>
                    <strong>{item.allocation}%</strong>
                  </button>
                ))}
              </details>
            )}
          </section>
        );
      })}
    </aside>
  );
}

function weeklyBuckets(days: WorkloadDay[]): WorkloadDay[] {
  const weeks = new Map<string, WorkloadDay>();
  for (const day of days) {
    const date = new Date(`${day.date}T00:00:00Z`);
    const weekday = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - weekday + 1);
    const key = `Week of ${date.toISOString().slice(0, 10)}`;
    const bucket = weeks.get(key) ?? { date: key, allocation: 0, tasks: [] };
    bucket.allocation = Math.max(bucket.allocation, day.allocation);
    bucket.tasks.push(...day.tasks.filter((task) => !bucket.tasks.some((item) => item.id === task.id)));
    weeks.set(key, bucket);
  }
  return [...weeks.values()];
}
