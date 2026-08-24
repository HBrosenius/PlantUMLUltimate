import type { GanttDependency, GanttDocument, GanttNote, GanttTask, TaskDeclaration } from "./model";
import type { SourceEdit } from "./source-edits";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function workingDaysBetween(source: string, start: string, end: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return undefined;
  const closedWeekdays = new Set<number>();
  const closedDates = new Set<string>();
  const openedDates = new Set<string>();
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    const weekday = line.match(
      /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(?:is|are)\s+(closed|opened)$/i,
    );
    if (weekday?.[1] && weekday[2]) {
      const day = WEEKDAYS.indexOf(weekday[1].toLowerCase());
      if (weekday[2].toLowerCase() === "closed") closedWeekdays.add(day);
      else closedWeekdays.delete(day);
      continue;
    }
    const dateRule = line.match(
      /^(\d{4}[-/]\d{2}[-/]\d{2})(?:\s+to\s+(\d{4}[-/]\d{2}[-/]\d{2}))?\s+(?:is|are)\s+(closed|opened)$/i,
    );
    if (!dateRule?.[1] || !dateRule[3]) continue;
    let date = dateRule[1].replaceAll("/", "-");
    const last = (dateRule[2] ?? dateRule[1]).replaceAll("/", "-");
    while (date <= last) {
      if (dateRule[3].toLowerCase() === "closed") {
        closedDates.add(date);
        openedDates.delete(date);
      } else {
        openedDates.add(date);
        closedDates.delete(date);
      }
      date = shiftIsoDate(date, 1)!;
    }
  }
  let count = 0;
  for (let date = start; date <= end; date = shiftIsoDate(date, 1)!) {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (openedDates.has(date) || (!closedDates.has(date) && !closedWeekdays.has(day))) count += 1;
  }
  return Math.max(1, count);
}

function shiftIsoDate(value: string, days: number): string | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match?.[1] || !match[2] || !match[3]) return undefined;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.valueOf())) return undefined;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export interface MoveTaskResult {
  edits: SourceEdit[];
  unavailableReason?: string;
}

export function moveTaskByDays(task: GanttTask, days: number): MoveTaskResult {
  if (!Number.isInteger(days)) return { edits: [], unavailableReason: "Task movement must use whole days" };
  if (days === 0) return { edits: [] };

  const fixedMilestone = task.milestone && "resolved" in task.milestone ? task.milestone : undefined;
  const candidates = [task.start, task.end, fixedMilestone].filter((value) => value !== undefined);
  if (candidates.length === 0) return { edits: [], unavailableReason: "Task has no explicit date to move" };

  const edits: SourceEdit[] = [];
  for (const expression of candidates) {
    const shifted = shiftIsoDate(expression.value, days);
    if (!expression.resolved || !shifted) {
      return { edits: [], unavailableReason: "Task uses a date expression that cannot be moved safely" };
    }
    edits.push({ range: expression.range, text: shifted });
  }
  return { edits };
}

export function resizeTaskByDays(task: GanttTask, deltaDays: number): MoveTaskResult {
  if (!Number.isInteger(deltaDays)) return { edits: [], unavailableReason: "Task resizing must use whole days" };
  const duration = task.duration;
  if (!duration) return { edits: [], unavailableReason: "Task has no explicit duration to resize" };
  const unitDays = duration.unit === "month" ? 30 : duration.unit === "week" ? 7 : 1;
  const currentDays = duration.value * unitDays;
  const nextDays = currentDays + deltaDays;
  if (nextDays < 1) return { edits: [], unavailableReason: "Task duration must be at least one day" };
  if (nextDays % unitDays !== 0) {
    return {
      edits: [],
      unavailableReason: `${duration.unit === "month" ? "Month" : "Week"}-based durations must resize in whole ${duration.unit}s`,
    };
  }
  const nextValue = nextDays / unitDays;
  return { edits: [{ range: duration.range, text: String(nextValue) }] };
}

export interface DependentMoveResult extends MoveTaskResult {
  affectedTaskIds: string[];
  affectedLabels: string[];
}

export function moveDependentTasksByDays(
  document: GanttDocument,
  rootTaskId: string,
  days: number,
): DependentMoveResult {
  const adjacency = new Map<string, string[]>();
  for (const dependency of document.dependencies) {
    const next = adjacency.get(dependency.predecessorTaskId) ?? [];
    if (!next.includes(dependency.successorTaskId)) next.push(dependency.successorTaskId);
    adjacency.set(dependency.predecessorTaskId, next);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: string[] = [];
  let cycle = false;
  const walk = (id: string) => {
    if (visiting.has(id)) {
      cycle = true;
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const successor of adjacency.get(id) ?? []) {
      walk(successor);
      if (!ordered.includes(successor)) ordered.push(successor);
    }
    visiting.delete(id);
    visited.add(id);
  };
  walk(rootTaskId);
  if (cycle)
    return {
      edits: [],
      affectedTaskIds: [],
      affectedLabels: [],
      unavailableReason: "A dependency cycle prevents cascading this schedule change",
    };
  const edits: SourceEdit[] = [];
  const affectedTaskIds: string[] = [];
  const affectedLabels: string[] = [];
  for (const id of ordered) {
    const task = document.symbols.tasks.get(id);
    if (!task || (!task.start?.resolved && !task.end?.resolved)) continue;
    const moved = moveTaskByDays(task, days);
    if (moved.unavailableReason) continue;
    edits.push(...moved.edits);
    affectedTaskIds.push(id);
    affectedLabels.push(task.label);
  }
  return { edits, affectedTaskIds, affectedLabels };
}

export function createDependency(source: string, predecessor: GanttTask, successor: GanttTask): MoveTaskResult {
  if (predecessor.id === successor.id) return { edits: [], unavailableReason: "A task cannot depend on itself" };
  const predecessorReference = predecessor.alias?.value ?? predecessor.label;
  const successorReference = successor.alias?.value ?? successor.label;
  const dependencyStatement = (declarationSource = "") => {
    const resources = declarationSource.match(/\bon\s+((?:\{[^}\r\n]+}\s*)+)/i)?.[1]?.trim();
    return `[${successorReference}]${resources ? ` on ${resources}` : ""} starts at [${predecessorReference}]'s end`;
  };
  const statement = dependencyStatement();
  const explicitStart = successor.start
    ? successor.declarations.find(
        (item) =>
          item.kind === "start" &&
          item.range.from <= successor.start!.range.from &&
          item.range.to >= successor.start!.range.to,
      )
    : undefined;
  const preservedDuration =
    !successor.duration && successor.start?.resolved && successor.end?.resolved
      ? workingDaysBetween(source, successor.start.value, successor.end.value)
      : undefined;
  const durationClause = preservedDuration
    ? `lasts ${preservedDuration} ${preservedDuration === 1 ? "day" : "days"}`
    : undefined;
  if (explicitStart) {
    if (explicitStart.inline) {
      const lineFrom = source.lastIndexOf("\n", explicitStart.range.from - 1) + 1;
      const nextLineBreak = source.indexOf("\n", explicitStart.range.to);
      const lineTo = nextLineBreak < 0 ? source.length : nextLineBreak;
      const originalLine = source.slice(lineFrom, lineTo);
      const clauseFrom = explicitStart.range.from - lineFrom;
      const clauseTo = explicitStart.range.to - lineFrom;
      const before = originalLine.slice(0, clauseFrom);
      const after = originalLine.slice(clauseTo);
      let remainingLine = after.match(/^\s+and\s+/i)
        ? before + after.replace(/^\s+and\s+/i, "")
        : before.replace(/\s+and\s+$/i, "") + after;
      if (durationClause && successor.end?.resolved)
        remainingLine = remainingLine.replace(
          new RegExp(`\\bends\\s+${successor.end.value.replaceAll("-", "\\-")}\\b`, "i"),
          durationClause,
        );
      const indentation = originalLine.match(/^\s*/)?.[0] ?? "";
      const newline = source.includes("\r\n") ? "\r\n" : "\n";
      return {
        edits: [
          { range: { from: lineFrom, to: lineTo }, text: `${indentation}${statement}${newline}${remainingLine}` },
        ],
      };
    }
    const original = source.slice(explicitStart.range.from, explicitStart.range.to);
    const indentation = original.match(/^\s*/)?.[0] ?? "";
    const edits: SourceEdit[] = [{ range: explicitStart.range, text: indentation + dependencyStatement(original) }];
    const explicitEnd =
      durationClause && successor.end
        ? successor.declarations.find(
            (item) =>
              item.kind === "end" &&
              item.range.from <= successor.end!.range.from &&
              item.range.to >= successor.end!.range.to,
          )
        : undefined;
    if (explicitEnd) {
      const endOriginal = source.slice(explicitEnd.range.from, explicitEnd.range.to);
      if (explicitEnd.inline) edits.push({ range: explicitEnd.range, text: durationClause! });
      else
        edits.push({
          range: explicitEnd.range,
          text: `${endOriginal.match(/^\s*/)?.[0] ?? ""}[${successor.label}] ${durationClause}`,
        });
    }
    return { edits };
  }
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  return {
    edits: [
      { range: { from: successor.sourceRange.to, to: successor.sourceRange.to }, text: `${newline}${statement}` },
    ],
  };
}

export function removeDependency(
  source: string,
  dependencyRange: { from: number; to: number },
  notes: readonly GanttNote[] = [],
): MoveTaskResult {
  let from = dependencyRange.from;
  let to = notes.length
    ? Math.max(dependencyRange.to, ...notes.map((note) => note.sourceRange.to))
    : dependencyRange.to;
  if (source.slice(to, to + 2) === "\r\n") to += 2;
  else if (source[to] === "\n") to += 1;
  else if (from > 0) {
    if (source.slice(from - 2, from) === "\r\n") from -= 2;
    else if (source[from - 1] === "\n") from -= 1;
  }
  return { edits: [{ range: { from, to }, text: "" }] };
}

export function setNote(
  source: string,
  ownerRange: { from: number; to: number },
  existing: readonly GanttNote[] | undefined,
  textValue: string,
  _position: GanttNote["position"] = "bottom",
): MoveTaskResult {
  const text = textValue.trim();
  const note = existing?.[0];
  if (!text && !note) return { edits: [] };
  if (!text && note) return { edits: [{ range: wholeLineRange(source, note.sourceRange), text: "" }] };
  if (/^\s*end\s+note\s*$/im.test(text))
    return { edits: [], unavailableReason: "Note text cannot contain an end note line" };
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const block = `note bottom${newline}${text.replace(/\r?\n/g, newline)}${newline}end note`;
  if (note) return { edits: [{ range: note.sourceRange, text: block }] };
  return { edits: [{ range: { from: ownerRange.to, to: ownerRange.to }, text: `${newline}${block}` }] };
}

export function insertDivider(
  source: string,
  labelValue: string,
  beforeRange?: { from: number; to: number },
): MoveTaskResult {
  const label = labelValue.trim();
  if (!label) return { edits: [], unavailableReason: "Divider name is required" };
  if (label.includes("--") || /[\r\n]/.test(label))
    return { edits: [], unavailableReason: "Divider name cannot contain -- or a line break" };
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  if (beforeRange)
    return { edits: [{ range: { from: beforeRange.from, to: beforeRange.from }, text: `-- ${label} --${newline}` }] };
  const endMatch = /(^|\r?\n)([ \t]*)@endgantt\b/i.exec(source);
  if (!endMatch || endMatch.index === undefined)
    return { edits: [], unavailableReason: "No @endgantt marker was found" };
  const insertionPoint = endMatch.index + (endMatch[1]?.length ?? 0);
  return {
    edits: [{ range: { from: insertionPoint, to: insertionPoint }, text: `-- ${label} --${newline}${newline}` }],
  };
}

export function insertVerticalSeparator(
  source: string,
  input: { taskLabel: string; anchor: "start" | "end"; offset: number; direction: "after" | "before" },
): MoveTaskResult {
  const taskLabel = input.taskLabel.trim();
  if (!taskLabel || /[[\]\r\n]/.test(taskLabel))
    return { edits: [], unavailableReason: "Choose a valid task for the vertical separator" };
  if (!Number.isInteger(input.offset) || input.offset < 0)
    return { edits: [], unavailableReason: "Vertical separator offset must be zero or more whole days" };
  const endMatch = /(^|\r?\n)([ \t]*)@endgantt\b/i.exec(source);
  if (!endMatch || endMatch.index === undefined)
    return { edits: [], unavailableReason: "No @endgantt marker was found" };
  const insertionPoint = endMatch.index + (endMatch[1]?.length ?? 0);
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const position = input.offset
    ? `${input.offset} day${input.offset === 1 ? "" : "s"} ${input.direction} `
    : "at ";
  return { edits: [{ range: { from: insertionPoint, to: insertionPoint }, text: `Separator just ${position}[${taskLabel}]'s ${input.anchor}${newline}${newline}` }] };
}

export function moveVerticalSeparatorByDays(
  source: string,
  separator: import("./model").GanttVerticalSeparator,
  days: number,
): MoveTaskResult {
  if (!Number.isInteger(days)) return { edits: [], unavailableReason: "Vertical separators move in whole days" };
  const current = (separator.direction === "before" ? -1 : 1) * separator.offset;
  const next = current + days;
  const position = next === 0
    ? "at "
    : `${Math.abs(next)} day${Math.abs(next) === 1 ? "" : "s"} ${next < 0 ? "before" : "after"} `;
  return {
    edits: [{
      range: separator.sourceRange,
      text: `Separator just ${position}[${separator.taskLabel}]'s ${separator.anchor}`,
    }],
  };
}

export function updateVerticalSeparator(
  separator: import("./model").GanttVerticalSeparator,
  input: { taskLabel: string; anchor: "start" | "end"; offset: number; direction: "after" | "before" },
): MoveTaskResult {
  const taskLabel = input.taskLabel.trim();
  if (!taskLabel || /[[\]\r\n]/.test(taskLabel))
    return { edits: [], unavailableReason: "Choose a valid task for the vertical separator" };
  if (!Number.isInteger(input.offset) || input.offset < 0)
    return { edits: [], unavailableReason: "Vertical separator offset must be zero or more whole days" };
  const position = input.offset
    ? `${input.offset} day${input.offset === 1 ? "" : "s"} ${input.direction} `
    : "at ";
  return { edits: [{ range: separator.sourceRange, text: `Separator just ${position}[${taskLabel}]'s ${input.anchor}` }] };
}

export function deleteVerticalSeparator(
  source: string,
  separator: import("./model").GanttVerticalSeparator,
): MoveTaskResult {
  return { edits: [{ range: wholeLineRange(source, separator.sourceRange), text: "" }] };
}

export function updateDivider(
  source: string,
  dividerRange: { from: number; to: number },
  labelValue: string,
): MoveTaskResult {
  const label = labelValue.trim();
  if (!label) return { edits: [], unavailableReason: "Divider name is required" };
  if (label.includes("--") || /[\r\n]/.test(label))
    return { edits: [], unavailableReason: "Divider name cannot contain -- or a line break" };
  const original = source.slice(dividerRange.from, dividerRange.to);
  const indentation = original.match(/^\s*/)?.[0] ?? "";
  return { edits: [{ range: dividerRange, text: `${indentation}-- ${label} --` }] };
}

export function deleteDivider(source: string, dividerRange: { from: number; to: number }): MoveTaskResult {
  return { edits: [{ range: wholeLineRange(source, dividerRange), text: "" }] };
}

export function moveDivider(
  source: string,
  dividerRange: { from: number; to: number },
  beforeRange?: { from: number; to: number },
): MoveTaskResult {
  const dividerLine = wholeLineRange(source, dividerRange);
  const block = source.slice(dividerLine.from, dividerLine.to);
  let target = beforeRange?.from;
  if (target === undefined) {
    const endMatch = /(^|\r?\n)([ \t]*)@endgantt\b/i.exec(source);
    if (!endMatch || endMatch.index === undefined)
      return { edits: [], unavailableReason: "No @endgantt marker was found" };
    target = endMatch.index + (endMatch[1]?.length ?? 0);
  }
  if (target >= dividerLine.from && target <= dividerLine.to) return { edits: [] };
  const withoutDivider = source.slice(0, dividerLine.from) + source.slice(dividerLine.to);
  const adjustedTarget = target > dividerLine.to ? target - (dividerLine.to - dividerLine.from) : target;
  return {
    edits: [
      {
        range: { from: 0, to: source.length },
        text: withoutDivider.slice(0, adjustedTarget) + block + withoutDivider.slice(adjustedTarget),
      },
    ],
  };
}

export interface DependencyUpdate {
  predecessorLabel: string;
  successorLabel: string;
  relation: GanttDependency["relation"];
  offset: number;
  direction: "after" | "before";
  color?: string;
  lineStyle: "solid" | "dotted" | "dashed" | "bold";
}

export function updateDependency(source: string, dependency: GanttDependency, value: DependencyUpdate): MoveTaskResult {
  if (value.predecessorLabel === value.successorLabel)
    return { edits: [], unavailableReason: "A task cannot depend on itself" };
  if (!Number.isInteger(value.offset) || value.offset < 0)
    return { edits: [], unavailableReason: "Dependency offset must be a non-negative whole number" };
  const [successorVerb, predecessorAnchor] =
    value.relation === "start-after-start"
      ? ["starts", "start"]
      : value.relation === "end-after-end"
        ? ["ends", "end"]
        : value.relation === "end-after-start"
          ? ["ends", "start"]
          : ["starts", "end"];
  const relation =
    value.offset === 0 && value.direction === "after" && !value.color && value.lineStyle === "solid"
      ? `${successorVerb} at [${value.predecessorLabel}]'s ${predecessorAnchor}`
      : `${successorVerb} ${value.offset} day${value.offset === 1 ? "" : "s"} ${value.direction} [${value.predecessorLabel}]'s ${predecessorAnchor}${value.color || value.lineStyle !== "solid" ? ` with ${value.color || "Black"} ${value.lineStyle} link` : ""}`;
  const original = source.slice(dependency.sourceRange.from, dependency.sourceRange.to);
  const indentation = original.match(/^\s*/)?.[0] ?? "";
  const alias = original.match(/\bas\s+\[[^\]]+]/i)?.[0];
  const resources = original.match(/\bon\s+(?:\{[^}]+}\s*)+/i)?.[0]?.trim();
  const prefix = [`[${value.successorLabel}]`, alias, resources].filter((part): part is string => Boolean(part)).join(
    " ",
  );
  return { edits: [{ range: dependency.sourceRange, text: `${indentation}${prefix} ${relation}` }] };
}

export interface NewTaskInput {
  label: string;
  durationDays: number;
  startDate?: string;
  predecessorLabel?: string;
  color?: string;
}

export interface NewMilestoneInput {
  label: string;
  date?: string;
  referenceLabel?: string;
  referenceAnchor?: "start" | "end";
}

export function insertMilestone(source: string, input: NewMilestoneInput): MoveTaskResult {
  const label = input.label.trim();
  if (!label) return { edits: [], unavailableReason: "Milestone name is required" };
  if (label.includes("]") || label.includes("[") || /[\r\n]/.test(label))
    return { edits: [], unavailableReason: "Milestone name cannot contain brackets or a line break" };
  const hasDate = Boolean(input.date);
  const hasReference = Boolean(input.referenceLabel);
  if (hasDate === hasReference)
    return { edits: [], unavailableReason: "Choose either a set date or a relative task date" };
  if (input.date && !/^\d{4}-\d{2}-\d{2}$/.test(input.date))
    return { edits: [], unavailableReason: "Milestone date must use YYYY-MM-DD" };
  const referenceLabel = input.referenceLabel?.trim();
  if (hasReference && (!referenceLabel || referenceLabel.includes("[") || referenceLabel.includes("]")))
    return { edits: [], unavailableReason: "A valid relative task is required" };

  const endMatch = /(^|\r?\n)([ \t]*)@endgantt\b/i.exec(source);
  if (!endMatch || endMatch.index === undefined)
    return { edits: [], unavailableReason: "No @endgantt marker was found" };
  const insertionPoint = endMatch.index + (endMatch[1]?.length ?? 0);
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const statement = input.date
    ? `[${label}] happens ${input.date}`
    : `[${label}] happens at [${referenceLabel}]'s ${input.referenceAnchor ?? "end"}`;
  return { edits: [{ range: { from: insertionPoint, to: insertionPoint }, text: `${statement}${newline}${newline}` }] };
}

export function insertTask(source: string, input: NewTaskInput): MoveTaskResult {
  const label = input.label.trim();
  if (!label) return { edits: [], unavailableReason: "Task name is required" };
  if (label.includes("]") || label.includes("["))
    return { edits: [], unavailableReason: "Task name cannot contain brackets" };
  if (!Number.isInteger(input.durationDays) || input.durationDays < 1)
    return { edits: [], unavailableReason: "Duration must be a positive whole number of days" };
  if (input.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate))
    return { edits: [], unavailableReason: "Start date must use YYYY-MM-DD" };

  const endMatch = /(^|\r?\n)([ \t]*)@endgantt\b/i.exec(source);
  if (!endMatch || endMatch.index === undefined)
    return { edits: [], unavailableReason: "No @endgantt marker was found" };
  const insertionPoint = endMatch.index + (endMatch[1]?.length ?? 0);
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines: string[] = [];
  if (input.predecessorLabel) lines.push(`[${label}] starts at [${input.predecessorLabel}]'s end`);
  else if (input.startDate) lines.push(`[${label}] starts ${input.startDate}`);
  lines.push(`[${label}] lasts ${input.durationDays} ${input.durationDays === 1 ? "day" : "days"}`);
  if (input.color?.trim()) {
    const color = input.color.trim();
    if (/\s|[\r\n]/.test(color)) return { edits: [], unavailableReason: "Color must be a PlantUML color name or hex value" };
    lines.push(`[${label}] is colored in ${color}`);
  }
  return {
    edits: [
      { range: { from: insertionPoint, to: insertionPoint }, text: `${lines.join(newline)}${newline}${newline}` },
    ],
  };
}

function wholeLineRange(source: string, sourceRange: { from: number; to: number }): { from: number; to: number } {
  const from = source.lastIndexOf("\n", Math.max(0, sourceRange.from - 1)) + 1;
  const nextLineBreak = source.indexOf("\n", sourceRange.to);
  const to = nextLineBreak < 0 ? source.length : nextLineBreak + 1;
  return { from, to };
}

export function renameTask(
  source: string,
  document: GanttDocument,
  task: GanttTask,
  nextLabelValue: string,
): MoveTaskResult {
  const nextLabel = nextLabelValue.trim();
  if (!nextLabel) return { edits: [], unavailableReason: "Task name is required" };
  if (nextLabel.includes("[") || nextLabel.includes("]"))
    return { edits: [], unavailableReason: "Task name cannot contain brackets" };
  const nextKey = nextLabel.toLocaleLowerCase().replace(/\s+/g, " ");
  const existingId = document.symbols.references.get(nextKey) ?? nextKey;
  const existing = document.symbols.tasks.get(existingId);
  if (existing && existing.id !== task.id)
    return { edits: [], unavailableReason: "A task with that name already exists" };
  if (nextLabel === task.label) return { edits: [] };

  const ranges = new Map<string, { from: number; to: number }>();
  ranges.set(`${task.labelRange.from}:${task.labelRange.to}`, task.labelRange);
  for (const item of task.declarations) {
    const text = source.slice(item.range.from, item.range.to);
    const match = /\[([^\]]+)]/.exec(text);
    if (match?.[1] === task.label && match.index !== undefined) {
      const from = item.range.from + match.index + 1;
      ranges.set(`${from}:${from + task.label.length}`, { from, to: from + task.label.length });
    }
  }
  for (const dependency of document.dependencies) {
    if (dependency.predecessorTaskId === task.id && dependency.predecessor.value === task.label)
      ranges.set(
        `${dependency.predecessor.range.from}:${dependency.predecessor.range.to}`,
        dependency.predecessor.range,
      );
  }
  return { edits: [...ranges.values()].map((range) => ({ range, text: nextLabel })) };
}

export function setTaskDeclaration(
  source: string,
  task: GanttTask,
  kind: Exclude<TaskDeclaration["kind"], "unknown">,
  statement?: string,
): MoveTaskResult {
  const existing = task.declarations.find((item) => item.kind === kind);
  if (existing) {
    if (existing.inline) {
      if (statement) return { edits: [{ range: existing.range, text: statement }] };
      let from = existing.range.from;
      let to = existing.range.to;
      const after = source.slice(to).match(/^\s+and\s+/i)?.[0];
      if (after) to += after.length;
      else {
        const before = source.slice(0, from).match(/\s+and\s+$/i)?.[0];
        if (before) from -= before.length;
      }
      return { edits: [{ range: { from, to }, text: "" }] };
    }
    if (!statement) return { edits: [{ range: wholeLineRange(source, existing.range), text: "" }] };
    const original = source.slice(existing.range.from, existing.range.to);
    const indentation = original.match(/^\s*/)?.[0] ?? "";
    const declarationLabel = original.match(/\[([^\]]+)]/)?.[1] ?? task.alias?.value ?? task.label;
    return { edits: [{ range: existing.range, text: `${indentation}[${declarationLabel}] ${statement}` }] };
  }
  if (!statement) return { edits: [] };
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  return {
    edits: [
      { range: { from: task.sourceRange.to, to: task.sourceRange.to }, text: `${newline}[${task.label}] ${statement}` },
    ],
  };
}

export function setTaskPauses(source: string, task: GanttTask, dates: readonly string[]): MoveTaskResult {
  if (dates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date) && !/^(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i.test(date)))
    return { edits: [], unavailableReason: "Pauses must use YYYY-MM-DD or a weekday name" };
  const pauseDeclarations = task.declarations.filter((item) => item.kind === "pause");
  const edits = pauseDeclarations.map((item) => ({ range: wholeLineRange(source, item.range), text: "" }));
  if (!dates.length) return { edits };
  const anchor = Math.max(
    task.labelRange.to,
    ...task.declarations.filter((item) => item.kind !== "pause").map((item) => item.range.to),
  );
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const label = task.alias?.value ?? task.label;
  edits.push({
    range: { from: anchor, to: anchor },
    text: dates.map((date) => `${newline}[${label}] pauses on ${date}`).join(""),
  });
  return { edits };
}

export function setTaskLinks(
  source: string,
  task: GanttTask,
  links: readonly { url: string; label?: string }[],
): MoveTaskResult {
  if (links.some((link) => !/^https?:\/\/\S+$/i.test(link.url) || /[[\]\r\n]/.test(link.label ?? "")))
    return { edits: [], unavailableReason: "Links need an http(s) URL and labels cannot contain brackets" };
  const declarations = task.declarations.filter((item) => item.kind === "link");
  const edits = declarations.map((item) => ({ range: wholeLineRange(source, item.range), text: "" }));
  if (!links.length) return { edits };
  const anchor = Math.max(task.labelRange.to, ...task.declarations.filter((item) => item.kind !== "link").map((item) => item.range.to));
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const label = task.alias?.value ?? task.label;
  edits.push({
    range: { from: anchor, to: anchor },
    text: links.map((link) => `${newline}[${label}] links to [[${link.url}${link.label?.trim() ? ` ${link.label.trim()}` : ""}]]`).join(""),
  });
  return { edits };
}

export interface TaskResourceInput {
  name: string;
  allocation?: number;
}

export function setTaskResources(
  source: string,
  task: GanttTask,
  resources: readonly TaskResourceInput[],
): MoveTaskResult {
  const invalid = resources.find(
    (item) =>
      !item.name.trim() ||
      /[{}]/.test(item.name) ||
      (item.allocation !== undefined &&
        (!Number.isInteger(item.allocation) || item.allocation < 1 || item.allocation > 100)),
  );
  if (invalid)
    return { edits: [], unavailableReason: "Resources need a name and an optional allocation from 1 to 100%" };
  const from = source.lastIndexOf("\n", task.labelRange.from - 1) + 1;
  let to = source.indexOf("\n", task.labelRange.to);
  if (to < 0) to = source.length;
  if (source[to - 1] === "\r") to -= 1;
  const original = source.slice(from, to);
  const prefix = original.match(/^(\s*\[[^\]]+]\s*(?:as\s+\[[^\]]+]\s*)?)/i)?.[1];
  if (!prefix) return { edits: [], unavailableReason: "Could not locate the task declaration" };
  const remainder = original.slice(prefix.length).replace(/^on\s+(?:\{[^}]+}\s*)+/i, "");
  const assignment = resources.length
    ? `on ${resources.map((item) => `{${item.name.trim()}${item.allocation === undefined ? "" : `:${item.allocation}%`}}`).join(" ")}`
    : "";
  return {
    edits: [{ range: { from, to }, text: `${prefix}${assignment}${assignment && remainder ? " " : ""}${remainder}` }],
  };
}

export function deleteTask(source: string, document: GanttDocument, task: GanttTask): MoveTaskResult {
  const ranges = new Map<string, { from: number; to: number }>();
  for (const item of task.declarations) {
    const line = wholeLineRange(source, item.range);
    ranges.set(`${line.from}:${line.to}`, line);
  }
  for (const note of task.notes ?? []) {
    const line = wholeLineRange(source, note.sourceRange);
    ranges.set(`${line.from}:${line.to}`, line);
  }
  for (const dependency of document.dependencies) {
    if (dependency.predecessorTaskId === task.id && dependency.successorTaskId !== task.id) {
      const line = wholeLineRange(source, dependency.sourceRange);
      ranges.set(`${line.from}:${line.to}`, line);
      for (const note of dependency.notes ?? []) {
        const noteRange = wholeLineRange(source, note.sourceRange);
        ranges.set(`${noteRange.from}:${noteRange.to}`, noteRange);
      }
    }
  }
  return { edits: [...ranges.values()].map((range) => ({ range, text: "" })) };
}

export function reorderTask(
  source: string,
  document: GanttDocument,
  task: GanttTask,
  beforeTask?: GanttTask,
): MoveTaskResult {
  if (task.id === beforeTask?.id) return { edits: [] };
  const dependencyLines = new Set(
    document.dependencies.map((item) => {
      const line = wholeLineRange(source, item.sourceRange);
      return `${line.from}:${line.to}`;
    }),
  );
  const sourceRanges = [
    ...task.declarations
      .map((item) => wholeLineRange(source, item.range))
      .filter((item) => !dependencyLines.has(`${item.from}:${item.to}`)),
    ...(task.notes ?? []).map((note) => wholeLineRange(source, note.sourceRange)),
  ];
  const unique = [...new Map(sourceRanges.map((item) => [`${item.from}:${item.to}`, item])).values()].sort(
    (a, b) => a.from - b.from,
  );
  if (!unique.length)
    return {
      edits: [],
      unavailableReason: "Add a duration or other task declaration before reordering this dependency-only task",
    };
  const targetDeclarations =
    beforeTask?.declarations
      .map((item) => wholeLineRange(source, item.range))
      .filter((item) => !dependencyLines.has(`${item.from}:${item.to}`)) ?? [];
  const endMarker = /^\s*@endgantt\b/im.exec(source);
  const target = beforeTask
    ? targetDeclarations.length
      ? Math.min(...targetDeclarations.map((item) => item.from))
      : beforeTask.sourceRange.from
    : (endMarker?.index ?? source.length);
  if (unique.some((item) => target >= item.from && target <= item.to)) return { edits: [] };
  const block = unique.map((item) => source.slice(item.from, item.to)).join("");
  let withoutTask = source;
  for (const item of [...unique].reverse()) withoutTask = withoutTask.slice(0, item.from) + withoutTask.slice(item.to);
  const removedBeforeTarget = unique
    .filter((item) => item.to <= target)
    .reduce((total, item) => total + item.to - item.from, 0);
  const adjustedTarget = target - removedBeforeTarget;
  const reordered = withoutTask.slice(0, adjustedTarget) + block + withoutTask.slice(adjustedTarget);
  return { edits: [{ range: { from: 0, to: source.length }, text: reordered }] };
}

export function renameResource(document: GanttDocument, currentName: string, nextNameValue: string): MoveTaskResult {
  const nextName = nextNameValue.trim();
  if (!nextName) return { edits: [], unavailableReason: "Person name is required" };
  if (/[{},:]/.test(nextName))
    return { edits: [], unavailableReason: "Person name cannot contain braces, commas, or colons" };
  const edits: SourceEdit[] = [];
  for (const task of document.tasks)
    for (const resource of task.resources ?? [])
      if (resource.value.toLocaleLowerCase() === currentName.toLocaleLowerCase())
        edits.push({ range: resource.range, text: nextName });
  if (!edits.length) return { edits: [], unavailableReason: `No assignments found for ${currentName}` };
  return { edits };
}
