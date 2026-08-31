import { useCallback, useEffect, useMemo, useState, type SetStateAction } from "react";
import {
  activeWorkspace,
  DEFAULT_SESSION,
  loadWorkspace,
  normalizeSession,
  saveWorkspace,
  type DocumentSnapshot,
  type WorkspaceSession,
  type WorkspaceSnapshot,
} from "./workspace-storage";

export function usePersistedWorkspace() {
  const [session, setSession] = useState<WorkspaceSession>(DEFAULT_SESSION);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    void loadWorkspace().then((saved) => {
      if (!active) return;
      setSession(saved);
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => void saveWorkspace(session), 350);
    return () => window.clearTimeout(timer);
  }, [hydrated, session]);

  const workspace = useMemo(() => activeWorkspace(session), [session]);
  const setWorkspace = useCallback((action: SetStateAction<WorkspaceSnapshot>) => {
    setSession((current) => {
      const previous = activeWorkspace(current);
      const next = typeof action === "function" ? action(previous) : action;
      return {
        ...current,
        viewMode: next.viewMode,
        splitPercent: next.splitPercent,
        theme: next.theme,
        documents: current.documents.map((item) =>
          item.id === current.activeDocumentId
            ? {
                ...item,
                diagramKind: next.diagramKind,
                source: next.source,
                fileName: next.fileName,
                dirty: next.dirty,
                zoom: next.zoom,
                cursor: next.cursor,
              }
            : item,
        ),
      };
    });
  }, []);

  const addDocument = useCallback((input?: Partial<Omit<DocumentSnapshot, "id">>) => {
    const id = `document-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const document: DocumentSnapshot = {
      id,
      historyId: input?.historyId ?? `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      diagramKind: input?.diagramKind ?? DEFAULT_SESSION.documents[0]!.diagramKind,
      source: input?.source ?? DEFAULT_SESSION.documents[0]!.source,
      fileName: input?.fileName ?? "untitled.puml",
      dirty: input?.dirty ?? false,
      zoom: input?.zoom ?? 1,
      cursor: input?.cursor ?? { line: 1, column: 1 },
    };
    setSession((current) => ({ ...current, documents: [...current.documents, document], activeDocumentId: id }));
    return id;
  }, []);

  const closeDocument = useCallback((id: string) => {
    setSession((current) => {
      const index = current.documents.findIndex((item) => item.id === id);
      if (index < 0) return current;
      let documents = current.documents.filter((item) => item.id !== id);
      if (documents.length === 0) documents = [{ ...DEFAULT_SESSION.documents[0]!, id: `document-${Date.now()}` }];
      const activeDocumentId =
        current.activeDocumentId === id
          ? documents[Math.min(index, documents.length - 1)]!.id
          : current.activeDocumentId;
      return { ...current, documents, activeDocumentId };
    });
  }, []);

  const activateDocument = useCallback(
    (id: string) =>
      setSession((current) =>
        current.documents.some((item) => item.id === id) ? { ...current, activeDocumentId: id } : current,
      ),
    [],
  );

  const duplicateDocument = useCallback((id: string) => {
    const nextId = `document-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setSession((current) => {
      const index = current.documents.findIndex((item) => item.id === id);
      if (index < 0) return current;
      const original = current.documents[index]!;
      const copy: DocumentSnapshot = {
        ...original,
        id: nextId,
        historyId: `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fileName: `Copy of ${original.fileName}`,
        dirty: true,
      };
      const documents = [...current.documents];
      documents.splice(index + 1, 0, copy);
      return { ...current, documents, activeDocumentId: nextId };
    });
    return nextId;
  }, []);

  const closeOtherDocuments = useCallback(
    (id: string) =>
      setSession((current) => {
        const document = current.documents.find((item) => item.id === id);
        return document ? { ...current, documents: [document], activeDocumentId: id } : current;
      }),
    [],
  );

  const reorderDocument = useCallback(
    (draggedId: string, targetId: string) =>
      setSession((current) => {
        if (draggedId === targetId) return current;
        const from = current.documents.findIndex((item) => item.id === draggedId);
        const to = current.documents.findIndex((item) => item.id === targetId);
        if (from < 0 || to < 0) return current;
        const documents = [...current.documents];
        const [dragged] = documents.splice(from, 1);
        documents.splice(to, 0, dragged!);
        return { ...current, documents };
      }),
    [],
  );
  const restoreSession = useCallback((next: WorkspaceSession) => setSession(normalizeSession(next)), []);
  const setDocumentHistoryId = useCallback((id: string, historyId: string) => {
    setSession((current) => ({
      ...current,
      documents: current.documents.map((document) => (document.id === id ? { ...document, historyId } : document)),
    }));
  }, []);
  const setDocumentBaselineVersionId = useCallback((id: string, baselineVersionId?: string) => {
    setSession((current) => ({
      ...current,
      documents: current.documents.map((document) =>
        document.id === id ? { ...document, baselineVersionId } : document,
      ),
    }));
  }, []);
  const replaceDocumentFromFile = useCallback(
    (id: string, input: Pick<DocumentSnapshot, "source" | "fileName" | "diagramKind">, dirty = false) => {
      setSession((current) => ({
        ...current,
        documents: current.documents.map((document) =>
          document.id === id ? { ...document, ...input, dirty, cursor: { line: 1, column: 1 } } : document,
        ),
      }));
    },
    [],
  );
  const updateDocumentSource = useCallback(
    (id: string, source: string, diagramKind: DocumentSnapshot["diagramKind"]) => {
      setSession((current) => ({
        ...current,
        documents: current.documents.map((document) =>
          document.id === id && document.source !== source
            ? { ...document, source, diagramKind, dirty: true }
            : document,
        ),
      }));
    },
    [],
  );

  const controls = useMemo(
    () => ({
      documents: session.documents,
      activeId: session.activeDocumentId,
      addDocument,
      closeDocument,
      activateDocument,
      duplicateDocument,
      closeOtherDocuments,
      reorderDocument,
      restoreSession,
      setDocumentHistoryId,
      setDocumentBaselineVersionId,
      replaceDocumentFromFile,
      updateDocumentSource,
      session,
    }),
    [
      activateDocument,
      addDocument,
      closeDocument,
      closeOtherDocuments,
      duplicateDocument,
      reorderDocument,
      restoreSession,
      setDocumentHistoryId,
      setDocumentBaselineVersionId,
      replaceDocumentFromFile,
      updateDocumentSource,
      session,
    ],
  );

  return [workspace, setWorkspace, hydrated, controls] as const;
}
