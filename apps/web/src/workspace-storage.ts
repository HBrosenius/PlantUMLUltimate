import { applySourceEdits, parseGantt, type SourceEdit } from "@plantuml-studio/diagram-gantt";
import { normalizeDiagramKind } from "./diagram-kind";
import { DEFAULT_SOURCE, type DiagramKind, type Theme, type ViewMode } from "./model";

export interface WorkspaceSnapshot {
  diagramKind: DiagramKind;
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
  historyId: string;
  diagramKind: DiagramKind;
  source: string;
  fileName: string;
  dirty: boolean;
  zoom: number;
  cursor: { line: number; column: number };
  baselineVersionId?: string | undefined;
}

export interface WorkspaceSession {
  version: 6;
  documents: DocumentSnapshot[];
  activeDocumentId: string;
  viewMode: ViewMode;
  splitPercent: number;
  theme: Theme;
}

export const DEFAULT_WORKSPACE: WorkspaceSnapshot = {
  diagramKind: "gantt",
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
  version: 6,
  documents: [
    {
      id: "welcome",
      historyId: "history-welcome",
      diagramKind: "gantt",
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
const VERSION_STORE = "document-versions";
const CURRENT = "current";
const LEGACY_KEY = "plantuml-studio.workspace.v1";
export const AUTOMATIC_VERSION_LIMIT = 30;

function wholeLineRange(source: string, range: { from: number; to: number }): { from: number; to: number } {
  const from = source.lastIndexOf("\n", Math.max(0, range.from - 1)) + 1;
  const lineBreak = source.indexOf("\n", range.to);
  return { from, to: lineBreak < 0 ? source.length : lineBreak + 1 };
}

export function migrateGanttDependencyPlacement(source: string): string {
  const parsed = parseGantt(source);
  const blocks = parsed.document.dependencies
    .filter((dependency) => !/->/.test(source.slice(dependency.sourceRange.from, dependency.sourceRange.to)))
    .map((dependency) => {
      const lastRange = dependency.notes?.at(-1)?.sourceRange ?? dependency.sourceRange;
      return wholeLineRange(source, { from: dependency.sourceRange.from, to: lastRange.to });
    })
    .sort((left, right) => left.from - right.from);
  if (!blocks.length) return source;

  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const endMarker = /(^|\r?\n)([ \t]*)@endgantt\b/i.exec(source);
  if (!endMarker) return source;
  const insertionPoint = endMarker.index + endMarker[1]!.length;
  const dependencyText = blocks.map((range) => source.slice(range.from, range.to).replace(/\r?\n$/, "")).join(newline);
  const edits: SourceEdit[] = [
    ...blocks.map((range) => ({ range, text: "" })),
    { range: { from: insertionPoint, to: insertionPoint }, text: `${dependencyText}${newline}` },
  ];
  return applySourceEdits(source, edits);
}

export function migrateInvalidWbsDirection(source: string): string {
  return source.replace(/^\s*(?:left side|right side|(?:left to right|top to bottom) direction)\s*(?:\r?\n)?/gim, "");
}

export function normalizeWorkspace(value: unknown): WorkspaceSnapshot {
  if (!value || typeof value !== "object") return DEFAULT_WORKSPACE;
  const candidate = value as Partial<WorkspaceSnapshot>;
  return {
    ...DEFAULT_WORKSPACE,
    ...candidate,
    diagramKind: normalizeDiagramKind(
      candidate.diagramKind,
      typeof candidate.source === "string" ? candidate.source : DEFAULT_SOURCE,
    ),
    cursor: { ...DEFAULT_WORKSPACE.cursor, ...candidate.cursor },
    splitPercent: Math.min(80, Math.max(20, Number(candidate.splitPercent) || 50)),
    zoom: Math.min(3, Math.max(0.25, Number(candidate.zoom) || 1)),
  };
}

export function normalizeSession(value: unknown): WorkspaceSession {
  if (value && typeof value === "object" && Array.isArray((value as Partial<WorkspaceSession>).documents)) {
    const candidate = value as Partial<WorkspaceSession>;
    const migrateDependencies = Number(candidate.version ?? 0) < 5;
    const migrateWbsDirection = Number(candidate.version ?? 0) < 6;
    const documents = candidate
      .documents!.filter((item): item is DocumentSnapshot =>
        Boolean(item && typeof item.id === "string" && typeof item.source === "string"),
      )
      .map((item) => {
        const diagramKind = normalizeDiagramKind((item as Partial<DocumentSnapshot>).diagramKind, item.source);
        let source =
          migrateDependencies && diagramKind === "gantt" ? migrateGanttDependencyPlacement(item.source) : item.source;
        if (migrateWbsDirection && diagramKind === "wbs") source = migrateInvalidWbsDirection(source);
        return {
          id: item.id,
          historyId: item.historyId || `history-${item.id}`,
          diagramKind,
          source,
          fileName: item.fileName || "untitled.puml",
          dirty: Boolean(item.dirty) || source !== item.source,
          zoom: Math.min(3, Math.max(0.25, Number(item.zoom) || 1)),
          cursor: {
            line: Math.max(1, Number(item.cursor?.line) || 1),
            column: Math.max(1, Number(item.cursor?.column) || 1),
          },
          ...(typeof item.baselineVersionId === "string" ? { baselineVersionId: item.baselineVersionId } : {}),
        };
      });
    if (documents.length === 0) return DEFAULT_SESSION;
    const activeDocumentId = documents.some((item) => item.id === candidate.activeDocumentId)
      ? candidate.activeDocumentId!
      : documents[0]!.id;
    return {
      version: 6,
      documents,
      activeDocumentId,
      viewMode: candidate.viewMode ?? "split",
      splitPercent: Math.min(80, Math.max(20, Number(candidate.splitPercent) || 50)),
      theme: candidate.theme ?? "system",
    };
  }
  const legacy = normalizeWorkspace(value);
  const diagramKind = normalizeDiagramKind(
    (value as Partial<WorkspaceSnapshot> | undefined)?.diagramKind,
    legacy.source,
  );
  const source =
    diagramKind === "gantt"
      ? migrateGanttDependencyPlacement(legacy.source)
      : diagramKind === "wbs"
        ? migrateInvalidWbsDirection(legacy.source)
        : legacy.source;
  return {
    version: 6,
    documents: [
      {
        id: "migrated",
        historyId: "history-migrated",
        diagramKind,
        source,
        fileName: legacy.fileName,
        dirty: legacy.dirty || source !== legacy.source,
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
    diagramKind: document.diagramKind,
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
  if (!globalThis.indexedDB) return Promise.reject(new Error("Persistent storage is unavailable in this browser"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      if (!request.result.objectStoreNames.contains(VERSION_STORE)) {
        const versions = request.result.createObjectStore(VERSION_STORE, { keyPath: "id" });
        versions.createIndex("historyId", "historyId");
        versions.createIndex("historyCreatedAt", ["historyId", "createdAt"]);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB"));
  });
}

export type DocumentVersionReason = "opened" | "saved" | "manual" | "before-restore" | "restored" | "collaboration";

export interface DocumentVersionAuthor {
  id: string;
  name: string;
  color: string;
}

export interface DocumentVersion {
  id: string;
  historyId: string;
  parentVersionId?: string;
  source: string;
  sourceHash: string;
  fileName: string;
  diagramKind: DiagramKind;
  createdAt: string;
  reason: DocumentVersionReason;
  label?: string;
  author?: DocumentVersionAuthor;
  pinned: boolean;
}

async function hashSource(source: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  }
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}

export async function loadDocumentVersions(historyId: string): Promise<DocumentVersion[]> {
  const database = await openDatabase();
  const result = await new Promise<DocumentVersion[]>((resolve, reject) => {
    const request = database
      .transaction(VERSION_STORE, "readonly")
      .objectStore(VERSION_STORE)
      .index("historyId")
      .getAll(historyId);
    request.onsuccess = () => resolve(request.result as DocumentVersion[]);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createDocumentVersion(
  input: Omit<DocumentVersion, "id" | "sourceHash" | "createdAt" | "pinned"> & {
    createdAt?: string;
    pinned?: boolean;
  },
): Promise<DocumentVersion> {
  const sourceHash = await hashSource(input.source);
  const existing = (await loadDocumentVersions(input.historyId)).find((version) => version.sourceHash === sourceHash);
  if (existing) {
    const promoted = {
      ...existing,
      ...(input.label?.trim() ? { label: input.label.trim() } : {}),
      pinned: existing.pinned || input.pinned === true || input.reason === "manual",
    };
    if (promoted.label !== existing.label || promoted.pinned !== existing.pinned) {
      const database = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(VERSION_STORE, "readwrite");
        transaction.objectStore(VERSION_STORE).put(promoted);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    }
    return promoted;
  }
  const version: DocumentVersion = {
    ...input,
    id: `version-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    sourceHash,
    createdAt: input.createdAt ?? new Date().toISOString(),
    pinned: input.pinned ?? input.reason === "manual",
  };
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(VERSION_STORE, "readwrite");
    transaction.objectStore(VERSION_STORE).put(version);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  await pruneDocumentVersions(input.historyId);
  return version;
}

export async function updateDocumentVersion(
  id: string,
  patch: { label?: string; pinned?: boolean },
): Promise<DocumentVersion> {
  const database = await openDatabase();
  const version = await new Promise<DocumentVersion>((resolve, reject) => {
    const transaction = database.transaction(VERSION_STORE, "readwrite");
    const store = transaction.objectStore(VERSION_STORE);
    const request = store.get(id);
    request.onsuccess = () => {
      const current = request.result as DocumentVersion | undefined;
      if (!current) {
        reject(new Error("Document version not found"));
        return;
      }
      const label = patch.label?.trim();
      const next: DocumentVersion = {
        ...current,
        ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
      };
      if (patch.label !== undefined) {
        if (label) next.label = label;
        else delete next.label;
      }
      store.put(next);
      resolve(next);
    };
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  return version;
}

export async function deleteDocumentVersion(id: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(VERSION_STORE, "readwrite");
    transaction.objectStore(VERSION_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function pruneDocumentVersions(historyId: string, limit = AUTOMATIC_VERSION_LIMIT): Promise<number> {
  const versions = await loadDocumentVersions(historyId);
  const expired = versions.filter((version) => !version.pinned).slice(Math.max(0, limit));
  if (!expired.length) return 0;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(VERSION_STORE, "readwrite");
    const store = transaction.objectStore(VERSION_STORE);
    expired.forEach((version) => store.delete(version.id));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  return expired.length;
}

export async function importDocumentVersions(versions: readonly DocumentVersion[]): Promise<void> {
  if (!versions.length) return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(VERSION_STORE, "readwrite");
    const store = transaction.objectStore(VERSION_STORE);
    versions.forEach((version) => store.put(version));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
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
