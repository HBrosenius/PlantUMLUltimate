import { useCallback, useEffect, useMemo, useState } from "react";
import type { SequenceDocument, SequenceStructure } from "@plantuml-studio/diagram-sequence";
import type { DiagramKind } from "../../model";

export function useSequenceController(
  diagramKind: DiagramKind,
  document: SequenceDocument,
  structures: SequenceStructure[],
  revealSource: (range: { from: number; to: number }) => void,
) {
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>();
  const [selectedMessageId, setSelectedMessageId] = useState<string>();
  const [selectedStructureId, setSelectedStructureId] = useState<string>();
  const [sourceHighlightedParticipantId, setSourceHighlightedParticipantId] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const selectedParticipant = useMemo(
    () => document.participants.find((item) => item.id === selectedParticipantId),
    [document.participants, selectedParticipantId],
  );
  const selectedMessage = useMemo(
    () => document.messages.find((item) => item.id === selectedMessageId),
    [document.messages, selectedMessageId],
  );
  const selectedStructure = useMemo(
    () => structures.find((item) => item.id === selectedStructureId),
    [selectedStructureId, structures],
  );

  const selectParticipant = useCallback(
    (id: string | undefined, reveal = true) => {
      setSelectedParticipantId(id);
      setSelectedMessageId(undefined);
      setSelectedStructureId(undefined);
      setSettingsOpen(false);
      const item = id ? document.participants.find((entry) => entry.id === id) : undefined;
      if (reveal && item) revealSource(item.sourceRange);
    },
    [document.participants, revealSource],
  );
  const selectMessage = useCallback(
    (id: string | undefined, reveal = true) => {
      setSelectedMessageId(id);
      setSelectedParticipantId(undefined);
      setSelectedStructureId(undefined);
      setSettingsOpen(false);
      const item = id ? document.messages.find((entry) => entry.id === id) : undefined;
      if (reveal && item) revealSource(item.sourceRange);
    },
    [document.messages, revealSource],
  );
  const selectStructure = useCallback(
    (id: string | undefined, reveal = true) => {
      setSelectedStructureId(id);
      setSelectedParticipantId(undefined);
      setSelectedMessageId(undefined);
      setSettingsOpen(false);
      const item = id ? structures.find((entry) => entry.id === id) : undefined;
      if (reveal && item) revealSource(item.sourceRange);
    },
    [revealSource, structures],
  );
  const clearSelection = useCallback(() => {
    setSelectedParticipantId(undefined);
    setSelectedMessageId(undefined);
    setSelectedStructureId(undefined);
  }, []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openSettings = useCallback(() => {
    clearSelection();
    setSettingsOpen(true);
  }, [clearSelection]);
  const dismissInspector = useCallback(() => {
    clearSelection();
    setSettingsOpen(false);
  }, [clearSelection]);
  const resetTransientSelection = useCallback(() => {
    setSelectedParticipantId(undefined);
    setSelectedMessageId(undefined);
  }, []);

  useEffect(() => {
    if (diagramKind === "sequence") return;
    dismissInspector();
  }, [diagramKind, dismissInspector]);

  return {
    selectedParticipantId,
    selectedMessageId,
    selectedStructureId,
    sourceHighlightedParticipantId,
    settingsOpen,
    selectedParticipant,
    selectedMessage,
    selectedStructure,
    setSourceHighlightedParticipantId,
    setSelectedParticipantId,
    setSelectedMessageId,
    setSelectedStructureId,
    selectParticipant,
    selectMessage,
    selectStructure,
    clearSelection,
    closeSettings,
    openSettings,
    dismissInspector,
    resetTransientSelection,
  };
}
