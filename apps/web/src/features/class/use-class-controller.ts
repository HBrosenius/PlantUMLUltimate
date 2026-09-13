import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClassDocument } from "@plantuml-studio/diagram-class";
import type { DiagramKind } from "../../model";

export function useClassController(
  diagramKind: DiagramKind,
  document: ClassDocument,
  revealSource: (range: { from: number; to: number }) => void,
) {
  const [selectedObjectId, setSelectedObjectId] = useState<string>();
  const [sourceHighlightedEntityId, setSourceHighlightedEntityId] = useState<string>();
  const [sourceHighlightedMemberId, setSourceHighlightedMemberId] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const selectedEntity = useMemo(
    () => document.entities.find((item) => item.id === selectedObjectId),
    [document.entities, selectedObjectId],
  );
  const selectedRelationship = useMemo(
    () => document.relationships.find((item) => item.id === selectedObjectId),
    [document.relationships, selectedObjectId],
  );
  const selectedPackage = useMemo(
    () => document.packages.find((item) => item.id === selectedObjectId),
    [document.packages, selectedObjectId],
  );
  const selectedNote = useMemo(
    () => document.notes.find((item) => item.id === selectedObjectId),
    [document.notes, selectedObjectId],
  );

  const clearSelection = useCallback(() => setSelectedObjectId(undefined), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openSettingsFromToolbar = useCallback(() => {
    setSelectedObjectId(undefined);
    setSettingsOpen(true);
  }, []);
  const selectObject = useCallback(
    (id: string) => {
      setSettingsOpen(false);
      setSourceHighlightedMemberId(undefined);
      setSelectedObjectId(id);
      const item = [...document.entities, ...document.packages, ...document.relationships, ...document.notes].find(
        (candidate) => candidate.id === id,
      );
      if (item) revealSource(item.sourceRange);
    },
    [document, revealSource],
  );
  const selectMember = useCallback(
    (entityId: string, memberId: string) => {
      setSettingsOpen(false);
      setSelectedObjectId(entityId);
      setSourceHighlightedMemberId(memberId);
      const member = document.entities
        .find((item) => item.id === entityId)
        ?.members.find((item) => item.id === memberId);
      if (member) revealSource(member.sourceRange);
    },
    [document.entities, revealSource],
  );
  const selectFromSource = useCallback(
    (highlightedEntityId: string | undefined, highlightedMemberId: string | undefined, fallbackObjectId?: string) => {
      setSourceHighlightedMemberId(highlightedMemberId);
      setSourceHighlightedEntityId(highlightedEntityId);
      setSettingsOpen(false);
      if (!highlightedEntityId && !highlightedMemberId) setSelectedObjectId(fallbackObjectId);
    },
    [],
  );
  const dismissInspector = useCallback(() => {
    setSelectedObjectId(undefined);
    setSettingsOpen(false);
  }, []);

  useEffect(() => {
    if (diagramKind === "class") return;
    dismissInspector();
  }, [diagramKind, dismissInspector]);

  return {
    selectedObjectId,
    sourceHighlightedEntityId,
    sourceHighlightedMemberId,
    settingsOpen,
    selectedEntity,
    selectedRelationship,
    selectedPackage,
    selectedNote,
    setSelectedObjectId,
    setSourceHighlightedEntityId,
    clearSelection,
    closeSettings,
    openSettingsFromToolbar,
    selectObject,
    selectMember,
    selectFromSource,
    dismissInspector,
  };
}
