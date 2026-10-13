import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { ActivityDocument } from "@plantuml-studio/diagram-activity";
import type { DiagramKind } from "../../model";

function remapNode(previous: ActivityDocument, next: ActivityDocument, id: string | undefined) {
  if (!id || previous === next) return id;
  const node = previous.nodes.find((item) => item.id === id);
  if (!node) return id;
  const matches = next.nodes.filter((item) => item.kind === node.kind && item.label === node.label);
  const uniqueBefore =
    previous.nodes.filter((item) => item.kind === node.kind && item.label === node.label).length === 1;
  if (matches.length === 1 && uniqueBefore) return matches[0]!.id;
  // A single label edit keeps its position; deletion or ambiguous reordering must not select a neighbour.
  if (
    previous.nodes.length === next.nodes.length &&
    previous.nodes.every(
      (item) =>
        item.id === id ||
        next.nodes.some(
          (candidate) => candidate.id === item.id && candidate.kind === item.kind && candidate.label === item.label,
        ),
    )
  ) {
    const renamed = next.nodes.find((item) => item.id === id && item.kind === node.kind);
    if (renamed && matches.length === 0) return renamed.id;
  }
  return undefined;
}

export function useActivityController(diagramKind: DiagramKind, document: ActivityDocument, documentId = "default") {
  const [selection, setSelection] = useState<{
    document: ActivityDocument;
    documentId: string;
    id: string | undefined;
  }>({
    document,
    documentId,
    id: undefined,
  });
  const selectedObjectId =
    selection.documentId === documentId ? remapNode(selection.document, document, selection.id) : undefined;
  useLayoutEffect(() => {
    setSelection((previous) =>
      previous.document === document && previous.documentId === documentId
        ? previous
        : {
            document,
            documentId,
            id: previous.documentId === documentId ? remapNode(previous.document, document, previous.id) : undefined,
          },
    );
  }, [document, documentId]);
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

  const clearSelection = useCallback(() => setSelection((previous) => ({ ...previous, id: undefined })), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openSettingsFromToolbar = useCallback(() => {
    setSelection((previous) => ({ ...previous, id: undefined }));
    setSettingsOpen(true);
  }, []);
  const selectObject = useCallback(
    (id: string | undefined) => {
      setSettingsOpen(false);
      setSourceHighlightedId(undefined);
      setSelection({ document, documentId, id });
    },
    [document, documentId],
  );
  const selectFromSource = useCallback(
    (highlightedId: string | undefined, fallbackObjectId?: string) => {
      setSourceHighlightedId(highlightedId);
      setSettingsOpen(false);
      if (!highlightedId) setSelection({ document, documentId, id: fallbackObjectId });
    },
    [document, documentId],
  );
  const dismissInspector = useCallback(() => {
    setSelection((previous) => ({ ...previous, id: undefined }));
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
