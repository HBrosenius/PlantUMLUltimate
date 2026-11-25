import {
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { Diagnostic } from "@codemirror/lint";
import { C4_MACROS, c4IncludeLine, c4Macro, includesC4Library, parseC4, type C4Macro } from "./c4-source";

/** `Container(${alias}, "${label}", "${techn}", "${descr}")` with the parameters as tab stops. */
export function c4Snippet(macro: C4Macro): string {
  const quoted = new Set(["label", "techn", "descr", "type", "tags", "link", "sprite"]);
  const optionalShown =
    macro.category === "relationship" ? ["techn"] : macro.category === "boundary" ? [] : ["techn", "descr", "type"];
  const shown = macro.params.filter((param) => !param.optional || optionalShown.includes(param.name));
  const args = shown.map((param, index) =>
    quoted.has(param.name) ? `"\${${index + 1}:${param.name}}"` : `\${${index + 1}:${param.name}}`,
  );
  return `${macro.name}(${args.join(", ")})${macro.block ? " {\n\t${}\n}" : ""}`;
}

export const c4Signature = (macro: C4Macro): string =>
  macro.params.map((param) => (param.optional ? `${param.name}?` : param.name)).join(", ");

export function c4Completions(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = context.state.sliceDoc(line.from, context.pos);
  // Inside the arguments of a relationship: offer the declared aliases.
  const call = before.match(/^\s*([A-Za-z_]\w*)\s*\(([^)]*)$/);
  const macro = call ? c4Macro(call[1]!) : undefined;
  if (call && macro) {
    const position = (call[2]!.match(/,/g) ?? []).length;
    const param = macro.params[position]?.name;
    if (macro.category === "relationship" && (param === "from" || param === "to")) {
      const word = before.match(/[\w$]*$/)![0];
      return {
        from: context.pos - word.length,
        options: parseC4(context.state.doc.toString()).elements.map((element) => ({
          label: element.id,
          type: "variable",
          detail: element.label,
        })),
      };
    }
    return null;
  }
  const word = context.matchBefore(/[A-Za-z_]\w*/);
  if (!word && !context.explicit) return null;
  if (word && /^\s*[A-Za-z_]\w*\s*\(/.test(line.text.slice(word.from - line.from))) return null;
  const options: Completion[] = [
    ...C4_MACROS.filter((item) => item.category !== "layout").map((item) =>
      snippetCompletion(c4Snippet(item), {
        label: item.name,
        detail: c4Signature(item),
        info: item.detail,
        type: "function",
      }),
    ),
    ...C4_MACROS.filter((item) => item.category === "layout").map((item) => ({
      label: item.params.length ? item.name : `${item.name}()`,
      type: "keyword",
      detail: item.detail,
    })),
    ...["C4_Context", "C4_Container", "C4_Component", "C4_Dynamic", "C4_Deployment"].map((name) => ({
      label: `!include <C4/${name}>`,
      type: "keyword",
      detail: "C4 library",
    })),
    { label: "title", type: "keyword" },
    { label: "skinparam", type: "keyword" },
  ];
  return { from: word?.from ?? context.pos, options };
}

/** Where a missing include goes: right after `@startuml`. */
function includeInsertion(source: string): { from: number; newline: string } | undefined {
  const start = /^[ \t]*@startuml\b[^\n]*/im.exec(source);
  if (!start) return undefined;
  return { from: start.index + start[0].length, newline: source.includes("\r\n") ? "\r\n" : "\n" };
}

interface C4Problem {
  from: number;
  to: number;
  severity: "error" | "warning";
  message: string;
  fix?: { from: number; to: number; replacement: string; message: string };
}

function c4Problems(source: string): C4Problem[] {
  const problems: C4Problem[] = [];
  const document = parseC4(source);
  const hasOtherInclude = /^\s*!\s*include\w*\s/im.test(source.replace(/^\s*!\s*include\w*\s+<C4\/[^\n]*/gim, ""));
  // A macro call with no include to define it, unless some other include might.
  const first = document.elements[0] ?? document.relationships[0];
  if (first && !includesC4Library(source) && !hasOtherInclude) {
    const macro = c4Macro("macro" in first ? first.macro : "Rel");
    const insertion = includeInsertion(source);
    const library = macro?.library ?? "C4_Container";
    problems.push({
      from: first.range.from,
      to: first.range.to,
      severity: "error",
      message: `${"macro" in first ? first.macro : "Rel"} is a C4 macro, but the diagram doesn't include the C4 library. Add ${c4IncludeLine(library)}.`,
      ...(insertion
        ? {
            fix: {
              from: insertion.from,
              to: insertion.from,
              replacement: `${insertion.newline}${c4IncludeLine(library)}`,
              message: `Add ${c4IncludeLine(library)}`,
            },
          }
        : {}),
    });
  }
  // Blocks: boundaries and deployment nodes end with }.
  let offset = 0;
  const open: Array<{ from: number; to: number }> = [];
  let comment = false;
  for (const raw of source.split("\n")) {
    const from = offset;
    offset += raw.length + 1;
    const line = raw.replace(/\r$/, "");
    const text = line.trim();
    if (comment) {
      if (text.includes("'/")) comment = false;
      continue;
    }
    if (text.startsWith("/'")) {
      comment = !text.includes("'/", 2);
      continue;
    }
    if (!text || text.startsWith("'") || /^@/.test(text)) continue;
    if (/^\}\s*(?:'.*)?$/.test(text)) {
      if (open.pop()) continue;
      problems.push({
        from,
        to: from + line.length,
        severity: "error",
        message: "This } has no matching boundary or node.",
        fix: {
          from,
          to: Math.min(source.length, from + raw.length + 1),
          replacement: "",
          message: "Remove the extra }",
        },
      });
      continue;
    }
    if (/\{\s*(?:'.*)?$/.test(text)) open.push({ from, to: from + line.length });
  }
  const end = /^[ \t]*@enduml\b/im.exec(source);
  for (const block of open)
    problems.push({
      from: block.from,
      to: block.to,
      severity: "error",
      message: "This boundary or node is never closed. Add a } after its contents.",
      fix: {
        from: end?.index ?? source.length,
        to: end?.index ?? source.length,
        replacement: `}${source.includes("\r\n") ? "\r\n" : "\n"}`,
        message: "Close the boundary",
      },
    });
  // Relationships between aliases that nothing declares (only when no other include could declare them).
  if (!hasOtherInclude) {
    const declared = new Set(document.elements.map((element) => element.id));
    for (const relationship of document.relationships)
      for (const alias of [relationship.from, relationship.to])
        if (alias && /^[A-Za-z_]\w*$/.test(alias) && !declared.has(alias))
          problems.push({
            from: relationship.range.from,
            to: relationship.range.to,
            severity: "warning",
            message: `${alias} isn't declared in this diagram. Declare it with Person, System, Container or Component first.`,
          });
  }
  return problems;
}

export const c4Diagnostics = (source: string): Diagnostic[] =>
  c4Problems(source).map(({ from, to, severity, message }) => ({ from, to, severity, message, source: "PlantUML C4" }));

export interface C4QuickFix {
  label?: string;
  choiceGroup?: string;
  from: number;
  to: number;
  replacement: string;
  message: string;
}

export const c4QuickFixes = (source: string): C4QuickFix[] =>
  c4Problems(source).flatMap((problem) => (problem.fix ? [problem.fix] : []));
