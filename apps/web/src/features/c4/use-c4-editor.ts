import { useCallback, useMemo, useRef, useState } from "react";
import type { TextRange } from "@plantuml-studio/language-core";
import { parseC4, type C4Document } from "../../c4-source";
import type { DiagramKind } from "../../model";
import type { AppDialog } from "../../use-app-dialog";
import { c4SelectionFromKey, type C4Selection } from "./c4-forms";
import { useC4Actions } from "./use-c4-actions";
import { useC4Controller } from "./use-c4-controller";

const EMPTY_C4_DOCUMENT: C4Document = parseC4("");

/**
 * The parsed document and the selection state. `App` needs these early (an open inspector closes the utility
 * panels), before the commit function that the edit actions need exists.
 */
export function useC4Selection(diagramKind: DiagramKind, source: string) {
  const document = useMemo(() => (diagramKind === "c4" ? parseC4(source) : EMPTY_C4_DOCUMENT), [diagramKind, source]);
  return { document, ...useC4Controller(diagramKind, document) };
}

export type C4SelectionState = ReturnType<typeof useC4Selection>;

interface UseC4EditorOptions {
  source: string;
  commitSource(source: string, description: string): boolean;
  setInteractionMessage(message: string): void;
  openDialog(dialog: AppDialog): void;
  closeDialog(kind: AppDialog["kind"]): void;
}

const confirmDelete = (message: string) => window.confirm(message);

interface InlineRename {
  alias: string;
  value: string;
  source: string;
  anchor: { left: number; bottom: number };
}

/**
 * Everything the app needs to edit a C4 diagram visually: the selection, the edit actions and the inline label
 * editor. `App` calls this once and hands the result to the places that mount C4 UI, so the C4 logic stays in
 * `features/c4/`.
 */
export function useC4Editor(
  selection: C4SelectionState,
  { source, commitSource, setInteractionMessage, openDialog, closeDialog }: UseC4EditorOptions,
) {
  const { document, select } = selection;
  const actions = useC4Actions({
    source,
    document,
    selection: selection.selection,
    commitSource,
    confirmDelete,
    closeDialog,
    select,
    reportMessage: setInteractionMessage,
  });
  const { rangeOf, labelProblem, updateArgument } = actions;

  /** A shape was chosen on the canvas or in the outline: select it, and say which source line to show. */
  const selectFromCanvas = useCallback(
    (next: C4Selection): TextRange | undefined => {
      select(next);
      return rangeOf(next);
    },
    [rangeOf, select],
  );
  const selectFromOutline = useCallback((key: string) => select(c4SelectionFromKey(key)), [select]);

  const [inlineRename, setInlineRename] = useState<InlineRename>();
  const returnFocus = useRef<string | undefined>(undefined);
  /** Opens the label editor over a shape. Only elements and boundaries the source declares can be renamed. */
  const startInlineRename = useCallback(
    (key: string, anchor: Element): boolean => {
      const element = document.elements.find((item) => item.id === key);
      if (!element || element.scope || document.elements.filter((item) => item.id === key).length !== 1) {
        setInteractionMessage(
          "This label comes from a procedure, an included file or an expression, so it can't be edited here. Change the source instead.",
        );
        return false;
      }
      returnFocus.current = key;
      const bounds = anchor.getBoundingClientRect();
      setInlineRename({
        alias: key,
        value: element.label,
        source,
        anchor: { left: bounds.left, bottom: bounds.bottom },
      });
      return true;
    },
    [document.elements, setInteractionMessage, source],
  );
  const closeInlineRename = useCallback(() => {
    const key = returnFocus.current;
    setInlineRename(undefined);
    // The overlay is drawn again after an edit, so the shape is looked up when the frame comes.
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        if (!key) return;
        window.document
          .querySelector<SVGElement>(`[data-c4-object-id="${CSS.escape(key)}"][tabindex]`)
          ?.focus({ preventScroll: true });
      }),
    );
  }, []);
  const applyInlineRename = useCallback(
    (value: string): boolean => {
      if (!inlineRename) return false;
      return !updateArgument({ kind: "element", alias: inlineRename.alias }, "label", value.trim());
    },
    [inlineRename, updateArgument],
  );
  const validateInlineRename = useCallback(
    (value: string) => (inlineRename ? labelProblem(inlineRename.alias, value) : undefined),
    [inlineRename, labelProblem],
  );

  const openAddElement = useCallback(
    (elementKind: "person" | "system" | "container" | "component") =>
      openDialog({ kind: "add-c4-element", elementKind }),
    [openDialog],
  );
  const openAddBoundary = useCallback(
    (
      boundaryKind?: "System_Boundary" | "Container_Boundary" | "Enterprise_Boundary" | "Boundary" | "Deployment_Node",
    ) => openDialog({ kind: "add-c4-boundary", ...(boundaryKind ? { boundaryKind } : {}) }),
    [openDialog],
  );
  const openAddRelationship = useCallback(() => openDialog({ kind: "add-c4-relationship" }), [openDialog]);

  return {
    ...selection,
    ...actions,
    source,
    selectFromCanvas,
    selectFromOutline,
    inlineRename,
    startInlineRename,
    closeInlineRename,
    applyInlineRename,
    validateInlineRename,
    openAddElement,
    openAddBoundary,
    openAddRelationship,
  };
}

export type C4Editor = ReturnType<typeof useC4Editor>;
