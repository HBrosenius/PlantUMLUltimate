import { type DockHandlers, dockActionsFor, type AddItem, type StageSelection } from "../stage/stage-selection";
import type { ClassMemberInput } from "../../../../packages/diagram-class/src/operations";
import type { WbsNodeInput } from "../../../../packages/diagram-wbs/src/model";
import type { WbsInsertPosition } from "../features/wbs/WbsDialogs";
import type { SemanticSymbolOccurrence } from "../semantic-symbol-provider";
import type { AppDialog } from "../use-app-dialog";
import type { DiagramParseResult } from "../../../../packages/language-core/src/index";
import type { GanttDocument } from "../../../../packages/diagram-gantt/src/model";
import type { SequenceDocument } from "../../../../packages/diagram-sequence/src/index";
import type { RefObject } from "react";
import type { WorkspaceSnapshot } from "../workspace-storage";

export interface useStageDockInputs {
  addClassMember: (value: ClassMemberInput) => void;
  addWbsNode: (value: WbsNodeInput, position: WbsInsertPosition) => void;
  commandReadOnly: boolean;
  deleteDependency: () => void;
  deleteSelectedDivider: () => void;
  deleteSelectedTask: () => void;
  deleteSelectedVerticalSeparator: () => void;
  duplicateTaskOccurrence: (occurrence: SemanticSymbolOccurrence) => void;
  moveGanttTask: (taskId: string, days: number) => void;
  openDialog: (next: AppDialog) => void;
  parseResult: DiagramParseResult<GanttDocument>;
  removeActivityAction: () => void;
  removeActivityArrow: () => void;
  removeActivityControl: () => void;
  removeActivityNote: () => void;
  removeActivityPartition: () => void;
  removeActivityTerminal: () => void;
  removeClassEntity: () => void;
  removeClassNote: () => void;
  removeClassPackage: () => void;
  removeClassRelationship: () => void;
  removeSequenceMessage: () => void;
  removeSequenceParticipant: () => void;
  removeSequenceStructure: () => void;
  removeUseCaseElement: () => void;
  removeUseCaseNote: () => void;
  removeUseCasePackage: () => void;
  removeUseCaseRelationship: () => void;
  removeWbsNode: () => void;
  removeWbsRelationship: () => void;
  reorderSequenceMessage: (id: string, targetId: string, placement?: "before" | "after") => void;
  reorderSequenceParticipant: (id: string, targetId: string, placement?: "before" | "after") => void;
  resizeGanttTask: (taskId: string, days: number, calendarDays?: number) => void;
  sequenceDocument: SequenceDocument;
  stagePendingMessage: RefObject<{ index: number; document: unknown } | undefined>;
  stageSelection: StageSelection | undefined;
  workspace: WorkspaceSnapshot;
}

export function useStageDock({
  addClassMember,
  addWbsNode,
  commandReadOnly,
  deleteDependency,
  deleteSelectedDivider,
  deleteSelectedTask,
  deleteSelectedVerticalSeparator,
  duplicateTaskOccurrence,
  moveGanttTask,
  openDialog,
  parseResult,
  removeActivityAction,
  removeActivityArrow,
  removeActivityControl,
  removeActivityNote,
  removeActivityPartition,
  removeActivityTerminal,
  removeClassEntity,
  removeClassNote,
  removeClassPackage,
  removeClassRelationship,
  removeSequenceMessage,
  removeSequenceParticipant,
  removeSequenceStructure,
  removeUseCaseElement,
  removeUseCaseNote,
  removeUseCasePackage,
  removeUseCaseRelationship,
  removeWbsNode,
  removeWbsRelationship,
  reorderSequenceMessage,
  reorderSequenceParticipant,
  resizeGanttTask,
  sequenceDocument,
  stagePendingMessage,
  stageSelection,
  workspace,
}: useStageDockInputs) {
  const dockHandlers: DockHandlers = {
    readOnly: commandReadOnly,
    resizeTask: (id, days) => resizeGanttTask(id, days),
    moveTask: (id, days) => moveGanttTask(id, days),
    addDependency: () => openDialog({ kind: "add-dependency" }),
    duplicateTask: (id) =>
      duplicateTaskOccurrence({ kind: "task", key: id } as unknown as Parameters<typeof duplicateTaskOccurrence>[0]),
    deleteTask: deleteSelectedTask,
    deleteDependency,
    deleteDivider: deleteSelectedDivider,
    moveSequenceMessage: (id, direction) => {
      const messages = sequenceDocument.messages;
      const index = messages.findIndex((item) => item.id === id);
      const target = messages[index + direction];
      if (!target) return;
      reorderSequenceMessage(id, target.id, direction < 0 ? "before" : "after");
      // The reorder clears the selection and ids follow position: reselect the moved message once parsed.
      stagePendingMessage.current = { index: index + direction, document: sequenceDocument };
    },
    moveSequenceParticipant: (id, direction) => {
      const participants = sequenceDocument.participants;
      const index = participants.findIndex((item) => item.id === id);
      const target = participants[index + direction];
      if (target) reorderSequenceParticipant(id, target.id, direction < 0 ? "before" : "after");
    },
    deleteSequenceMessage: removeSequenceMessage,
    deleteSequenceParticipant: removeSequenceParticipant,
    deleteSequenceStructure: removeSequenceStructure,
    renameInLens: () => window.dispatchEvent(new Event("stage-focus-lens")),
    addLinked: () => {
      if (workspace.diagramKind === "usecase") openDialog({ kind: "add-usecase-relationship" });
      else if (workspace.diagramKind === "activity") openDialog({ kind: "add-activity-arrow" });
      else openDialog({ kind: "add-class-relationship" });
    },
    addClassMember: () => addClassMember({ kind: "field", name: "newField", type: "String", visibility: "-" }),
    addWbsNode: (position) => addWbsNode({ label: "New item" }, position),
    remove: {
      "gantt-separator": deleteSelectedVerticalSeparator,
      "usecase-element": removeUseCaseElement,
      "usecase-package": removeUseCasePackage,
      "usecase-note": removeUseCaseNote,
      "usecase-relationship": removeUseCaseRelationship,
      "class-entity": removeClassEntity,
      "class-package": removeClassPackage,
      "class-note": removeClassNote,
      "class-relationship": removeClassRelationship,
      "activity-action": removeActivityAction,
      "activity-partition": removeActivityPartition,
      "activity-note": removeActivityNote,
      "activity-control": removeActivityControl,
      "activity-terminal": removeActivityTerminal,
      "activity-arrow": removeActivityArrow,
      "wbs-node": removeWbsNode,
      "wbs-relationship": removeWbsRelationship,
    },
  };
  const stageDockActions = stageSelection ? dockActionsFor(stageSelection, dockHandlers) : [];
  const stageAddItems: AddItem[] = (() => {
    const item = (id: string, label: string, run: () => void): AddItem => ({ id, label, run });
    switch (workspace.diagramKind) {
      case "gantt":
        return [
          item("task", "Task", () => openDialog({ kind: "add-task" })),
          item("milestone", "Milestone", () => openDialog({ kind: "add-milestone" })),
          item("divider", "Divider", () => openDialog({ kind: "add-divider" })),
          ...(parseResult.document.tasks.length >= 2
            ? [item("dependency", "Dependency", () => openDialog({ kind: "add-dependency" }))]
            : []),
        ];
      case "sequence":
        return [
          item("participant", "Participant", () => openDialog({ kind: "add-sequence-participant" })),
          item("message", "Message", () => openDialog({ kind: "add-sequence-message" })),
          item("fragment", "Fragment", () => openDialog({ kind: "add-sequence-structure", structureKind: "fragment" })),
          item("note", "Note", () => openDialog({ kind: "add-sequence-structure", structureKind: "note" })),
        ];
      case "usecase":
        return [
          item("actor", "Actor", () => openDialog({ kind: "add-usecase-element", elementKind: "actor" })),
          item("usecase", "Use case", () => openDialog({ kind: "add-usecase-element", elementKind: "usecase" })),
          item("relationship", "Relationship", () => openDialog({ kind: "add-usecase-relationship" })),
        ];
      case "class":
      case "component":
        return [
          item("entity", "Element", () => openDialog({ kind: "add-class-entity" })),
          item("relationship", "Relationship", () => openDialog({ kind: "add-class-relationship" })),
        ];
      case "activity":
        return [
          item("action", "Action", () => openDialog({ kind: "add-activity-action" })),
          item("arrow", "Arrow", () => openDialog({ kind: "add-activity-arrow" })),
        ];
      case "wbs":
        return [item("node", "Node", () => openDialog({ kind: "add-wbs-node" }))];
      default:
        return [];
    }
  })();

  return { stageDockActions, stageAddItems };
}
