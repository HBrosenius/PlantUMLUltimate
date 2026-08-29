import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { Diagnostic } from "@codemirror/lint";
import { parseSequence } from "@plantuml-studio/diagram-sequence";

const KEYWORDS = [
  "participant",
  "actor",
  "boundary",
  "control",
  "entity",
  "database",
  "collections",
  "queue",
  "activate",
  "deactivate",
  "destroy",
  "return",
  "create",
  "create participant",
  "alt",
  "else",
  "opt",
  "loop",
  "par",
  "break",
  "critical",
  "group",
  "end",
  "ref over",
  "ref#LightBlue over",
  "note over",
  "note across",
  "note left",
  "note right",
  "hnote over",
  "rnote over",
  "note left of",
  "note right of",
  "autonumber",
  "autonumber stop",
  "autonumber resume",
  "autonumber inc",
  "autoactivate on",
  "autoactivate off",
  "hide footbox",
  "show footbox",
  "hide unlinked",
  "box",
  "end box",
  "newpage",
  "title",
  "header",
  "footer",
  "legend",
  "skinparam sequence",
  "teoz on",
  "...delay...",
  "== separator ==",
  "||20||",
];
const COLORS = [
  "AliceBlue",
  "Black",
  "Blue",
  "Crimson",
  "Gold",
  "Gray",
  "Green",
  "LightBlue",
  "Orange",
  "Pink",
  "Purple",
  "Red",
  "White",
  "Yellow",
];

export interface SequenceQuickFix {
  from: number;
  to: number;
  replacement: string;
  message: string;
}

export function sequenceCompletions(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = context.state.sliceDoc(line.from, context.pos);
  const participants = parseSequence(context.state.doc.toString()).participants;
  const names = participants.map((participant) => ({
    label: participant.alias ?? participant.label,
    type: "variable",
    detail: participant.kind,
  }));
  const color = before.match(/#([A-Za-z]*)$/);
  if (color)
    return { from: context.pos - color[1]!.length, options: COLORS.map((label) => ({ label, type: "constant" })) };
  const target = before.match(/[^\s:]*[-.=\\/][^\s:]*\s+("?[\w.$: ]*)$/);
  if (target) {
    const typed = target[1] ?? "";
    return {
      from: context.pos - typed.length,
      options: names,
    };
  }
  const owner = before.match(
    /(?:activate|deactivate|destroy|create(?:\s+\w+)?|(?:note|hnote|rnote)\s+(?:left of|right of|over)|ref(?:\s+#[\w]+)?\s+over)\s+(?:[^,]*,\s*)?("?[\w.$: ]*)$/i,
  );
  if (owner) return { from: context.pos - owner[1]!.length, options: names };
  const word = context.matchBefore(/[\w ]*/);
  if (!context.explicit && (!word || word.from === word.to)) return null;
  return { from: word?.from ?? context.pos, options: KEYWORDS.map((label) => ({ label, type: "keyword" })) };
}

export function sequenceDiagnostics(source: string): Diagnostic[] {
  const stack: Array<{ kind: string; closer: string; from: number; to: number }> = [];
  const diagnostics: Diagnostic[] = [];
  let offset = 0;
  for (const line of source.split("\n")) {
    const start = line.match(
      /^\s*(?:(alt|opt|loop|par|break|critical|group|box)\b|(\/?\s*(?:note|hnote|rnote))\s+(?:left|right|over|across)\b(?!.*:)|ref(?:\s+#[\w]+)?\s+over\b(?!.*:))/i,
    );
    const end = line.match(/^\s*end(?:\s+(box|note|ref))?\s*$/i);
    if (start) {
      const kind = start[1]?.toLowerCase() ?? (start[2] ? "note" : "ref");
      stack.push({
        kind,
        closer: kind === "box" ? "end box" : kind === "note" ? "end note" : kind === "ref" ? "end ref" : "end",
        from: offset,
        to: offset + line.length,
      });
    } else if (end) {
      const expected = end[1]?.toLowerCase() ?? "fragment";
      const open = stack.at(-1);
      const matches =
        open && (expected === "fragment" ? !["box", "note", "ref"].includes(open.kind) : open.kind === expected);
      if (!matches)
        diagnostics.push({
          from: offset,
          to: offset + line.length,
          severity: "error",
          message: `Unexpected ${end[1] ? `end ${end[1].toLowerCase()}` : "end"}`,
          source: "PlantUML Sequence",
        });
      else stack.pop();
    }
    offset += line.length + 1;
  }
  for (const open of stack)
    diagnostics.push({
      from: open.from,
      to: open.to,
      severity: "error",
      message: `Unclosed ${open.kind} block`,
      source: "PlantUML Sequence",
    });
  return diagnostics;
}

export function sequenceQuickFixes(source: string): SequenceQuickFix[] {
  const diagnostics = sequenceDiagnostics(source);
  const end = /^\s*@enduml\b/im.exec(source);
  return diagnostics.map((diagnostic) => {
    if (diagnostic.message.startsWith("Unexpected"))
      return {
        from: diagnostic.from,
        to: Math.min(source.length, diagnostic.to + (source[diagnostic.to] === "\n" ? 1 : 0)),
        replacement: "",
        message: `Remove ${diagnostic.message.toLowerCase()}`,
      };
    const kind = diagnostic.message.match(/^Unclosed\s+(\S+)/)?.[1] ?? "fragment";
    const closer = kind === "box" ? "end box" : kind === "note" ? "end note" : kind === "ref" ? "end ref" : "end";
    const at = end?.index ?? source.length;
    return { from: at, to: at, replacement: `${closer}\n`, message: `Insert ${closer}` };
  });
}
