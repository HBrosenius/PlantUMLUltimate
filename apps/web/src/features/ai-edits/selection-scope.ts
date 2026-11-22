import { diffVersionSources } from "../../version-diff";
import type { AiSelection } from "./prompt";

const DECLARATION = /^\s*(?:participant|actor|boundary|control|entity|database|collections|queue)\b/i;

export interface ScopeReport {
  /** Original lines outside the selection that were removed or modified. */
  removedOutside: string[];
  /** Added lines outside the selection that are not participant declarations. */
  addedOutside: string[];
  /** Added participant declarations outside the selection (allowed: a new participant must be declared). */
  declarationsOutside: string[];
  /** Number of original lines outside the selection. */
  outsideLineCount: number;
  /** Share of outside lines touched, 0..1. */
  touchedShare: number;
}

/**
 * Measures how much of the document outside the selection a proposal changed. Without a selection the whole
 * document counts as "inside" and nothing can be out of scope.
 */
export function measureScope(original: string, revised: string, selection: AiSelection | undefined): ScopeReport {
  const lineCount = original.split("\n").length;
  const report: ScopeReport = {
    removedOutside: [],
    addedOutside: [],
    declarationsOutside: [],
    outsideLineCount: 0,
    touchedShare: 0,
  };
  if (!selection) return report;
  const start = Math.max(1, selection.startLine);
  const end = Math.min(lineCount, Math.max(start, selection.endLine));
  report.outsideLineCount = lineCount - (end - start + 1);
  let anchor = 0;
  for (const line of diffVersionSources(original, revised)) {
    if (line.kind === "added") {
      // An insertion belongs to the selection when it sits directly before, inside or directly after it.
      const inside = anchor >= start - 1 && anchor <= end;
      if (inside) continue;
      const text = line.right ?? "";
      if (DECLARATION.test(text)) report.declarationsOutside.push(text);
      else report.addedOutside.push(text);
      continue;
    }
    anchor = line.leftNumber ?? anchor + 1;
    if (line.kind === "removed" && (anchor < start || anchor > end)) report.removedOutside.push(line.left ?? "");
  }
  const touched = report.removedOutside.length + report.addedOutside.length;
  report.touchedShare = report.outsideLineCount > 0 ? Math.min(1, touched / report.outsideLineCount) : 0;
  return report;
}

export const hasScopeViolation = (report: ScopeReport): boolean =>
  report.removedOutside.length > 0 || report.addedOutside.length > 0;
