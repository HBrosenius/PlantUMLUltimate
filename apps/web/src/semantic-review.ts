import { parseSequence, type SequenceMessage, type SequenceParticipant } from "@plantuml-studio/diagram-sequence";
import type { DiagramKind } from "./model";
import { diffVersionSources, type VersionDiffLine } from "./version-diff";

export interface ReviewGroup {
  id: string;
  title: string;
  detail: string;
  confidence: "confirmed" | "unclassified";
  startLeft: number;
  deleteCount: number;
  replacement: string[];
}

type SequenceItem =
  | { kind: "participant"; line: number; value: SequenceParticipant }
  | { kind: "message"; line: number; value: SequenceMessage };

const lineAt = (source: string, offset: number) => source.slice(0, offset).split("\n").length - 1;

function sequenceItems(source: string): SequenceItem[] {
  const parsed = parseSequence(source);
  return [
    ...parsed.participants.map((value) => ({
      kind: "participant" as const,
      line: lineAt(source, value.sourceRange.from),
      value,
    })),
    ...parsed.messages.map((value) => ({
      kind: "message" as const,
      line: lineAt(source, value.sourceRange.from),
      value,
    })),
  ];
}

function describeSequenceChange(
  removed: SequenceItem[],
  added: SequenceItem[],
): Pick<ReviewGroup, "title" | "detail" | "confidence"> {
  if (removed.length === 1 && added.length === 1 && removed[0]!.kind === added[0]!.kind) {
    const before = removed[0]!;
    const after = added[0]!;
    if (before.kind === "participant" && after.kind === "participant") {
      const stableAlias = before.value.alias && before.value.alias === after.value.alias;
      const stableLabel = before.value.label === after.value.label;
      if (stableAlias || stableLabel) {
        const renamed = before.value.label !== after.value.label;
        return {
          title: renamed
            ? `Rename participant ${before.value.label} to ${after.value.label}`
            : `Modify participant ${after.value.label}`,
          detail: `A conservative match based on the unchanged ${stableAlias ? "alias" : "label"}.`,
          confidence: "confirmed",
        };
      }
    }
    if (before.kind === "message" && after.kind === "message") {
      if (before.value.from === after.value.from && before.value.to === after.value.to) {
        return {
          title: `Change message ${after.value.from} → ${after.value.to}`,
          detail: `${before.value.label || "Unlabelled message"} → ${after.value.label || "unlabelled message"}`,
          confidence: "confirmed",
        };
      }
    }
  }
  if (!removed.length && added.length && added.every((item) => item.kind === "participant"))
    return {
      title: `Add participant${added.length === 1 ? ` ${added[0]!.value.label}` : `s (${added.length})`}`,
      detail: "All changed lines are recognized participant declarations.",
      confidence: "confirmed",
    };
  if (!removed.length && added.length && added.every((item) => item.kind === "message"))
    return {
      title: `Add message${added.length === 1 ? ` ${added[0]!.value.from} → ${added[0]!.value.to}` : `s (${added.length})`}`,
      detail: "All changed lines are recognized sequence messages.",
      confidence: "confirmed",
    };
  if (!added.length && removed.length && removed.every((item) => item.kind === "message"))
    return {
      title: `Remove message${removed.length === 1 ? ` ${removed[0]!.value.from} → ${removed[0]!.value.to}` : `s (${removed.length})`}`,
      detail: "All changed lines are recognized sequence messages.",
      confidence: "confirmed",
    };
  return {
    title: "Unclassified source change",
    detail: "Review the source lines directly. This change is not eligible for partial semantic acceptance.",
    confidence: "unclassified",
  };
}

export function buildReviewGroups(leftSource: string, rightSource: string, kind: DiagramKind): ReviewGroup[] {
  const diff = diffVersionSources(leftSource, rightSource);
  let leftItems: SequenceItem[] = [];
  let rightItems: SequenceItem[] = [];
  if (kind === "sequence") {
    try {
      leftItems = sequenceItems(leftSource);
      rightItems = sequenceItems(rightSource);
    } catch {
      // Oversized or otherwise unparseable input still receives a bounded raw-source review.
    }
  }
  const groups: ReviewGroup[] = [];
  let leftCursor = 0;
  let rightCursor = 0;
  let index = 0;
  while (index < diff.length) {
    const line = diff[index]!;
    if (line.kind === "equal") {
      leftCursor += 1;
      rightCursor += 1;
      index += 1;
      continue;
    }
    const startLeft = leftCursor;
    const startRight = rightCursor;
    let deleteCount = 0;
    const replacement: string[] = [];
    while (index < diff.length && diff[index]!.kind !== "equal") {
      const changed = diff[index]!;
      if (changed.kind === "removed") {
        deleteCount += 1;
        leftCursor += 1;
      } else {
        replacement.push(changed.right ?? "");
        rightCursor += 1;
      }
      index += 1;
    }
    const removed = leftItems.filter((item) => item.line >= startLeft && item.line < startLeft + deleteCount);
    const added = rightItems.filter((item) => item.line >= startRight && item.line < startRight + replacement.length);
    const description = kind === "sequence" ? describeSequenceChange(removed, added) : describeSequenceChange([], []);
    groups.push({ id: `change-${groups.length + 1}`, ...description, startLeft, deleteCount, replacement });
  }
  return groups;
}

export function applyReviewGroups(
  leftSource: string,
  groups: readonly ReviewGroup[],
  selectedIds: ReadonlySet<string>,
): string {
  const lines = leftSource.split("\n");
  for (const group of [...groups].reverse()) {
    if (selectedIds.has(group.id)) lines.splice(group.startLeft, group.deleteCount, ...group.replacement);
  }
  return lines.join("\n");
}

export function createUnifiedPatch(fileName: string, leftSource: string, rightSource: string): string {
  const diff = diffVersionSources(leftSource, rightSource);
  const leftCount = leftSource.split("\n").length;
  const rightCount = rightSource.split("\n").length;
  const body: string[] = [];
  let index = 0;
  while (index < diff.length) {
    if (diff[index]!.kind === "equal") {
      body.push(` ${diff[index]!.left ?? ""}`);
      index += 1;
      continue;
    }
    const changed: VersionDiffLine[] = [];
    while (index < diff.length && diff[index]!.kind !== "equal") changed.push(diff[index++]!);
    body.push(
      ...changed.filter((line) => line.kind === "removed").map((line) => `-${line.left ?? ""}`),
      ...changed.filter((line) => line.kind === "added").map((line) => `+${line.right ?? ""}`),
    );
  }
  const safeName = fileName.replace(/[\r\n]/g, "_");
  return [`--- a/${safeName}`, `+++ b/${safeName}`, `@@ -1,${leftCount} +1,${rightCount} @@`, ...body, ""].join("\n");
}
