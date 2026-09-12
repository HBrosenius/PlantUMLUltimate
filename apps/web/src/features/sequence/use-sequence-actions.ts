import { useCallback } from "react";
import {
  deleteSequenceMessage,
  deleteSequenceParticipant,
  deleteSequenceStructure,
  insertSequenceMessage,
  insertSequenceParticipant,
  insertSequenceParticipantBox,
  insertSequenceStructure,
  parseSequence,
  reconnectSequenceStructure,
  reorderSequenceStatement,
  updateSequenceMessage,
  updateSequenceParticipant,
  updateSequenceStructure,
  type SequenceDocument,
  type SequenceMessage,
  type SequenceParticipant,
  type SequenceStructure,
  type SequenceStructureInput,
} from "@plantuml-studio/diagram-sequence";
import type { AddSequenceParticipantValue } from "../../AddSequenceParticipantDialog";
import type { AddSequenceMessageValue } from "../../AddSequenceMessageDialog";
import type { SequenceParticipantInspectorValue } from "../../SequenceParticipantInspector";
import type { SequenceMessageInspectorValue } from "../../SequenceMessageInspector";
import { updateSequenceSettings, type SequenceSettings } from "../../sequence-settings";

interface UseSequenceActionsOptions {
  source: string;
  document: SequenceDocument;
  structures: SequenceStructure[];
  selectedParticipant: SequenceParticipant | undefined;
  selectedMessage: SequenceMessage | undefined;
  selectedStructure: SequenceStructure | undefined;
  commitSource(source: string, description: string): boolean;
  mapProjectRename(
    kind: "sequence-participant",
    from: number,
    declaration: { symbolKey: string; from: number; to: number },
    source: string,
  ): Promise<void>;
  confirmDelete(message: string): boolean;
  closeDialog(kind: "participant" | "message" | "structure"): void;
  selectParticipant(id: string | undefined): void;
  selectMessage(id: string | undefined): void;
  selectStructure(id: string | undefined): void;
  closeSettings(): void;
  reportMessage(message: string): void;
}

export function useSequenceActions(options: UseSequenceActionsOptions) {
  const {
    source,
    document,
    structures,
    selectedParticipant,
    selectedMessage,
    selectedStructure,
    commitSource,
    mapProjectRename,
    confirmDelete,
    closeDialog,
    selectParticipant,
    selectMessage,
    selectStructure,
    closeSettings,
    reportMessage,
  } = options;

  const addSequenceParticipant = useCallback(
    (value: AddSequenceParticipantValue) => {
      commitSource(insertSequenceParticipant(source, value), `Add ${value.kind} ${value.label.trim()}`);
      closeDialog("participant");
      reportMessage(`Added ${value.kind} ${value.label.trim()}`);
    },
    [closeDialog, commitSource, reportMessage, source],
  );
  const addSequenceMessage = useCallback(
    (value: AddSequenceMessageValue) => {
      commitSource(insertSequenceMessage(source, value), `Add message ${value.from} to ${value.to}`);
      closeDialog("message");
      reportMessage(`Added message from ${value.from} to ${value.to}`);
    },
    [closeDialog, commitSource, reportMessage, source],
  );
  const addSequenceStructure = useCallback(
    (value: SequenceStructureInput) => {
      const nextSource =
        value.kind === "box"
          ? insertSequenceParticipantBox(source, document, value)
          : insertSequenceStructure(source, value);
      commitSource(nextSource, `Add Sequence ${value.kind}`);
      closeDialog("structure");
      reportMessage(`Added Sequence ${value.kind}`);
    },
    [closeDialog, commitSource, document, reportMessage, source],
  );
  const applySequenceParticipant = useCallback(
    (value: SequenceParticipantInspectorValue) => {
      if (!selectedParticipant) return;
      const { order, ...presentation } = value;
      const next = updateSequenceParticipant(source, document, selectedParticipant, {
        ...presentation,
        ...(order !== undefined ? { order } : {}),
      });
      const key = value.alias.trim() || value.label.trim();
      const updated = parseSequence(next).participants.find((item) => (item.alias ?? item.label) === key);
      if (updated)
        void mapProjectRename(
          "sequence-participant",
          selectedParticipant.sourceRange.from,
          { symbolKey: key, ...updated.sourceRange },
          next,
        );
      commitSource(next, `Update participant ${selectedParticipant.label}`);
      selectParticipant(key.toLowerCase());
      reportMessage(`Updated participant ${value.label.trim()}`);
    },
    [commitSource, document, mapProjectRename, reportMessage, selectedParticipant, selectParticipant, source],
  );
  const removeSequenceParticipant = useCallback(() => {
    if (!selectedParticipant) return;
    const reference = selectedParticipant.alias ?? selectedParticipant.label;
    const attached = document.messages.filter(
      (message) => message.from === reference || message.to === reference,
    ).length;
    if (
      !confirmDelete(
        `Delete “${selectedParticipant.label}”${attached ? ` and ${attached} connected message${attached === 1 ? "" : "s"}` : ""}?`,
      )
    )
      return;
    commitSource(
      deleteSequenceParticipant(source, document, selectedParticipant),
      `Delete participant ${selectedParticipant.label}`,
    );
    selectParticipant(undefined);
    reportMessage(`Deleted participant ${selectedParticipant.label}`);
  }, [commitSource, confirmDelete, document, reportMessage, selectedParticipant, selectParticipant, source]);
  const applySequenceMessage = useCallback(
    (value: SequenceMessageInspectorValue) => {
      if (!selectedMessage) return;
      if (!commitSource(updateSequenceMessage(source, selectedMessage, value), "Update Sequence message")) return;
      selectMessage(selectedMessage.id);
      reportMessage("Updated message");
    },
    [commitSource, reportMessage, selectedMessage, selectMessage, source],
  );
  const removeSequenceMessage = useCallback(() => {
    if (!selectedMessage || !confirmDelete("Delete this message?")) return;
    commitSource(deleteSequenceMessage(source, selectedMessage), "Delete Sequence message");
    selectMessage(undefined);
    reportMessage("Deleted message");
  }, [commitSource, confirmDelete, reportMessage, selectedMessage, selectMessage, source]);
  const applySequenceStructure = useCallback(
    (value: SequenceStructureInput) => {
      if (!selectedStructure) return;
      commitSource(updateSequenceStructure(source, selectedStructure, value), `Update Sequence ${value.kind}`);
      reportMessage(`Updated Sequence ${value.kind}`);
    },
    [commitSource, reportMessage, selectedStructure, source],
  );
  const removeSequenceStructure = useCallback(() => {
    if (!selectedStructure || !confirmDelete("Delete this Sequence structure?")) return;
    commitSource(deleteSequenceStructure(source, selectedStructure), "Delete Sequence structure");
    selectStructure(undefined);
    reportMessage("Deleted Sequence structure");
  }, [commitSource, confirmDelete, reportMessage, selectedStructure, selectStructure, source]);
  const reorderSequenceParticipant = useCallback(
    (id: string, targetId: string, placement: "before" | "after" = "before") => {
      const moved = document.participants.find((item) => item.id === id);
      const target = document.participants.find((item) => item.id === targetId);
      if (!moved || !target) return;
      commitSource(reorderSequenceStatement(source, moved, target, placement), `Reorder participant ${moved.label}`);
      reportMessage(`Moved ${moved.label} ${placement} ${target.label}`);
    },
    [commitSource, document.participants, reportMessage, source],
  );
  const reorderSequenceMessage = useCallback(
    (id: string, targetId: string, placement: "before" | "after" = "before") => {
      const moved = document.messages.find((item) => item.id === id);
      const target = document.messages.find((item) => item.id === targetId);
      if (!moved || !target) return;
      commitSource(reorderSequenceStatement(source, moved, target, placement), "Reorder Sequence message");
      selectMessage(undefined);
      reportMessage("Reordered message");
    },
    [commitSource, document.messages, reportMessage, selectMessage, source],
  );
  const reorderSequenceTimeline = useCallback(
    (id: string, targetId: string, placement: "before" | "after" = "before") => {
      const timeline = [...document.messages, ...structures];
      const moved = timeline.find((item) => item.id === id);
      const target = timeline.find((item) => item.id === targetId);
      if (!moved || !target) return;
      const next = reorderSequenceStatement(source, moved, target, placement);
      if (next === source) return;
      commitSource(next, "Reorder Sequence element");
      selectMessage(undefined);
      selectStructure(undefined);
      reportMessage(`Moved Sequence element ${placement} target`);
    },
    [commitSource, document.messages, reportMessage, selectMessage, selectStructure, source, structures],
  );
  const reconnectSequenceElement = useCallback(
    (structureId: string, endpoint: number, participantId: string) => {
      const structure = structures.find((item) => item.id === structureId);
      const participant = document.participants.find((item) => item.id === participantId);
      if (!structure || !participant) return;
      const next = reconnectSequenceStructure(source, structure, endpoint, participant.alias ?? participant.label);
      if (next === source) return;
      commitSource(next, "Reconnect Sequence element");
      reportMessage(`Attached Sequence element to ${participant.label}`);
    },
    [commitSource, document.participants, reportMessage, source, structures],
  );
  const reconnectSequenceMessage = useCallback(
    (messageId: string, endpoint: "from" | "to", participantId: string) => {
      const message = document.messages.find((item) => item.id === messageId);
      const participant = document.participants.find((item) => item.id === participantId);
      if (!message || !participant) return;
      const reference = participant.alias ?? participant.label;
      commitSource(
        updateSequenceMessage(source, message, { ...message, [endpoint]: reference }),
        `Reconnect message ${endpoint}`,
      );
      reportMessage(`Changed message ${endpoint === "from" ? "sender" : "recipient"} to ${participant.label}`);
    },
    [commitSource, document, reportMessage, source],
  );
  const externalizeSequenceMessage = useCallback(
    (messageId: string, endpoint: "from" | "to", marker: "[" | "]" | "?") => {
      const message = document.messages.find((item) => item.id === messageId);
      if (!message) return;
      commitSource(
        updateSequenceMessage(source, message, { ...message, [endpoint]: marker }),
        "Reconnect message to diagram edge",
      );
      reportMessage(marker === "?" ? "Marked message as lost" : "Connected message to diagram edge");
    },
    [commitSource, document.messages, reportMessage, source],
  );
  const createSequenceMessageByDrag = useCallback(
    (fromId: string, toId: string) => {
      const from = document.participants.find((item) => item.id === fromId);
      const to = document.participants.find((item) => item.id === toId);
      if (!from || !to) return;
      const next = insertSequenceMessage(source, {
        from: from.alias ?? from.label,
        to: to.alias ?? to.label,
        arrow: "->",
        label: "New message",
      });
      commitSource(next, `Connect ${from.label} to ${to.label}`);
      reportMessage(`Added message from ${from.label} to ${to.label}`);
    },
    [commitSource, document.participants, reportMessage, source],
  );
  const applySequenceSettings = useCallback(
    (value: SequenceSettings) => {
      commitSource(updateSequenceSettings(source, value), "Update Sequence settings");
      closeSettings();
      reportMessage("Updated Sequence settings");
    },
    [closeSettings, commitSource, reportMessage, source],
  );

  return {
    addSequenceParticipant,
    addSequenceMessage,
    addSequenceStructure,
    applySequenceParticipant,
    removeSequenceParticipant,
    applySequenceMessage,
    removeSequenceMessage,
    applySequenceStructure,
    removeSequenceStructure,
    reorderSequenceParticipant,
    reorderSequenceMessage,
    reorderSequenceTimeline,
    reconnectSequenceElement,
    reconnectSequenceMessage,
    externalizeSequenceMessage,
    createSequenceMessageByDrag,
    applySequenceSettings,
  };
}
