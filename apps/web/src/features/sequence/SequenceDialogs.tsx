import type { SequenceStructureInput } from "@plantuml-studio/diagram-sequence";
import { AddSequenceParticipantDialog, type AddSequenceParticipantValue } from "../../AddSequenceParticipantDialog";
import { AddSequenceMessageDialog, type AddSequenceMessageValue } from "../../AddSequenceMessageDialog";
import { AddSequenceStructureDialog, type SequenceStructureKind } from "../../AddSequenceStructureDialog";

export type SequenceDialog =
  { kind: "participant" } | { kind: "message" } | { kind: "structure"; structureKind: SequenceStructureKind };

interface SequenceDialogsProps {
  active: SequenceDialog | undefined;
  participants: string[];
  anchors: string[];
  onAddParticipant(value: AddSequenceParticipantValue): void;
  onAddMessage(value: AddSequenceMessageValue): void;
  onAddStructure(value: SequenceStructureInput): void;
  onClose(): void;
}

export function SequenceDialogs({
  active,
  participants,
  anchors,
  onAddParticipant,
  onAddMessage,
  onAddStructure,
  onClose,
}: SequenceDialogsProps) {
  if (active?.kind === "participant")
    return <AddSequenceParticipantDialog onAdd={onAddParticipant} onClose={onClose} />;
  if (active?.kind === "message")
    return <AddSequenceMessageDialog participants={participants} onAdd={onAddMessage} onClose={onClose} />;
  if (active?.kind === "structure")
    return (
      <AddSequenceStructureDialog
        initialKind={active.structureKind}
        participants={participants}
        anchors={anchors}
        onAdd={onAddStructure}
        onClose={onClose}
      />
    );
  return null;
}
