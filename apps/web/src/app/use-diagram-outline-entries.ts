import { useMemo } from "react";
import { type DiagramOutlineEntry, buildDiagramOutlineEntries, outlineLine } from "../diagram-outline";
import type { ActivityDocument } from "../../../../packages/diagram-activity/src/model";
import type { ClassDocument } from "../../../../packages/diagram-class/src/model";
import type { DiagramParseResult } from "../../../../packages/language-core/src/index";
import type { GanttDocument } from "../../../../packages/diagram-gantt/src/model";
import type {
  SequenceDocument,
  SequenceFragment,
  SequenceActivation,
  SequenceNote,
  SequenceTimelineItem,
  SequenceReference,
  SequenceParticipantBox,
  SequenceAutonumber,
  SequenceCreation,
  SequenceDuration,
} from "../../../../packages/diagram-sequence/src/index";
import type { SemanticSymbolOccurrence } from "../semantic-symbol-provider";
import type { UseCaseDocument } from "../../../../packages/diagram-usecase/src/model";
import type { WbsDocument } from "../../../../packages/diagram-wbs/src/model";
import type { WorkspaceSnapshot } from "../workspace-storage";

export interface useDiagramOutlineEntriesInputs {
  activityDocument: ActivityDocument;
  classDocument: ClassDocument;
  outlineVisible: boolean;
  parseResult: DiagramParseResult<GanttDocument>;
  sequenceDocument: SequenceDocument;
  sequenceStructures: (
    | SequenceFragment
    | SequenceActivation
    | SequenceNote
    | SequenceTimelineItem
    | SequenceReference
    | SequenceParticipantBox
    | SequenceAutonumber
    | SequenceCreation
    | SequenceDuration
  )[];
  symbolOccurrences: SemanticSymbolOccurrence[];
  useCaseDocument: UseCaseDocument;
  wbsDocument: WbsDocument;
  workspace: WorkspaceSnapshot;
}

export function useDiagramOutlineEntries({
  activityDocument,
  classDocument,
  outlineVisible,
  parseResult,
  sequenceDocument,
  sequenceStructures,
  symbolOccurrences,
  useCaseDocument,
  wbsDocument,
  workspace,
}: useDiagramOutlineEntriesInputs) {
  const diagramOutlineEntries = useMemo((): DiagramOutlineEntry[] => {
    if (!outlineVisible) return [];
    const source = workspace.source;
    const semantic = buildDiagramOutlineEntries(source, symbolOccurrences, workspace.diagramKind);
    const entry = (
      id: string,
      kind: string,
      typeLabel: string,
      label: string,
      range: { from: number; to: number },
      target: DiagramOutlineEntry["target"],
      group?: string,
    ): DiagramOutlineEntry => ({
      id,
      kind,
      typeLabel,
      label,
      range,
      target,
      ...(group ? { group } : {}),
      line: outlineLine(source, range),
    });
    const named = (id: string) =>
      parseResult.document.tasks.find((item) => item.id === id)?.label ??
      sequenceDocument.participants.find((item) => item.id === id)?.label ??
      useCaseDocument.elements.find((item) => item.id === id)?.label ??
      classDocument.entities.find((item) => item.id === id)?.label ??
      wbsDocument.nodes.find((item) => item.id === id)?.label ??
      id;
    const extras: DiagramOutlineEntry[] = [];

    if (workspace.diagramKind === "gantt") {
      parseResult.document.dependencies.forEach((item, index) =>
        extras.push(
          entry(
            `dependency:${index}`,
            "gantt-dependency",
            "Dependency",
            `${named(item.predecessorTaskId)} → ${named(item.successorTaskId)}`,
            item.sourceRange,
            { type: "gantt-dependency", index },
            "Dependencies",
          ),
        ),
      );
      parseResult.document.dividers.forEach((item, index) =>
        extras.push(
          entry(`divider:${index}`, "gantt-divider", "Divider", item.label, item.sourceRange, {
            type: "gantt-divider",
            index,
          }),
        ),
      );
      parseResult.document.verticalSeparators.forEach((item, index) =>
        extras.push(
          entry(
            `separator:${index}`,
            "gantt-separator",
            "Separator",
            `${item.taskLabel} ${item.anchor} ${item.direction} ${Math.abs(item.offset)} day${Math.abs(item.offset) === 1 ? "" : "s"}`,
            item.sourceRange,
            { type: "gantt-separator", index },
          ),
        ),
      );
    } else if (workspace.diagramKind === "sequence") {
      sequenceDocument.messages.forEach((item) =>
        extras.push(
          entry(
            `message:${item.id}`,
            "sequence-message",
            "Message",
            item.label || `${named(item.from)} → ${named(item.to)}`,
            item.sourceRange,
            { type: "sequence-message", id: item.id },
            `${named(item.from)} → ${named(item.to)}`,
          ),
        ),
      );
      sequenceStructures.forEach((item) => {
        const typeLabel =
          "branches" in item
            ? "Fragment"
            : "placement" in item
              ? "Note"
              : "participant" in item && "kind" in item
                ? "Activation"
                : "fromAnchor" in item
                  ? "Duration"
                  : "participants" in item && "multiline" in item
                    ? "Reference"
                    : "participants" in item
                      ? "Participant box"
                      : "command" in item
                        ? "Autonumber"
                        : "participantKind" in item
                          ? "Creation"
                          : "Timeline item";
        const label =
          "text" in item
            ? item.text
            : "label" in item && item.label
              ? item.label
              : "participant" in item
                ? `${"kind" in item ? item.kind : "create"} ${item.participant}`
                : "command" in item
                  ? `${item.command} ${item.value}`.trim()
                  : typeLabel;
        extras.push(
          entry(
            `structure:${item.id}`,
            `sequence-${typeLabel.toLowerCase().replaceAll(" ", "-")}`,
            typeLabel,
            label,
            item.sourceRange,
            {
              type: "sequence-structure",
              id: item.id,
            },
          ),
        );
      });
    } else if (workspace.diagramKind === "usecase") {
      useCaseDocument.relationships.forEach((item) =>
        extras.push(
          entry(
            `usecase:${item.id}`,
            "usecase-relationship",
            "Relationship",
            item.label || `${named(item.from)} → ${named(item.to)}`,
            item.sourceRange,
            {
              type: "usecase-object",
              id: item.id,
            },
          ),
        ),
      );
      useCaseDocument.notes.forEach((item) =>
        extras.push(
          entry(`usecase:${item.id}`, "usecase-note", "Note", item.text, item.sourceRange, {
            type: "usecase-object",
            id: item.id,
          }),
        ),
      );
    } else if (workspace.diagramKind === "class" || workspace.diagramKind === "component") {
      classDocument.relationships.forEach((item) =>
        extras.push(
          entry(
            `class:${item.id}`,
            "class-relationship",
            "Relationship",
            item.label || `${named(item.from)} → ${named(item.to)}`,
            item.sourceRange,
            {
              type: "class-object",
              id: item.id,
            },
          ),
        ),
      );
      classDocument.notes.forEach((item) =>
        extras.push(
          entry(`class:${item.id}`, "class-note", "Note", item.text, item.sourceRange, {
            type: "class-object",
            id: item.id,
          }),
        ),
      );
    } else if (workspace.diagramKind === "activity") {
      activityDocument.controls.forEach((item) =>
        extras.push(
          entry(
            `activity:${item.id}`,
            "activity-control",
            "Control",
            item.condition ?? item.label ?? item.kind,
            item.sourceRange,
            {
              type: "activity-object",
              id: item.id,
            },
          ),
        ),
      );
      activityDocument.notes.forEach((item) =>
        extras.push(
          entry(`activity:${item.id}`, "activity-note", "Note", item.text, item.sourceRange, {
            type: "activity-object",
            id: item.id,
          }),
        ),
      );
      activityDocument.arrows.forEach((item) =>
        extras.push(
          entry(`activity:${item.id}`, "activity-arrow", "Arrow", item.label ?? "Arrow", item.sourceRange, {
            type: "activity-object",
            id: item.id,
          }),
        ),
      );
    } else if (workspace.diagramKind === "wbs") {
      wbsDocument.relationships.forEach((item) =>
        extras.push(
          entry(
            `wbs:${item.id}`,
            "wbs-relationship",
            "Relationship",
            `${named(item.from)} → ${named(item.to)}`,
            item.sourceRange,
            {
              type: "wbs-relationship",
              id: item.id,
            },
          ),
        ),
      );
    }

    const contexts = new Map<string, { label: string; parentId?: string | undefined }>();
    if (workspace.diagramKind === "wbs") {
      for (const node of wbsDocument.nodes) contexts.set(node.id, node);
    } else if (workspace.diagramKind === "usecase") {
      for (const item of useCaseDocument.packages) contexts.set(item.id, item);
      for (const item of useCaseDocument.elements)
        contexts.set(item.id, { label: item.label, parentId: item.packageId });
    } else if (workspace.diagramKind === "class" || workspace.diagramKind === "component") {
      for (const item of classDocument.packages) contexts.set(item.id, item);
      for (const item of classDocument.entities) contexts.set(item.id, { label: item.label, parentId: item.packageId });
    } else if (workspace.diagramKind === "activity") {
      for (const item of activityDocument.partitions) contexts.set(item.id, item);
      for (const item of activityDocument.nodes)
        contexts.set(item.id, { label: item.label ?? item.kind, parentId: item.partitionId });
    }
    const groupedSemantic = semantic.map((item) => {
      const key = item.target.type === "semantic" ? item.target.occurrence.key : "";
      const task = parseResult.document.tasks.find((object) => object.id === key);
      const activityNode = activityDocument.nodes.find((object) => object.id === key);
      const ancestors: string[] = [];
      const seen = new Set([key]);
      let parentId = contexts.get(key)?.parentId;
      while (parentId && !seen.has(parentId)) {
        seen.add(parentId);
        const parent = contexts.get(parentId);
        if (!parent) break;
        ancestors.unshift(parent.label);
        parentId = parent.parentId;
      }
      return {
        ...item,
        ...(task?.milestone ? { kind: "gantt-milestone", typeLabel: "Milestone" } : {}),
        ...(activityNode && activityNode.kind !== "action" ? { kind: "activity-terminal", typeLabel: "Terminal" } : {}),
        ...(ancestors.length ? { group: ancestors.join(" / "), depth: ancestors.length } : {}),
      };
    });
    return [...groupedSemantic, ...extras].sort((left, right) => left.range.from - right.range.from);
  }, [
    activityDocument,
    classDocument,
    outlineVisible,
    parseResult.document,
    sequenceDocument,
    sequenceStructures,
    symbolOccurrences,
    useCaseDocument,
    wbsDocument,
    workspace.diagramKind,
    workspace.source,
  ]);

  return { diagramOutlineEntries };
}
