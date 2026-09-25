import { autocompletion } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { linter } from "@codemirror/lint";
import { ganttCompletions } from "./gantt-language";
import { plantUmlGanttHighlightStyle, plantUmlGanttMode } from "./plantuml-gantt-mode";
import { plantUmlSequenceHighlightStyle, plantUmlSequenceMode } from "./plantuml-sequence-mode";
import { sequenceCompletions } from "./sequence-language";
import { plantUmlUseCaseHighlightStyle, plantUmlUseCaseMode } from "./plantuml-usecase-mode";
import { useCaseCompletions } from "./usecase-language";
import { plantUmlClassHighlightStyle, plantUmlClassMode } from "./plantuml-class-mode";
import { classCompletions } from "./class-language";
import { plantUmlActivityHighlightStyle, plantUmlActivityMode } from "./plantuml-activity-mode";
import { activityCompletions } from "./activity-language";
import { plantUmlWbsHighlightStyle, plantUmlWbsMode } from "./plantuml-wbs-mode";
import { wbsCompletions } from "./wbs-language";
import type { DiagramKind } from "./model";
import { diagnosticsForDiagram } from "./diagram-diagnostics";

export function languageExtensions(kind: DiagramKind): Extension {
  const mode =
    kind === "gantt"
      ? plantUmlGanttMode
      : kind === "sequence"
        ? plantUmlSequenceMode
        : kind === "usecase"
          ? plantUmlUseCaseMode
          : kind === "class" || kind === "component"
            ? plantUmlClassMode
            : kind === "activity"
              ? plantUmlActivityMode
              : plantUmlWbsMode;
  const highlights =
    kind === "gantt"
      ? plantUmlGanttHighlightStyle
      : kind === "sequence"
        ? plantUmlSequenceHighlightStyle
        : kind === "usecase"
          ? plantUmlUseCaseHighlightStyle
          : kind === "class" || kind === "component"
            ? plantUmlClassHighlightStyle
            : kind === "activity"
              ? plantUmlActivityHighlightStyle
              : plantUmlWbsHighlightStyle;
  const completions =
    kind === "gantt"
      ? ganttCompletions
      : kind === "sequence"
        ? sequenceCompletions
        : kind === "usecase"
          ? useCaseCompletions
          : kind === "class" || kind === "component"
            ? classCompletions
            : kind === "activity"
              ? activityCompletions
              : wbsCompletions;
  return [
    StreamLanguage.define(mode),
    syntaxHighlighting(highlights),
    autocompletion({ override: [completions] }),
    linter((current) => diagnosticsForDiagram(kind, current.state.doc.toString()), { delay: 120 }),
  ];
}
