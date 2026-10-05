import { relatedDiagnosticFixes } from "./diagram-diagnostic-fixes";
import { autocompletion } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { linter, type Diagnostic } from "@codemirror/lint";
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
import { withManualErrorGuidance } from "./manual-error-guidance";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";

export function languageExtensions(kind: DiagramKind, onPreviewFixes?: (diagnostic: Diagnostic) => void): Extension {
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
    linter(
      (current) => {
        const source = current.state.doc.toString();
        const fixes = quickFixesForDiagram(kind, source);
        const diagnostics = withManualErrorGuidance(kind, diagnosticsForDiagram(kind, source), fixes);
        return onPreviewFixes
          ? diagnostics.map((diagnostic) => ({
              ...diagnostic,
              actions:
                !current.state.readOnly && relatedDiagnosticFixes(kind, source, diagnostic, fixes).length
                  ? [
                      {
                        name: "Preview fixes",
                        apply(view) {
                          if (!view.state.readOnly && view.state.doc.toString() === source) onPreviewFixes(diagnostic);
                        },
                      },
                    ]
                  : [],
            }))
          : diagnostics;
      },
      { delay: 120 },
    ),
  ];
}
