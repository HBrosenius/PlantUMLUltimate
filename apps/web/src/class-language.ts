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
  "component",
  "database",
  "queue",
  "cloud",
  "node",
  "artifact",
  "file",
  "folder",
  "rectangle",
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
  const typeWord = before.match(/[A-Za-z_$][\w.$-]*$/);
  const relationshipLine = /(?:<\|)?[o*]?[-.]+(?:left|right|up|down)?[-.]*[|>]?/i.test(before);
  const memberTypeContext = !relationshipLine && before.includes(":");
  const classGenericContext = /^\s*(?:(?:abstract\s+)?class|abstract|interface|enum|annotation)\b[^{}]*<[^>]*$/i.test(
    before,
  );
  if (memberTypeContext || classGenericContext) {
    const from = typeWord ? c.pos - typeWord[0].length : c.pos;
    return {
      from,
      options: d.entities.map((entity) => {
        const identity = entity.alias ?? entity.label;
        return {
          label: entity.label,
          ...(identity !== entity.label ? { apply: identity, filterText: `${entity.label} ${identity}` } : {}),
          type: "class",
          detail: entity.alias ? `${entity.kind} · alias ${entity.alias}` : entity.kind,
        };
      }),
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
  label?: string;
  choiceGroup?: string;
  from: number;
  to: number;
  replacement: string;
  message: string;
}
export function classQuickFixes(source: string): ClassQuickFix[] {
  const document = parseClassDiagram(source);
  const end = /^\s*@enduml\b/im.exec(source);
  return document.diagnostics.flatMap((item) => {
    if (item.code === "unterminated-package" || item.code === "unterminated-class") {
      const newline = source.includes("\r\n") ? "\r\n" : "\n";
      const at = end?.index ?? source.length;
      const message = item.code === "unterminated-class" ? "Close class member block" : "Close package";
      const choices: ClassQuickFix[] = [{ from: at, to: at, replacement: "}" + newline, message }];
      if (item.code === "unterminated-class") {
        const headerEnd = source.indexOf("\n", item.range.from);
        const header = source.slice(item.range.from, headerEnd < 0 ? source.length : headerEnd);
        const indent = header.match(/^\s*/)?.[0] ?? "";
        let offset = headerEnd + 1;
        let comment = false;
        let note = false;
        for (const raw of source.slice(offset, at).split("\n")) {
          const text = raw.trim();
          if (comment) {
            if (text.includes("'/")) comment = false;
          } else if (text.startsWith("/'")) comment = !text.includes("'/", 2);
          else if (note) {
            if (/^end\s+note\b/i.test(text)) note = false;
          } else if (/^note\b/i.test(text) && !text.includes(":")) note = true;
          else if (
            !text.startsWith("'") &&
            /^(?:abstract\s+class|class|interface|enum|annotation|entity|component|package|rectangle|node|database|cloud|folder|frame)\s+/i.test(
              text,
            ) &&
            (raw.match(/^\s*/)?.[0].length ?? 0) <= indent.length
          ) {
            const replacement = indent + "}" + newline;
            const candidate = source.slice(0, offset) + replacement + source.slice(offset);
            if (
              parseClassDiagram(candidate).diagnostics.filter((diagnostic) => diagnostic.severity === "error").length <
              document.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length
            ) {
              const choiceGroup = `class-close:${item.range.from}`;
              choices[0] = { ...choices[0]!, label: "Close class at diagram end", choiceGroup };
              choices.push({
                from: offset,
                to: offset,
                replacement,
                message,
                label: `Close class before line ${source.slice(0, offset).split("\n").length}`,
                choiceGroup,
              });
            }
            break;
          }
          offset += raw.length + 1;
        }
      }
      return choices;
    }
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
