import { useMemo, useState } from "react";
import { MAX_WORKLOAD_CELLS, type GanttTask } from "@plantuml-studio/diagram-gantt";
import { taskElapsedDays } from "./gantt-schedule";
import { taskPauses, isWorkingDate, type GanttCalendar } from "./gantt-calendar";

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
  unscheduledTasks: Array<{ task: GanttTask; reason: string }>;
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
  end?: string;
  issue?: string;
  derived?: boolean;
}

const MAX_SCHEDULE_STEPS = 10_000;

export interface ResourceWorkWindow {
  start: string;
  days: number;
}

export function buildResourceWorkloads(
  tasks: readonly GanttTask[],
  resolvedDates?: ReadonlyMap<string, ResourceResolvedDate>,
  calendar?: GanttCalendar,
  workWindows?: ReadonlyMap<string, ResourceWorkWindow>,
): ResourceWorkload[] {
  let workBudget = MAX_WORKLOAD_CELLS;
  const resources = new Map<
    string,
    {
      name: string;
      days: Map<string, WorkloadDay>;
      tasks: Map<string, GanttTask>;
      unscheduledTasks: Array<{ task: GanttTask; reason: string }>;
    }
  >();
  for (const task of tasks) {
    for (const assignment of task.resources ?? []) {
      const key = assignment.value.toLocaleLowerCase();
      const resource = resources.get(key) ?? {
        name: assignment.value,
        days: new Map(),
        tasks: new Map(),
        unscheduledTasks: [] as ResourceWorkload["unscheduledTasks"],
      };
      resource.tasks.set(task.id, task);
      const window = workWindows?.get(task.id);
      const resolved = resolvedDates?.get(task.id);
      const rejected = resolvedDates && (!resolved?.start || resolved.issue || (resolved.derived && !resolved.end));
      if (rejected) {
        resource.unscheduledTasks.push({ task, reason: resolved?.issue ?? "Task dates cannot be resolved" });
        resources.set(key, resource);
        continue;
      }
      const start =
        window?.start ?? (resolvedDates ? resolved?.start : task.start?.resolved ? task.start.value : undefined);
      const duration = window ? window.days : taskElapsedDays(task);
      // Tasks defined by start and end dates (no `lasts`) occupy every working day of their
      // resolved window, matching the planned side of the forecast resource comparison.
      const end =
        window || duration || (task.milestone && !task.duration)
          ? undefined
          : resolvedDates
            ? resolved?.end
            : task.end?.resolved
              ? task.end.value
              : undefined;
      if (start && ((duration && duration > 0) || (end && end >= start))) {
        const pauses = taskPauses(task);
        const scheduledDays: string[] = [];
        // Cap the walk so a calendar that closes every day (or pauses covering them) cannot
        // freeze the tab; exhausting it simply leaves the rest of the task unscheduled.
        for (let index = 0; index < MAX_SCHEDULE_STEPS; index += 1) {
          if (--workBudget < 0) break;
          if (duration && scheduledDays.length >= duration) break;
          const date = new Date(`${start}T00:00:00Z`);
          date.setUTCDate(date.getUTCDate() + index);
          const value = date.toISOString().slice(0, 10);
          if (end && value > end) break;
          if (pauses.has(value) || (calendar && !isWorkingDate(value, calendar))) continue;
          scheduledDays.push(value);
        }
        if (duration && scheduledDays.length < duration) {
          resource.unscheduledTasks.push({ task, reason: "Not enough available working days to schedule this task" });
        } else {
          for (const value of scheduledDays) {
            const day = resource.days.get(value) ?? { date: value, allocation: 0, tasks: [] };
            day.allocation += assignment.allocation ?? 100;
            day.tasks.push(task);
            resource.days.set(value, day);
          }
        }
      } else if (!task.milestone) {
        resource.unscheduledTasks.push({ task, reason: "Task dates cannot be resolved" });
      }
      resources.set(key, resource);
    }
  }
  return [...resources.values()]
    .map((item) => ({
      name: item.name,
      days: [...item.days.values()].sort((a, b) => a.date.localeCompare(b.date)),
      tasks: [...item.tasks.values()],
      unscheduledTasks: item.unscheduledTasks,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Exported alongside the panel so both views use the exact same workload calculation.
// eslint-disable-next-line react-refresh/only-export-components
export function buildResourceOverAllocations(
  tasks: readonly GanttTask[],
  capacities: ResourceCapacity,
  resolvedDates?: ReadonlyMap<string, ResourceResolvedDate>,
  calendar?: GanttCalendar,
): ResourceOverAllocation[] {
  return buildResourceWorkloads(tasks, resolvedDates, calendar).flatMap((resource) => {
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
  calendar,
  capacities,
  onCapacityChange,
  onRename,
  onFilter,
  onTaskSelect,
  onClose,
}: {
  tasks: readonly GanttTask[];
  resolvedDates?: ReadonlyMap<string, ResourceResolvedDate>;
  calendar: GanttCalendar;
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
  const workloads = useMemo(
    () => buildResourceWorkloads(tasks, resolvedDates, calendar),
    [calendar, resolvedDates, tasks],
  );
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
            {resource.unscheduledTasks.length > 0 && (
              <details open>
                <summary>
                  {resource.unscheduledTasks.length} unscheduled task{resource.unscheduledTasks.length === 1 ? "" : "s"}{" "}
                  excluded from workload
                </summary>
                {resource.unscheduledTasks.map(({ task, reason }) => (
                  <button key={task.id} onClick={() => onTaskSelect(task.id)}>
                    {task.label}: {reason}
                  </button>
                ))}
              </details>
            )}
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
