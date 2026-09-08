import { parseSequence, type SequenceMessage, type SequenceParticipant } from "@plantuml-studio/diagram-sequence";
import { parseGantt, type GanttTask } from "@plantuml-studio/diagram-gantt";
import type { DiagramKind } from "./model";
import { diffVersionSources, type VersionDiffLine } from "./version-diff";

export interface ReviewGroup {
  id: string;
  title: string;
  detail: string;
  confidence: "confirmed" | "probable" | "unclassified";
  startLeft: number;
  deleteCount: number;
  replacement: string[];
}

type SequenceItem =
  | { kind: "participant"; line: number; value: SequenceParticipant }
  | { kind: "message"; line: number; value: SequenceMessage };
type GanttItem = {
  kind: "task";
  line: number;
  declarationKind: GanttTask["declarations"][number]["kind"];
  value: GanttTask;
};

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

function ganttItems(source: string): GanttItem[] {
  return parseGantt(source).document.tasks.flatMap((value) =>
    value.declarations.map((declaration) => ({
      kind: "task" as const,
      line: lineAt(source, declaration.range.from),
      declarationKind: declaration.kind,
      value,
    })),
  );
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
      if (before.value.kind === after.value.kind)
        return {
          title: `Possible participant rename: ${before.value.label} → ${after.value.label}`,
          detail: "The declaration position and kind match, but no stable alias or label confirms identity.",
          confidence: "probable",
        };
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

function describeGanttChange(
  removed: GanttItem[],
  added: GanttItem[],
): Pick<ReviewGroup, "title" | "detail" | "confidence"> {
  if (
    removed.length > 1 &&
    removed.length === added.length &&
    removed.every((item) => item.value.id === removed[0]!.value.id) &&
    added.every((item) => item.value.id === removed[0]!.value.id)
  )
    return {
      title: `Change schedule for ${added[0]!.value.label}`,
      detail: `A single transaction updates ${[...new Set(removed.map((item) => item.declarationKind))].join(" and ")}.`,
      confidence: "confirmed",
    };
  if (removed.length === 1 && added.length === 1) {
    const before = removed[0]!.value;
    const after = added[0]!.value;
    if (before.id === after.id) {
      if (
        removed[0]!.declarationKind === "duration" &&
        before.duration &&
        after.duration &&
        before.duration.value !== after.duration.value
      )
        return {
          title: `Change ${after.label} duration from ${before.duration.value} to ${after.duration.value} days`,
          detail: "The task identity is unchanged and both duration declarations are recognized.",
          confidence: "confirmed",
        };
      if (
        removed[0]!.declarationKind === "start" &&
        before.start &&
        after.start &&
        before.start.value !== after.start.value
      )
        return {
          title: `Move ${after.label} start from ${before.start.value} to ${after.start.value}`,
          detail: "The task identity is unchanged and both start declarations are recognized.",
          confidence: "confirmed",
        };
      return {
        title: `Modify task ${after.label}`,
        detail: "The declaration belongs to the same parsed task.",
        confidence: "confirmed",
      };
    }
    if (before.alias?.value && before.alias.value === after.alias?.value)
      return {
        title: `Rename task ${before.label} to ${after.label}`,
        detail: "A stable task alias confirms identity.",
        confidence: "confirmed",
      };
  }
  if (!removed.length && added.length === 1)
    return {
      title: `Add task ${added[0]!.value.label}`,
      detail: "The added declaration is recognized.",
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
  let leftGanttItems: GanttItem[] = [];
  let rightGanttItems: GanttItem[] = [];
  if (kind === "sequence") {
    try {
      leftItems = sequenceItems(leftSource);
      rightItems = sequenceItems(rightSource);
    } catch {
      // Oversized or otherwise unparseable input still receives a bounded raw-source review.
    }
  }
  if (kind === "gantt") {
    leftGanttItems = ganttItems(leftSource);
    rightGanttItems = ganttItems(rightSource);
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
    const removedGantt = leftGanttItems.filter((item) => item.line >= startLeft && item.line < startLeft + deleteCount);
    const addedGantt = rightGanttItems.filter(
      (item) => item.line >= startRight && item.line < startRight + replacement.length,
    );
    const description =
      kind === "sequence"
        ? describeSequenceChange(removed, added)
        : kind === "gantt"
          ? describeGanttChange(removedGantt, addedGantt)
          : describeSequenceChange([], []);
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

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export function createReviewReport(
  fileName: string,
  leftSource: string,
  rightSource: string,
  groups: readonly ReviewGroup[],
): string {
  const rows = groups
    .map(
      (group) =>
        `<li data-confidence="${group.confidence}"><strong>${escapeHtml(group.title)}</strong> — ${group.confidence}<br>${escapeHtml(group.detail)}</li>`,
    )
    .join("");
  return [
    "<!doctype html>",
    '<meta charset="utf-8">',
    '<meta name="referrer" content="no-referrer">',
    `<title>${escapeHtml(fileName)} review</title>`,
    `<h1>${escapeHtml(fileName)} review</h1>`,
    `<p>Generated locally. ${groups.length} change group${groups.length === 1 ? "" : "s"}.</p>`,
    `<ol>${rows}</ol>`,
    "<h2>Source patch</h2>",
    `<pre>${escapeHtml(createUnifiedPatch(fileName, leftSource, rightSource))}</pre>`,
  ].join("\n");
}
