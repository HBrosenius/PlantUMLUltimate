import { DEFAULT_SOURCE, type Theme, type ViewMode } from "./model";

export interface WorkspaceSnapshot {
  source: string;
  fileName: string;
  dirty: boolean;
  viewMode: ViewMode;
  splitPercent: number;
  theme: Theme;
  zoom: number;
  cursor: { line: number; column: number };
}

export interface DocumentSnapshot {
  id: string;
  source: string;
  fileName: string;
  dirty: boolean;
  zoom: number;
  cursor: { line: number; column: number };
}

export interface WorkspaceSession {
  version: 2;
  documents: DocumentSnapshot[];
  activeDocumentId: string;
  viewMode: ViewMode;
  splitPercent: number;
  theme: Theme;
}

export const DEFAULT_WORKSPACE: WorkspaceSnapshot = {
  source: DEFAULT_SOURCE,
  fileName: "untitled.puml",
  dirty: false,
  viewMode: "split",
  splitPercent: 50,
  theme: "system",
  zoom: 1,
  cursor: { line: 1, column: 1 },
};

export const DEFAULT_SESSION: WorkspaceSession = {
  version: 2,
  documents: [
    {
      id: "welcome",
      source: DEFAULT_SOURCE,
      fileName: "untitled.puml",
      dirty: false,
      zoom: 1,
      cursor: { line: 1, column: 1 },
    },
  ],
  activeDocumentId: "welcome",
  viewMode: "split",
  splitPercent: 50,
  theme: "system",
};

const DATABASE = "plantuml-studio";
const STORE = "workspace";
const CURRENT = "current";
const LEGACY_KEY = "plantuml-studio.workspace.v1";

export function normalizeWorkspace(value: unknown): WorkspaceSnapshot {
  if (!value || typeof value !== "object") return DEFAULT_WORKSPACE;
  const candidate = value as Partial<WorkspaceSnapshot>;
  return {
    ...DEFAULT_WORKSPACE,
    ...candidate,
    cursor: { ...DEFAULT_WORKSPACE.cursor, ...candidate.cursor },
    splitPercent: Math.min(80, Math.max(20, Number(candidate.splitPercent) || 50)),
    zoom: Math.min(3, Math.max(0.25, Number(candidate.zoom) || 1)),
  };
}

export function normalizeSession(value: unknown): WorkspaceSession {
  if (value && typeof value === "object" && Array.isArray((value as Partial<WorkspaceSession>).documents)) {
    const candidate = value as Partial<WorkspaceSession>;
    const documents = candidate
      .documents!.filter((item): item is DocumentSnapshot =>
        Boolean(item && typeof item.id === "string" && typeof item.source === "string"),
      )
      .map((item) => ({
        id: item.id,
        source: item.source,
        fileName: item.fileName || "untitled.puml",
        dirty: Boolean(item.dirty),
        zoom: Math.min(3, Math.max(0.25, Number(item.zoom) || 1)),
        cursor: {
          line: Math.max(1, Number(item.cursor?.line) || 1),
          column: Math.max(1, Number(item.cursor?.column) || 1),
        },
      }));
    if (documents.length === 0) return DEFAULT_SESSION;
    const activeDocumentId = documents.some((item) => item.id === candidate.activeDocumentId)
      ? candidate.activeDocumentId!
      : documents[0]!.id;
    return {
      version: 2,
      documents,
      activeDocumentId,
      viewMode: candidate.viewMode ?? "split",
      splitPercent: Math.min(80, Math.max(20, Number(candidate.splitPercent) || 50)),
      theme: candidate.theme ?? "system",
    };
  }
  const legacy = normalizeWorkspace(value);
  return {
    version: 2,
    documents: [
      {
        id: "migrated",
        source: legacy.source,
        fileName: legacy.fileName,
        dirty: legacy.dirty,
        zoom: legacy.zoom,
        cursor: legacy.cursor,
      },
    ],
    activeDocumentId: "migrated",
    viewMode: legacy.viewMode,
    splitPercent: legacy.splitPercent,
    theme: legacy.theme,
  };
}

export function activeWorkspace(session: WorkspaceSession): WorkspaceSnapshot {
  const document =
    session.documents.find((item) => item.id === session.activeDocumentId) ??
    session.documents[0] ??
    DEFAULT_SESSION.documents[0]!;
  return {
    source: document.source,
    fileName: document.fileName,
    dirty: document.dirty,
    zoom: document.zoom,
    cursor: document.cursor,
    viewMode: session.viewMode,
    splitPercent: session.splitPercent,
    theme: session.theme,
  };
}

export function documentDisplayNames(
  documents: readonly Pick<DocumentSnapshot, "id" | "fileName">[],
): Map<string, string> {
  const totals = new Map<string, number>();
  for (const document of documents) totals.set(document.fileName, (totals.get(document.fileName) ?? 0) + 1);
  const seen = new Map<string, number>();
  return new Map(
    documents.map((document) => {
      const occurrence = (seen.get(document.fileName) ?? 0) + 1;
      seen.set(document.fileName, occurrence);
      return [
        document.id,
        (totals.get(document.fileName) ?? 0) > 1 ? `${document.fileName} (${occurrence})` : document.fileName,
      ];
    }),
  );
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB"));
  });
}

export async function loadWorkspace(): Promise<WorkspaceSession> {
  try {
    const database = await openDatabase();
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).get(CURRENT);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    if (value) return normalizeSession(value);
  } catch {
    // Private browsing or storage policy may make IndexedDB unavailable.
  }
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    return legacy ? normalizeSession(JSON.parse(legacy)) : DEFAULT_SESSION;
  } catch {
    return DEFAULT_SESSION;
  }
}

export async function saveWorkspace(snapshot: WorkspaceSession): Promise<void> {
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(snapshot, CURRENT);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  } catch {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(snapshot));
  }
}
