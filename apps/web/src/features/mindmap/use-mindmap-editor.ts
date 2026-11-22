import { useCallback, useMemo } from "react";
import { parseMindmap, type MindmapDocument, type MindmapNode } from "@plantuml-studio/diagram-mindmap";
import type { DiagramKind } from "../../model";
import type { AppDialog } from "../../use-app-dialog";
import { isMirroredDirection } from "./mindmap-render-order";
import { mindmapDeleteBlocker, mindmapSettingsOf, useMindmapActions } from "./use-mindmap-actions";
import { useMindmapController } from "./use-mindmap-controller";

const EMPTY_MINDMAP_DOCUMENT: MindmapDocument = parseMindmap("");

/**
 * The parsed document and the selection state. `App` needs these early (an open inspector closes the
 * utility panels), before the commit function that the edit actions need exists.
 */
export function useMindmapSelection(diagramKind: DiagramKind, source: string) {
  const document = useMemo(
    () => (diagramKind === "mindmap" ? parseMindmap(source) : EMPTY_MINDMAP_DOCUMENT),
    [diagramKind, source],
  );
  return { document, ...useMindmapController(diagramKind, document) };
}

export type MindmapSelection = ReturnType<typeof useMindmapSelection>;

interface UseMindmapEditorOptions {
  source: string;
  commitSource(source: string, description: string): boolean;
  setInteractionMessage(message: string): void;
  openDialog(dialog: AppDialog): void;
  closeDialog(kind: AppDialog["kind"]): void;
}

const confirmDelete = (message: string) => window.confirm(message);

/**
 * Everything the app needs to edit a mindmap visually: the selection, and the edit actions. `App` calls
 * this once and hands the result to the places that mount mindmap UI, so the mindmap logic stays in
 * `features/mindmap/`.
 */
export function useMindmapEditor(
  selection: MindmapSelection,
  { source, commitSource, setInteractionMessage, openDialog, closeDialog }: UseMindmapEditorOptions,
) {
  const { document, selectNode, clearSelectedNode, selectedNode } = selection;
  // New nodes go next to the selection, or under the only root when nothing is selected.
  const addTarget = selectedNode ?? (document.roots.length === 1 ? document.roots[0] : undefined);
  const closeAddNode = useCallback(() => closeDialog("add-mindmap-node"), [closeDialog]);
  const actions = useMindmapActions({
    source,
    document,
    selectedNode,
    addTarget,
    commitSource,
    confirmDelete,
    closeAddNode,
    selectNode,
    clearSelectedNode,
    reportMessage: setInteractionMessage,
  });
  const openAddNode = useCallback(
    (position?: "child" | "sibling", nodeId?: string) => {
      if (nodeId) selectNode(nodeId);
      openDialog({ kind: "add-mindmap-node", ...(position ? { position } : {}) });
    },
    [openDialog, selectNode],
  );
  const settings = useMemo(() => mindmapSettingsOf(document), [document]);
  const deleteBlockerFor = useCallback((node: MindmapNode) => mindmapDeleteBlocker(document, node), [document]);
  return {
    ...selection,
    ...actions,
    addTarget,
    /** False in right-to-left documents, where a branch has no side and the side control is hidden. */
    sidesApply: !isMirroredDirection(document),
    settings,
    openAddNode,
    deleteBlockerFor,
  };
}

export type MindmapEditor = ReturnType<typeof useMindmapEditor>;
