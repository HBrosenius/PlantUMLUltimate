import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { Diagnostic as CodeMirrorDiagnostic } from "@codemirror/lint";
import { parseGantt } from "@plantuml-studio/diagram-gantt";

export interface GanttQuickFix {
  from: number;
  to: number;
  replacement: string;
  message: string;
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

export function ganttDiagnostics(source: string): CodeMirrorDiagnostic[] {
  const diagnostics = parseGantt(source).diagnostics;
  const fixes = quickFixesForDiagnostics(source, diagnostics);
  return diagnostics.map((diagnostic) => {
    const fix = fixes.find((item) => item.from === diagnostic.range.from && item.to === diagnostic.range.to);
    return {
      from: diagnostic.range.from,
      to: diagnostic.range.to,
      severity: diagnostic.severity,
      message: diagnostic.message,
      source: "PlantUML Gantt",
      ...(fix
        ? {
            actions: [
              {
                name: "Fix statement",
                apply(view: import("@codemirror/view").EditorView) {
                  view.dispatch({ changes: { from: fix.from, to: fix.to, insert: fix.replacement } });
                },
              },
            ],
          }
        : {}),
    };
  });
}

export function ganttQuickFixes(source: string): GanttQuickFix[] {
  return quickFixesForDiagnostics(source, parseGantt(source).diagnostics);
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
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]!
          : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
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
  return normalized === value ? undefined : normalized;
}

function quickFixesForDiagnostics(
  source: string,
  diagnostics: ReturnType<typeof parseGantt>["diagnostics"],
): GanttQuickFix[] {
  return diagnostics.flatMap((diagnostic) => {
    const text = source.slice(diagnostic.range.from, diagnostic.range.to);
    const color = text.match(/^(\s*\[[^\]]+]\s+)is\s+colou?red\s+(\S+)\s*$/i);
    const missingDurationUnit = text.match(/^(\s*\[[^\]]+]\s+(?:lasts|requires)\s+\d+)\s*$/i);
    const missingDurationSpace = text.match(
      /^(\s*\[[^\]]+]\s+(?:lasts|requires)\s+)(\d+)(days?|weeks?|months?)\s*$/i,
    );
    const invalidDuration = text.match(/^(\s*\[[^\]]+]\s+(?:lasts|requires)\s+).+$/i);
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
    const replacement = unsupportedNotePosition
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
                  : missingDurationUnit
                    ? `${missingDurationUnit[1]} days`
                    : diagnostic.code === "invalid-duration" && invalidDuration
                      ? `${invalidDuration[1]}1 day`
                      : keywordSuggestion && keywordTypo
                        ? `${keywordTypo[1]}${keywordSuggestion}${keywordTypo[3]}`
                        : undefined;
    return replacement
      ? [{ from: diagnostic.range.from, to: diagnostic.range.to, replacement, message: diagnostic.message }]
      : [];
  });
}
