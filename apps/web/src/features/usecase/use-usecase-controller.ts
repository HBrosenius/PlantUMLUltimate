import { useCallback, useEffect, useMemo, useState } from "react";
import type { UseCaseDocument } from "@plantuml-studio/diagram-usecase";
import type { DiagramKind } from "../../model";

export function useUseCaseController(diagramKind: DiagramKind, document: UseCaseDocument) {
  const [selectedObjectId, setSelectedObjectId] = useState<string>();
  const [sourceHighlightedId, setSourceHighlightedId] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const selectedElement = useMemo(
    () => document.elements.find((item) => item.id === selectedObjectId),
    [document.elements, selectedObjectId],
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
  const selectObject = useCallback((id: string | undefined) => {
    setSettingsOpen(false);
    setSelectedObjectId(id);
  }, []);
  const selectFromSource = useCallback((highlightedId: string | undefined, fallbackObjectId?: string) => {
    setSourceHighlightedId(highlightedId);
    setSettingsOpen(false);
    if (!highlightedId) setSelectedObjectId(fallbackObjectId);
  }, []);
  const dismissInspector = useCallback(() => {
    setSelectedObjectId(undefined);
    setSettingsOpen(false);
  }, []);

  useEffect(() => {
    if (diagramKind === "usecase") return;
    dismissInspector();
  }, [diagramKind, dismissInspector]);

  return {
    selectedObjectId,
    sourceHighlightedId,
    settingsOpen,
    selectedElement,
    selectedRelationship,
    selectedPackage,
    selectedNote,
    setSourceHighlightedId,
    clearSelection,
    closeSettings,
    openSettingsFromToolbar,
    selectObject,
    selectFromSource,
    dismissInspector,
  };
}
