import { useCallback, useEffect, useMemo, useState } from "react";
import type { C4Document } from "../../c4-source";
import type { DiagramKind } from "../../model";
import { c4SelectionAtPosition, c4SelectionKey, type C4Selection } from "./c4-forms";

/** Selection state for a C4 diagram: the selected shape, the settings panel, and the shape the editor's cursor is on. */
export function useC4Controller(diagramKind: DiagramKind, document: C4Document) {
  const [requested, setRequested] = useState<C4Selection>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sourceHighlightedKey, setSourceHighlightedKey] = useState<string>();

  // Undo, a source edit or a rename can remove what was selected; the panel then closes by itself.
  const selection = useMemo((): C4Selection | undefined => {
    if (!requested) return undefined;
    if (requested.kind === "element")
      return document.elements.some((item) => item.id === requested.alias) ? requested : undefined;
    if (requested.kind === "relationship") return document.relationships[requested.index] ? requested : undefined;
    return requested;
  }, [document, requested]);
  const selectedElement = useMemo(
    () => (selection?.kind === "element" ? document.elements.find((item) => item.id === selection.alias) : undefined),
    [document.elements, selection],
  );
  const selectedRelationship = useMemo(
    () => (selection?.kind === "relationship" ? document.relationships[selection.index] : undefined),
    [document.relationships, selection],
  );
  const selectedUnmanaged = selection?.kind === "unmanaged" ? selection : undefined;
  const selectedKey = c4SelectionKey(selection);

  const select = useCallback((next: C4Selection | undefined) => {
    setSettingsOpen(false);
    setRequested(next);
  }, []);
  const clearSelection = useCallback(() => setRequested(undefined), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openSettings = useCallback(() => {
    setRequested(undefined);
    setSettingsOpen(true);
  }, []);
  const dismissInspector = useCallback(() => {
    setRequested(undefined);
    setSettingsOpen(false);
  }, []);
  const selectFromSource = useCallback(
    (position: number | undefined) => {
      setSourceHighlightedKey(
        position === undefined ? undefined : c4SelectionKey(c4SelectionAtPosition(document, position)),
      );
    },
    [document],
  );

  useEffect(() => {
    if (diagramKind === "c4") return;
    dismissInspector();
    setSourceHighlightedKey(undefined);
  }, [diagramKind, dismissInspector]);

  return {
    selection,
    selectedKey,
    sourceHighlightedKey,
    settingsOpen,
    selectedElement,
    selectedRelationship,
    selectedUnmanaged,
    select,
    clearSelection,
    openSettings,
    closeSettings,
    dismissInspector,
    selectFromSource,
  };
}
