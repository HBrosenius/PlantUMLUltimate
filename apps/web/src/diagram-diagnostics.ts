import type { Diagnostic } from "@codemirror/lint";
import type { DiagramKind } from "./model";
import { ganttDiagnostics, ganttQuickFixes } from "./gantt-language";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { sequenceDiagnostics, sequenceQuickFixes } from "./sequence-language";
import { getUseCaseQuickFixes, useCaseDiagnostics as collectUseCaseDiagnostics } from "./usecase-language";
import { classDiagnostics, classQuickFixes } from "./class-language";
import { activityDiagnostics, activityQuickFixes } from "./activity-language";
import { wbsDiagnostics, wbsQuickFixes } from "./wbs-language";

export interface DiagramQuickFix {
  from: number;
  to: number;
  replacement: string;
  message: string;
}

export const diagnosticsForDiagram = (kind: DiagramKind, source: string): Diagnostic[] => {
  if (kind === "gantt") {
    const preserved = new Set(
      parseGantt(source)
        .diagnostics.filter((item) => item.code === "unsupported-syntax")
        .map((item) => `${item.range.from}:${item.range.to}`),
    );
    return ganttDiagnostics(source).filter((item) => !preserved.has(`${item.from}:${item.to}`));
  }
  return kind === "sequence"
    ? sequenceDiagnostics(source)
    : kind === "usecase"
      ? collectUseCaseDiagnostics(source)
      : kind === "class"
        ? classDiagnostics(source)
        : kind === "activity"
          ? activityDiagnostics(source)
          : wbsDiagnostics(source);
};

export const quickFixesForDiagram = (kind: DiagramKind, source: string): DiagramQuickFix[] =>
  kind === "gantt"
    ? ganttQuickFixes(source)
    : kind === "sequence"
      ? sequenceQuickFixes(source)
      : kind === "usecase"
        ? getUseCaseQuickFixes(source)
        : kind === "class"
          ? classQuickFixes(source)
          : kind === "activity"
            ? activityQuickFixes(source)
            : wbsQuickFixes(source);
