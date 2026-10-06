import { keywordRepairs } from "./diagram-keyword-repairs";
import { terminatorIssues, terminatorRepairs } from "./diagram-terminator-repairs";
import { braceIssues } from "./diagram-brace-issues";
import { boundaryIssues } from "./diagram-boundary-issues";
import { quoteIssues } from "./diagram-quote-issues";
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
  choiceGroup?: string;
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

const languageQuickFixes = (kind: DiagramKind, source: string): DiagramQuickFix[] => {
  const fixes =
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
  const uncertainNotes = terminatorIssues(kind, source).filter((issue) => issue.replacement === undefined);
  return fixes.filter((fix) => {
    const closesBlocks = fix.replacement
      .trim()
      .split(/\r?\n/)
      .every((line) => /^(?:}|end(?:\s+(?:note|ref|box|fork|split))?|endif|endwhile|endswitch)$/.test(line.trim()));
    return !closesBlocks || !uncertainNotes.some((note) => note.from < fix.from);
  });
};

// Compare parser results after the non-overlapping shared repairs, but retain original
// source ranges for the editor. This removes consequences of a typo rather than unrelated errors.
function consistentItems<T extends { from: number; to: number; message: string }>(
  kind: DiagramKind,
  source: string,
  repairs: DiagramQuickFix[],
  read: (kind: DiagramKind, source: string) => T[],
): T[] {
  const items = read(kind, source);
  const overlaps = (a: DiagramQuickFix, b: DiagramQuickFix) => a.from === b.from || (a.from < b.to && b.from < a.to);
  const selected = repairs
    .filter((repair, index) => !repairs.some((other, otherIndex) => otherIndex !== index && overlaps(repair, other)))
    .sort((a, b) => a.from - b.from);
  if (!selected.length) return items;
  let repaired = source;
  for (const fix of [...selected].reverse())
    repaired = repaired.slice(0, fix.from) + fix.replacement + repaired.slice(fix.to);
  const originalOffset = (position: number) => {
    let shift = 0;
    for (const fix of selected) {
      const from = fix.from + shift;
      const end = from + fix.replacement.length;
      if (position < from) break;
      if (position < end) return fix.from;
      shift += fix.replacement.length - (fix.to - fix.from);
    }
    return position - shift;
  };
  const key = (item: { from: number; to: number; message: string }) => `${item.from}:${item.to}:${item.message}`;
  const remaining = new Map<string, number>();
  for (const item of read(kind, repaired)) {
    const identity = key({ ...item, from: originalOffset(item.from), to: originalOffset(item.to) });
    remaining.set(identity, (remaining.get(identity) ?? 0) + 1);
  }
  return items.filter((item) => {
    const identity = key(item);
    const count = remaining.get(identity) ?? 0;
    if (!count) return false;
    remaining.set(identity, count - 1);
    return true;
  });
}

function sharedRepairs(kind: DiagramKind, source: string): DiagramQuickFix[] {
  const existing = [
    ...syntaxRepairs(kind, source),
    ...braceIssues(kind, source),
    ...terminatorRepairs(kind, source),
    ...[...quoteIssues(kind, source), ...boundaryIssues(kind, source)].flatMap((issue) =>
      issue.replacement === undefined ? [] : [{ ...issue, replacement: issue.replacement }],
    ),
  ];
  return [
    ...existing,
    ...keywordRepairs(kind, source).filter(
      (fix) => !existing.some((repair) => repair.from < fix.to && fix.from < repair.to),
    ),
  ];
}

function coherentRepairs(kind: DiagramKind, source: string): DiagramQuickFix[] {
  const repairs = sharedRepairs(kind, source);
  const corrections = repairs.filter((fix) => fix.from < fix.to);
  if (!corrections.length) return repairs;
  const remaining = consistentItems(kind, source, corrections, sharedRepairs);
  return repairs.filter(
    (fix) =>
      fix.from < fix.to ||
      remaining.includes(fix) ||
      remaining.some((item) => item.from === fix.from && item.to === fix.to && item.message === fix.message),
  );
}

function unfixableIssues(kind: DiagramKind, source: string) {
  return [...quoteIssues(kind, source), ...boundaryIssues(kind, source), ...terminatorIssues(kind, source)].filter(
    (issue) => issue.replacement === undefined,
  );
}

export const quickFixesForDiagram = (kind: DiagramKind, source: string): DiagramQuickFix[] => {
  const repairs = coherentRepairs(kind, source);
  return [
    ...repairs,
    ...consistentItems(kind, source, repairs, languageQuickFixes).filter(
      (fix) => !repairs.some((repair) => repair.from <= fix.from && repair.to >= fix.to),
    ),
  ];
};

export const diagnosticsForDiagram = (kind: DiagramKind, source: string): Diagnostic[] => {
  const repairs = coherentRepairs(kind, source);
  const issues = consistentItems(kind, source, repairs, unfixableIssues);
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
    ...issues.map((issue): Diagnostic => ({
      from: issue.from,
      to: issue.to,
      severity: "error",
      message: issue.message,
    })),
    ...consistentItems(kind, source, repairs, languageDiagnostics).filter(
      (item) =>
        !repairs.some((repair) => repair.from <= item.from && repair.to >= item.to) &&
        !issues.some((issue) => issue.from === item.from && issue.to === item.to && issue.message === item.message),
    ),
  ];
};
