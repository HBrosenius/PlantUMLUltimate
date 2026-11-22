import { useCallback, useEffect, useRef, useState } from "react";
import type { SequenceDocument } from "@plantuml-studio/diagram-sequence";
import type { DiagramKind } from "../../model";
import { onAiEditDialogRequest, currentEditorSelection, type AiEditRange } from "./ai-edit-bridge";
import { isAiAssistantReady, loadRememberedAiKey } from "./ai-settings";

/** Kinds the assistant supports. Gantt is added by its own slice. */
export const AI_EDIT_KINDS: readonly DiagramKind[] = ["sequence"];

export function aiEditSupports(kind: DiagramKind): boolean {
  return AI_EDIT_KINDS.includes(kind);
}

export interface AiEditLauncherInput {
  kind: DiagramKind;
  source: string;
  readOnly: boolean;
  sequenceDocument: SequenceDocument;
  selectedMessageId: string | undefined;
  selectedParticipantId: string | undefined;
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
    if (!aiEditSupports(current.kind)) return current.notify("The AI assistant can change Sequence diagrams for now.");
    await loadRememberedAiKey();
    if (!isAiAssistantReady()) {
      current.notify("Turn on the AI assistant and add a key in Settings first.");
      current.openAiSettings();
      return;
    }
    const message = current.sequenceDocument.messages.find((item) => item.id === current.selectedMessageId);
    const participant = current.sequenceDocument.participants.find((item) => item.id === current.selectedParticipantId);
    const fromDiagram = (message ?? participant)?.sourceRange;
    setOpen({
      selection:
        explicit ??
        currentEditorSelection(current.source.length) ??
        (fromDiagram ? { from: fromDiagram.from, to: fromDiagram.to } : undefined),
    });
  }, []);

  useEffect(() => onAiEditDialogRequest((range) => void askAi(range)), [askAi]);

  return { aiEdit: open, askAi: () => void askAi(), closeAiEdit: () => setOpen(undefined) };
}
