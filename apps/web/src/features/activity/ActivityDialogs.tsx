import type {
  ActivityActionInput,
  ActivityArrowInput,
  ActivityDocument,
  ActivityNoteInput,
  ActivityPartitionInput,
  ActivityStructureInput,
} from "@plantuml-studio/diagram-activity";
import {
  AddActivityActionDialog,
  AddActivityArrowDialog,
  AddActivityNoteDialog,
  AddActivityPartitionDialog,
  AddActivityStructureDialog,
  AddActivityTerminalDialog,
} from "../../ActivityEditors";

export type ActivityDialogKind = "action" | "partition" | "note" | "structure" | "terminal" | "arrow";

interface ActivityDialogsProps {
  active: ActivityDialogKind | undefined;
  document: ActivityDocument;
  onAddAction(value: ActivityActionInput): void;
  onAddPartition(value: ActivityPartitionInput): void;
  onAddNote(value: ActivityNoteInput): void;
  onAddStructure(value: ActivityStructureInput): void;
  onAddTerminal(kind: "start" | "stop" | "end" | "detach" | "kill"): void;
  onAddArrow(value: ActivityArrowInput): void;
  onClose(): void;
}

export function ActivityDialogs({
  active,
  document,
  onAddAction,
  onAddPartition,
  onAddNote,
  onAddStructure,
  onAddTerminal,
  onAddArrow,
  onClose,
}: ActivityDialogsProps) {
  if (active === "action") return <AddActivityActionDialog document={document} onAdd={onAddAction} onClose={onClose} />;
  if (active === "partition")
    return <AddActivityPartitionDialog document={document} onAdd={onAddPartition} onClose={onClose} />;
  if (active === "note") return <AddActivityNoteDialog document={document} onAdd={onAddNote} onClose={onClose} />;
  if (active === "structure")
    return <AddActivityStructureDialog document={document} onAdd={onAddStructure} onClose={onClose} />;
  if (active === "terminal") return <AddActivityTerminalDialog onAdd={onAddTerminal} onClose={onClose} />;
  if (active === "arrow") return <AddActivityArrowDialog document={document} onAdd={onAddArrow} onClose={onClose} />;
  return null;
}
