import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { Diagnostic } from "@codemirror/lint";
import { parseActivity } from "@plantuml-studio/diagram-activity";
import { PLANTUML_COLOR_NAMES } from "./gantt-language";

const KEYWORDS = [
  "start",
  "stop",
  "end",
  ":Action;",
  "if (condition) then (yes)",
  "else (no)",
  "endif",
  "fork",
  "fork again",
  "end fork",
  "repeat",
  "repeat while (condition) is (yes)",
  "while (condition) is (yes)",
  "endwhile (no)",
  'partition "Team" {',
  "note right",
  "end note",
];

export function activityCompletions(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = context.state.sliceDoc(line.from, context.pos);
  const color = before.match(/#([A-Za-z]*)$/);
  if (color)
    return {
      from: context.pos - color[1]!.length,
      options: PLANTUML_COLOR_NAMES.map((label) => ({ label, type: "constant" })),
    };
  const word = context.matchBefore(/[\w :()"-]*/);
  if (!context.explicit && (!word || word.from === word.to)) return null;
  return { from: word?.from ?? context.pos, options: KEYWORDS.map((label) => ({ label, type: "keyword" })) };
}

export const activityDiagnostics = (source: string): Diagnostic[] =>
  parseActivity(source).diagnostics.map((item) => ({
    from: item.range.from,
    to: item.range.to,
    severity: item.severity,
    message: item.message,
    source: "PlantUML Activity",
  }));

export interface ActivityQuickFix { from: number; to: number; replacement: string; message: string }
export function activityQuickFixes(source: string): ActivityQuickFix[] {
  const end = /^\s*@enduml\b/im.exec(source)?.index ?? source.length;
  return parseActivity(source).diagnostics.flatMap((item) => {
    const endings: Record<string, string> = {
      if: "endif",
      switch: "endswitch",
      fork: "end fork",
      split: "end split",
      repeat: "repeat while (condition?)",
      while: "endwhile",
    };
    if (item.code === "unterminated-partition") return [{ from: end, to: end, replacement: "}\n", message: "Close partition" }];
    if (item.code === "unterminated-control") {
      const kind = item.message.split(" ")[0]?.toLowerCase() ?? "";
      return [{ from: end, to: end, replacement: `${endings[kind] ?? "endif"}\n`, message: `Close ${kind} block` }];
    }
    return [];
  });
}
