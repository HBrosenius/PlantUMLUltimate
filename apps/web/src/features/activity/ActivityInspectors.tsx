import type {
  ActivityActionInput,
  ActivityArrow,
  ActivityArrowInput,
  ActivityControl,
  ActivityControlInput,
  ActivityDocument,
  ActivityNode,
  ActivityNote,
  ActivityNoteInput,
  ActivityPartition,
  ActivityPartitionInput,
} from "@plantuml-studio/diagram-activity";
import type { ActivitySettings } from "../../activity-settings";
import { ActivitySettingsInspector } from "../../ActivitySettingsInspector";
import {
  ActivityActionInspector,
  ActivityArrowInspector,
  ActivityControlInspector,
  ActivityNoteInspector,
  ActivityPartitionInspector,
  ActivityTerminalInspector,
} from "../../ActivityEditors";

interface ActivityInspectorsProps {
  settingsOpen: boolean;
  settings: ActivitySettings;
  document: ActivityDocument;
  selectedAction: ActivityNode | undefined;
  selectedControl: ActivityControl | undefined;
  selectedTerminal: ActivityNode | undefined;
  selectedArrow: ActivityArrow | undefined;
  selectedPartition: ActivityPartition | undefined;
  selectedNote: ActivityNote | undefined;
  onSettingsChange(value: ActivitySettings): void;
  onActionChange(value: ActivityActionInput): void;
  onActionPartitionChange(partitionId?: string): void;
  onActionDelete(): void;
  onControlChange(value: ActivityControlInput): void;
  onControlDelete(): void;
  onTerminalDelete(): void;
  onArrowChange(value: ActivityArrowInput): void;
  onArrowDelete(): void;
  onPartitionChange(value: ActivityPartitionInput): void;
  onPartitionParentChange(parentId?: string): void;
  onPartitionDelete(): void;
  onNoteChange(value: ActivityNoteInput): void;
  onNoteDelete(): void;
  onCloseSettings(): void;
  onCloseSelection(): void;
}

export function ActivityInspectors({
  settingsOpen,
  settings,
  document,
  selectedAction,
  selectedControl,
  selectedTerminal,
  selectedArrow,
  selectedPartition,
  selectedNote,
  onSettingsChange,
  onActionChange,
  onActionPartitionChange,
  onActionDelete,
  onControlChange,
  onControlDelete,
  onTerminalDelete,
  onArrowChange,
  onArrowDelete,
  onPartitionChange,
  onPartitionParentChange,
  onPartitionDelete,
  onNoteChange,
  onNoteDelete,
  onCloseSettings,
  onCloseSelection,
}: ActivityInspectorsProps) {
  return (
    <>
      {settingsOpen && (
        <ActivitySettingsInspector settings={settings} onChange={onSettingsChange} onClose={onCloseSettings} />
      )}
      {selectedAction && (
        <ActivityActionInspector
          item={selectedAction}
          document={document}
          onChange={onActionChange}
          onPartitionChange={onActionPartitionChange}
          onDelete={onActionDelete}
          onClose={onCloseSelection}
        />
      )}
      {selectedControl && (
        <ActivityControlInspector
          item={selectedControl}
          onChange={onControlChange}
          onDelete={onControlDelete}
          onClose={onCloseSelection}
        />
      )}
      {selectedTerminal && (
        <ActivityTerminalInspector item={selectedTerminal} onDelete={onTerminalDelete} onClose={onCloseSelection} />
      )}
      {selectedArrow && (
        <ActivityArrowInspector
          item={selectedArrow}
          onChange={onArrowChange}
          onDelete={onArrowDelete}
          onClose={onCloseSelection}
        />
      )}
      {selectedPartition && (
        <ActivityPartitionInspector
          item={selectedPartition}
          document={document}
          onChange={onPartitionChange}
          onParentChange={onPartitionParentChange}
          onDelete={onPartitionDelete}
          onClose={onCloseSelection}
        />
      )}
      {selectedNote && (
        <ActivityNoteInspector
          item={selectedNote}
          document={document}
          onChange={onNoteChange}
          onDelete={onNoteDelete}
          onClose={onCloseSelection}
        />
      )}
    </>
  );
}
