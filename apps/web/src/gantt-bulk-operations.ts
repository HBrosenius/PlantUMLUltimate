import {
  applySourceEdits,
  deleteTask,
  duplicateTask,
  moveTaskByDays,
  normalizeTaskId,
  parseGantt,
  setTaskDeclaration,
  setTaskResources,
  type GanttTask,
  type MoveTaskResult,
} from "@plantuml-studio/diagram-gantt";

/** The full line (including its line break) containing `range`. */
function wholeLineRange(source: string, range: { from: number; to: number }) {
  const from = source.lastIndexOf("\n", Math.max(0, range.from - 1)) + 1;
  const end = source.indexOf("\n", range.to);
  return { from, to: end < 0 ? source.length : end + 1 };
}

export interface BulkTaskResult {
  source: string;
  /** Tasks the operation changed, in selection order. */
  applied: string[];
  /** Labels of tasks the operation could not change, with the reason. */
  skipped: Array<{ label: string; reason: string }>;
}

/**
 * Applies one task operation to each selected task in turn. The source is reparsed between tasks
 * because every edit shifts the offsets of later declarations.
 */
function eachTask(
  source: string,
  taskIds: readonly string[],
  operation: (current: string, task: GanttTask) => MoveTaskResult,
): BulkTaskResult {
  let current = source;
  const applied: string[] = [];
  const skipped: BulkTaskResult["skipped"] = [];
  for (const id of new Set(taskIds)) {
    const task = parseGantt(current).document.symbols.tasks.get(id);
    if (!task) continue;
    const result = operation(current, task);
    if (result.unavailableReason) skipped.push({ label: task.label, reason: result.unavailableReason });
    else if (result.edits.length) {
      current = applySourceEdits(current, result.edits);
      applied.push(id);
    }
  }
  return { source: current, applied, skipped };
}

export const moveTasksByDays = (source: string, taskIds: readonly string[], days: number) =>
  eachTask(source, taskIds, (_current, task) => moveTaskByDays(task, days));

export const setTasksColor = (source: string, taskIds: readonly string[], color: string) =>
  eachTask(source, taskIds, (current, task) =>
    setTaskDeclaration(current, task, "color", color.trim() ? `is colored in ${color.trim()}` : undefined),
  );

export const setTasksCompletion = (source: string, taskIds: readonly string[], completion: number | undefined) =>
  eachTask(source, taskIds, (current, task) =>
    setTaskDeclaration(
      current,
      task,
      "completion",
      completion === undefined ? undefined : `is ${completion}% completed`,
    ),
  );

export const setTasksResource = (source: string, taskIds: readonly string[], resource: string, allocation = 100) =>
  eachTask(source, taskIds, (current, task) =>
    setTaskResources(current, task, resource.trim() ? [{ name: resource.trim(), allocation }] : []),
  );

export const deleteTasks = (source: string, taskIds: readonly string[]) =>
  eachTask(source, taskIds, (current, task) => deleteTask(current, parseGantt(current).document, task));

/** Duplicates each task after itself and returns the copies' IDs in selection order. */
export function duplicateTasks(source: string, taskIds: readonly string[]): BulkTaskResult & { copies: string[] } {
  const copies: string[] = [];
  const result = eachTask(source, taskIds, (current, task) => {
    const duplicated = duplicateTask(current, parseGantt(current).document, task);
    if (duplicated.taskId && !duplicated.unavailableReason) copies.push(duplicated.taskId);
    return duplicated;
  });
  return { ...result, copies };
}

/** A short summary such as "Moved 3 tasks · skipped Design (no explicit date)". */
export function describeBulkResult(verb: string, result: BulkTaskResult): string {
  const count = result.applied.length;
  const changed = `${verb} ${count} task${count === 1 ? "" : "s"}`;
  if (!result.skipped.length) return changed;
  const skipped = result.skipped.map((item) => `${item.label} (${item.reason.replace(/\.$/, "")})`).join(", ");
  return `${changed} · skipped ${skipped}`;
}

/**
 * PlantUML lines for the selected tasks: their declarations and notes, plus dependency lines whose
 * tasks are both selected. Dependencies on unselected tasks are left out.
 */
export function copyTasksText(source: string, taskIds: readonly string[]): string {
  const { document } = parseGantt(source);
  const selected = new Set(taskIds);
  const dependencyLines = new Map<string, (typeof document.dependencies)[number]>(
    document.dependencies.map((item) => {
      const line = wholeLineRange(source, item.sourceRange);
      return [`${line.from}:${line.to}`, item] as const;
    }),
  );
  const ranges = new Map<string, { from: number; to: number }>();
  for (const id of selected) {
    const task = document.symbols.tasks.get(id);
    if (!task) continue;
    for (const range of [
      ...task.declarations.map((item) => item.range),
      ...(task.notes ?? []).map((note) => note.sourceRange),
    ]) {
      const line = wholeLineRange(source, range);
      const key = `${line.from}:${line.to}`;
      const dependency = dependencyLines.get(key);
      if (dependency && !(selected.has(dependency.predecessorTaskId) && selected.has(dependency.successorTaskId)))
        continue;
      ranges.set(key, line);
    }
  }
  return [...ranges.values()]
    .sort((left, right) => left.from - right.from)
    .map((range) => source.slice(range.from, range.to).replace(/\r?\n$/, ""))
    .join("\n");
}

/**
 * Inserts copied task lines before `@endgantt`. Tasks whose names or aliases already exist in the
 * target are renamed ("Design copy", "design_copy") throughout the pasted lines.
 */
export function pasteTasksText(target: string, text: string): { source: string; taskIds: string[] } {
  const pasted = parseGantt(`@startgantt\n${text}\n@endgantt`).document;
  if (!pasted.tasks.length) return { source: target, taskIds: [] };
  const existing = parseGantt(target).document.symbols;
  const taken = new Set([...existing.tasks.keys(), ...existing.references.keys()]);
  const unique = (value: string, separator: string) => {
    if (!taken.has(normalizeTaskId(value))) return value;
    for (let index = 1; ; index += 1) {
      const candidate = index === 1 ? `${value}${separator}copy` : `${value}${separator}copy${separator}${index}`;
      if (!taken.has(normalizeTaskId(candidate))) return candidate;
    }
  };
  const renames = new Map<string, string>();
  const taskIds: string[] = [];
  for (const task of pasted.tasks) {
    const label = unique(task.label, " ");
    taken.add(normalizeTaskId(label));
    renames.set(normalizeTaskId(task.label), label);
    const alias = task.alias ? unique(task.alias.value, "_") : undefined;
    if (task.alias && alias) {
      taken.add(normalizeTaskId(alias));
      renames.set(normalizeTaskId(task.alias.value), alias);
    }
    taskIds.push(normalizeTaskId(alias ?? label));
  }
  const block = text.replace(/\[([^\]]+)]/g, (match, value: string) => {
    const renamed = renames.get(normalizeTaskId(value));
    return renamed ? `[${renamed}]` : match;
  });
  const end = /^[ \t]*@endgantt\b/im.exec(target);
  const at = end ? end.index : target.length;
  const prefix = at > 0 && target[at - 1] !== "\n" ? "\n" : "";
  return { source: `${target.slice(0, at)}${prefix}${block}\n${target.slice(at)}`, taskIds };
}
