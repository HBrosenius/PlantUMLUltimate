import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { Diagnostic } from "@codemirror/lint";
import { convertMindmapToOrgMode, parseMindmap } from "@plantuml-studio/diagram-mindmap";
import { PLANTUML_COLOR_NAMES } from "./gantt-language";

const KEYWORDS: Completion[] = [
  { label: "* Topic", detail: "root node", type: "keyword" },
  { label: "** Idea", detail: "child node", type: "keyword" },
  { label: "*** Detail", detail: "grandchild node", type: "keyword" },
  { label: "-- Left branch", detail: "node on the left", type: "keyword" },
  { label: "++ Right branch", detail: "node on the right", type: "keyword" },
  { label: "**_ Boxless idea", detail: "node without a box", type: "keyword" },
  { label: "**: multi-line node", apply: "**:Line one\nLine two;", detail: "multi-line node", type: "keyword" },
  { label: "left side", detail: "following ** nodes go left", type: "keyword" },
  { label: "right side", detail: "following ** nodes go right", type: "keyword" },
  { label: "left to right direction", type: "keyword" },
  { label: "top to bottom direction", type: "keyword" },
  { label: "right to left direction", type: "keyword" },
  { label: "title Mindmap", type: "keyword" },
  { label: "caption Caption", type: "keyword" },
  { label: "skinparam", type: "keyword" },
  { label: "<style> block", apply: "<style>\nmindmapDiagram {\n}\n</style>", detail: "style block", type: "keyword" },
];

export function mindmapCompletions(context: CompletionContext): CompletionResult | null {
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
  return { from: word?.from ?? context.pos, options: KEYWORDS };
}

export const mindmapDiagnostics = (source: string): Diagnostic[] =>
  parseMindmap(source).diagnostics.map((item) => ({
    from: item.range.from,
    to: item.range.to,
    severity: item.severity,
    message: item.message,
    source: "PlantUML Mindmap",
  }));

export interface MindmapQuickFix {
  from: number;
  to: number;
  replacement: string;
  message: string;
}

/** The smallest single edit that turns `before` into `after`. */
function narrowEdit(before: string, after: string): { from: number; to: number; replacement: string } {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  return { from: start, to: endBefore, replacement: after.slice(start, endAfter) };
}

export function mindmapQuickFixes(source: string): MindmapQuickFix[] {
  const document = parseMindmap(source);
  const diagnostics = document.diagnostics;
  const fixes: MindmapQuickFix[] = [];
  if (diagnostics.some((item) => item.code === "missing-start"))
    fixes.push({ from: 0, to: 0, replacement: "@startmindmap\n", message: "Add @startmindmap" });
  if (diagnostics.some((item) => item.code === "missing-end"))
    fixes.push({
      from: source.length,
      to: source.length,
      replacement: `${source.endsWith("\n") ? "" : "\n"}@endmindmap`,
      message: "Add @endmindmap",
    });
  if (diagnostics.some((item) => item.code === "markdown-form")) {
    const converted = convertMindmapToOrgMode(source, document);
    if (converted !== source)
      fixes.push({ ...narrowEdit(source, converted), message: "Convert to * markers (OrgMode) to edit visually" });
  }
  for (const item of diagnostics) {
    if (item.code !== "unsupported-arrow") continue;
    // Remove the whole line, including its line break.
    const lineEnd = source.indexOf("\n", item.range.to);
    const from = source.lastIndexOf("\n", item.range.from - 1) + 1;
    fixes.push({
      from,
      to: lineEnd < 0 ? source.length : lineEnd + 1,
      replacement: "",
      message: "Remove the arrow line (not supported in mindmaps)",
    });
  }
  return fixes;
}
