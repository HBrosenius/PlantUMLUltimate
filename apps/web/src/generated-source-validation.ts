import type { Diagnostic } from "@codemirror/lint";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseUseCase } from "@plantuml-studio/diagram-usecase";
import { parseClassDiagram } from "@plantuml-studio/diagram-class";
import { parseActivity } from "@plantuml-studio/diagram-activity";
import { parseWbs } from "@plantuml-studio/diagram-wbs";
import { parseMindmap } from "@plantuml-studio/diagram-mindmap";
import type { DiagramKind } from "./model";
import { diagnosticsForDiagram } from "./diagram-diagnostics";

export interface GeneratedSourceValidation {
  valid: boolean;
  introduced: Diagnostic[];
  message?: string;
}

const markers: Record<DiagramKind, [string, string]> = {
  gantt: ["@startgantt", "@endgantt"],
  wbs: ["@startwbs", "@endwbs"],
  mindmap: ["@startmindmap", "@endmindmap"],
  sequence: ["@startuml", "@enduml"],
  usecase: ["@startuml", "@enduml"],
  class: ["@startuml", "@enduml"],
  component: ["@startuml", "@enduml"],
  activity: ["@startuml", "@enduml"],
  c4: ["@startuml", "@enduml"],
};

const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const errors = (kind: DiagramKind, source: string) =>
  diagnosticsForDiagram(kind, source).filter((item) => item.severity === "error");

function preservedSyntax(kind: DiagramKind, source: string): string[] {
  const unknown =
    kind === "gantt"
      ? parseGantt(source).document.unknown
      : kind === "usecase"
        ? parseUseCase(source).unknown
        : kind === "class" || kind === "component"
          ? parseClassDiagram(source).unknown
          : kind === "activity"
            ? parseActivity(source).unknown
            : kind === "wbs"
              ? parseWbs(source).unknown
              : kind === "mindmap"
                ? parseMindmap(source).unknown
                : kind === "c4"
                  ? c4PreservedSyntax(source)
                  : [];
  return unknown.map((item) => item.text);
}

/**
 * The preprocessor lines of a C4 diagram: the `!include` that gives it its macros, themes and the definitions it
 * makes itself. They are not editable in forms, so an edit that changes or drops one is refused.
 */
function c4PreservedSyntax(source: string): Array<{ text: string }> {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^!\s*(?:include\w*|theme|define\w*|(?:unquoted\s+)?(?:procedure|function))\b/i.test(line))
    .map((text) => ({ text }));
}

const occurrences = (source: string, value: string): number =>
  value.length === 0 ? 0 : source.split(value).length - 1;

export function validateGeneratedSource(kind: DiagramKind, before: string, after: string): GeneratedSourceValidation {
  const [start, end] = markers[kind];
  if (
    !new RegExp(`^\\s*${escaped(start)}\\b`, "im").test(after) ||
    !new RegExp(`^\\s*${escaped(end)}\\b`, "im").test(after)
  )
    return {
      valid: false,
      introduced: [],
      message: `The operation would remove a required ${start} or ${end} marker.`,
    };

  const remaining = new Map<string, number>();
  for (const diagnostic of errors(kind, before)) {
    const key = `${diagnostic.severity}\u0000${diagnostic.message}`;
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  const introduced = errors(kind, after).filter((diagnostic) => {
    const key = `${diagnostic.severity}\u0000${diagnostic.message}`;
    const count = remaining.get(key) ?? 0;
    if (count < 1) return true;
    remaining.set(key, count - 1);
    return false;
  });
  const preserved = preservedSyntax(kind, before);
  const preservedCounts = new Map<string, number>();
  for (const text of preserved) preservedCounts.set(text, (preservedCounts.get(text) ?? 0) + 1);
  if ([...preservedCounts].some(([text, count]) => occurrences(after, text) < count))
    return {
      valid: false,
      introduced,
      message: "The operation would modify syntax that is preserved but not visually editable.",
    };
  return introduced.length
    ? {
        valid: false,
        introduced,
        message: `The operation would introduce ${introduced[0]!.message.toLowerCase()}`,
      }
    : { valid: true, introduced: [] };
}
