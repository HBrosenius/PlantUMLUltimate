import { useEffect, type Dispatch, type SetStateAction, type RefObject } from "react";
import { outlineTargetSelector, type DiagramOutlineEntry } from "../diagram-outline";
import type { DocumentSnapshot, WorkspaceSession, WorkspaceSnapshot } from "../workspace-storage";

export interface useOutlineModeEffectsInputs {
  outlineMatches: readonly DiagramOutlineEntry[];
  outlineMode: "dock" | "find" | undefined;
  outlineReveal: { entry: DiagramOutlineEntry } | undefined;
  setOutlineMode: Dispatch<SetStateAction<"dock" | "find" | undefined>>;
  setOutlineReveal: Dispatch<SetStateAction<{ entry: DiagramOutlineEntry } | undefined>>;
  tabs: {
    documents: DocumentSnapshot[];
    activeId: string;
    addDocument: (input?: Partial<Omit<DocumentSnapshot, "id">>) => string;
    closeDocument: (id: string) => void;
    activateDocument: (id: string) => void;
    duplicateDocument: (id: string) => string;
    closeOtherDocuments: (id: string) => void;
    reorderDocument: (draggedId: string, targetId: string) => void;
    restoreSession: (next: WorkspaceSession) => void;
    setDocumentHistoryId: (id: string, historyId: string) => void;
    setDocumentBaselineVersionId: (id: string, baselineVersionId?: string) => void;
    replaceDocumentFromFile: (
      id: string,
      input: Pick<DocumentSnapshot, "source" | "fileName" | "diagramKind">,
      dirty?: boolean,
    ) => void;
    updateDocumentSource: (id: string, source: string, diagramKind: DocumentSnapshot["diagramKind"]) => void;
    updateDocumentFormat: (id: string, patch: Partial<DocumentSnapshot>, flushRecovery?: boolean) => void;
    getDocument: (id: string) => DocumentSnapshot | undefined;
    setOnboarded: () => void;
    session: WorkspaceSession;
  };
  workspace: WorkspaceSnapshot;
  workspaceElement: RefObject<HTMLElement | null>;
}

export function useOutlineModeEffects({
  outlineMatches,
  outlineMode,
  outlineReveal,
  setOutlineMode,
  setOutlineReveal,
  tabs,
  workspace,
  workspaceElement,
}: useOutlineModeEffectsInputs) {
  useEffect(() => {
    setOutlineMode(undefined);
    setOutlineReveal(undefined);
  }, [setOutlineMode, setOutlineReveal, tabs.activeId]);
  useEffect(() => {
    const root = workspaceElement.current;
    if (!root || !outlineMode) return;
    const selectors = new Set(outlineMatches.map(outlineTargetSelector).filter(Boolean));
    const attributes = [
      "data-task-id",
      "data-dependency-index",
      "data-divider-index",
      "data-vertical-separator-index",
      "data-sequence-participant-id",
      "data-sequence-message-id",
      "data-sequence-structure-id",
      "data-usecase-object-id",
      "data-class-object-id",
      "data-activity-object-id",
      "data-wbs-node-id",
      "data-wbs-relationship-id",
    ];
    const mark = () => {
      root.querySelectorAll("[data-outline-match]").forEach((element) => element.removeAttribute("data-outline-match"));
      if (!selectors.size) return;
      for (const element of root.querySelectorAll(".diagram [" + attributes.join("], .diagram [") + "]")) {
        if (
          attributes.some((attribute) => {
            const value = element.getAttribute(attribute);
            return value !== null && selectors.has(`[${attribute}="${CSS.escape(value)}"]`);
          })
        )
          element.setAttribute("data-outline-match", "true");
      }
    };
    mark();
    const observer = new MutationObserver(mark);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      root.querySelectorAll("[data-outline-match]").forEach((element) => element.removeAttribute("data-outline-match"));
    };
  }, [workspaceElement, outlineMode, outlineMatches, workspace.source]);
  useEffect(() => {
    if (!outlineReveal) return;
    const selector = outlineTargetSelector(outlineReveal.entry);
    if (!selector) return;
    const root = workspaceElement.current;
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const target = root?.querySelector<SVGElement>(`.diagram ${selector}`);
        target?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [workspaceElement, outlineReveal]);
}
