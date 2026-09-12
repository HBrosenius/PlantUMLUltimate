import type {
  SequenceMessage,
  SequenceParticipant,
  SequenceStructure,
  SequenceStructureInput,
} from "@plantuml-studio/diagram-sequence";
import type { SequenceSettings } from "../../sequence-settings";
import { SequenceSettingsInspector } from "../../SequenceSettingsInspector";
import {
  SequenceParticipantInspector,
  type SequenceParticipantInspectorValue,
} from "../../SequenceParticipantInspector";
import { SequenceMessageInspector, type SequenceMessageInspectorValue } from "../../SequenceMessageInspector";
import { SequenceStructureInspector } from "../../SequenceStructureInspector";

interface SequenceInspectorsProps {
  settingsOpen: boolean;
  settings: SequenceSettings;
  selectedParticipant: SequenceParticipant | undefined;
  selectedMessage: SequenceMessage | undefined;
  selectedStructure: SequenceStructure | undefined;
  participants: string[];
  anchors: string[];
  onSettingsApply(value: SequenceSettings): void;
  onParticipantApply(value: SequenceParticipantInspectorValue): void;
  onParticipantDelete(): void;
  onMessageApply(value: SequenceMessageInspectorValue): void;
  onMessageDelete(): void;
  onStructureApply(value: SequenceStructureInput): void;
  onStructureDelete(): void;
  onCloseSettings(): void;
  onCloseParticipant(): void;
  onCloseMessage(): void;
  onCloseStructure(): void;
}

export function SequenceInspectors({
  settingsOpen,
  settings,
  selectedParticipant,
  selectedMessage,
  selectedStructure,
  participants,
  anchors,
  onSettingsApply,
  onParticipantApply,
  onParticipantDelete,
  onMessageApply,
  onMessageDelete,
  onStructureApply,
  onStructureDelete,
  onCloseSettings,
  onCloseParticipant,
  onCloseMessage,
  onCloseStructure,
}: SequenceInspectorsProps) {
  return (
    <>
      {settingsOpen && (
        <SequenceSettingsInspector settings={settings} onApply={onSettingsApply} onClose={onCloseSettings} />
      )}
      {selectedParticipant && (
        <SequenceParticipantInspector
          key={`${selectedParticipant.id}:${selectedParticipant.sourceRange.to}`}
          participant={selectedParticipant}
          onApply={onParticipantApply}
          onDelete={onParticipantDelete}
          onClose={onCloseParticipant}
        />
      )}
      {selectedMessage && (
        <SequenceMessageInspector
          key={`${selectedMessage.id}:${selectedMessage.sourceRange.to}`}
          message={selectedMessage}
          participants={participants}
          onApply={onMessageApply}
          onDelete={onMessageDelete}
          onClose={onCloseMessage}
        />
      )}
      {selectedStructure && (
        <SequenceStructureInspector
          key={`${selectedStructure.id}:${selectedStructure.sourceRange.to}`}
          structure={selectedStructure}
          participants={participants}
          anchors={anchors}
          onApply={onStructureApply}
          onDelete={onStructureDelete}
          onClose={onCloseStructure}
        />
      )}
    </>
  );
}
