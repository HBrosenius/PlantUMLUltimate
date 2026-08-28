import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { Diagnostic } from "@codemirror/lint";
import { parseWbs } from "@plantuml-studio/diagram-wbs";
import { PLANTUML_COLOR_NAMES } from "./gantt-language";

const KEYWORDS = [
  "* Project",
  "** Work package",
  "*** Task",
  "-- Left branch",
  "++ Right branch",
  "title WBS",
  "skinparam",
  "<style>\n</style>",
];
export function wbsCompletions(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = context.state.sliceDoc(line.from, context.pos);
  const color = before.match(/#([A-Za-z]*)$/);
  if (color)
    return {
      from: context.pos - color[1]!.length,
      options: PLANTUML_COLOR_NAMES.map((label) => ({ label, type: "constant" })),
    };
  const word = context.matchBefore(/[\w *+\-<>]*/);
  if (!context.explicit && (!word || word.from === word.to)) return null;
  return { from: word?.from ?? context.pos, options: KEYWORDS.map((label) => ({ label, type: "keyword" })) };
}
export const wbsDiagnostics = (source: string): Diagnostic[] =>
  parseWbs(source).diagnostics.map((item) => ({
    from: item.range.from,
    to: item.range.to,
    severity: item.severity,
    message: item.message,
    source: "PlantUML WBS",
  }));
export interface WbsQuickFix {
  from: number;
  to: number;
  replacement: string;
  message: string;
}
export function wbsQuickFixes(source: string): WbsQuickFix[] {
  const diagnostics = parseWbs(source).diagnostics;
  const fixes: WbsQuickFix[] = [];
  if (diagnostics.some((item) => item.code === "missing-start"))
    fixes.push({ from: 0, to: 0, replacement: "@startwbs\n", message: "Add @startwbs" });
  if (diagnostics.some((item) => item.code === "missing-end"))
    fixes.push({
      from: source.length,
      to: source.length,
      replacement: `${source.endsWith("\n") ? "" : "\n"}@endwbs`,
      message: "Add @endwbs",
    });
  return fixes;
}
