import { parseSequence, type SequenceMessage, type SequenceParticipant } from "@plantuml-studio/diagram-sequence";
import { parseGantt, type GanttDependency, type GanttTask } from "@plantuml-studio/diagram-gantt";
import type { DiagramKind } from "./model";
import { diffVersionSources, type VersionDiffLine } from "./version-diff";
import { plantUmlTheme } from "./plantuml-theme";

export interface ReviewGroup {
  id: string;
  title: string;
  detail: string;
  changeKind: "added" | "removed" | "modified";
  confidence: "confirmed" | "probable" | "unclassified";
  startLeft: number;
  startRight: number;
  deleteCount: number;
  replacement: string[];
  leftTargets: ReviewTarget[];
  rightTargets: ReviewTarget[];
}

export type ReviewTarget =
  | { kind: "sequence-participant"; id: string; label: string; alias?: string }
  | { kind: "sequence-message"; id: string; label: string }
  | { kind: "gantt-task"; id: string; label: string }
  | { kind: "gantt-dependency"; predecessorId: string; successorId: string };

type SequenceItem =
  | { kind: "participant"; line: number; value: SequenceParticipant }
  | { kind: "message"; line: number; value: SequenceMessage };
type GanttItem = {
  kind: "task";
  line: number;
  declarationKind: GanttTask["declarations"][number]["kind"];
  value: GanttTask;
};
type GanttDependencyItem = { line: number; value: GanttDependency };

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

function hasCompleteMatching<T>(before: readonly T[], after: readonly T[], compatible: (left: T, right: T) => boolean) {
  if (before.length !== after.length) return false;
  const matchedBefore = new Array<number>(after.length).fill(-1);
  const assign = (beforeIndex: number, visited: Set<number>): boolean => {
    for (let afterIndex = 0; afterIndex < after.length; afterIndex += 1) {
      if (visited.has(afterIndex) || !compatible(before[beforeIndex]!, after[afterIndex]!)) continue;
      visited.add(afterIndex);
      if (matchedBefore[afterIndex] === -1 || assign(matchedBefore[afterIndex]!, visited)) {
        matchedBefore[afterIndex] = beforeIndex;
        return true;
      }
    }
    return false;
  };
  return before.every((_, index) => assign(index, new Set()));
}

function describeCompoundSequenceChange(
  removed: SequenceItem[],
  added: SequenceItem[],
): Pick<ReviewGroup, "title" | "detail" | "confidence"> | undefined {
  if (removed.length < 2 || removed.length !== added.length) return undefined;
  const removedParticipants = removed.filter(
    (item): item is Extract<SequenceItem, { kind: "participant" }> => item.kind === "participant",
  );
  const addedParticipants = added.filter(
    (item): item is Extract<SequenceItem, { kind: "participant" }> => item.kind === "participant",
  );
  const removedMessages = removed.filter(
    (item): item is Extract<SequenceItem, { kind: "message" }> => item.kind === "message",
  );
  const addedMessages = added.filter(
    (item): item is Extract<SequenceItem, { kind: "message" }> => item.kind === "message",
  );
  const participantsMatch = hasCompleteMatching(removedParticipants, addedParticipants, (before, after) => {
    const stableAlias = before.value.alias && before.value.alias === after.value.alias;
    return Boolean(stableAlias || before.value.label === after.value.label);
  });
  const messagesMatch = hasCompleteMatching(
    removedMessages,
    addedMessages,
    (before, after) => before.value.from === after.value.from && before.value.to === after.value.to,
  );
  if (!participantsMatch || !messagesMatch) return undefined;
  const parts = [
    removedParticipants.length
      ? `${removedParticipants.length} participant${removedParticipants.length === 1 ? "" : "s"}`
      : "",
    removedMessages.length ? `${removedMessages.length} message${removedMessages.length === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return {
    title: `Update ${parts.join(" and ")}`,
    detail:
      "Every declaration and relationship has a stable identity, so this contiguous edit is one atomic transaction.",
    confidence: "confirmed",
  };
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

function ganttDependencyItems(source: string): GanttDependencyItem[] {
  return parseGantt(source).document.dependencies.map((value) => ({
    line: lineAt(source, value.sourceRange.from),
    value,
  }));
}

function sequenceTargets(items: readonly SequenceItem[]): ReviewTarget[] {
  const targets: ReviewTarget[] = [];
  for (const item of items) {
    if (item.kind === "participant")
      targets.push({
        kind: "sequence-participant",
        id: item.value.id,
        label: item.value.label,
        ...(item.value.alias ? { alias: item.value.alias } : {}),
      });
    else if (item.value.label) targets.push({ kind: "sequence-message", id: item.value.id, label: item.value.label });
  }
  return targets;
}

function ganttTargets(items: readonly GanttItem[], dependencies: readonly GanttDependencyItem[]): ReviewTarget[] {
  const dependencyLines = new Set(dependencies.map((item) => item.line));
  const tasks = new Map(
    items.filter((item) => !dependencyLines.has(item.line)).map((item) => [item.value.id, item.value]),
  );
  return [
    ...[...tasks.values()].map((task) => ({ kind: "gantt-task" as const, id: task.id, label: task.label })),
    ...dependencies.map(({ value }) => ({
      kind: "gantt-dependency" as const,
      predecessorId: value.predecessorTaskId,
      successorId: value.successorTaskId,
    })),
  ];
}

function describeSequenceChange(
  removed: SequenceItem[],
  added: SequenceItem[],
): Pick<ReviewGroup, "title" | "detail" | "confidence"> {
  const compound = describeCompoundSequenceChange(removed, added);
  if (compound) return compound;
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

function resourceNames(resources: GanttTask["resources"]): string[] {
  return (resources ?? []).map((resource) =>
    resource.allocation != null ? `${resource.value} (${resource.allocation}%)` : resource.value,
  );
}

function completionLabel(label: string, value: number): string {
  return value >= 100 ? `Mark ${label} as complete` : `Set ${label} to ${value}% complete`;
}

function describeGanttChange(
  removed: GanttItem[],
  added: GanttItem[],
  removedDependencies: GanttDependencyItem[],
  addedDependencies: GanttDependencyItem[],
  leftItems: GanttItem[] = [],
): Pick<ReviewGroup, "title" | "detail" | "confidence"> {
  if (!removedDependencies.length && addedDependencies.length === 1) {
    const dependency = addedDependencies[0]!.value;
    return {
      title: `Add dependency ${dependency.predecessor.value} → ${dependency.successor.value}`,
      detail: "The added source is recognized as a Gantt dependency, not a new task.",
      confidence: "confirmed",
    };
  }
  if (removedDependencies.length === 1 && !addedDependencies.length) {
    const dependency = removedDependencies[0]!.value;
    return {
      title: `Remove dependency ${dependency.predecessor.value} → ${dependency.successor.value}`,
      detail: "The removed source is a recognized Gantt dependency.",
      confidence: "confirmed",
    };
  }
  if (removedDependencies.length === 1 && addedDependencies.length === 1) {
    const before = removedDependencies[0]!.value;
    const after = addedDependencies[0]!.value;
    if (before.predecessorTaskId === after.predecessorTaskId && before.successorTaskId === after.successorTaskId) {
      const signedOffset = (dependency: GanttDependency) =>
        (dependency.direction === "before" ? -1 : 1) * (dependency.offset?.value ?? 0);
      const beforeOffset = signedOffset(before);
      const afterOffset = signedOffset(after);
      if (before.relation === after.relation && beforeOffset !== afterOffset)
        return {
          title: `Move task ${after.successor.value} relative to ${after.predecessor.value}`,
          detail: `The dependency offset changes from ${beforeOffset} to ${afterOffset} days.`,
          confidence: "confirmed",
        };
      return {
        title: `Change dependency ${after.predecessor.value} → ${after.successor.value}`,
        detail: "Both dependency endpoints retain their parsed task identities.",
        confidence: "confirmed",
      };
    }
    return {
      title: `Reconnect dependency ${before.predecessor.value} → ${before.successor.value} as ${after.predecessor.value} → ${after.successor.value}`,
      detail: "One recognized dependency is replaced by another.",
      confidence: "confirmed",
    };
  }
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
      if (removed[0]!.declarationKind === "end" && before.end && after.end && before.end.value !== after.end.value)
        return {
          title: `Change ${after.label} end from ${before.end.value} to ${after.end.value}`,
          detail: "The task identity is unchanged and both end declarations are recognized.",
          confidence: "confirmed",
        };
      if (
        removed[0]!.declarationKind === "completion" &&
        before.completion &&
        after.completion &&
        before.completion.value !== after.completion.value
      )
        return {
          title:
            after.completion.value >= 100
              ? `Mark ${after.label} as complete`
              : `Change ${after.label} completion from ${before.completion.value}% to ${after.completion.value}%`,
          detail: "The task identity is unchanged and both completion declarations are recognized.",
          confidence: "confirmed",
        };
      // Resource assignments are written inline on the same source line as the task's
      // duration/start/end declaration (see setTaskResources in operations.ts), so a resource
      // change is not tied to a distinct "resource" declarationKind — it can show up on a hunk
      // whose declarationKind is "duration", "start", "end", or anything else. Check it
      // independently of declarationKind rather than gating on removed[0].declarationKind.
      {
        const beforeNames = resourceNames(before.resources);
        const afterNames = resourceNames(after.resources);
        if (beforeNames.join(",") !== afterNames.join(",")) {
          if (!beforeNames.length && afterNames.length)
            return {
              title: `Assign ${after.label} to ${afterNames.join(", ")}`,
              detail: "The task identity is unchanged and a resource assignment was added.",
              confidence: "confirmed",
            };
          if (beforeNames.length && !afterNames.length)
            return {
              title: `Unassign ${after.label} from ${beforeNames.join(", ")}`,
              detail: "The task identity is unchanged and its resource assignment was removed.",
              confidence: "confirmed",
            };
          return {
            title: `Reassign ${after.label} from ${beforeNames.join(", ")} to ${afterNames.join(", ")}`,
            detail: "The task identity is unchanged and both resource assignments are recognized.",
            confidence: "confirmed",
          };
        }
      }
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
    if (removed[0]!.declarationKind === added[0]!.declarationKind)
      return {
        title: `Possible task rename: ${before.label} → ${after.label}`,
        detail: "The declaration stays in place with the same kind, but there is no stable alias to prove identity.",
        confidence: "probable",
      };
  }
  if (!removed.length && added.length && added.every((item) => item.declarationKind === "milestone"))
    return {
      title: added.length === 1 ? `Add milestone ${added[0]!.value.label}` : `Add milestones (${added.length})`,
      detail:
        added.length === 1
          ? "The added declaration is recognized as a milestone."
          : "All added declarations are recognized as milestones.",
      confidence: "confirmed",
    };
  if (!removed.length && added.length === 1) {
    const addedItem = added[0]!;
    const existedBefore = leftItems.some((item) => item.value.id === addedItem.value.id);
    if (existedBefore) {
      const after = addedItem.value;
      if (addedItem.declarationKind === "completion" && after.completion)
        return {
          title: completionLabel(after.label, after.completion.value),
          detail: "The task already existed; a completion declaration was added to it.",
          confidence: "confirmed",
        };
      if (after.resources?.length)
        return {
          title: `Assign ${after.label} to ${resourceNames(after.resources).join(", ")}`,
          detail: "The task already existed; a resource assignment was added to it.",
          confidence: "confirmed",
        };
      return {
        title: `Modify task ${after.label}`,
        detail: "The task already existed; a new declaration was added to it.",
        confidence: "confirmed",
      };
    }
    return {
      title: `Add task ${addedItem.value.label}`,
      detail: "The added declaration is recognized.",
      confidence: "confirmed",
    };
  }
  if (!removed.length && added.length > 1) {
    const tasks = new Map(added.map((item) => [item.value.id, item.value]));
    const preExisting = [...tasks.values()].every((task) => leftItems.some((item) => item.value.id === task.id));
    return {
      title: preExisting ? `Modify tasks (${tasks.size})` : `Add tasks (${tasks.size})`,
      detail: preExisting
        ? "All changed declarations belong to tasks that already existed."
        : "All added declarations belong to recognized Gantt tasks.",
      confidence: "confirmed",
    };
  }
  if (removed.length && !added.length) {
    const tasks = new Map(removed.map((item) => [item.value.id, item.value]));
    return {
      title: tasks.size === 1 ? `Remove task ${[...tasks.values()][0]!.label}` : `Remove tasks (${tasks.size})`,
      detail: "All removed declarations belong to recognized Gantt tasks.",
      confidence: "confirmed",
    };
  }
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
  let leftGanttDependencies: GanttDependencyItem[] = [];
  let rightGanttDependencies: GanttDependencyItem[] = [];
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
    leftGanttDependencies = ganttDependencyItems(leftSource);
    rightGanttDependencies = ganttDependencyItems(rightSource);
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
    const removedGanttDependencies = leftGanttDependencies.filter(
      (item) => item.line >= startLeft && item.line < startLeft + deleteCount,
    );
    const addedGanttDependencies = rightGanttDependencies.filter(
      (item) => item.line >= startRight && item.line < startRight + replacement.length,
    );
    const changedLeftLines = leftSource.split("\n").slice(startLeft, startLeft + deleteCount);
    const themeOnly = [...changedLeftLines, ...replacement]
      .filter((line) => line.trim())
      .every((line) => /^\s*!theme\b/i.test(line));
    const beforeTheme = plantUmlTheme(leftSource);
    const afterTheme = plantUmlTheme(rightSource);
    const description =
      themeOnly && beforeTheme !== afterTheme
        ? {
            title: beforeTheme
              ? afterTheme
                ? `Change diagram theme from ${beforeTheme} to ${afterTheme}`
                : `Remove diagram theme ${beforeTheme}`
              : `Set diagram theme to ${afterTheme}`,
            detail: "The changed source is a native PlantUML theme directive.",
            confidence: "confirmed" as const,
          }
        : kind === "sequence"
          ? describeSequenceChange(removed, added)
          : kind === "gantt"
            ? describeGanttChange(removedGantt, addedGantt, removedGanttDependencies, addedGanttDependencies, leftGanttItems)
            : describeSequenceChange([], []);
    groups.push({
      id: `change-${groups.length + 1}`,
      ...description,
      changeKind: deleteCount === 0 ? "added" : replacement.length === 0 ? "removed" : "modified",
      startLeft,
      startRight,
      deleteCount,
      replacement,
      leftTargets:
        kind === "sequence"
          ? sequenceTargets(removed)
          : kind === "gantt"
            ? ganttTargets(removedGantt, removedGanttDependencies)
            : [],
      rightTargets:
        kind === "sequence"
          ? sequenceTargets(added)
          : kind === "gantt"
            ? ganttTargets(addedGantt, addedGanttDependencies)
            : [],
    });
  }
  if (kind !== "gantt") return groups;
  const rightLines = rightSource.split("\n");
  if (groups.length === 2) {
    const removalIndex = groups.findIndex(
      (group) => group.deleteCount > 0 && group.replacement.every((line) => !line.trim()),
    );
    const additionIndex = groups.findIndex(
      (group) => group.deleteCount === 0 && group.replacement.some((line) => line.trim()),
    );
    const removal = groups[removalIndex];
    const addition = groups[additionIndex];
    const removedTasks = removal?.leftTargets.filter((target) => target.kind === "gantt-task") ?? [];
    const addedTasks = addition?.rightTargets.filter((target) => target.kind === "gantt-task") ?? [];
    const movedTaskId = removedTasks[0]?.id;
    const leftTask = leftGanttItems.find((item) => item.value.id === movedTaskId)?.value;
    const rightTask = rightGanttItems.find((item) => item.value.id === movedTaskId)?.value;
    const declarations = (source: string, task: GanttTask | undefined) =>
      task?.declarations.map((declaration) => source.slice(declaration.range.from, declaration.range.to)).join("\n");
    if (
      removal &&
      addition &&
      removedTasks.length === 1 &&
      addedTasks.length === 1 &&
      removedTasks[0]!.id === addedTasks[0]!.id &&
      declarations(leftSource, leftTask) === declarations(rightSource, rightTask)
    ) {
      const startLeft = Math.min(removal.startLeft, addition.startLeft);
      const endLeft = Math.max(removal.startLeft + removal.deleteCount, addition.startLeft + addition.deleteCount);
      const startRight = Math.min(removal.startRight, addition.startRight);
      const endRight = Math.max(
        removal.startRight + removal.replacement.length,
        addition.startRight + addition.replacement.length,
      );
      return [
        {
          id: groups[0]!.id,
          title: `Move task ${addedTasks[0]!.label}`,
          detail: "The task declarations are unchanged and moved together to a new position.",
          changeKind: "modified",
          confidence: "confirmed",
          startLeft,
          startRight,
          deleteCount: endLeft - startLeft,
          replacement: rightLines.slice(startRight, endRight),
          leftTargets: removedTasks,
          rightTargets: addedTasks,
        },
      ];
    }
  }
  const startReplacements = groups.map((group) => {
    const starts = leftGanttItems.filter(
      (item) =>
        item.declarationKind === "start" &&
        item.line >= group.startLeft &&
        item.line < group.startLeft + group.deleteCount,
    );
    return group.deleteCount === 1 && group.replacement.every((line) => !line.trim()) && starts.length === 1
      ? starts[0]
      : undefined;
  });
  const dependencyGroups = groups.map((group) =>
    rightGanttDependencies.filter(
      (item) => item.line >= group.startRight && item.line < group.startRight + group.replacement.length,
    ),
  );
  const dependencyGroupIndex = dependencyGroups.findIndex((items) => items.length > 1);
  if (
    dependencyGroupIndex >= 0 &&
    dependencyGroupIndex === groups.length - 1 &&
    startReplacements.slice(0, dependencyGroupIndex).every(Boolean) &&
    dependencyGroups.slice(0, dependencyGroupIndex).every((items) => items.length === 0)
  ) {
    const starts = startReplacements.slice(0, dependencyGroupIndex).filter(Boolean) as GanttItem[];
    const dependencies = dependencyGroups[dependencyGroupIndex]!;
    if (
      starts.length === dependencies.length &&
      dependencies.every((dependency) => starts.some((start) => start.value.id === dependency.value.successorTaskId))
    ) {
      const first = groups[0]!;
      const last = groups[dependencyGroupIndex]!;
      return [
        {
          id: first.id,
          title: `Add dependencies (${dependencies.length})`,
          detail: `${dependencies.length} explicit task starts are replaced by recognized dependencies. The source regions apply together.`,
          changeKind: "modified",
          confidence: "confirmed",
          startLeft: first.startLeft,
          startRight: first.startRight,
          deleteCount: last.startLeft + last.deleteCount - first.startLeft,
          replacement: rightLines.slice(first.startRight, last.startRight + last.replacement.length),
          leftTargets: groups.slice(0, dependencyGroupIndex).flatMap((group) => group.leftTargets),
          rightTargets: last.rightTargets,
        },
      ];
    }
  }
  const merged: ReviewGroup[] = [];
  for (let index = 0; index < groups.length; index += 1) {
    const removal = groups[index]!;
    const addition = groups[index + 1];
    const removedStarts = leftGanttItems.filter(
      (item) =>
        item.declarationKind === "start" &&
        item.line >= removal.startLeft &&
        item.line < removal.startLeft + removal.deleteCount,
    );
    const addedDependencies = addition
      ? rightGanttDependencies.filter(
          (item) => item.line >= addition.startRight && item.line < addition.startRight + addition.replacement.length,
        )
      : [];
    const replacesOnlyStart =
      removal.deleteCount === 1 && removal.replacement.every((line) => !line.trim()) && removedStarts.length === 1;
    const addsOnlyDependency =
      addition?.deleteCount === 0 && addition.replacement.length === 1 && addedDependencies.length === 1;
    const dependency = addedDependencies[0]?.value;
    if (
      addition &&
      replacesOnlyStart &&
      addsOnlyDependency &&
      dependency?.successorTaskId === removedStarts[0]!.value.id
    ) {
      const replacementEnd = addition.startRight + addition.replacement.length;
      merged.push({
        id: removal.id,
        title: `Add dependency ${dependency.predecessor.value} → ${dependency.successor.value}`,
        detail: `${dependency.successor.value}'s explicit start is replaced by a dependency on ${dependency.predecessor.value}. Both source regions apply together.`,
        changeKind: "modified",
        confidence: "confirmed",
        startLeft: removal.startLeft,
        startRight: removal.startRight,
        deleteCount: addition.startLeft + addition.deleteCount - removal.startLeft,
        replacement: rightLines.slice(removal.startRight, replacementEnd),
        leftTargets: removal.leftTargets,
        rightTargets: addition.rightTargets,
      });
      index += 1;
      continue;
    }
    merged.push(removal);
  }
  return merged;
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
