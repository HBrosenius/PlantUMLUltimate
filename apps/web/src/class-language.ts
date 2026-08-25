import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { Diagnostic } from "@codemirror/lint";
import { parseClassDiagram } from "@plantuml-studio/diagram-class";
import { PLANTUML_COLOR_NAMES } from "./gantt-language";
const KEYWORDS = [
  "class",
  "abstract class",
  "interface",
  "enum",
  "annotation",
  "package",
  "namespace",
  "note right of",
  "note left of",
  "hide empty members",
  "skinparam classAttributeIconSize 0",
  "left to right direction",
  "top to bottom direction",
];
export function classCompletions(c: CompletionContext): CompletionResult | null {
  const src = c.state.doc.toString(),
    d = parseClassDiagram(src),
    line = c.state.doc.lineAt(c.pos),
    before = c.state.sliceDoc(line.from, c.pos),
    color = before.match(/#([A-Za-z]*)$/);
  if (color)
    return {
      from: c.pos - color[1]!.length,
      options: PLANTUML_COLOR_NAMES.map((label) => ({ label, type: "constant" })),
    };
  if (/[-.*o|>]+\s+[^:]*$/.test(before)) {
    const m = before.match(/([\w.$-]*)$/);
    return {
      from: c.pos - (m?.[1]?.length ?? 0),
      options: d.entities.map((x) => ({ label: x.alias ?? x.label, type: "class", detail: x.kind })),
    };
  }
  const word = c.matchBefore(/[\w ]*/);
  if (!c.explicit && (!word || word.from === word.to)) return null;
  return {
    from: word?.from ?? c.pos,
    options: [
      ...KEYWORDS.map((label) => ({ label, type: "keyword" })),
      { label: "inheritance", type: "keyword", apply: "--|> " },
      { label: "implementation", type: "keyword", apply: "..|> " },
      { label: "composition", type: "keyword", apply: "*-- " },
      { label: "aggregation", type: "keyword", apply: "o-- " },
      { label: "dependency", type: "keyword", apply: "..> " },
    ],
  };
}
export const classDiagnostics = (s: string): Diagnostic[] =>
  parseClassDiagram(s).diagnostics.map((x) => ({
    from: x.range.from,
    to: x.range.to,
    severity: x.severity,
    message: x.message,
    source: "PlantUML Class",
  }));
export interface ClassQuickFix {
  from: number;
  to: number;
  replacement: string;
  message: string;
}
export function classQuickFixes(source: string): ClassQuickFix[] {
  const document = parseClassDiagram(source);
  const end = /^\s*@enduml\b/im.exec(source);
  return document.diagnostics.flatMap((item) => {
    if (item.code === "unterminated-package" || item.code === "unterminated-class")
      return [
        {
          from: end?.index ?? source.length,
          to: end?.index ?? source.length,
          replacement: "}\n",
          message: item.code === "unterminated-class" ? "Close class member block" : "Close package",
        },
      ];
    if (item.code === "unexpected-package-end")
      return [
        {
          from: item.range.from,
          to: Math.min(source.length, item.range.to + (source[item.range.to] === "\n" ? 1 : 0)),
          replacement: "",
          message: "Remove unexpected closing brace",
        },
      ];
    return [];
  });
}
