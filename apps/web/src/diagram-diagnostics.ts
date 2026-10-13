import { statementIssues } from "./diagram-statement-issues";
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

const languageDiagnostics = (kind: DiagramKind, source: string, parse = parseGantt): Diagnostic[] => {
  if (kind === "gantt") {
    const parsed = parse(source);
    const preserved = new Set(
      parsed.diagnostics
        .filter((item) => item.code === "unsupported-syntax")
        .map((item) => `${item.range.from}:${item.range.to}`),
    );
    return ganttDiagnostics(source, parsed).filter((item) => !preserved.has(`${item.from}:${item.to}`));
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

const languageQuickFixes = (kind: DiagramKind, source: string, parse = parseGantt): DiagramQuickFix[] => {
  const fixes =
    kind === "gantt"
      ? ganttQuickFixes(source, parse(source))
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
      .every((line) =>
        /^(?:}|end(?:\s+(?:note|ref|box|fork|split))?|endhnote|endrnote|endif|endwhile|endswitch)$/.test(line.trim()),
      );
    if (!fix.replacement.trim() && source.slice(fix.from, fix.to).trim() === "}") {
      let depth = 0;
      const nested = [
        ...source.slice(0, fix.from).matchAll(/\{[ \t]*(?:'[^\n]*)?$|^[ \t]*(}+)[ \t]*(?:'[^\n]*)?$/gm),
      ].some(([, closers]) => {
        depth += closers ? -closers.length : 1;
        return depth > 1;
      });
      if (nested) {
        const previousLine = source
          .slice(0, fix.from)
          .split(/\r?\n/)
          .filter((line) => line.trim())
          .at(-1);
        const lineStart = source.lastIndexOf("\n", Math.max(0, fix.from - 1)) + 1;
        const lineEnd = source.indexOf("\n", fix.from);
        const currentLine = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd);
        if (previousLine?.trim() !== "}" || previousLine.match(/^[ \t]*/)?.[0] !== currentLine.match(/^[ \t]*/)?.[0])
          return false;
      }
    }
    const removesTerminator =
      !fix.replacement.trim() &&
      /^(?:end(?:\s+(?:note|ref|box|fork|split))?|endhnote|endrnote|endif|endwhile|endswitch)\s*$/i.test(
        source.slice(fix.from, fix.to).trim(),
      );
    const insertsRepeatCondition = /^repeat while\b/i.test(fix.replacement.trim());
    return (
      !(closesBlocks || removesTerminator || insertsRepeatCondition) ||
      !uncertainNotes.some((issue) => issue.from <= fix.from)
    );
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

function sharedRepairs(kind: DiagramKind, source: string, parse = parseGantt): DiagramQuickFix[] {
  const existing = [
    ...statementIssues(kind, source).flatMap((issue) =>
      issue.replacement === undefined ? [] : [{ ...issue, replacement: issue.replacement }],
    ),
    ...syntaxRepairs(kind, source, parse),
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

function coherentRepairs(kind: DiagramKind, source: string, read = sharedRepairs): DiagramQuickFix[] {
  const repairs = read(kind, source);
  const corrections = repairs.filter((fix) => fix.from < fix.to);
  if (!corrections.length) return repairs;
  const remaining = consistentItems(kind, source, corrections, read);
  return repairs.filter(
    (fix) =>
      fix.from < fix.to ||
      remaining.includes(fix) ||
      remaining.some((item) => item.from === fix.from && item.to === fix.to && item.message === fix.message),
  );
}

function unfixableIssues(kind: DiagramKind, source: string) {
  return [
    ...statementIssues(kind, source),
    ...quoteIssues(kind, source),
    ...boundaryIssues(kind, source),
    ...terminatorIssues(kind, source),
  ].filter((issue) => issue.replacement === undefined);
}

function collectQuickFixes(
  kind: DiagramKind,
  source: string,
  repairs: DiagramQuickFix[],
  parse: typeof parseGantt,
): DiagramQuickFix[] {
  return [
    ...repairs,
    ...consistentItems(kind, source, repairs, (kind, source) => languageQuickFixes(kind, source, parse)).filter(
      (fix) => !repairs.some((repair) => repair.from <= fix.from && repair.to >= fix.to),
    ),
  ];
}

function collectDiagnostics(
  kind: DiagramKind,
  source: string,
  repairs: DiagramQuickFix[],
  parse: typeof parseGantt,
): Diagnostic[] {
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
    ...consistentItems(kind, source, repairs, (kind, source) => languageDiagnostics(kind, source, parse)).filter(
      (item) =>
        !repairs.some((repair) => repair.from <= item.from && repair.to >= item.to) &&
        !issues.some((issue) => issue.from === item.from && issue.to === item.to && issue.message === item.message),
    ),
  ];
}

export interface DiagramAnalysis {
  readonly kind: DiagramKind;
  readonly source: string;
  readonly diagnostics: Diagnostic[];
  readonly quickFixes: DiagramQuickFix[];
}

/** Owned by one source snapshot; no global cache of documents or encrypted source. */
export function analyzeDiagram(
  kind: DiagramKind,
  source: string,
  initialParse?: ReturnType<typeof parseGantt>,
): DiagramAnalysis {
  let parsed = initialParse;
  let alternate: { source: string; parsed: ReturnType<typeof parseGantt> } | undefined;
  const parse: typeof parseGantt = (text) => {
    if (text === source) return (parsed ??= parseGantt(text));
    if (alternate?.source === text) return alternate.parsed;
    const value = parseGantt(text);
    // Repair previews may try many candidates; retain at most one alternate model.
    alternate = { source: text, parsed: value };
    return value;
  };
  let repairs: DiagramQuickFix[] | undefined;
  let diagnostics: Diagnostic[] | undefined;
  let quickFixes: DiagramQuickFix[] | undefined;
  const getRepairs = () =>
    (repairs ??= coherentRepairs(kind, source, (kind, source) => sharedRepairs(kind, source, parse)));
  return {
    kind,
    source,
    get diagnostics() {
      return (diagnostics ??= collectDiagnostics(kind, source, getRepairs(), parse));
    },
    get quickFixes() {
      return (quickFixes ??= collectQuickFixes(kind, source, getRepairs(), parse));
    },
  };
}

export const diagnosticsForDiagram = (kind: DiagramKind, source: string): Diagnostic[] =>
  analyzeDiagram(kind, source).diagnostics;
export const quickFixesForDiagram = (kind: DiagramKind, source: string): DiagramQuickFix[] =>
  analyzeDiagram(kind, source).quickFixes;

/** Share the latest snapshot between the editor and its owner, without retaining edit history. */
export function createDiagramAnalyzer(): typeof analyzeDiagram {
  let latest: DiagramAnalysis | undefined;
  return (kind, source, parsed) => {
    if (latest?.kind !== kind || latest.source !== source) latest = analyzeDiagram(kind, source, parsed);
    return latest;
  };
}
