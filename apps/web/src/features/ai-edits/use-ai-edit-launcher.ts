import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { DiagramKind } from "../../model";
import { onAiEditDialogRequest, currentEditorSelection, type AiEditRange } from "./ai-edit-bridge";
import { getAiAssistantState, isAiAssistantReady, loadRememberedAiKey, subscribeAiAssistant } from "./ai-settings";

/** Diagram kinds the assistant can change. */
export const AI_EDIT_KINDS: readonly DiagramKind[] = ["sequence", "gantt", "c4"];

export function aiEditSupports(kind: DiagramKind): boolean {
  return AI_EDIT_KINDS.includes(kind);
}

/** True when the user has turned the assistant on. Menus that are otherwise unchanged use this to stay quiet. */
export function useAiAssistantEnabled(): boolean {
  return useSyncExternalStore(subscribeAiAssistant, () => getAiAssistantState().enabled);
}

/**
 * Picks what "the selection" means when no range is passed explicitly. Selecting an object in the
 * diagram also highlights part of it in the source, so an editor selection that lies inside the selected
 * object is that highlight, not a choice: use the whole object then. An editor selection elsewhere wins.
 */
export function chooseSelection(
  editor: AiEditRange | undefined,
  diagramObject: AiEditRange | undefined,
): AiEditRange | undefined {
  const object = diagramObject ? { from: diagramObject.from, to: diagramObject.to } : undefined;
  if (!editor) return object;
  if (object && editor.from >= object.from && editor.to <= object.to) return object;
  return editor;
}

export interface AiEditLauncherInput {
  kind: DiagramKind;
  source: string;
  readOnly: boolean;
  /** Source range of the diagram object selected in the preview (a message, participant or task). */
  selectedObjectRange: AiEditRange | undefined;
  /** Opens Settings on the AI assistant page. */
  openAiSettings(): void;
  notify(message: string): void;
}

/**
 * Owns the "Ask AI to change the selection…" flow for the app: where the selection comes from, the
 * feature-off redirect to Settings, and whether the dialog is open. The dialog itself is rendered by the
 * document dialogs.
 */
export function useAiEditLauncher(input: AiEditLauncherInput) {
  const [open, setOpen] = useState<{ selection: AiEditRange | undefined } | undefined>();
  const latest = useRef(input);
  latest.current = input;

  const askAi = useCallback(async (explicit?: AiEditRange) => {
    const current = latest.current;
    if (current.readOnly) return current.notify("This document is read-only, so the AI assistant cannot change it.");
    if (!aiEditSupports(current.kind))
      return current.notify("The AI assistant can change Sequence, Gantt and C4 diagrams for now.");
    await loadRememberedAiKey();
    if (!isAiAssistantReady()) {
      current.notify("Turn on the AI assistant and add a key in Settings first.");
      current.openAiSettings();
      return;
    }
    setOpen({
      selection:
        explicit ?? chooseSelection(currentEditorSelection(current.source.length), current.selectedObjectRange),
    });
  }, []);

  useEffect(() => onAiEditDialogRequest((range) => void askAi(range)), [askAi]);

  return {
    aiEdit: open,
    askAi: () => void askAi(),
    askAiAt: (range: AiEditRange | undefined) => void askAi(range),
    closeAiEdit: () => setOpen(undefined),
  };
}
