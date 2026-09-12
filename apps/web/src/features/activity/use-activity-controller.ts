import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActivityDocument } from "@plantuml-studio/diagram-activity";
import type { DiagramKind } from "../../model";

export function useActivityController(diagramKind: DiagramKind, document: ActivityDocument) {
  const [selectedObjectId, setSelectedObjectId] = useState<string>();
  const [sourceHighlightedId, setSourceHighlightedId] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const selectedAction = useMemo(
    () => document.nodes.find((item) => item.id === selectedObjectId && item.kind === "action"),
    [document.nodes, selectedObjectId],
  );
  const selectedTerminal = useMemo(
    () => document.nodes.find((item) => item.id === selectedObjectId && item.kind !== "action"),
    [document.nodes, selectedObjectId],
  );
  const selectedPartition = useMemo(
    () => document.partitions.find((item) => item.id === selectedObjectId),
    [document.partitions, selectedObjectId],
  );
  const selectedNote = useMemo(
    () => document.notes.find((item) => item.id === selectedObjectId),
    [document.notes, selectedObjectId],
  );
  const selectedControl = useMemo(
    () => document.controls.find((item) => item.id === selectedObjectId),
    [document.controls, selectedObjectId],
  );
  const selectedArrow = useMemo(
    () => document.arrows.find((item) => item.id === selectedObjectId),
    [document.arrows, selectedObjectId],
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
    if (diagramKind === "activity") return;
    dismissInspector();
  }, [diagramKind, dismissInspector]);

  return {
    selectedObjectId,
    sourceHighlightedId,
    settingsOpen,
    selectedAction,
    selectedTerminal,
    selectedPartition,
    selectedNote,
    selectedControl,
    selectedArrow,
    setSourceHighlightedId,
    clearSelection,
    closeSettings,
    openSettingsFromToolbar,
    selectObject,
    selectFromSource,
    dismissInspector,
  };
}
