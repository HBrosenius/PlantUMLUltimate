import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { DocumentSnapshot } from "./workspace-storage";

type TabControls = {
  activeId: string;
  documents: DocumentSnapshot[];
  activateDocument: (id: string) => void;
  closeDocument: (id: string) => void;
  duplicateDocument: (id: string) => string;
  closeOtherDocuments: (id: string) => void;
};

type UseDocumentTabLifecycleOptions = {
  tabs: TabControls;
  selectedTaskId: string | undefined;
  setSelectedTaskId: Dispatch<SetStateAction<string | undefined>>;
  resetTransientSelection: () => void;
  removeHistory: (id: string) => void;
  retainHistories: (ids: readonly string[]) => void;
  releaseDocumentResources: (id: string) => void;
  retainDocumentResources: (id: string) => void;
  closeTabMenu: () => void;
  openNewDocumentDialog: () => void;
  setInteractionMessage: Dispatch<SetStateAction<string | undefined>>;
};

export function closeDocumentConfirmation(document: Pick<DocumentSnapshot, "dirty" | "fileName">) {
  return document.dirty ? `Close “${document.fileName}” without saving?` : undefined;
}

export function closeOtherDocumentsConfirmation(documents: readonly DocumentSnapshot[], retainedId: string) {
  const otherCount = documents.filter((document) => document.id !== retainedId).length;
  const dirtyCount = documents.filter((document) => document.id !== retainedId && document.dirty).length;
  if (dirtyCount === 0) return undefined;
  return `Close ${otherCount} other tab${otherCount === 1 ? "" : "s"}? ${dirtyCount} contain unsaved changes.`;
}

export function useDocumentTabLifecycle({
  tabs,
  selectedTaskId,
  setSelectedTaskId,
  resetTransientSelection,
  removeHistory,
  retainHistories,
  releaseDocumentResources,
  retainDocumentResources,
  closeTabMenu,
  openNewDocumentDialog,
  setInteractionMessage,
}: UseDocumentTabLifecycleOptions) {
  const selectedTasksByDocument = useRef(new Map<string, string>());
  const rememberSelectedTask = useCallback(
    (taskId: string | undefined) => {
      if (taskId) selectedTasksByDocument.current.set(tabs.activeId, taskId);
      else selectedTasksByDocument.current.delete(tabs.activeId);
    },
    [tabs.activeId],
  );

  useEffect(() => {
    if (!tabs.documents.some((document) => document.dirty)) return;
    const protectUnsavedDocuments = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectUnsavedDocuments);
    return () => window.removeEventListener("beforeunload", protectUnsavedDocuments);
  }, [tabs.documents]);

  const activateTab = useCallback(
    (id: string) => {
      if (selectedTaskId) selectedTasksByDocument.current.set(tabs.activeId, selectedTaskId);
      tabs.activateDocument(id);
      setSelectedTaskId(selectedTasksByDocument.current.get(id));
      resetTransientSelection();
      setInteractionMessage(undefined);
    },
    [resetTransientSelection, selectedTaskId, setInteractionMessage, setSelectedTaskId, tabs],
  );

  const closeTab = useCallback(
    (id: string) => {
      const document = tabs.documents.find((item) => item.id === id);
      if (!document) return;
      const confirmation = closeDocumentConfirmation(document);
      if (confirmation && !window.confirm(confirmation)) return;
      const closingLastDocument = tabs.documents.length === 1;
      tabs.closeDocument(id);
      removeHistory(id);
      releaseDocumentResources(id);
      selectedTasksByDocument.current.delete(id);
      setSelectedTaskId(undefined);
      resetTransientSelection();
      if (closingLastDocument) openNewDocumentDialog();
    },
    [openNewDocumentDialog, releaseDocumentResources, removeHistory, resetTransientSelection, setSelectedTaskId, tabs],
  );

  const duplicateTab = useCallback(
    (id: string) => {
      tabs.duplicateDocument(id);
      setSelectedTaskId(undefined);
      resetTransientSelection();
      closeTabMenu();
      setInteractionMessage("Duplicated document");
    },
    [closeTabMenu, resetTransientSelection, setInteractionMessage, setSelectedTaskId, tabs],
  );

  const closeOtherTabs = useCallback(
    (id: string) => {
      const confirmation = closeOtherDocumentsConfirmation(tabs.documents, id);
      if (confirmation && !window.confirm(confirmation)) return;
      tabs.closeOtherDocuments(id);
      retainHistories([id]);
      retainDocumentResources(id);
      for (const documentId of selectedTasksByDocument.current.keys()) {
        if (documentId !== id) selectedTasksByDocument.current.delete(documentId);
      }
      closeTabMenu();
    },
    [closeTabMenu, retainDocumentResources, retainHistories, tabs],
  );

  return { activateTab, closeTab, duplicateTab, closeOtherTabs, rememberSelectedTask };
}
