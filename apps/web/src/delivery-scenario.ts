import { parseGantt, type GanttDependency, type GanttTask } from "@plantuml-studio/diagram-gantt";
import { parseGanttCalendar, type GanttCalendar } from "./gantt-calendar";
import { resolveTaskDates, type ResolvedTaskDates } from "./gantt-schedule";
import { analyzeCriticalPath } from "./schedule-analysis";
import {
  buildResourceOverAllocations,
  type ResourceCapacity,
  type ResourceOverAllocation,
} from "./ResourceWorkloadPanel";

export type ScenarioChangeKind = "added" | "removed" | "changed";

export interface ScenarioTaskChange {
  taskId: string;
  label: string;
  kind: ScenarioChangeKind;
  changedFields: string[];
  before?: ResolvedTaskDates;
  after?: ResolvedTaskDates;
  startDeltaDays?: number;
  endDeltaDays?: number;
}

export interface ScenarioDependencyChange {
  kind: "added" | "removed";
  predecessorTaskId: string;
  successorTaskId: string;
  relation: GanttDependency["relation"];
}

export interface ScenarioCause {
  kind: "task" | "dependency" | "calendar";
  taskId?: string;
  label: string;
  detail: string;
}

export interface ScenarioMilestoneChange {
  taskId: string;
  label: string;
  before?: string;
  after?: string;
  deltaDays?: number;
  causes: ScenarioCause[];
}

export interface ScenarioConflictChange {
  kind: "new" | "resolved" | "changed";
  resource: string;
  before?: ResourceOverAllocation;
  after?: ResourceOverAllocation;
}

export interface DeliveryScenarioComparison {
  issues: string[];
  taskChanges: ScenarioTaskChange[];
  dependencyChanges: ScenarioDependencyChange[];
  milestoneChanges: ScenarioMilestoneChange[];
  resourceConflictChanges: ScenarioConflictChange[];
  criticalPath: {
    before: string[];
    after: string[];
    added: string[];
    removed: string[];
    durationDeltaDays: number;
  };
}

const DAY_MS = 86_400_000;
const dateDelta = (after?: string, before?: string) =>
  after && before
    ? Math.round((Date.parse(`${after}T00:00:00Z`) - Date.parse(`${before}T00:00:00Z`)) / DAY_MS)
    : undefined;

function projectStart(document: ReturnType<typeof parseGantt>["document"]): string | undefined {
  return document.projectStart?.resolved ? document.projectStart.value : undefined;
}

function resolve(source: string) {
  const parsed = parseGantt(source);
  const calendar = parseGanttCalendar(source);
  const dates = resolveTaskDates(
    parsed.document.tasks,
    parsed.document.dependencies,
    projectStart(parsed.document),
    calendar,
  );
  for (const task of parsed.document.tasks) {
    if (!task.milestone || "resolved" in task.milestone || dates.get(task.id)?.end) continue;
    const referencedId =
      parsed.document.symbols.references.get(task.milestone.value.toLocaleLowerCase()) ??
      task.milestone.value.toLocaleLowerCase();
    const referenced = dates.get(referencedId);
    const value = referenced?.end ?? referenced?.start;
    if (value) dates.set(task.id, { start: value, end: value, derived: true });
  }
  return { ...parsed, calendar, dates };
}

function dependencyKey(dependency: GanttDependency): string {
  return [
    dependency.predecessorTaskId,
    dependency.successorTaskId,
    dependency.relation,
    dependency.direction ?? "after",
    dependency.offset?.value ?? 0,
  ].join("|");
}

function calendarKey(calendar: GanttCalendar): string {
  return [calendar.closedWeekdays, calendar.closedDates, calendar.openedDates]
    .map((values) => [...values].sort().join(","))
    .join("|");
}

function taskFields(task: GanttTask): Record<string, string> {
  return {
    label: task.label,
    duration: `${task.duration?.value ?? ""}:${task.duration?.unit ?? ""}`,
    start: task.start?.value ?? "",
    end: task.end?.value ?? "",
    milestone: task.milestone?.value ?? "",
    resources: (task.resources ?? [])
      .map((item) => `${item.value}:${item.allocation ?? 100}`)
      .sort()
      .join("|"),
    pauses: (task.pauses ?? [])
      .map((item) => item.value)
      .sort()
      .join("|"),
  };
}

function changedFields(before: GanttTask, after: GanttTask): string[] {
  const left = taskFields(before);
  const right = taskFields(after);
  return Object.keys(left).filter((key) => left[key] !== right[key]);
}

function taskChanges(
  beforeTasks: readonly GanttTask[],
  afterTasks: readonly GanttTask[],
  beforeDates: ReadonlyMap<string, ResolvedTaskDates>,
  afterDates: ReadonlyMap<string, ResolvedTaskDates>,
): ScenarioTaskChange[] {
  const beforeById = new Map(beforeTasks.map((task) => [task.id, task]));
  const afterById = new Map(afterTasks.map((task) => [task.id, task]));
  const result: ScenarioTaskChange[] = [];
  for (const id of new Set([...beforeById.keys(), ...afterById.keys()])) {
    const before = beforeById.get(id);
    const after = afterById.get(id);
    const beforeDate = beforeDates.get(id);
    const afterDate = afterDates.get(id);
    const startDeltaDays = dateDelta(afterDate?.start, beforeDate?.start);
    const endDeltaDays = dateDelta(afterDate?.end, beforeDate?.end);
    const fields = before && after ? changedFields(before, after) : [];
    if (beforeDate?.start !== afterDate?.start) fields.push("resolvedStart");
    if (beforeDate?.end !== afterDate?.end) fields.push("resolvedEnd");
    if (before && after && !fields.length) continue;
    result.push({
      taskId: id,
      label: after?.label ?? before?.label ?? id,
      kind: !before ? "added" : !after ? "removed" : "changed",
      changedFields: [...new Set(fields)],
      ...(beforeDate ? { before: beforeDate } : {}),
      ...(afterDate ? { after: afterDate } : {}),
      ...(startDeltaDays !== undefined ? { startDeltaDays } : {}),
      ...(endDeltaDays !== undefined ? { endDeltaDays } : {}),
    });
  }
  return result;
}

function dependencyChanges(
  before: readonly GanttDependency[],
  after: readonly GanttDependency[],
): ScenarioDependencyChange[] {
  const left = new Map(before.map((item) => [dependencyKey(item), item]));
  const right = new Map(after.map((item) => [dependencyKey(item), item]));
  return [
    ...[...left].filter(([key]) => !right.has(key)).map(([, item]) => ({ kind: "removed" as const, ...item })),
    ...[...right].filter(([key]) => !left.has(key)).map(([, item]) => ({ kind: "added" as const, ...item })),
  ].map(({ kind, predecessorTaskId, successorTaskId, relation }) => ({
    kind,
    predecessorTaskId,
    successorTaskId,
    relation,
  }));
}

function milestoneCauses(
  milestoneId: string,
  milestoneReferenceId: string | undefined,
  changes: readonly ScenarioTaskChange[],
  dependencies: readonly GanttDependency[],
  dependencyDiff: readonly ScenarioDependencyChange[],
  calendarChanged: boolean,
): ScenarioCause[] {
  const changed = new Map(changes.map((item) => [item.taskId, item]));
  const incoming = new Map<string, string[]>();
  for (const dependency of dependencies)
    incoming.set(dependency.successorTaskId, [
      ...(incoming.get(dependency.successorTaskId) ?? []),
      dependency.predecessorTaskId,
    ]);
  const reachable = new Set<string>();
  const queue = [milestoneId, ...(milestoneReferenceId ? [milestoneReferenceId] : [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    queue.push(...(incoming.get(id) ?? []));
  }
  const causes: ScenarioCause[] = [...reachable].flatMap((id) => {
    const change = changed.get(id);
    const inputs = change?.changedFields.filter((field) => !field.startsWith("resolved")) ?? [];
    return inputs.length
      ? [{ kind: "task" as const, taskId: id, label: change!.label, detail: `Changed ${inputs.join(", ")}` }]
      : [];
  });
  for (const change of dependencyDiff)
    if (reachable.has(change.successorTaskId))
      causes.push({
        kind: "dependency",
        taskId: change.successorTaskId,
        label: `${change.predecessorTaskId} → ${change.successorTaskId}`,
        detail: `${change.kind === "added" ? "Added" : "Removed"} ${change.relation} dependency`,
      });
  if (calendarChanged)
    causes.push({ kind: "calendar", label: "Working calendar", detail: "Calendar exceptions changed" });
  return causes;
}

function conflictChanges(
  before: readonly ResourceOverAllocation[],
  after: readonly ResourceOverAllocation[],
): ScenarioConflictChange[] {
  const left = new Map(before.map((item) => [item.name.toLocaleLowerCase(), item]));
  const right = new Map(after.map((item) => [item.name.toLocaleLowerCase(), item]));
  const result: ScenarioConflictChange[] = [];
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const previous = left.get(key);
    const next = right.get(key);
    if (
      previous &&
      next &&
      previous.peak === next.peak &&
      previous.days === next.days &&
      previous.capacity === next.capacity
    )
      continue;
    result.push({
      kind: !previous ? "new" : !next ? "resolved" : "changed",
      resource: next?.name ?? previous!.name,
      ...(previous ? { before: previous } : {}),
      ...(next ? { after: next } : {}),
    });
  }
  return result;
}

export function compareDeliveryScenarios(
  currentSource: string,
  scenarioSource: string,
  capacities: ResourceCapacity = {},
): DeliveryScenarioComparison {
  const current = resolve(currentSource);
  const scenario = resolve(scenarioSource);
  const tasks = taskChanges(current.document.tasks, scenario.document.tasks, current.dates, scenario.dates);
  const dependencies = dependencyChanges(current.document.dependencies, scenario.document.dependencies);
  const calendarChanged = calendarKey(current.calendar) !== calendarKey(scenario.calendar);
  const beforeCritical = analyzeCriticalPath(
    current.document.tasks,
    current.document.dependencies,
    current.dates,
    current.calendar,
  );
  const afterCritical = analyzeCriticalPath(
    scenario.document.tasks,
    scenario.document.dependencies,
    scenario.dates,
    scenario.calendar,
  );
  const beforeIds = beforeCritical.orderedTaskIds;
  const afterIds = afterCritical.orderedTaskIds;
  return {
    issues: [...current.diagnostics, ...scenario.diagnostics]
      .filter((item) => item.severity !== "info")
      .map((item) => item.message),
    taskChanges: tasks,
    dependencyChanges: dependencies,
    milestoneChanges: scenario.document.tasks
      .filter((task) => task.milestone)
      .flatMap((task) => {
        const before = current.dates.get(task.id)?.end;
        const after = scenario.dates.get(task.id)?.end;
        const deltaDays = dateDelta(after, before);
        if (before === after) return [];
        return [
          {
            taskId: task.id,
            label: task.label,
            ...(before ? { before } : {}),
            ...(after ? { after } : {}),
            ...(deltaDays !== undefined ? { deltaDays } : {}),
            causes: milestoneCauses(
              task.id,
              task.milestone && !("resolved" in task.milestone)
                ? (scenario.document.symbols.references.get(task.milestone.value.toLocaleLowerCase()) ??
                    task.milestone.value.toLocaleLowerCase())
                : undefined,
              tasks,
              scenario.document.dependencies,
              dependencies,
              calendarChanged,
            ),
          },
        ];
      }),
    resourceConflictChanges: conflictChanges(
      buildResourceOverAllocations(current.document.tasks, capacities, current.dates, current.calendar),
      buildResourceOverAllocations(scenario.document.tasks, capacities, scenario.dates, scenario.calendar),
    ),
    criticalPath: {
      before: beforeIds,
      after: afterIds,
      added: afterIds.filter((id) => !beforeCritical.taskIds.has(id)),
      removed: beforeIds.filter((id) => !afterCritical.taskIds.has(id)),
      durationDeltaDays: afterCritical.projectDuration - beforeCritical.projectDuration,
    },
  };
}
