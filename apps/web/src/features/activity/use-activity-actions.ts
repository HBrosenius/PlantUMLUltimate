import { useCallback } from "react";
import {
  deleteActivityArrow,
  deleteActivityControlBlock,
  deleteActivityNode,
  deleteActivityNote,
  deleteActivityPartition,
  insertActivityAction,
  insertActivityArrow,
  insertActivityNote,
  insertActivityPartition,
  insertActivityStructure,
  insertActivityTerminal,
  moveActivityActionToPartition,
  moveActivityPartition,
  reorderActivityAction,
  reorderActivityControlBlock,
  updateActivityAction,
  updateActivityArrow,
  updateActivityControl,
  updateActivityNoteWithTarget,
  updateActivityPartition,
  type ActivityActionInput,
  type ActivityArrow,
  type ActivityArrowInput,
  type ActivityControl,
  type ActivityControlInput,
  type ActivityDocument,
  type ActivityNode,
  type ActivityNote,
  type ActivityNoteInput,
  type ActivityPartition,
  type ActivityPartitionInput,
  type ActivityStructureInput,
} from "@plantuml-studio/diagram-activity";
import { updateActivitySettings, type ActivitySettings } from "../../activity-settings";
import type { ActivityDialogKind } from "./ActivityDialogs";

interface UseActivityActionsOptions {
  source: string;
  document: ActivityDocument;
  selectedAction: ActivityNode | undefined;
  selectedTerminal: ActivityNode | undefined;
  selectedPartition: ActivityPartition | undefined;
  selectedNote: ActivityNote | undefined;
  selectedControl: ActivityControl | undefined;
  selectedArrow: ActivityArrow | undefined;
  commitSource(source: string, description: string): boolean;
  closeDialog(kind: ActivityDialogKind): void;
  clearSelection(): void;
  reportMessage(message: string): void;
}

export function useActivityActions({
  source,
  document,
  selectedAction,
  selectedTerminal,
  selectedPartition,
  selectedNote,
  selectedControl,
  selectedArrow,
  commitSource,
  closeDialog,
  clearSelection,
  reportMessage,
}: UseActivityActionsOptions) {
  const applyActivitySettings = useCallback(
    (value: ActivitySettings) => {
      commitSource(updateActivitySettings(source, value), "Update Activity settings");
      reportMessage("Updated Activity settings");
    },
    [commitSource, reportMessage, source],
  );
  const addActivityAction = useCallback(
    (value: ActivityActionInput) => {
      commitSource(insertActivityAction(source, document, value), "Add Activity action");
      closeDialog("action");
    },
    [closeDialog, commitSource, document, source],
  );
  const applyActivityAction = useCallback(
    (value: ActivityActionInput) => {
      if (selectedAction) commitSource(updateActivityAction(source, selectedAction, value), "Update Activity action");
    },
    [commitSource, selectedAction, source],
  );
  const moveActivityActionPartition = useCallback(
    (partitionId?: string) => {
      if (!selectedAction) return;
      commitSource(
        moveActivityActionToPartition(source, document, selectedAction, partitionId),
        "Move Activity action",
      );
      clearSelection();
    },
    [clearSelection, commitSource, document, selectedAction, source],
  );
  const removeActivityAction = useCallback(() => {
    if (!selectedAction) return;
    commitSource(deleteActivityNode(source, selectedAction), "Delete Activity action");
    clearSelection();
  }, [clearSelection, commitSource, selectedAction, source]);
  const addActivityPartition = useCallback(
    (value: ActivityPartitionInput) => {
      commitSource(insertActivityPartition(source, document, value), "Add Activity partition");
      closeDialog("partition");
    },
    [closeDialog, commitSource, document, source],
  );
  const applyActivityPartition = useCallback(
    (value: ActivityPartitionInput) => {
      if (selectedPartition)
        commitSource(updateActivityPartition(source, selectedPartition, value), "Update Activity partition");
    },
    [commitSource, selectedPartition, source],
  );
  const moveSelectedActivityPartition = useCallback(
    (parentId?: string) => {
      if (!selectedPartition) return;
      commitSource(moveActivityPartition(source, document, selectedPartition, parentId), "Move Activity partition");
      clearSelection();
    },
    [clearSelection, commitSource, document, selectedPartition, source],
  );
  const removeActivityPartition = useCallback(() => {
    if (!selectedPartition) return;
    commitSource(deleteActivityPartition(source, selectedPartition), "Delete Activity partition");
    clearSelection();
  }, [clearSelection, commitSource, selectedPartition, source]);
  const addActivityNote = useCallback(
    (value: ActivityNoteInput) => {
      commitSource(insertActivityNote(source, document, value), "Add Activity note");
      closeDialog("note");
    },
    [closeDialog, commitSource, document, source],
  );
  const addActivityStructure = useCallback(
    (value: ActivityStructureInput) => {
      commitSource(insertActivityStructure(source, document, value), "Add Activity flow structure");
      closeDialog("structure");
    },
    [closeDialog, commitSource, document, source],
  );
  const addActivityTerminal = useCallback(
    (kind: "start" | "stop" | "end" | "detach" | "kill") => {
      commitSource(insertActivityTerminal(source, kind), `Add Activity ${kind}`);
      closeDialog("terminal");
    },
    [closeDialog, commitSource, source],
  );
  const addActivityArrow = useCallback(
    (value: ActivityArrowInput) => {
      commitSource(insertActivityArrow(source, document, value), "Add Activity flow arrow");
      closeDialog("arrow");
    },
    [closeDialog, commitSource, document, source],
  );
  const applyActivityNote = useCallback(
    (value: ActivityNoteInput) => {
      if (selectedNote)
        commitSource(updateActivityNoteWithTarget(source, document, selectedNote, value), "Update Activity note");
    },
    [commitSource, document, selectedNote, source],
  );
  const removeActivityNote = useCallback(() => {
    if (!selectedNote) return;
    commitSource(deleteActivityNote(source, selectedNote), "Delete Activity note");
    clearSelection();
  }, [clearSelection, commitSource, selectedNote, source]);
  const applyActivityControl = useCallback(
    (value: ActivityControlInput) => {
      if (selectedControl)
        commitSource(updateActivityControl(source, selectedControl, value), "Update Activity control");
    },
    [commitSource, selectedControl, source],
  );
  const removeActivityControl = useCallback(() => {
    if (!selectedControl) return;
    commitSource(deleteActivityControlBlock(source, document, selectedControl), "Delete Activity flow structure");
    clearSelection();
  }, [clearSelection, commitSource, document, selectedControl, source]);
  const removeActivityTerminal = useCallback(() => {
    if (!selectedTerminal) return;
    commitSource(deleteActivityNode(source, selectedTerminal), "Delete Activity terminal");
    clearSelection();
  }, [clearSelection, commitSource, selectedTerminal, source]);
  const applyActivityArrow = useCallback(
    (value: ActivityArrowInput) => {
      if (selectedArrow) commitSource(updateActivityArrow(source, selectedArrow, value), "Update Activity flow arrow");
    },
    [commitSource, selectedArrow, source],
  );
  const removeActivityArrow = useCallback(() => {
    if (!selectedArrow) return;
    commitSource(deleteActivityArrow(source, selectedArrow), "Delete Activity flow arrow");
    clearSelection();
  }, [clearSelection, commitSource, selectedArrow, source]);
  const reorderActivityActionByDrag = useCallback(
    (id: string, targetId: string, placement: "before" | "after") => {
      const item = document.nodes.find((node) => node.id === id);
      const target = document.nodes.find((node) => node.id === targetId);
      const control = document.controls.find((entry) => entry.id === id);
      if (!target || (!item && !control)) return;
      commitSource(
        item
          ? reorderActivityAction(source, document, item, target, placement)
          : reorderActivityControlBlock(source, document, control!, target, placement),
        item ? "Reorder Activity action" : "Reorder Activity flow structure",
      );
    },
    [commitSource, document, source],
  );

  return {
    applyActivitySettings,
    addActivityAction,
    applyActivityAction,
    moveActivityActionPartition,
    removeActivityAction,
    addActivityPartition,
    applyActivityPartition,
    moveSelectedActivityPartition,
    removeActivityPartition,
    addActivityNote,
    addActivityStructure,
    addActivityTerminal,
    addActivityArrow,
    applyActivityNote,
    removeActivityNote,
    applyActivityControl,
    removeActivityControl,
    removeActivityTerminal,
    applyActivityArrow,
    removeActivityArrow,
    reorderActivityActionByDrag,
  };
}
