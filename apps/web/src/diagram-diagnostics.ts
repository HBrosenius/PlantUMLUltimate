import { syntaxRepairs } from "./diagram-syntax-repairs";
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
  label?: string;
  from: number;
  to: number;
  replacement: string;
  message: string;
}

const languageDiagnostics = (kind: DiagramKind, source: string): Diagnostic[] => {
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
      : kind === "class" || kind === "component"
        ? classDiagnostics(source)
        : kind === "activity"
          ? activityDiagnostics(source)
          : wbsDiagnostics(source);
};

const languageQuickFixes = (kind: DiagramKind, source: string): DiagramQuickFix[] =>
  kind === "gantt"
    ? ganttQuickFixes(source)
    : kind === "sequence"
      ? sequenceQuickFixes(source)
      : kind === "usecase"
        ? getUseCaseQuickFixes(source)
        : kind === "class" || kind === "component"
          ? classQuickFixes(source)
          : kind === "activity"
            ? activityQuickFixes(source)
            : wbsQuickFixes(source);

export const quickFixesForDiagram = (kind: DiagramKind, source: string): DiagramQuickFix[] => {
  const repairs = syntaxRepairs(kind, source);
  return [
    ...repairs,
    ...languageQuickFixes(kind, source).filter(
      (fix) => !repairs.some((repair) => repair.from <= fix.from && repair.to >= fix.to),
    ),
  ];
};

export const diagnosticsForDiagram = (kind: DiagramKind, source: string): Diagnostic[] => {
  const repairs = syntaxRepairs(kind, source);
  return [
    ...repairs.map((fix): Diagnostic => ({
      from: fix.from,
      to: fix.to,
      severity: "error",
      message: fix.message,
      actions: [
        {
          name: fix.label ?? fix.message,
          apply(view) {
            view.dispatch({ changes: { from: fix.from, to: fix.to, insert: fix.replacement } });
          },
        },
      ],
    })),
    ...languageDiagnostics(kind, source).filter(
      (item) => !repairs.some((repair) => repair.from <= item.from && repair.to >= item.to),
    ),
  ];
};
