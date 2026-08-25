import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { Diagnostic } from "@codemirror/lint";
import { parseUseCase } from "@plantuml-studio/diagram-usecase";
import { PLANTUML_COLOR_NAMES } from "./gantt-language";

const KEYWORDS = [
  "actor",
  "actor/",
  "usecase",
  "usecase/",
  "package",
  "rectangle",
  "note left of",
  "note right of",
  "note top of",
  "note bottom of",
  "left to right direction",
  "top to bottom direction",
  "skinparam actorStyle awesome",
  "skinparam actorStyle hollow",
  "skinparam packageStyle rectangle",
  "title",
  "caption",
  "legend",
  "newpage",
];

export interface UseCaseQuickFix {
  from: number;
  to: number;
  replacement: string;
  message: string;
}

export function useCaseCompletions(context: CompletionContext): CompletionResult | null {
  const source = context.state.doc.toString();
  const document = parseUseCase(source);
  const line = context.state.doc.lineAt(context.pos);
  const before = context.state.sliceDoc(line.from, context.pos);
  const color = before.match(/#([A-Za-z]*)$/);
  if (color)
    return {
      from: context.pos - color[1]!.length,
      options: PLANTUML_COLOR_NAMES.map((label) => ({ label, type: "constant" })),
    };
  const stereotype = before.match(/<<\s*([^>]*)$/);
  if (stereotype)
    return {
      from: context.pos - stereotype[1]!.length,
      options: document.stereotypes.map((label) => ({ label, type: "type" })),
    };
  const endpoint = before.match(/(?:^|\s)("?[\w .$/-]*)$/);
  if (/[-.][^\s]*\s+[^:]*$/.test(before) && endpoint) {
    const typed = endpoint[1] ?? "";
    return {
      from: context.pos - typed.length,
      options: document.elements.map((item) => ({
        label: item.alias ?? item.label,
        type: "variable",
        detail: item.kind === "actor" ? "Actor" : "Use case",
      })),
    };
  }
  const noteTarget = before.match(/note\s+(?:left|right|top|bottom)\s+of\s+([^\s]*)$/i);
  if (noteTarget)
    return {
      from: context.pos - noteTarget[1]!.length,
      options: document.elements.map((item) => ({ label: item.alias ?? item.label, type: "variable" })),
    };
  const word = context.matchBefore(/[\w ]*/);
  if (!context.explicit && (!word || word.from === word.to)) return null;
  return {
    from: word?.from ?? context.pos,
    options: [
      ...KEYWORDS.map((label) => ({ label, type: "keyword" })),
      { label: "association", type: "keyword", apply: "--> " },
      { label: "include relationship", type: "keyword", apply: "..>  : <<include>>" },
      { label: "extend relationship", type: "keyword", apply: "..>  : <<extend>>" },
      { label: "generalization", type: "keyword", apply: "--|> " },
    ],
  };
}

export function useCaseDiagnostics(source: string): Diagnostic[] {
  return parseUseCase(source).diagnostics.map((item) => ({
    from: item.range.from,
    to: item.range.to,
    severity: item.severity,
    message: item.message,
    source: "PlantUML Use Case",
  }));
}

export function getUseCaseQuickFixes(source: string): UseCaseQuickFix[] {
  const document = parseUseCase(source);
  const end = /^\s*@enduml\b/im.exec(source);
  return document.diagnostics.flatMap((item) =>
    item.code === "unterminated-package"
      ? [
          {
            from: end?.index ?? source.length,
            to: end?.index ?? source.length,
            replacement: "}\n",
            message: "Close package or rectangle",
          },
        ]
      : item.code === "unexpected-package-end"
        ? [
            {
              from: item.range.from,
              to: Math.min(source.length, item.range.to + (source[item.range.to] === "\n" ? 1 : 0)),
              replacement: "",
              message: "Remove unexpected closing brace",
            },
          ]
        : [],
  );
}
