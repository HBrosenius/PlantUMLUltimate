import { useCallback, useEffect, useMemo, useState } from "react";
import type { WbsDocument } from "@plantuml-studio/diagram-wbs";
import type { DiagramKind } from "../../model";

export function useWbsController(diagramKind: DiagramKind, document: WbsDocument) {
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string>();
  const [sourceHighlightedNodeId, setSourceHighlightedNodeId] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const selectedNode = useMemo(
    () => document.nodes.find((item) => item.id === selectedNodeId),
    [document.nodes, selectedNodeId],
  );
  const selectedRelationship = useMemo(
    () => document.relationships.find((item) => item.id === selectedRelationshipId),
    [document.relationships, selectedRelationshipId],
  );

  const clearSelectedNode = useCallback(() => setSelectedNodeId(undefined), []);
  const clearSelectedRelationship = useCallback(() => setSelectedRelationshipId(undefined), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const openSettingsFromToolbar = useCallback(() => {
    setSelectedNodeId(undefined);
    setSettingsOpen(true);
  }, []);
  const selectNode = useCallback((id: string | undefined) => {
    setSettingsOpen(false);
    setSelectedNodeId(id);
    if (id) setSelectedRelationshipId(undefined);
  }, []);
  const selectRelationship = useCallback((id: string | undefined) => {
    setSettingsOpen(false);
    setSelectedRelationshipId(id);
    if (id) setSelectedNodeId(undefined);
  }, []);
  const selectFromSource = useCallback((highlightedId: string | undefined, fallbackNodeId?: string) => {
    setSourceHighlightedNodeId(highlightedId);
    setSettingsOpen(false);
    if (!highlightedId) setSelectedNodeId(fallbackNodeId);
  }, []);

  useEffect(() => {
    if (diagramKind === "wbs") return;
    setSelectedNodeId(undefined);
    setSelectedRelationshipId(undefined);
    setSettingsOpen(false);
  }, [diagramKind]);

  return {
    selectedNodeId,
    selectedRelationshipId,
    sourceHighlightedNodeId,
    settingsOpen,
    selectedNode,
    selectedRelationship,
    setSourceHighlightedNodeId,
    clearSelectedNode,
    clearSelectedRelationship,
    closeSettings,
    openSettings,
    openSettingsFromToolbar,
    selectNode,
    selectRelationship,
    selectFromSource,
  };
}
