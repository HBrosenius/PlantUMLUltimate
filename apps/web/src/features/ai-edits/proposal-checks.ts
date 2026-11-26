import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseSequence } from "@plantuml-studio/diagram-sequence";
import { parseC4 } from "@plantuml-studio/diagram-c4";
import { analyzeDiagram } from "../../diagram-diagnostics";
import { resolveThreeWayMerge, threeWayMerge } from "../../external-file-merge";
import type { DiagramKind } from "../../model";
import { buildReviewGroups, type ReviewGroup } from "../../semantic-review";
import {
  SELECTION_END_MARKER,
  SELECTION_START_MARKER,
  utf8Length,
  MAX_AI_SOURCE_BYTES,
  type AiSelection,
} from "./prompt";
import { measureScope } from "./selection-scope";

/** More than this share of the lines outside the selection changing needs the user's confirmation. */
export const REWRITE_SHARE_LIMIT = 0.3;

export interface ProposalCheckInput {
  kind: DiagramKind;
  /** The document as it was when the request was sent. */
  original: string;
  /** The document now. Differs from `original` when the user edited while the request ran. */
  current: string;
  /** The model's revised document, made from `original`. */
  proposal: string;
  selection?: AiSelection | undefined;
}

export type ProposalFailure = "empty" | "unchanged" | "invalid" | "errors" | "stale";

export type ProposalCheckResult =
  | {
      ok: true;
      /** The proposal to review against `current`: rebased onto the user's newer edits when needed. */
      source: string;
      rebased: boolean;
      /** Warnings that the proposal adds (shown, not blocking). */
      warnings: string[];
      /** Set when the proposal rewrites much more than the selection; the user must confirm first. */
      rewrite?: { share: number; changedLines: number };
    }
  | {
      ok: false;
      reason: ProposalFailure;
      message: string;
      /** Plain diagnostics, fed back to the model on the one automatic retry. */
      problems: string[];
    };

const fail = (reason: ProposalFailure, message: string, problems: string[] = [message]): ProposalCheckResult => ({
  ok: false,
  reason,
  message,
  problems,
});

function diagnosticsOf(kind: DiagramKind, source: string, severity: "error" | "warning"): string[] {
  return analyzeDiagram(kind, source)
    .diagnostics.filter((diagnostic) => diagnostic.severity === severity)
    .map((diagnostic) => diagnostic.message);
}

/** Messages in `after` that `before` did not already have, counting duplicates. */
function newMessages(before: readonly string[], after: readonly string[]): string[] {
  const remaining = [...before];
  return after.filter((message) => {
    const index = remaining.indexOf(message);
    if (index === -1) return true;
    remaining.splice(index, 1);
    return false;
  });
}

/** Parses with the kind's parser. Returns a plain problem, or undefined when the source parses. */
export function parseProblem(kind: DiagramKind, source: string): string | undefined {
  if (source.includes(SELECTION_START_MARKER) || source.includes(SELECTION_END_MARKER))
    return "The proposal still contains selection marker lines.";
  if (!/^\s*@start\w+/i.test(source) || !/@end\w+\s*$/i.test(source))
    return "The proposal is missing its @start... / @end... lines.";
  try {
    if (kind === "sequence") parseSequence(source);
    else if (kind === "gantt") parseGantt(source);
    else if (kind === "c4") {
      const document = parseC4(source);
      if (document.elements.length === 0 && document.relationships.length === 0)
        return "The proposal has no C4 elements or relationships left.";
    }
  } catch {
    return "The proposal could not be parsed.";
  }
  return undefined;
}

/**
 * Everything a proposal must pass before it reaches review. Pure and synchronous; the render check runs
 * separately because it needs the renderer frame.
 */
export function checkProposal(input: ProposalCheckInput): ProposalCheckResult {
  const { kind, original, current, proposal } = input;
  if (!proposal.trim()) return fail("empty", "The assistant did not return a diagram.");
  if (utf8Length(proposal) > MAX_AI_SOURCE_BYTES * 2)
    return fail("invalid", "The proposal is much larger than the document. It was discarded.");
  const parseIssue = parseProblem(kind, proposal);
  if (parseIssue) return fail("invalid", parseIssue);
  if (proposal === original) return fail("unchanged", "The assistant did not change anything.");

  const addedErrors = newMessages(diagnosticsOf(kind, original, "error"), diagnosticsOf(kind, proposal, "error"));
  if (addedErrors.length)
    return fail(
      "errors",
      `The proposal adds ${addedErrors.length} error${addedErrors.length === 1 ? "" : "s"}: ${addedErrors[0]}`,
      addedErrors,
    );

  let source = proposal;
  let rebased = false;
  if (current !== original) {
    const merge = threeWayMerge(original, current, proposal);
    if (merge.conflicts.length)
      return fail(
        "stale",
        "The document changed while the assistant was working and the change overlaps your edits. The proposal was discarded; ask again.",
      );
    source = resolveThreeWayMerge(merge, []);
    rebased = true;
    const mergedParse = parseProblem(kind, source);
    if (mergedParse) return fail("invalid", mergedParse);
    const mergedErrors = newMessages(diagnosticsOf(kind, current, "error"), diagnosticsOf(kind, source, "error"));
    if (mergedErrors.length)
      return fail("stale", "The proposal no longer fits your newer edits and was discarded; ask again.", mergedErrors);
    if (source === current) return fail("unchanged", "Your newer edits already contain this change.");
  }

  const warnings = newMessages(diagnosticsOf(kind, original, "warning"), diagnosticsOf(kind, source, "warning"));
  const scope = measureScope(original, proposal, input.selection);
  const touched = scope.removedOutside.length + scope.addedOutside.length;
  return {
    ok: true,
    source,
    rebased,
    warnings,
    ...(scope.touchedShare > REWRITE_SHARE_LIMIT
      ? { rewrite: { share: scope.touchedShare, changedLines: touched } }
      : {}),
  };
}

/** Review groups for a checked proposal, with the groups that reach outside the selection. */
export function reviewProposal(
  kind: DiagramKind,
  current: string,
  proposal: string,
  selection: AiSelection | undefined,
): { groups: ReviewGroup[]; outsideGroupIds: Set<string>; initiallySelected: Set<string> } {
  const groups = buildReviewGroups(current, proposal, kind);
  const outsideGroupIds = groupsOutsideSelection(groups, selection);
  const initiallySelected = new Set(
    groups
      .filter((group) => group.confidence === "confirmed" && !outsideGroupIds.has(group.id))
      .map((group) => group.id),
  );
  return { groups, outsideGroupIds, initiallySelected };
}

/**
 * Groups whose lines in the reviewed document fall outside the selection. A group that only inserts is inside
 * when the insertion point is within or directly next to the selection. `selection` refers to `current`.
 */
export function groupsOutsideSelection(
  groups: readonly ReviewGroup[],
  selection: AiSelection | undefined,
): Set<string> {
  const outside = new Set<string>();
  if (!selection) return outside;
  const first = selection.startLine - 1;
  const last = selection.endLine - 1;
  for (const group of groups) {
    const start = group.startLeft;
    const end = group.startLeft + group.deleteCount - 1;
    const inside = group.deleteCount === 0 ? start >= first && start <= last + 1 : start >= first && end <= last;
    if (!inside) outside.add(group.id);
  }
  return outside;
}
