import {
  applySourceEdits,
  normalizeTaskId,
  parseGantt,
  renameTask,
  setTaskDeclaration,
  setTaskResources,
  type GanttTask,
} from "@plantuml-studio/diagram-gantt";
import { validateGeneratedSource } from "./generated-source-validation";

export interface TaskRowValue {
  label: string;
  completion: string;
  duration: string;
  durationUnit: "day" | "week" | "month";
  resources: Array<{ name: string; allocation: string }>;
}
export interface TaskRowDraft {
  taskId: string;
  source: string;
  value: TaskRowValue;
}
export function taskRowValue(task: GanttTask): TaskRowValue {
  return {
    label: task.label,
    duration: task.duration ? String(task.duration.value) : "",
    durationUnit: task.duration?.unit ?? "day",
    completion: task.completion === undefined ? "" : String(task.completion.value),
    resources: (task.resources ?? []).map((r) => ({
      name: r.value,
      allocation: r.allocation === undefined ? "" : String(r.allocation),
    })),
  };
}
export type TaskRowEdit = { source: string; taskId: string; original: GanttTask; task: GanttTask } | { error: string };
/** Apply only changed fields; never rewrite scheduling, notes or unsupported statements. */
export function editTaskRow(source: string, draft: TaskRowDraft): TaskRowEdit {
  if (source !== draft.source)
    return { error: "Diagram source changed while this row was being edited. Reload the row or cancel." };
  const document = parseGantt(source).document;
  const original = document.symbols.tasks.get(draft.taskId);
  if (!original || !original.declarations.length) return { error: "This task no longer has an editable declaration." };
  if (original.milestone) return { error: "Edit milestones using Details." };
  const value = draft.value,
    label = value.label.trim();
  if (!label || /[\r\n[\]]/.test(label) || Array.from(label).some((char) => char.charCodeAt(0) < 32))
    return { error: "Task name is required and cannot contain brackets or line breaks." };
  const completion = value.completion.trim();
  if (completion && (!/^\d+$/.test(completion) || Number(completion) > 100))
    return { error: "Progress must be a whole number from 0 to 100, or blank." };
  const prior = taskRowValue(original);
  const duration = value.duration.trim();
  const durationChanged = duration !== prior.duration || value.durationUnit !== prior.durationUnit;
  if (durationChanged) {
    if (!/^[1-9]\d*$/.test(duration) || !Number.isSafeInteger(Number(duration)))
      return { error: "Duration must be a positive whole number." };
    if (!["day", "week", "month"].includes(value.durationUnit))
      return { error: "Choose days, weeks or months for duration." };
    if (
      original.end ||
      document.dependencies.some(
        (dependency) => dependency.successorTaskId === original.id && dependency.relation.startsWith("end-"),
      )
    )
      return { error: "This task has an end constraint. Adjust its schedule in Details before changing duration." };
    if (original.declarations.filter((d) => d.kind === "duration").length > 1)
      return { error: "Resolve multiple duration declarations in source before editing duration." };
  }
  const resourceChanged = JSON.stringify(value.resources) !== JSON.stringify(prior.resources);
  if (resourceChanged) {
    const names = new Set<string>();
    for (const resource of value.resources) {
      const name = resource.name.trim(),
        allocation = resource.allocation.trim();
      if (!name || /[{}:\r\n]/.test(name) || Array.from(name).some((char) => char.charCodeAt(0) < 32))
        return { error: "Each resource needs a name without braces, colon or line breaks." };
      if (allocation && (!/^\d+$/.test(allocation) || Number(allocation) < 1 || Number(allocation) > 100))
        return { error: "Resource allocation must be a whole number from 1 to 100, or blank for the default." };
      const key = name.toLocaleLowerCase();
      if (names.has(key)) return { error: "Assign each resource only once." };
      names.add(key);
    }
  }
  const renamed = renameTask(source, document, original, label);
  if (renamed.unavailableReason) return { error: renamed.unavailableReason };
  let next = applySourceEdits(source, renamed.edits);
  const taskId = original.alias ? original.id : normalizeTaskId(label);
  const current = () => parseGantt(next).document.symbols.tasks.get(taskId);
  if (completion !== prior.completion) {
    const task = current();
    if (!task) return { error: "Could not locate the renamed task." };
    if (task.declarations.filter((d) => d.kind === "completion").length > 1)
      return { error: "This task has multiple progress declarations. Resolve them in source before editing progress." };
    const operation = setTaskDeclaration(
      next,
      task,
      "completion",
      completion ? `is ${Number(completion)}% completed` : undefined,
    );
    if (operation.unavailableReason) return { error: operation.unavailableReason };
    next = applySourceEdits(next, operation.edits);
  }
  if (durationChanged) {
    const task = current();
    if (!task) return { error: "Could not locate the task." };
    const operation = setTaskDeclaration(next, task, "duration", `lasts ${Number(duration)} ${value.durationUnit}s`);
    if (operation.unavailableReason) return { error: operation.unavailableReason };
    next = applySourceEdits(next, operation.edits);
  }
  if (resourceChanged) {
    const task = current();
    if (!task) return { error: "Could not locate the task." };
    const resources = value.resources.map((r) => ({
      name: r.name.trim(),
      ...(r.allocation.trim() ? { allocation: Number(r.allocation) } : {}),
    }));
    const operation = setTaskResources(next, task, resources);
    if (operation.unavailableReason) return { error: operation.unavailableReason };
    next = applySourceEdits(next, operation.edits);
    const actual = current()?.resources ?? [];
    if (
      actual.length !== resources.length ||
      actual.some((r, i) => r.value !== resources[i]?.name || r.allocation !== resources[i]?.allocation)
    )
      return { error: "These resource names cannot be represented safely. No changes were applied." };
  }
  const validation = validateGeneratedSource("gantt", source, next);
  if (!validation.valid) return { error: validation.message ?? "This edit would produce invalid source." };
  const task = current();
  if (!task) return { error: "Could not locate the edited task." };
  return { source: next, taskId, original, task };
}

/** Stage all mutations locally; callers commit only the final source once. */
export function editTaskRows(
  source: string,
  drafts: readonly TaskRowDraft[],
):
  | { source: string; edits: Array<{ original: GanttTask; task: GanttTask; taskId: string }> }
  | { error: string; taskId: string } {
  const originals = parseGantt(source).document.symbols.tasks;
  const ids = new Set<string>();
  for (const draft of drafts) {
    if (ids.has(draft.taskId)) return { error: "A task can appear only once in a batch.", taskId: draft.taskId };
    ids.add(draft.taskId);
    const check = editTaskRow(source, draft);
    if ("error" in check) return { ...check, taskId: draft.taskId };
  }
  let next = source;
  const edits: Array<{ original: GanttTask; task: GanttTask; taskId: string }> = [];
  for (const draft of drafts) {
    const result = editTaskRow(next, { ...draft, source: next });
    if ("error" in result) return { ...result, taskId: draft.taskId };
    next = result.source;
    edits.push({ original: originals.get(draft.taskId)!, task: result.task, taskId: result.taskId });
  }
  const final = parseGantt(next).document.symbols.tasks;
  return { source: next, edits: edits.map((edit) => ({ ...edit, task: final.get(edit.taskId)! })) };
}
