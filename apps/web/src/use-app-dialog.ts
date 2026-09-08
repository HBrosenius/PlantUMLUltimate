import { useCallback, useReducer } from "react";
import type { SequenceStructureKind } from "./AddSequenceStructureDialog";
import type { UseCaseElementKind } from "@plantuml-studio/diagram-usecase";

export type AppDialog =
  | { kind: "command-palette" }
  | { kind: "new-document"; replaceActiveDocument: boolean }
  | { kind: "help" }
  | { kind: "add-task" }
  | { kind: "add-divider" }
  | { kind: "add-milestone" }
  | { kind: "add-wbs-node" }
  | { kind: "add-activity-action" }
  | { kind: "add-activity-partition" }
  | { kind: "add-activity-note" }
  | { kind: "add-activity-structure" }
  | { kind: "add-activity-terminal" }
  | { kind: "add-activity-arrow" }
  | { kind: "add-class-entity" }
  | { kind: "add-class-relationship" }
  | { kind: "add-class-package" }
  | { kind: "add-class-note" }
  | { kind: "add-usecase-element"; elementKind: UseCaseElementKind }
  | { kind: "add-usecase-relationship" }
  | { kind: "add-usecase-package" }
  | { kind: "add-usecase-note" }
  | { kind: "add-sequence-participant" }
  | { kind: "add-sequence-message" }
  | { kind: "add-sequence-structure"; structureKind: SequenceStructureKind };

type AppDialogAction =
  | { type: "open"; dialog: AppDialog }
  | { type: "close"; kind?: AppDialog["kind"] }
  | { type: "toggle-command-palette" };

export function appDialogReducer(state: AppDialog | undefined, action: AppDialogAction): AppDialog | undefined {
  if (action.type === "open") return action.dialog;
  if (action.type === "toggle-command-palette")
    return state?.kind === "command-palette" ? undefined : { kind: "command-palette" };
  return !action.kind || state?.kind === action.kind ? undefined : state;
}

export function useAppDialog() {
  const [dialog, dispatch] = useReducer(appDialogReducer, undefined);
  const openDialog = useCallback((next: AppDialog) => dispatch({ type: "open", dialog: next }), []);
  const closeDialog = useCallback(
    (kind?: AppDialog["kind"]) => dispatch(kind ? { type: "close", kind } : { type: "close" }),
    [],
  );
  const toggleCommandPalette = useCallback(() => dispatch({ type: "toggle-command-palette" }), []);
  return { dialog, openDialog, closeDialog, toggleCommandPalette };
}
