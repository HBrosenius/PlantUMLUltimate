import { useCallback, useEffect, useMemo, useState } from "react";
import type { SequenceDocument, SequenceMessage, SequenceStructure } from "@plantuml-studio/diagram-sequence";
import type { DiagramKind } from "../../model";

function messageIdentity(message: SequenceMessage): string {
  return JSON.stringify([
    message.from,
    message.to,
    message.arrow,
    message.label,
    message.modifiers ?? "",
    message.anchor ?? "",
  ]);
}

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
  const [selectionDocument, setSelectionDocument] = useState(document);

  // Parser message IDs are positional. Reconcile before rendering inspectors so no
  // event handler ever receives the message that merely inherited an old index.
  let resolvedMessageId = selectedMessageId;
  if (selectionDocument !== document) {
    const previous = selectionDocument.messages.find((item) => item.id === selectedMessageId);
    const identity = previous ? messageIdentity(previous) : undefined;
    const previousMatches =
      identity === undefined ? [] : selectionDocument.messages.filter((item) => messageIdentity(item) === identity);
    const matches =
      identity === undefined ? [] : document.messages.filter((item) => messageIdentity(item) === identity);
    resolvedMessageId = previousMatches.length === 1 && matches.length === 1 ? matches[0]!.id : undefined;
    setSelectionDocument(document);
    setSelectedMessageId(resolvedMessageId);
  }

  const selectedParticipant = useMemo(
    () => document.participants.find((item) => item.id === selectedParticipantId),
    [document.participants, selectedParticipantId],
  );
  const selectedMessage = useMemo(
    () => document.messages.find((item) => item.id === resolvedMessageId),
    [document.messages, resolvedMessageId],
  );
  const selectedStructure = useMemo(
    () => structures.find((item) => item.id === selectedStructureId),
    [selectedStructureId, structures],
  );

  // An inspector Apply knows exactly which statement it updated. Anchor its
  // explicit reselection to that parsed revision; free-form edits stay conservative.
  const setMessageSelection = useCallback((id: string | undefined, updatedDocument?: SequenceDocument) => {
    if (updatedDocument) setSelectionDocument(updatedDocument);
    setSelectedMessageId(id);
  }, []);

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
    selectedMessageId: resolvedMessageId,
    selectedStructureId,
    sourceHighlightedParticipantId,
    settingsOpen,
    selectedParticipant,
    selectedMessage,
    selectedStructure,
    setSourceHighlightedParticipantId,
    setSelectedParticipantId,
    setSelectedMessageId: setMessageSelection,
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
