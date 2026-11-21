import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { Diagnostic } from "@codemirror/lint";
import { convertMindmapToOrgMode, parseMindmap } from "@plantuml-studio/diagram-mindmap";
import { PLANTUML_COLOR_NAMES } from "./gantt-language";

/**
 * `<style>` blocks the pinned engine draws (fixtures 10, 22 and 36 in tests/fixtures/mindmap-svg). None of
 * them has a `* {` rule: the engine reads that line as a node and crashes (fixtures 15 and 34).
 */
export const MINDMAP_STYLE_SNIPPETS = {
  block: ["<style>", "mindmapDiagram {", "  node {", "    BackgroundColor lightyellow", "  }", "}", "</style>"].join(
    "\n",
  ),
  styleClass: [
    "<style>",
    "mindmapDiagram {",
    "  .green {",
    "    BackgroundColor lightgreen",
    "  }",
    "}",
    "</style>",
  ].join("\n"),
  depth: ["<style>", "mindmapDiagram {", "  :depth(1) {", "    BackgroundColor lightblue", "  }", "}", "</style>"].join(
    "\n",
  ),
  maximumWidth: ["<style>", "mindmapDiagram {", "  node {", "    MaximumWidth 150", "  }", "}", "</style>"].join("\n"),
} as const;

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
  { label: "<style> block", apply: MINDMAP_STYLE_SNIPPETS.block, detail: "style block", type: "keyword" },
  {
    label: "<style> class",
    apply: MINDMAP_STYLE_SNIPPETS.styleClass,
    detail: "style for nodes marked <<green>>",
    type: "keyword",
  },
  {
    label: "<style> depth",
    apply: MINDMAP_STYLE_SNIPPETS.depth,
    detail: "style for one level of nodes",
    type: "keyword",
  },
  {
    label: "<style> maximum width",
    apply: MINDMAP_STYLE_SNIPPETS.maximumWidth,
    detail: "wrap long labels",
    type: "keyword",
  },
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

const STAR_RULE_MESSAGE = "A `* {` style rule crashes the PlantUML engine. Use `node {` for every node.";

/** The `*` of every `* {` rule line inside a `<style>` block. */
function styleStarRules(source: string): Array<{ from: number; to: number }> {
  const found: Array<{ from: number; to: number }> = [];
  let inStyle = false;
  let offset = 0;
  for (const line of source.split("\n")) {
    const text = line.replace(/\r$/, "");
    if (/^\s*<style\b/i.test(text)) inStyle = !/<\/style>/i.test(text);
    else if (inStyle && /^\s*<\/style>/i.test(text)) inStyle = false;
    else if (inStyle) {
      const star = /^(\s*)(\*)(?=\s*\{)/.exec(text);
      if (star) found.push({ from: offset + star[1]!.length, to: offset + star[1]!.length + 1 });
    }
    offset += line.length + 1;
  }
  return found;
}

export const mindmapDiagnostics = (source: string): Diagnostic[] => [
  ...parseMindmap(source).diagnostics.map((item) => ({
    from: item.range.from,
    to: item.range.to,
    severity: item.severity,
    message: item.message,
    source: "PlantUML Mindmap",
  })),
  ...styleStarRules(source).map((range) => ({
    ...range,
    severity: "warning" as const,
    message: STAR_RULE_MESSAGE,
    source: "PlantUML Mindmap",
  })),
];

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
  for (const range of styleStarRules(source))
    fixes.push({
      ...range,
      replacement: "node",
      message: "Replace the * {} rule with node {} (the engine crashes on *)",
    });
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
