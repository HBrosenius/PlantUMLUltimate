import { useEffect, type Dispatch, type SetStateAction, type RefObject } from "react";
import type { AppDialog } from "../use-app-dialog";
import type { DocumentSnapshot, WorkspaceSession, WorkspaceSnapshot } from "../workspace-storage";
import type { ViewMode } from "../model";

export interface useGlobalShortcutsInputs {
  clearSelectedWbsNode: () => void;
  clearSelectedWbsRelationship: () => void;
  closeTab: (id: string) => void;
  closeWbsSettings: () => void;
  dismissAllInspectors: () => void;
  narrow: boolean;
  newDocument: () => void;
  openDialog: (next: AppDialog) => void;
  openDocument: () => Promise<void>;
  redo: (steps?: unknown) => void;
  saveActiveProject: () => Promise<void>;
  saveCurrentDocument: () => Promise<void>;
  saveDocument: () => Promise<void>;
  setStageLensExpanded: Dispatch<SetStateAction<boolean>>;
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
  taskClipboard: RefObject<string | undefined>;
  taskShortcuts: RefObject<{
    selectedTaskIds: string[];
    copySelectedTasks: () => void;
    pasteCopiedTasks: () => void;
    duplicateSelectedTasks: () => void;
  }>;
  toggleCommandPalette: () => void;
  undo: (steps?: unknown) => void;
  update: <K extends keyof WorkspaceSnapshot>(key: K, value: WorkspaceSnapshot[K]) => void;
  usingSingleFileProject: boolean;
  viewModeRef: RefObject<ViewMode>;
  workspace: WorkspaceSnapshot;
}

export function useGlobalShortcuts({
  clearSelectedWbsNode,
  clearSelectedWbsRelationship,
  closeTab,
  closeWbsSettings,
  dismissAllInspectors,
  narrow,
  newDocument,
  openDialog,
  openDocument,
  redo,
  saveActiveProject,
  saveCurrentDocument,
  saveDocument,
  setStageLensExpanded,
  tabs,
  taskClipboard,
  taskShortcuts,
  toggleCommandPalette,
  undo,
  update,
  usingSingleFileProject,
  viewModeRef,
  workspace,
}: useGlobalShortcutsInputs) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (document.querySelector(".presentation-shell")) return;
      const target = event.target as HTMLElement | null;
      const editing =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      const editingOutsideCodeEditor =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (target?.isContentEditable && !target.closest(".cm-editor"));
      const modalOpen = Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
      if (event.key === "Escape") {
        if (event.defaultPrevented || modalOpen || document.querySelector(".icon-field-panel, .color-field-panel"))
          return;
        dismissAllInspectors();
        clearSelectedWbsNode();
        clearSelectedWbsRelationship();
        closeWbsSettings();
        return;
      }
      if (event.key === "?" && !event.metaKey && !event.ctrlKey && !event.altKey && !editing) {
        event.preventDefault();
        openDialog({ kind: "help" });
        return;
      }
      if (
        event.altKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !editingOutsideCodeEditor &&
        !modalOpen &&
        !event.repeat
      ) {
        const creation =
          event.code === "KeyT"
            ? "t"
            : event.code === "KeyM"
              ? "m"
              : event.code === "KeyD"
                ? "d"
                : event.code === "KeyP"
                  ? "p"
                  : event.code === "KeyN"
                    ? "n"
                    : "";
        if (workspace.diagramKind === "wbs" && creation === "n") {
          event.preventDefault();
          openDialog({ kind: "add-wbs-node" });
          return;
        }
        if (workspace.diagramKind === "sequence" && (creation === "p" || creation === "m")) {
          event.preventDefault();
          if (creation === "p") openDialog({ kind: "add-sequence-participant" });
          else openDialog({ kind: "add-sequence-message" });
          return;
        }
        if (workspace.diagramKind === "gantt" && (creation === "t" || creation === "m" || creation === "d")) {
          event.preventDefault();
          if (creation === "t") openDialog({ kind: "add-task" });
          else if (creation === "m") openDialog({ kind: "add-milestone" });
          else openDialog({ kind: "add-divider" });
          return;
        }
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (event.shiftKey && key === "p") {
        event.preventDefault();
        toggleCommandPalette();
        return;
      }
      if (modalOpen) {
        // Document commands must not act on the document behind a dialog. Still block the browser's
        // own save, open, new-window and close-tab shortcuts.
        if (["s", "o", "n", "w"].includes(key)) event.preventDefault();
        return;
      }
      // Text fields keep their native undo and redo.
      if (key === "z" && editingOutsideCodeEditor) return;
      // Copy, paste and duplicate Gantt tasks when focus is on the diagram rather than in text.
      if (!editing && workspace.diagramKind === "gantt" && !event.shiftKey && !event.altKey) {
        const shortcuts = taskShortcuts.current;
        if (key === "c" && shortcuts.selectedTaskIds.length) {
          event.preventDefault();
          shortcuts.copySelectedTasks();
          return;
        }
        if (key === "v" && taskClipboard.current) {
          event.preventDefault();
          shortcuts.pasteCopiedTasks();
          return;
        }
        if (key === "d" && shortcuts.selectedTaskIds.length) {
          event.preventDefault();
          shortcuts.duplicateSelectedTasks();
          return;
        }
      }
      if (event.shiftKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        openDialog({ kind: "diagram-outline" });
        return;
      }
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        newDocument();
        return;
      }
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (key === "y" && !event.shiftKey && !editingOutsideCodeEditor) {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveCurrentDocument();
        return;
      }
      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        void openDocument();
        return;
      }
      if (event.key.toLowerCase() === "w") {
        event.preventDefault();
        closeTab(tabs.activeId);
        return;
      }
      if (event.key.toLowerCase() === "e" && viewModeRef.current === "stage") {
        event.preventDefault();
        setStageLensExpanded((expanded) => !expanded);
        return;
      }
      const mode =
        event.key === "1"
          ? "code"
          : event.key === "2"
            ? "split"
            : event.key === "3"
              ? "diagram"
              : event.key === "4" && !narrow
                ? "stage"
                : undefined;
      if (mode) {
        event.preventDefault();
        update("viewMode", mode);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    narrow,
    closeTab,
    dismissAllInspectors,
    clearSelectedWbsNode,
    clearSelectedWbsRelationship,
    closeWbsSettings,
    newDocument,
    openDialog,
    openDocument,
    redo,
    saveCurrentDocument,
    saveActiveProject,
    saveDocument,
    tabs.activeId,
    toggleCommandPalette,
    undo,
    update,
    usingSingleFileProject,
    workspace.diagramKind,
  ]);
}
