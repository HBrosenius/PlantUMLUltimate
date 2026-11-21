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
import { plantUmlMindmapHighlightStyle, plantUmlMindmapMode } from "./plantuml-mindmap-mode";
import { mindmapCompletions } from "./mindmap-language";
import type { DiagramKind } from "./model";
import { withManualErrorGuidance } from "./manual-error-guidance";
import { analyzeDiagram } from "./diagram-diagnostics";

/** Exhaustive: a new kind fails to compile here instead of silently getting another kind's editor support. */
function languageSupport(kind: DiagramKind) {
  switch (kind) {
    case "gantt":
      return { mode: plantUmlGanttMode, highlights: plantUmlGanttHighlightStyle, completions: ganttCompletions };
    case "sequence":
      return {
        mode: plantUmlSequenceMode,
        highlights: plantUmlSequenceHighlightStyle,
        completions: sequenceCompletions,
      };
    case "usecase":
      return { mode: plantUmlUseCaseMode, highlights: plantUmlUseCaseHighlightStyle, completions: useCaseCompletions };
    case "class":
    case "component":
      return { mode: plantUmlClassMode, highlights: plantUmlClassHighlightStyle, completions: classCompletions };
    case "activity":
      return {
        mode: plantUmlActivityMode,
        highlights: plantUmlActivityHighlightStyle,
        completions: activityCompletions,
      };
    case "wbs":
      return { mode: plantUmlWbsMode, highlights: plantUmlWbsHighlightStyle, completions: wbsCompletions };
    case "mindmap":
      return {
        mode: plantUmlMindmapMode,
        highlights: plantUmlMindmapHighlightStyle,
        completions: mindmapCompletions,
      };
    default: {
      const unreachable: never = kind;
      throw new Error(`Unknown diagram kind: ${String(unreachable)}`);
    }
  }
}

export function languageExtensions(
  kind: DiagramKind,
  onPreviewFixes?: (diagnostic: Diagnostic) => void,
  readAnalysis = analyzeDiagram,
): Extension {
  const { mode, highlights, completions } = languageSupport(kind);
  return [
    StreamLanguage.define(mode),
    syntaxHighlighting(highlights),
    autocompletion({ override: [completions] }),
    linter(
      (current) => {
        const source = current.state.doc.toString();
        const analysis = readAnalysis(kind, source);
        const fixes = analysis.quickFixes;
        const diagnostics = withManualErrorGuidance(kind, analysis.diagnostics, fixes);
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
