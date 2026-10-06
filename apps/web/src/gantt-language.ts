import { durationUnitRepairs } from "./gantt-duration-unit-repairs";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { Diagnostic as CodeMirrorDiagnostic } from "@codemirror/lint";
import {
  applySourceEdits,
  setTaskDeclaration,
  ganttKeywordRepair,
  isValidCalendarDate,
  parseGantt,
} from "@plantuml-studio/diagram-gantt";
import { taskElapsedDays, resolveTaskDates } from "./gantt-schedule";
import { taskPauses, parseGanttCalendar, isWorkingDate, shiftDate } from "./gantt-calendar";

export interface GanttQuickFix {
  choiceGroup?: string;
  from: number;
  to: number;
  replacement: string;
  message: string;
  label?: string;
}

function wholeLineRange(source: string, range: { from: number; to: number }) {
  const from = source.lastIndexOf("\n", Math.max(0, range.from - 1)) + 1;
  const lineBreak = source.indexOf("\n", range.to);
  return { from, to: lineBreak < 0 ? source.length : lineBreak + 1 };
}

function dependencyOrderRepair(
  source: string,
): { replacement: string; affected: { from: number; to: number }[] } | undefined {
  const parsed = parseGantt(source).document;
  const seenLines = new Set<string>();
  const standalone = parsed.dependencies
    .map((dependency, index) => ({ dependency, index, range: wholeLineRange(source, dependency.sourceRange) }))
    .filter(({ range }) => {
      const line = source.slice(range.from, range.to).trim();
      const key = `${range.from}:${range.to}`;
      if (!/^\s*(?:then\s+)?\[[^\]]+]/i.test(line) || seenLines.has(key)) return false;
      seenLines.add(key);
      return true;
    });
  if (!standalone.length) return undefined;

  const schedulingKinds = new Set(["start", "end", "duration", "milestone", "pause"]);
  const affected = standalone.filter(({ dependency }) => {
    const predecessor = parsed.symbols.tasks.get(dependency.predecessorTaskId);
    return predecessor?.declarations.some(
      (declaration) => schedulingKinds.has(declaration.kind) && declaration.range.from > dependency.sourceRange.from,
    );
  });
  if (!affected.length) return undefined;

  // PlantUML evaluates these statements in source order. Put relationship statements after
  // ordinary task scheduling, and order relationship chains from predecessor to successor.
  const remaining = [...standalone];
  const ordered: typeof standalone = [];
  const pendingSuccessors = new Set(remaining.map(({ dependency }) => dependency.successorTaskId));
  while (remaining.length) {
    const nextIndex = remaining.findIndex(({ dependency }) => !pendingSuccessors.has(dependency.predecessorTaskId));
    const [next] = remaining.splice(nextIndex < 0 ? 0 : nextIndex, 1);
    if (!next) break;
    ordered.push(next);
    if (!remaining.some(({ dependency }) => dependency.successorTaskId === next.dependency.successorTaskId))
      pendingSuccessors.delete(next.dependency.successorTaskId);
  }

  const ranges = standalone.map(({ range }) => range).sort((a, b) => b.from - a.from);
  let withoutDependencies = source;
  for (const range of ranges)
    withoutDependencies = withoutDependencies.slice(0, range.from) + withoutDependencies.slice(range.to);
  const end = /(^|\r?\n)([ \t]*)@endgantt\b/i.exec(withoutDependencies);
  if (!end) return undefined;
  const at = end.index + end[1]!.length;
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const relationshipBlock = ordered
    .map(({ range }) => source.slice(range.from, range.to).replace(/\r?\n$/, ""))
    .join(newline);
  return {
    replacement: `${withoutDependencies.slice(0, at)}${relationshipBlock}${newline}${withoutDependencies.slice(at)}`,
    affected: affected.map(({ dependency }) => dependency.sourceRange),
  };
}

export const PLANTUML_COLOR_NAMES = [
  "AliceBlue",
  "AntiqueWhite",
  "Aqua",
  "Aquamarine",
  "Azure",
  "Beige",
  "Bisque",
  "Black",
  "Blue",
  "BlueViolet",
  "Brown",
  "BurlyWood",
  "CadetBlue",
  "Chartreuse",
  "Chocolate",
  "Coral",
  "CornflowerBlue",
  "Cornsilk",
  "Crimson",
  "Cyan",
  "DarkBlue",
  "DarkCyan",
  "DarkGoldenRod",
  "DarkGray",
  "DarkGreen",
  "DarkKhaki",
  "DarkMagenta",
  "DarkOliveGreen",
  "DarkOrange",
  "DarkOrchid",
  "DarkRed",
  "DarkSalmon",
  "DarkSeaGreen",
  "DarkSlateBlue",
  "DarkSlateGray",
  "DarkTurquoise",
  "DarkViolet",
  "DeepPink",
  "DeepSkyBlue",
  "DimGray",
  "DodgerBlue",
  "FireBrick",
  "FloralWhite",
  "ForestGreen",
  "Fuchsia",
  "Gainsboro",
  "GhostWhite",
  "Gold",
  "GoldenRod",
  "Gray",
  "Green",
  "GreenYellow",
  "HoneyDew",
  "HotPink",
  "IndianRed",
  "Indigo",
  "Ivory",
  "Khaki",
  "Lavender",
  "LavenderBlush",
  "LawnGreen",
  "LemonChiffon",
  "LightBlue",
  "LightCoral",
  "LightCyan",
  "LightGoldenRodYellow",
  "LightGray",
  "LightGreen",
  "LightPink",
  "LightSalmon",
  "LightSeaGreen",
  "LightSkyBlue",
  "LightSlateGray",
  "LightSteelBlue",
  "LightYellow",
  "Lime",
  "LimeGreen",
  "Linen",
  "Magenta",
  "Maroon",
  "MediumAquaMarine",
  "MediumBlue",
  "MediumOrchid",
  "MediumPurple",
  "MediumSeaGreen",
  "MediumSlateBlue",
  "MediumSpringGreen",
  "MediumTurquoise",
  "MediumVioletRed",
  "MidnightBlue",
  "MintCream",
  "MistyRose",
  "Moccasin",
  "NavajoWhite",
  "Navy",
  "OldLace",
  "Olive",
  "OliveDrab",
  "Orange",
  "OrangeRed",
  "Orchid",
  "PaleGoldenRod",
  "PaleGreen",
  "PaleTurquoise",
  "PaleVioletRed",
  "PapayaWhip",
  "PeachPuff",
  "Peru",
  "Pink",
  "Plum",
  "PowderBlue",
  "Purple",
  "Red",
  "RosyBrown",
  "RoyalBlue",
  "SaddleBrown",
  "Salmon",
  "SandyBrown",
  "SeaGreen",
  "SeaShell",
  "Sienna",
  "Silver",
  "SkyBlue",
  "SlateBlue",
  "SlateGray",
  "Snow",
  "SpringGreen",
  "SteelBlue",
  "Tan",
  "Teal",
  "Thistle",
  "Tomato",
  "Turquoise",
  "Violet",
  "Wheat",
  "White",
  "WhiteSmoke",
  "Yellow",
  "YellowGreen",
] as const;

function applyReplacingCloser(insertText: string, closer: string) {
  return (view: import("@codemirror/view").EditorView, _completion: unknown, from: number, to: number) => {
    const after = view.state.sliceDoc(to, to + closer.length);
    const end = after === closer ? to + closer.length : to;
    view.dispatch({
      changes: { from, to: end, insert: insertText },
      selection: { anchor: from + insertText.length },
    });
  };
}

export function ganttCompletions(context: CompletionContext): CompletionResult | null {
  const before = context.state.sliceDoc(0, context.pos);
  const line = context.state.doc.lineAt(context.pos);
  const lineBefore = before.slice(line.from);
  const result = parseGantt(context.state.doc.toString());

  const taskLine = lineBefore.match(/^\s*(?:then\s+)?\[([^\]]*)$/i);
  if (taskLine) {
    const typed = taskLine[1] ?? "";
    return {
      from: context.pos - typed.length,
      options: result.document.tasks.map((task) => ({
        label: task.label,
        type: "variable",
        detail: task.alias ? `Existing task · alias ${task.alias.value}` : "Existing Gantt task",
        apply: applyReplacingCloser(`${task.alias?.value ?? task.label}] `, "]"),
      })),
      validFor: /^[^\]]*$/,
    };
  }

  const resource = lineBefore.match(/\bon\s+(?:\{[^}]+}\s*)*\{([^}:}]*)$/i);
  if (resource) {
    const typed = resource[1] ?? "";
    const names = [
      ...new Set(result.document.tasks.flatMap((task) => (task.resources ?? []).map((item) => item.value))),
    ];
    return {
      from: context.pos - typed.length,
      options: names.map((name) => ({
        label: name,
        type: "variable",
        detail: "Person · 100% allocation",
        apply: applyReplacingCloser(`${name}:100%}`, "}"),
      })),
      validFor: /^[^}:]*$/,
    };
  }

  const reference = lineBefore.match(
    /\b(?:starts|ends|happens)(?:\s+\d+\s+days?)?\s+(?:at|after|before)\s+\[([^\]]*)$/i,
  );
  if (reference) {
    const typed = reference[1] ?? "";
    return {
      from: context.pos - typed.length,
      options: result.document.tasks.map((task) => ({
        label: task.label,
        type: "variable",
        detail: "Gantt task",
        apply: applyReplacingCloser(`${task.label}]'s end`, "]"),
      })),
      validFor: /^[^\]]*$/,
    };
  }

  const colorValue = lineBefore.match(/^\s*\[[^\]]+]\s+is\s+colou?red\s+in\s+([a-z]*)$/i);
  if (colorValue) {
    const typed = colorValue[1] ?? "";
    return {
      from: context.pos - typed.length,
      options: PLANTUML_COLOR_NAMES.map((color) => ({ label: color, type: "constant", detail: "PlantUML color" })),
      validFor: /^[a-z]*$/i,
    };
  }

  const datedTaskContinuation = lineBefore.match(/^\s*\[[^\]]+]\s+starts\s+\d{4}-\d{2}-\d{2}\s+([\w ]*)$/i);
  if (datedTaskContinuation) {
    const typed = datedTaskContinuation[1] ?? "";
    return {
      from: context.pos - typed.length,
      options: [
        { label: "and ends", type: "keyword", apply: "and ends 2026-09-01" },
        { label: "and lasts", type: "keyword", apply: "and lasts 1 day" },
        { label: "and is colored in", type: "keyword", apply: "and is colored in Orange" },
        { label: "and is completed", type: "keyword", apply: "and is 0% completed" },
      ],
      validFor: /^[\w ]*$/,
    };
  }

  const statement = lineBefore.match(/^\s*(?:then\s+)?\[[^\]]+]\s+([\w ]*)$/i);
  if (statement) {
    const typed = statement[1] ?? "";
    return {
      from: context.pos - typed.length,
      options: [
        { label: "starts", type: "keyword", apply: "starts " },
        { label: "starts at", type: "keyword", apply: "starts at [" },
        { label: "ends", type: "keyword", apply: "ends " },
        { label: "ends at", type: "keyword", apply: "ends at [" },
        { label: "lasts", type: "keyword", apply: "lasts 1 day" },
        { label: "requires", type: "keyword", apply: "requires 1 day" },
        { label: "pauses on", type: "keyword", apply: "pauses on 2026-09-01" },
        { label: "links to", type: "keyword", apply: "links to [[https://]]" },
        { label: "is completed", type: "keyword", apply: "is 0% completed" },
        { label: "is colored in", type: "keyword", apply: "is colored in Orange" },
        { label: "happens", type: "keyword", apply: "happens 2026-09-01" },
        { label: "happens at", type: "keyword", apply: "happens at [" },
      ],
      validFor: /^[\w ]*$/,
    };
  }

  return context.explicit ? { from: context.pos, options: [] } : null;
}

function durationConflicts(source: string, parsed: ReturnType<typeof parseGantt>) {
  const errors = parsed.diagnostics.filter((item) => item.severity === "error");
  const invalidTasks = new Set<string>();
  for (const error of errors) {
    const lineStart = source.lastIndexOf("\n", Math.max(0, error.range.from - 1)) + 1;
    const lineEnd = source.indexOf("\n", error.range.from);
    const line = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd);
    const owner = line.match(/^\s*(?:then\s+)?\[([^\]]+)]/i)?.[1];
    if (owner) {
      invalidTasks.add(owner.trim());
      continue;
    }
    // An invalid calendar may affect every task. Presentation settings and the
    // project start cannot affect these explicitly dated task calculations.
    const repair = ganttKeywordRepair(line)?.replacement ?? line;
    if (!/^\s*(?:printscale\b|today\s+is\s+colou?red\b|project\s+starts\b)/i.test(repair)) return [];
  }
  const calendar = parseGanttCalendar(source);
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return parsed.document.tasks.flatMap((task) => {
    const { start, end, duration } = task;
    if (invalidTasks.has(task.label) || (task.alias && invalidTasks.has(task.alias.value))) return [];
    if (
      !start?.resolved ||
      !end?.resolved ||
      !duration ||
      duration.value <= 0 ||
      (task.pauses ?? []).some((pause) => !pause.resolved && !weekdays.includes(pause.value.toLowerCase()))
    )
      return [];
    const declarations = ["start", "end", "duration"].map((kind) =>
      task.declarations.filter((item) => item.kind === kind).at(-1),
    );
    if (
      [start, end, duration].some(
        (expression, index) =>
          !declarations[index] ||
          declarations[index]!.range.from > expression.range.from ||
          declarations[index]!.range.to < expression.range.to,
      )
    )
      return [];
    const declaredDays = duration.value * (duration.unit === "week" ? 7 : duration.unit === "month" ? 30 : 1);
    const paused = taskPauses(task);
    const working = (date: string) => isWorkingDate(date, calendar) && !paused.has(date);
    let date = start.value;
    let calculated = 0;
    let steps = 0;
    while (date <= end.value && steps++ < 10000) {
      if (working(date)) calculated++;
      date = shiftDate(date, 1)!;
    }
    if (date <= end.value || calculated === declaredDays) return [];
    const range = declarations[2]!.range;
    const message = `Task '${task.label}' declares ${declaredDays} working days, but ${start.value} to ${end.value} contains ${calculated}. Review its dates and duration.`;
    const fixes: GanttQuickFix[] = [];
    if (calculated > 0)
      fixes.push({
        from: range.from,
        to: range.to,
        replacement: source
          .slice(range.from, range.to)
          .replace(
            /\b(lasts|requires)\s+\d+\s+(?:weeks?\s+and\s+\d+\s+days?|days?|weeks?|months?)/i,
            `$1 ${calculated} days`,
          ),
        label: `Use duration ${calculated} days`,
        message,
      });
    date = start.value;
    let remaining = declaredDays;
    for (let step = 0; step < 10000 && remaining > 0; step++) {
      if (working(date)) remaining--;
      if (remaining > 0) date = shiftDate(date, 1)!;
    }
    if (remaining === 0)
      fixes.push({ from: end.range.from, to: end.range.to, replacement: date, label: `Use end date ${date}`, message });
    return [{ from: range.from, to: range.to, message, fixes }];
  });
}

function dependencyConflictFixes(source: string, parsed: ReturnType<typeof parseGantt>): GanttQuickFix[] {
  if (parsed.diagnostics.some((item) => item.severity === "error")) return [];
  const calendar = parseGanttCalendar(source);
  const resolve = (text: string) => {
    const document = parseGantt(text).document;
    return resolveTaskDates(
      document.tasks,
      document.dependencies,
      document.projectStart?.resolved ? document.projectStart.value : undefined,
      parseGanttCalendar(text),
    );
  };
  const originalDates = resolve(source);
  const fixes: GanttQuickFix[] = [];
  for (const task of parsed.document.tasks) {
    const conflict = originalDates.get(task.id);
    if (!conflict?.conflict) continue;
    const kind = conflict.conflict.anchor;
    const expression = kind === "start" ? task.start : task.end;
    if (!expression?.resolved) continue;
    const add = (candidate: string, label: string) => {
      if (candidate === source || parseGantt(candidate).diagnostics.some((item) => item.severity === "error")) return;
      const dates = resolve(candidate);
      const repaired = dates.get(task.id);
      if (!repaired?.start || !repaired.end || repaired.issue || repaired.end < repaired.start) return;
      if ([...dates].some(([id, item]) => item.issue && !originalDates.get(id)?.issue)) return;
      if (
        durationConflicts(candidate, parseGantt(candidate)).some((item) =>
          item.message.includes(`Task '${task.label}'`),
        )
      )
        return;
      let from = 0;
      while (from < source.length && from < candidate.length && source[from] === candidate[from]) from++;
      let to = source.length;
      let candidateTo = candidate.length;
      while (to > from && candidateTo > from && source[to - 1] === candidate[candidateTo - 1]) {
        to--;
        candidateTo--;
      }
      fixes.push({ from, to, replacement: candidate.slice(from, candidateTo), label, message: conflict.issue! });
    };
    add(
      applySourceEdits(source, setTaskDeclaration(source, task, kind).edits),
      `Let dependency determine ${kind} date`,
    );
    // Move the fixed window by its available work days, keeping all other clauses intact.
    let days = taskElapsedDays(task);
    const pauses = taskPauses(task);
    const working = (date: string) => isWorkingDate(date, calendar) && !pauses.has(date);
    if (!days && task.start?.resolved && task.end?.resolved) {
      days = 0;
      let date = task.start.value;
      for (let step = 0; step < 10_000 && date <= task.end.value; step++) {
        if (working(date)) days++;
        date = shiftDate(date, 1)!;
      }
      if (date <= task.end.value) continue;
    }
    if (!days) continue;
    let date = conflict.conflict.expected;
    let remaining = days;
    const direction = kind === "start" ? 1 : -1;
    for (let step = 0; step < 10_000 && remaining > 0; step++) {
      if (working(date)) remaining--;
      if (remaining > 0) date = shiftDate(date, direction)!;
    }
    if (remaining) continue;
    const expected = conflict.conflict.expected;
    const edits = [{ range: expression.range, text: expected }];
    const opposite = kind === "start" ? task.end : task.start;
    if (opposite?.resolved) edits.push({ range: opposite.range, text: date });
    add(applySourceEdits(source, edits), `Move fixed dates to satisfy dependency`);
  }
  return fixes;
}

export function ganttDiagnostics(source: string): CodeMirrorDiagnostic[] {
  const parsed = parseGantt(source);
  const diagnostics = parsed.diagnostics;
  const fixes = quickFixesForDiagnostics(source, parsed);
  const conflictFixes = dependencyConflictFixes(source, parsed);
  const result = diagnostics.map((diagnostic) => {
    const matchingFixes = fixes.filter(
      (item) => item.from === diagnostic.range.from && item.to === diagnostic.range.to,
    );
    return {
      from: diagnostic.range.from,
      to: diagnostic.range.to,
      severity: diagnostic.severity,
      message: diagnostic.message,
      source: "PlantUML Gantt",
      ...(matchingFixes.length
        ? {
            actions: matchingFixes.map((fix) => ({
              name: fix.label ? `${fix.label}: ${fix.replacement.trim()}` : "Fix statement",
              apply(view: import("@codemirror/view").EditorView) {
                view.dispatch({ changes: { from: fix.from, to: fix.to, insert: fix.replacement } });
              },
            })),
          }
        : {}),
    };
  });
  const repair = diagnostics.some((item) => item.code === "dependency-cycle")
    ? undefined
    : dependencyOrderRepair(source);
  if (repair) {
    const first = repair.affected[0]!;
    result.push({
      from: first.from,
      to: first.to,
      severity: "warning",
      message: `${repair.affected.length} relationship statement${repair.affected.length === 1 ? " is" : "s are"} evaluated before later predecessor scheduling. Repair their order.`,
      source: "PlantUML Gantt",
      actions: [
        {
          name: "Repair relationship order",
          apply(view: import("@codemirror/view").EditorView) {
            view.dispatch({ changes: { from: 0, to: source.length, insert: repair.replacement } });
          },
        },
      ],
    });
  }
  for (const conflict of durationConflicts(source, parsed))
    result.push({
      from: conflict.from,
      to: conflict.to,
      severity: "warning",
      message: conflict.message,
      source: "PlantUML Gantt",
      actions: conflict.fixes.map((fix) => ({
        name: fix.label!,
        apply(view: import("@codemirror/view").EditorView) {
          view.dispatch({ changes: { from: fix.from, to: fix.to, insert: fix.replacement } });
        },
      })),
    });
  const dates = resolveTaskDates(
    parsed.document.tasks,
    parsed.document.dependencies,
    parsed.document.projectStart?.resolved ? parsed.document.projectStart.value : undefined,
    parseGanttCalendar(source),
  );
  for (const item of dates.values()) {
    for (const range of item.conflictRanges ?? []) {
      result.push({
        from: range.from,
        to: range.to,
        severity: "error",
        message: item.issue!,
        source: "PlantUML Gantt",
        actions: conflictFixes
          .filter((fix) => fix.message === item.issue)
          .map((fix) => ({
            name: fix.label!,
            apply(view: import("@codemirror/view").EditorView) {
              view.dispatch({ changes: { from: fix.from, to: fix.to, insert: fix.replacement } });
            },
          })),
      });
    }
  }
  return result;
}

export function ganttQuickFixes(source: string): GanttQuickFix[] {
  const parsed = parseGantt(source);
  const fixes = [
    ...quickFixesForDiagnostics(source, parsed),
    ...durationConflicts(source, parsed).flatMap((item) => item.fixes),
    ...dependencyConflictFixes(source, parsed),
  ];
  const repair = parsed.diagnostics.some((item) => item.code === "dependency-cycle")
    ? undefined
    : dependencyOrderRepair(source);
  return repair
    ? [
        ...fixes,
        {
          from: 0,
          to: source.length,
          replacement: repair.replacement,
          message: `Repair ${repair.affected.length} order-sensitive relationship statement${repair.affected.length === 1 ? "" : "s"}`,
        },
      ]
    : fixes;
}

const GANTT_STATEMENT_KEYWORDS = ["starts", "ends", "lasts", "requires", "happens", "pauses", "links", "displays"];

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i]![0] = i;
  for (let j = 0; j < cols; j++) dp[0]![j] = j;
  for (let i = 1; i < rows; i++)
    for (let j = 1; j < cols; j++)
      dp[i]![j] =
        a[i - 1] === b[j - 1] ? dp[i - 1]![j - 1]! : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
  return dp[a.length]![b.length]!;
}

// Suggests the closest recognized statement keyword for a likely typo (e.g. "star" -> "starts").
// Only returns a suggestion when it's close (distance <= 2, and shorter than the word itself) and
// unambiguous (no other keyword is an equally close match), to avoid "fixing" unrelated words.
function closestKeyword(word: string): string | undefined {
  const lower = word.toLowerCase();
  if (GANTT_STATEMENT_KEYWORDS.includes(lower)) return undefined;
  const ranked = GANTT_STATEMENT_KEYWORDS.map((keyword) => ({ keyword, dist: levenshtein(lower, keyword) })).sort(
    (a, b) => a.dist - b.dist,
  );
  const [best, next] = ranked;
  if (!best || best.dist > 2 || best.dist >= lower.length) return undefined;
  if (next && next.dist === best.dist) return undefined;
  return best.keyword;
}

// Normalizes common malformed-but-recognizable date shapes to PlantUML's expected YYYY-MM-DD,
// e.g. missing zero-padding (2026-9-1) or a dotted separator (2026.09.01).
function normalizeDateGuess(value: string): string | undefined {
  const match = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!match?.[1] || !match[2] || !match[3]) return undefined;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const normalized = `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!isValidCalendarDate(normalized)) return undefined;
  return normalized === value ? undefined : normalized;
}

function quickFixesForDiagnostics(source: string, parsed: ReturnType<typeof parseGantt>): GanttQuickFix[] {
  return parsed.diagnostics.flatMap((diagnostic) => {
    const text = source.slice(diagnostic.range.from, diagnostic.range.to);
    if (["malformed-inline-clause", "malformed-statement"].includes(diagnostic.code ?? "")) {
      const completion = text.match(
        /^(\s*(?:(?:then\s+)?\[[^\]]+]\s+)?)(\d{1,2}%\s+completed|100%\s+completed)(\s*)$/i,
      );
      if (completion)
        return [
          {
            from: diagnostic.range.from,
            to: diagnostic.range.to,
            replacement: `${completion[1]}is ${completion[2]}${completion[3]}`,
            label: "Add is before completion percentage",
            message: diagnostic.message,
          },
        ];
    }
    if (["malformed-inline-clause", "malformed-statement", "invalid-duration"].includes(diagnostic.code ?? "")) {
      const units = durationUnitRepairs(text, source, parsed, diagnostic.range.from);
      if (units.length)
        return units.map((repair) => ({
          from: diagnostic.range.from,
          to: diagnostic.range.to,
          message: diagnostic.message,
          ...repair,
        }));
    }
    if (diagnostic.code === "malformed-inline-clause") {
      const prefix = "[Task] ";
      const repair = ganttKeywordRepair(prefix + text);
      const typo = text.match(/^(\S+)(.*)$/);
      const keyword = typo ? closestKeyword(typo[1]!) : undefined;
      const replacement = repair
        ? repair.replacement.slice(prefix.length)
        : keyword && typo
          ? keyword + typo[2]
          : undefined;
      return replacement
        ? [
            {
              from: diagnostic.range.from,
              to: diagnostic.range.to,
              replacement,
              label: repair?.label ?? `Use ${keyword}`,
              message: diagnostic.message,
            },
          ]
        : [];
    }
    const keywordRepair =
      diagnostic.code === "malformed-statement" ||
      diagnostic.code === "malformed-global-statement" ||
      diagnostic.code === "invalid-duration"
        ? ganttKeywordRepair(text)
        : undefined;
    if (keywordRepair)
      return [{ from: diagnostic.range.from, to: diagnostic.range.to, message: diagnostic.message, ...keywordRepair }];
    if (diagnostic.code === "unknown-task") {
      const normalize = (reference: string) => reference.trim().toLowerCase();
      const unknown = normalize(text);
      const dependency = parsed.document.dependencies.find(
        (item) =>
          item.predecessor.range.from === diagnostic.range.from && item.predecessor.range.to === diagnostic.range.to,
      );
      const owner = parsed.document.tasks.find((task) =>
        [task.sameRowAs, task.milestone].some(
          (reference) => reference?.range.from === diagnostic.range.from && reference.range.to === diagnostic.range.to,
        ),
      );
      const limit = Math.min(2, Math.max(1, Math.floor(unknown.length / 3)));
      return parsed.document.tasks
        .filter((task) => task.id !== dependency?.successorTaskId && task.id !== owner?.id)
        .map((task) => {
          const references = [task.label, ...(task.alias ? [task.alias.value] : [])];
          return references
            .map((reference) => ({ reference, distance: levenshtein(unknown, normalize(reference)) }))
            .sort((a, b) => a.distance - b.distance)[0]!;
        })
        .filter((candidate) => candidate.distance <= limit && candidate.distance < unknown.length)
        .sort((a, b) => a.distance - b.distance || a.reference.localeCompare(b.reference))
        .slice(0, 3)
        .map(({ reference }) => ({
          from: diagnostic.range.from,
          to: diagnostic.range.to,
          replacement: reference,
          message: diagnostic.message,
          label: `Use task ${reference}`,
        }));
    }
    // Keep repairs narrow so a suggestion preserves the task, anchor and value.
    const syntaxRepairs: Array<[RegExp, string, string]> = [
      [
        /^(\s*(?:then\s+)?\[[^\]]+]\s+(?:starts|ends))\s+(\[[^\]]+]'s\s+(?:start|end)\s*)$/i,
        "$1 at $2",
        "Add missing at",
      ],
      [
        /^(\s*(?:then\s+)?\[[^\]]+]\s+(?:starts|ends)\s+at\s+\[[^\]]+])\s+(start|end)(\s*)$/i,
        "$1's $2$3",
        "Add missing possessive marker",
      ],
      [
        /^(\s*(?:then\s+)?\[[^\]]+]\s+(?:starts|ends)\s+at\s+\[[^\]]+])s\s+(start|end)(\s*)$/i,
        "$1's $2$3",
        "Add missing apostrophe",
      ],
      [
        /^(\s*(?:then\s+)?\[[^\]]+]\s+(?:starts|ends)\s+at\s+\[[^\]]+]'s\s+)starts?(\s*)$/i,
        "$1start$2",
        "Use start anchor",
      ],
      [/^(\s*(?:then\s+)?\[[^\]]+]\s+(?:starts|ends)\s+at\s+\[[^\]]+]'s\s+)ends(\s*)$/i, "$1end$2", "Use end anchor"],
      [/^(\s*(?:then\s+)?\[[^\]]+]\s+is\s+(?:\d{1,2}|100))\s+completed(\s*)$/i, "$1% completed$2", "Add missing %"],
      [/^(\s*(?:then\s+)?\[[^\]]+]\s+is\s+(?:\d{1,2}|100)%)\s*$/i, "$1 completed", "Add completed keyword"],
    ];
    const syntaxRepair =
      diagnostic.code === "malformed-statement" ? syntaxRepairs.find(([pattern]) => pattern.test(text)) : undefined;
    const missingDependencyAnchor =
      diagnostic.code === "malformed-statement"
        ? text.match(/^(\s*(?:then\s+)?\[[^\]]+]\s+(?:starts|ends)\s+at\s+\[[^\]]+]'s)(\s*)$/i)
        : undefined;
    if (missingDependencyAnchor) {
      return ["end", "start"].map((anchor) => ({
        from: diagnostic.range.from,
        to: diagnostic.range.to,
        replacement: `${missingDependencyAnchor[1]} ${anchor}${missingDependencyAnchor[2]}`,
        message: diagnostic.message,
        label: `Use predecessor ${anchor}`,
        choiceGroup: `dependency-anchor:${diagnostic.range.from}`,
      }));
    }
    const color = text.match(/^(\s*\[[^\]]+]\s+)is\s+colou?red\s+(?!in\b)(\S+)\s*$/i);
    const missingDurationSpace = text.match(/^(\s*\[[^\]]+]\s+(?:lasts|requires)\s+)(\d+)(days?|weeks?|months?)\s*$/i);
    const duplicateTask = text.match(/^(\s*\[([^\]]+)]\s+)\[\2]\s+(.+)$/i);
    const missingCloseBracket =
      diagnostic.code === "missing-closing-bracket"
        ? text.match(
            /^(\s*(?:then\s+)?\[[^\]]*?)(\s+)(starts|ends|lasts|requires|happens|is|on|pauses|links|displays|as)\b(.*)$/i,
          )
        : undefined;
    const missingKeywordSpace =
      diagnostic.code === "malformed-statement"
        ? text.match(/^(\s*(?:then\s+)?\[[^\]]+]\s+)(starts|ends|lasts|requires|happens|pauses|is)(\d)(.*)$/i)
        : undefined;
    const invalidDateFix = diagnostic.code === "invalid-date" ? normalizeDateGuess(text) : undefined;
    // A loosely-formatted date (missing zero-padding, dotted separators) after "starts"/"ends"/
    // "pauses on" doesn't match the parser's strict date shape at all, so it's reported as a
    // generic malformed statement rather than "invalid-date" -- handle it here too.
    const looseDateStatement =
      diagnostic.code === "malformed-statement"
        ? text.match(/^(\s*(?:then\s+)?\[[^\]]+]\s+(?:starts|ends|pauses\s+on)\s+)(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\s*$/i)
        : undefined;
    const looseDateFix = looseDateStatement?.[2] ? normalizeDateGuess(looseDateStatement[2]) : undefined;
    const keywordTypo =
      diagnostic.code === "malformed-statement" && !missingKeywordSpace && !looseDateFix
        ? text.match(/^(\s*(?:then\s+)?\[[^\]]+]\s+)(\S+)(.*)$/i)
        : undefined;
    const keywordSuggestion = keywordTypo?.[2] ? closestKeyword(keywordTypo[2]) : undefined;
    const unsupportedNotePosition =
      diagnostic.code === "unsupported-gantt-note-position"
        ? text.replace(/^(\s*note\s+)(?:top|left|right)/i, "$1bottom")
        : undefined;
    const replacement = syntaxRepair
      ? text.replace(syntaxRepair[0], syntaxRepair[1])
      : unsupportedNotePosition
        ? unsupportedNotePosition
        : missingCloseBracket
          ? `${missingCloseBracket[1]}]${missingCloseBracket[2]}${missingCloseBracket[3]}${missingCloseBracket[4]}`
          : invalidDateFix
            ? invalidDateFix
            : looseDateStatement && looseDateFix
              ? `${looseDateStatement[1]}${looseDateFix}`
              : duplicateTask
                ? `${duplicateTask[1]}${duplicateTask[3]}`
                : color
                  ? `${color[1]}is colored in ${color[2]}`
                  : missingKeywordSpace
                    ? `${missingKeywordSpace[1]}${missingKeywordSpace[2]} ${missingKeywordSpace[3]}${missingKeywordSpace[4]}`
                    : missingDurationSpace
                      ? `${missingDurationSpace[1]}${missingDurationSpace[2]} ${missingDurationSpace[3]}`
                      : keywordSuggestion && keywordTypo
                        ? `${keywordTypo[1]}${keywordSuggestion}${keywordTypo[3]}`
                        : undefined;
    return replacement
      ? [
          {
            from: diagnostic.range.from,
            to: diagnostic.range.to,
            replacement,
            message: diagnostic.message,
            label: syntaxRepair
              ? syntaxRepair[2]
              : missingCloseBracket
                ? "Close task bracket"
                : invalidDateFix || looseDateFix
                  ? "Normalize date"
                  : color
                    ? "Add missing in"
                    : missingDurationSpace || missingKeywordSpace
                      ? "Insert missing space"
                      : keywordSuggestion
                        ? `Use ${keywordSuggestion}`
                        : "Fix statement",
          },
        ]
      : [];
  });
}
