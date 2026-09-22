import {
  applySourceEdits,
  ganttAdapter,
  parseGantt,
  setTaskDeclaration,
  setTaskResources,
  updateDependency,
  type GanttVisualOperation,
  type GanttTask,
} from "@plantuml-studio/diagram-gantt";

export interface ScenarioTaskInput {
  duration: string;
  durationUnit: "day" | "week" | "month";
  startDate?: string;
  endDate: string;
  completion: string;
  resources: Array<{ name: string; allocation: string }>;
}

export type ScenarioTaskEditResult = { source: string; error?: string };

export function applyScenarioVisualOperation(source: string, operation: GanttVisualOperation): ScenarioTaskEditResult {
  const document = parseGantt(source).document;
  let result = ganttAdapter.applyVisualOperation(operation, document, source);
  if (operation.kind === "move-task" && result.unavailableReason) {
    const dependency = document.dependencies.find((item) => item.successorTaskId === operation.taskId);
    const predecessor = dependency ? document.symbols.tasks.get(dependency.predecessorTaskId) : undefined;
    const successor = document.symbols.tasks.get(operation.taskId);
    if (dependency && predecessor && successor) {
      const currentOffset = (dependency.direction === "before" ? -1 : 1) * (dependency.offset?.value ?? 0);
      const nextOffset = currentOffset + operation.days;
      result = updateDependency(source, dependency, {
        predecessorLabel: predecessor.alias?.value ?? predecessor.label,
        successorLabel: successor.alias?.value ?? successor.label,
        relation: dependency.relation,
        offset: Math.abs(nextOffset),
        direction: nextOffset < 0 ? "before" : "after",
        ...(dependency.color?.value ? { color: dependency.color.value } : {}),
        lineStyle: dependency.lineStyle?.value ?? "solid",
      });
    }
  }
  return result.unavailableReason
    ? { source, error: result.unavailableReason }
    : { source: applySourceEdits(source, result.edits) };
}

export function updateScenarioTask(source: string, taskId: string, input: ScenarioTaskInput): ScenarioTaskEditResult {
  const duration = input.duration === "" ? undefined : Number(input.duration);
  const completion = input.completion === "" ? undefined : Number(input.completion);
  if (duration !== undefined && (!Number.isInteger(duration) || duration < 1))
    return { source, error: "Duration must be a positive whole number" };
  if (completion !== undefined && (!Number.isInteger(completion) || completion < 0 || completion > 100))
    return { source, error: "Completion must be a whole number from 0 to 100" };
  if (input.startDate !== undefined && input.startDate !== "" && !validDate(input.startDate))
    return { source, error: "Start date must use YYYY-MM-DD" };
  if (input.endDate && !validDate(input.endDate)) return { source, error: "End date must use YYYY-MM-DD" };

  const resources = input.resources
    .filter((item) => item.name.trim() || item.allocation.trim())
    .map((item) => ({
      name: item.name.trim(),
      ...(item.allocation.trim() ? { allocation: Number(item.allocation) } : {}),
    }));
  if (
    resources.some(
      (item) =>
        !item.name ||
        (item.allocation !== undefined &&
          (!Number.isInteger(item.allocation) || item.allocation < 1 || item.allocation > 100)),
    )
  )
    return { source, error: "Resource allocations must be whole numbers from 1 to 100" };

  let next = source;
  const task = (): GanttTask | undefined => parseGantt(next).document.symbols.tasks.get(taskId);
  const declaration = (
    kind: "start" | "end" | "duration" | "completion",
    statement: string | undefined,
  ): string | undefined => {
    const current = task();
    if (!current) return "The selected task no longer exists";
    const operation = setTaskDeclaration(next, current, kind, statement);
    if (operation.unavailableReason) return operation.unavailableReason;
    next = applySourceEdits(next, operation.edits);
  };

  if (input.startDate !== undefined) {
    const error = declaration("start", input.startDate ? `starts ${input.startDate}` : undefined);
    if (error) return { source, error };
  }
  let error = declaration("end", input.endDate ? `ends ${input.endDate}` : undefined);
  if (error) return { source, error };
  error = declaration(
    "duration",
    duration === undefined ? undefined : `lasts ${duration} ${input.durationUnit}${duration === 1 ? "" : "s"}`,
  );
  if (error) return { source, error };
  error = declaration("completion", completion === undefined ? undefined : `is ${completion}% completed`);
  if (error) return { source, error };

  const current = task();
  if (!current) return { source, error: "The selected task no longer exists" };
  const resourceOperation = setTaskResources(next, current, resources);
  if (resourceOperation.unavailableReason) return { source, error: resourceOperation.unavailableReason };
  next = applySourceEdits(next, resourceOperation.edits);
  return { source: next };
}

const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
