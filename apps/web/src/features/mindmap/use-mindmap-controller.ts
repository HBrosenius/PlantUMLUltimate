import { useCallback, useEffect, useMemo, useState } from "react";
import type { MindmapDocument } from "@plantuml-studio/diagram-mindmap";
import type { DiagramKind } from "../../model";

/** Selection, source highlight and settings-open state of the mindmap editor. */
export function useMindmapController(diagramKind: DiagramKind, document: MindmapDocument) {
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const selectedNode = useMemo(
    () => document.nodes.find((item) => item.id === selectedNodeId),
    [document.nodes, selectedNodeId],
  );

  const clearSelectedNode = useCallback(() => setSelectedNodeId(undefined), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  /** Closes the node and settings inspectors. */
  const dismissInspectors = useCallback(() => {
    setSelectedNodeId(undefined);
    setSettingsOpen(false);
  }, []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const openSettingsFromToolbar = useCallback(() => {
    setSelectedNodeId(undefined);
    setSettingsOpen(true);
  }, []);
  const selectNode = useCallback((id: string | undefined) => {
    setSettingsOpen(false);
    setSelectedNodeId(id);
  }, []);
  /** The source cursor moved into a node (or out of every node): select it. */
  const selectFromSource = useCallback((nodeId: string | undefined) => {
    setSettingsOpen(false);
    setSelectedNodeId(nodeId);
  }, []);

  useEffect(() => {
    if (diagramKind === "mindmap") return;
    setSelectedNodeId(undefined);
    setSettingsOpen(false);
  }, [diagramKind]);

  return {
    selectedNodeId,
    settingsOpen,
    selectedNode,
    clearSelectedNode,
    closeSettings,
    dismissInspectors,
    openSettings,
    openSettingsFromToolbar,
    selectNode,
    selectFromSource,
  };
}
