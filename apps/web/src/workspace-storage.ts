import { MAX_DIAGRAM_ZOOM, MIN_DIAGRAM_ZOOM } from "./diagram-zoom";
import { applySourceEdits, parseGantt, type SourceEdit } from "@plantuml-studio/diagram-gantt";
import { normalizeDiagramKind } from "./diagram-kind";
import { DEFAULT_SOURCE, type DiagramKind, type Theme, type ViewMode } from "./model";
import { validForecastTimeZone } from "./forecast-date";
import { reportStorageWrite, reportWorkspaceBackend } from "./storage-health";

export interface WorkspaceSnapshot {
  diagramKind: DiagramKind;
  source: string;
  fileName: string;
  dirty: boolean;
  viewMode: ViewMode;
  splitPercent: number;
  theme: Theme;
  advancedMode: boolean;
  defaultDiagramTheme: string;
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
  portableDocumentId?: string | undefined;
  native?: boolean | undefined;
  encrypted?: boolean | undefined;
  compression?: "gzip" | "none" | undefined;
  historyMaxVersions?: number | undefined;
  historyMaxLogicalBytes?: number | undefined;
  revision?: number | undefined;
  resourceCapacities?: Record<string, number> | undefined;
  progressForecast?:
    { enabled: boolean; remainingDays: Record<string, number>; asOf?: string; timeZone?: string } | undefined;
  linkedWbsDocumentId?: string | undefined;
  wbsGanttLinks?: Array<{ wbsAlias: string; ganttAlias: string }> | undefined;
  wbsGanttDependencies?: Array<{ from: string; to: string }> | undefined;
}

export interface WorkspaceSession {
  version: 7;
  recoverySavedAt?: number;
  documents: DocumentSnapshot[];
  activeDocumentId: string;
  viewMode: ViewMode;
  splitPercent: number;
  theme: Theme;
  advancedMode: boolean;
  defaultDiagramTheme: string;
  onboarded: boolean;
}

export const DEFAULT_WORKSPACE: WorkspaceSnapshot = {
  diagramKind: "gantt",
  source: DEFAULT_SOURCE,
  fileName: "untitled.pumlu",
  dirty: false,
  viewMode: "split",
  splitPercent: 50,
  theme: "system",
  advancedMode: true,
  defaultDiagramTheme: "",
  zoom: 1,
  cursor: { line: 1, column: 1 },
};

export const DEFAULT_SESSION: WorkspaceSession = {
  version: 7,
  documents: [
    {
      id: "welcome",
      historyId: "history-welcome",
      diagramKind: "gantt",
      source: DEFAULT_SOURCE,
      fileName: "untitled.pumlu",
      dirty: false,
      zoom: 1,
      cursor: { line: 1, column: 1 },
    },
  ],
  activeDocumentId: "welcome",
  viewMode: "diagram",
  splitPercent: 50,
  theme: "system",
  advancedMode: false,
  defaultDiagramTheme: "",
  onboarded: false,
};

const DATABASE = "plantuml-studio";
const STORE = "workspace";
const VERSION_STORE = "document-versions";
const CURRENT = "current";
const ACTIVE_PROJECT = "active-project";
const LEGACY_KEY = "plantuml-studio.workspace.v1";
const RECOVERY_KEY = "plantuml-studio.workspace.recovery.v6";
const ACTIVE_PROJECT_LEGACY_KEY = "plantuml-studio.active-project.v1";
export const AUTOMATIC_VERSION_LIMIT = 30;
/** Automatic "before-restore" pins beyond this many become ordinary, prunable versions. */
export const BEFORE_RESTORE_PIN_LIMIT = 10;
const memoryOnlyHistories = new Map<string, DocumentVersion[]>();
const plaintextExcluded = new Set<string>();
export function allowPlaintextPersistence(documentId: string): void {
  plaintextExcluded.delete(documentId);
}

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
    zoom: Math.min(MAX_DIAGRAM_ZOOM, Math.max(MIN_DIAGRAM_ZOOM, Number(candidate.zoom) || 1)),
    advancedMode: candidate.advancedMode ?? DEFAULT_WORKSPACE.advancedMode,
    defaultDiagramTheme:
      typeof candidate.defaultDiagramTheme === "string"
        ? candidate.defaultDiagramTheme
        : DEFAULT_WORKSPACE.defaultDiagramTheme,
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
          zoom: Math.min(MAX_DIAGRAM_ZOOM, Math.max(MIN_DIAGRAM_ZOOM, Number(item.zoom) || 1)),
          cursor: {
            line: Math.max(1, Number(item.cursor?.line) || 1),
            column: Math.max(1, Number(item.cursor?.column) || 1),
          },
          ...(typeof item.baselineVersionId === "string" ? { baselineVersionId: item.baselineVersionId } : {}),
          ...(typeof item.portableDocumentId === "string" ? { portableDocumentId: item.portableDocumentId } : {}),
          ...(item.native === true ? { native: true } : {}),
          ...(item.encrypted === true ? { encrypted: true } : {}),
          ...(item.compression === "none" ? { compression: "none" as const } : {}),
          ...(Number.isSafeInteger(item.historyMaxVersions) ? { historyMaxVersions: item.historyMaxVersions } : {}),
          ...(Number.isSafeInteger(item.historyMaxLogicalBytes)
            ? { historyMaxLogicalBytes: item.historyMaxLogicalBytes }
            : {}),
          ...(item.resourceCapacities && typeof item.resourceCapacities === "object"
            ? { resourceCapacities: item.resourceCapacities }
            : {}),
          ...(item.progressForecast &&
          typeof item.progressForecast === "object" &&
          typeof item.progressForecast.enabled === "boolean" &&
          item.progressForecast.remainingDays &&
          typeof item.progressForecast.remainingDays === "object" &&
          !Array.isArray(item.progressForecast.remainingDays)
            ? {
                progressForecast: {
                  enabled: item.progressForecast.enabled,
                  remainingDays: Object.fromEntries(
                    Object.entries(item.progressForecast.remainingDays).filter(
                      ([id, days]) => id.length <= 128 && Number.isSafeInteger(days) && days >= 1 && days <= 10_000,
                    ),
                  ),
                  ...(typeof item.progressForecast.asOf === "string" &&
                  /^\d{4}-\d{2}-\d{2}$/.test(item.progressForecast.asOf) &&
                  !Number.isNaN(Date.parse(`${item.progressForecast.asOf}T00:00:00Z`)) &&
                  new Date(`${item.progressForecast.asOf}T00:00:00Z`).toISOString().slice(0, 10) ===
                    item.progressForecast.asOf
                    ? { asOf: item.progressForecast.asOf }
                    : {}),
                  ...(validForecastTimeZone(item.progressForecast.timeZone)
                    ? { timeZone: item.progressForecast.timeZone }
                    : {}),
                },
              }
            : {}),
          ...(typeof item.linkedWbsDocumentId === "string" ? { linkedWbsDocumentId: item.linkedWbsDocumentId } : {}),
          ...(Array.isArray(item.wbsGanttLinks)
            ? {
                wbsGanttLinks: item.wbsGanttLinks.filter(
                  (link) => link && typeof link.wbsAlias === "string" && typeof link.ganttAlias === "string",
                ),
              }
            : {}),
          ...(Array.isArray(item.wbsGanttDependencies)
            ? {
                wbsGanttDependencies: item.wbsGanttDependencies.filter(
                  (edge) => edge && typeof edge.from === "string" && typeof edge.to === "string",
                ),
              }
            : {}),
          ...(Number.isSafeInteger(item.revision) ? { revision: Math.max(0, Number(item.revision)) } : {}),
        };
      });
    if (documents.length === 0) return DEFAULT_SESSION;
    const activeDocumentId = documents.some((item) => item.id === candidate.activeDocumentId)
      ? candidate.activeDocumentId!
      : documents[0]!.id;
    return {
      version: 7,
      documents,
      activeDocumentId,
      viewMode: candidate.viewMode === "code" || candidate.viewMode === "diagram" ? candidate.viewMode : "split",
      splitPercent: Math.min(80, Math.max(20, Number(candidate.splitPercent) || 50)),
      theme: candidate.theme === "light" || candidate.theme === "dark" ? candidate.theme : "system",
      advancedMode: candidate.advancedMode ?? true,
      defaultDiagramTheme: typeof candidate.defaultDiagramTheme === "string" ? candidate.defaultDiagramTheme : "",
      onboarded: candidate.onboarded ?? true,
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
    version: 7,
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
    advancedMode: legacy.advancedMode,
    defaultDiagramTheme: legacy.defaultDiagramTheme,
    onboarded: true,
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
    advancedMode: session.advancedMode,
    defaultDiagramTheme: session.defaultDiagramTheme,
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

const STORAGE_TIMEOUT_MS = 3000;
let recoveryScope: string | undefined;
export function workspaceRecoveryScope(): string {
  if (recoveryScope) return recoveryScope;
  try {
    recoveryScope = globalThis.history?.state?.plantumlRecovery;
    if (!recoveryScope) {
      recoveryScope = crypto.randomUUID();
      globalThis.history?.replaceState({ ...globalThis.history.state, plantumlRecovery: recoveryScope }, "");
    }
  } catch {
    recoveryScope = crypto.randomUUID();
  }
  return recoveryScope!;
}
const scopedKey = (key: string) => `${key}:${workspaceRecoveryScope()}`;
let lastRecoveryTime = 0;
function recoverySnapshot(snapshot: WorkspaceSession): WorkspaceSession {
  lastRecoveryTime = Math.max(Date.now(), lastRecoveryTime + 1);
  return { ...persistableWorkspace(snapshot), recoverySavedAt: lastRecoveryTime };
}

function pruneRecoveryJournals(): void {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    for (const prefix of [RECOVERY_KEY, LEGACY_KEY]) {
      const keys = Object.keys(storage).filter((key) => key.startsWith(`${prefix}:`));
      if (keys.length <= 100) continue;
      keys.sort(
        (a, b) =>
          Number(JSON.parse(storage.getItem(b)!).recoverySavedAt ?? 0) -
          Number(JSON.parse(storage.getItem(a)!).recoverySavedAt ?? 0),
      );
      for (const key of keys.slice(100)) if (key !== scopedKey(prefix)) storage.removeItem(key);
    }
  } catch {
    /* Quota/denial is reported by the save path. */
  }
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
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      reject(new Error("Browser storage timed out"));
    }, STORAGE_TIMEOUT_MS);
    request.onblocked = () => {
      expired = true;
      clearTimeout(timer);
      reject(new Error("Browser storage upgrade is blocked"));
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (expired) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error ?? new Error("Could not open IndexedDB"));
    };
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
  portableId?: string;
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
  const memory = memoryOnlyHistories.get(historyId);
  if (memory) return [...memory].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
  const version: DocumentVersion = {
    ...input,
    id: `version-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    portableId: crypto.randomUUID(),
    sourceHash,
    createdAt: input.createdAt ?? new Date().toISOString(),
    pinned: input.pinned ?? input.reason === "manual",
  };
  const memory = memoryOnlyHistories.get(input.historyId);
  if (memory) {
    memory.push(version);
    await pruneDocumentVersions(input.historyId);
    return version;
  }
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(VERSION_STORE, "readwrite");
    transaction.objectStore(VERSION_STORE).put(version);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("Browser storage transaction was aborted"));
  });
  database.close();
  await pruneDocumentVersions(input.historyId);
  return version;
}

export async function updateDocumentVersion(
  id: string,
  patch: { label?: string; pinned?: boolean },
): Promise<DocumentVersion> {
  for (const versions of memoryOnlyHistories.values()) {
    const index = versions.findIndex((version) => version.id === id);
    if (index >= 0) {
      const current = versions[index]!;
      const next = { ...current, ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}) };
      if (patch.label !== undefined) {
        if (patch.label.trim()) next.label = patch.label.trim();
        else delete next.label;
      }
      versions[index] = next;
      return next;
    }
  }
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
      transaction.oncomplete = () => resolve(next);
    };
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("Browser storage transaction was aborted"));
  });
  database.close();
  return version;
}

export async function deleteDocumentVersion(id: string): Promise<void> {
  for (const versions of memoryOnlyHistories.values()) {
    const index = versions.findIndex((version) => version.id === id);
    if (index >= 0) {
      versions.splice(index, 1);
      return;
    }
  }
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(VERSION_STORE, "readwrite");
    transaction.objectStore(VERSION_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("Browser storage transaction was aborted"));
  });
  database.close();
}

export async function pruneDocumentVersions(historyId: string, limit = AUTOMATIC_VERSION_LIMIT): Promise<number> {
  const versions = await loadDocumentVersions(historyId);
  const protectedRestorePoints = new Set(
    versions
      .filter((version) => version.pinned && version.reason === "before-restore")
      .slice(0, BEFORE_RESTORE_PIN_LIMIT)
      .map((version) => version.id),
  );
  const isProtected = (version: DocumentVersion) =>
    version.pinned && (version.reason !== "before-restore" || protectedRestorePoints.has(version.id));
  const expired = versions.filter((version) => !isProtected(version)).slice(Math.max(0, limit));
  if (!expired.length) return 0;
  const memory = memoryOnlyHistories.get(historyId);
  if (memory) {
    const expiredIds = new Set(expired.map((version) => version.id));
    memoryOnlyHistories.set(
      historyId,
      memory.filter((version) => !expiredIds.has(version.id)),
    );
    return expired.length;
  }
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(VERSION_STORE, "readwrite");
    const store = transaction.objectStore(VERSION_STORE);
    expired.forEach((version) => store.delete(version.id));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("Browser storage transaction was aborted"));
  });
  database.close();
  return expired.length;
}

export async function importDocumentVersions(versions: readonly DocumentVersion[]): Promise<void> {
  if (!versions.length) return;
  const memory = memoryOnlyHistories.get(versions[0]!.historyId);
  if (memory) {
    memory.push(...versions);
    return;
  }
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(VERSION_STORE, "readwrite");
    const store = transaction.objectStore(VERSION_STORE);
    versions.forEach((version) => store.put(version));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("Browser storage transaction was aborted"));
  });
  database.close();
}

export async function loadWorkspace(): Promise<WorkspaceSession> {
  const own: unknown[] = [];
  const shared: unknown[] = [];
  for (const key of [RECOVERY_KEY, LEGACY_KEY]) {
    for (const [name, list] of [
      [scopedKey(key), own],
      [key, shared],
    ] as const) {
      try {
        const raw = globalThis.localStorage?.getItem(name);
        if (raw) list.push(JSON.parse(raw));
      } catch {
        /* Try other copies. */
      }
    }
  }
  try {
    const database = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE, "readonly");
        const timer = setTimeout(() => {
          transaction.abort();
          reject(new Error("Browser recovery timed out"));
        }, STORAGE_TIMEOUT_MS);
        for (const [key, list] of [
          [scopedKey(CURRENT), own],
          [CURRENT, shared],
        ] as const) {
          const request = transaction.objectStore(STORE).get(key);
          request.onsuccess = () => {
            if (request.result) list.push(request.result);
          };
        }
        transaction.oncomplete = () => {
          clearTimeout(timer);
          resolve();
        };
        transaction.onerror = transaction.onabort = () => {
          clearTimeout(timer);
          reject(transaction.error ?? new Error("Browser recovery aborted"));
        };
      });
    } finally {
      database.close();
    }
  } catch {
    /* Recovery journals remain available without IndexedDB. */
  }
  const candidates = own.length ? own : shared;
  candidates.sort(
    (a, b) =>
      Number((b as WorkspaceSession).recoverySavedAt ?? 0) - Number((a as WorkspaceSession).recoverySavedAt ?? 0),
  );
  return candidates.length ? normalizeSession(candidates[0]) : DEFAULT_SESSION;
}

function persistableWorkspace(snapshot: WorkspaceSession): WorkspaceSession {
  const documents = snapshot.documents.filter((document) => !document.encrypted && !plaintextExcluded.has(document.id));
  return {
    ...snapshot,
    documents,
    activeDocumentId:
      documents.find((document) => document.id === snapshot.activeDocumentId)?.id ?? documents[0]?.id ?? "",
  };
}

/**
 * Writes or clears a synchronous recovery copy. When the write fails (for example over quota),
 * the stale copy is removed so that loading falls through to the newer IndexedDB record.
 */
function writeRecoveryItem(key: string, value: string): boolean {
  try {
    globalThis.localStorage?.setItem(key, value);
    return true;
  } catch {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Storage may be entirely unavailable; IndexedDB remains the durable copy.
    }
    return false;
  }
}

/** Returns false when the synchronous recovery copy could not be written. */
export function saveWorkspaceRecovery(snapshot: WorkspaceSession): boolean {
  const value = JSON.stringify(recoverySnapshot(snapshot));
  const saved = writeRecoveryItem(scopedKey(RECOVERY_KEY), value);
  writeRecoveryItem(RECOVERY_KEY, value);
  return saved;
}

export async function saveWorkspace(snapshot: WorkspaceSession): Promise<void> {
  const persistable = recoverySnapshot(snapshot);
  const value = JSON.stringify(persistable);
  const recovered = writeRecoveryItem(scopedKey(RECOVERY_KEY), value);
  writeRecoveryItem(RECOVERY_KEY, value);
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      const timer = setTimeout(() => {
        transaction.abort();
        reject(new Error("Browser save timed out"));
      }, STORAGE_TIMEOUT_MS);
      // Protection can change while opening the database; never commit an obsolete plaintext copy.
      const current = persistableWorkspace(persistable);
      transaction.objectStore(STORE).put(current, CURRENT);
      transaction.objectStore(STORE).put(current, scopedKey(CURRENT));
      const sessions: Array<{ key: IDBValidKey; savedAt: number }> = [];
      const cursor = transaction.objectStore(STORE).openCursor();
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (entry) {
          if (String(entry.key).startsWith(`${CURRENT}:`))
            sessions.push({ key: entry.key, savedAt: entry.value.recoverySavedAt ?? 0 });
          entry.continue();
        } else {
          sessions.sort((a, b) => b.savedAt - a.savedAt);
          for (const entry of sessions.slice(100)) transaction.objectStore(STORE).delete(entry.key);
        }
      };
      transaction.oncomplete = () => {
        clearTimeout(timer);
        resolve();
      };
      transaction.onerror = transaction.onabort = () => {
        clearTimeout(timer);
        reject(transaction.error ?? new Error("Browser storage transaction was aborted"));
      };
    });
    database.close();
    reportStorageWrite("workspace", true);
    reportWorkspaceBackend("indexeddb");
    pruneRecoveryJournals();
  } catch (error) {
    const fallback = JSON.stringify(persistableWorkspace(persistable));
    const saved = writeRecoveryItem(scopedKey(LEGACY_KEY), fallback);
    writeRecoveryItem(LEGACY_KEY, fallback);
    reportStorageWrite("workspace", saved || recovered);
    reportWorkspaceBackend(saved || recovered ? "localstorage" : "memory");
    pruneRecoveryJournals();
    if (!saved && !recovered) throw error;
  }
}

/** Persists an active project recovery record alongside the workspace session. */
export async function saveActiveProject(value: unknown): Promise<void> {
  // Write the small recovery record synchronously first, so an immediate reload cannot race IndexedDB.
  // A failed write clears the stale copy so loading cannot prefer an older project state.
  const serialized = JSON.stringify(value);
  const recovered = writeRecoveryItem(scopedKey(ACTIVE_PROJECT_LEGACY_KEY), serialized);
  writeRecoveryItem(ACTIVE_PROJECT_LEGACY_KEY, serialized);
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      const timer = setTimeout(() => {
        transaction.abort();
        reject(new Error("Project recovery save timed out"));
      }, STORAGE_TIMEOUT_MS);
      transaction.objectStore(STORE).put(value, ACTIVE_PROJECT);
      transaction.objectStore(STORE).put(value, scopedKey(ACTIVE_PROJECT));
      transaction.oncomplete = () => {
        clearTimeout(timer);
        resolve();
      };
      transaction.onerror = transaction.onabort = () => {
        clearTimeout(timer);
        reject(transaction.error ?? new Error("Browser storage transaction was aborted"));
      };
    });
    database.close();
    reportStorageWrite("project", true);
  } catch (error) {
    // IndexedDB recovery is optional when the synchronous fallback has succeeded.
    reportStorageWrite("project", recovered);
    if (!recovered) throw error;
  }
}

/** Loads the active project recovery record, if there is one. */
export async function loadActiveProject(): Promise<unknown | undefined> {
  try {
    const own = localStorage.getItem(scopedKey(ACTIVE_PROJECT_LEGACY_KEY));
    if (own) return JSON.parse(own) ?? undefined;
  } catch {
    // Fall through to IndexedDB.
  }
  try {
    const database = await openDatabase();
    const value = await new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readonly");
      const timer = setTimeout(() => {
        transaction.abort();
        reject(new Error("Project recovery timed out"));
      }, STORAGE_TIMEOUT_MS);
      const request = transaction.objectStore(STORE).get(scopedKey(ACTIVE_PROJECT));
      request.onsuccess = () => {
        if (request.result !== undefined) {
          clearTimeout(timer);
          resolve(request.result);
        } else {
          const legacyRequest = transaction.objectStore(STORE).get(ACTIVE_PROJECT);
          legacyRequest.onsuccess = () => {
            clearTimeout(timer);
            resolve(legacyRequest.result);
          };
          legacyRequest.onerror = () => {
            clearTimeout(timer);
            reject(legacyRequest.error);
          };
        }
      };
      request.onerror = transaction.onabort = () => {
        clearTimeout(timer);
        reject(request.error ?? transaction.error);
      };
    });
    database.close();
    if (value !== undefined) return value ?? undefined;
  } catch {
    // Fall through to the legacy browser-storage record.
  }
  try {
    const legacy = localStorage.getItem(ACTIVE_PROJECT_LEGACY_KEY);
    if (legacy) return JSON.parse(legacy) ?? undefined;
  } catch {
    /* Recovery may be unavailable. */
  }
  return undefined;
}

/** Removes the active-project recovery record from both supported browser stores. */
export async function clearActiveProject(): Promise<void> {
  writeRecoveryItem(scopedKey(ACTIVE_PROJECT_LEGACY_KEY), "null");
  try {
    globalThis.localStorage?.removeItem(ACTIVE_PROJECT_LEGACY_KEY);
  } catch {
    /* Continue with IndexedDB. */
  }
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).delete(ACTIVE_PROJECT);
      transaction.objectStore(STORE).put(null, scopedKey(ACTIVE_PROJECT));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("Browser storage transaction was aborted"));
    });
    database.close();
  } catch {
    // The local-storage copy was already removed. IndexedDB recovery is best effort.
  }
}

/** Removes persisted plaintext before routing all future history operations to memory. */
export async function enableMemoryOnlyHistory(historyId: string): Promise<void> {
  // Route new versions to memory before touching IndexedDB, so a version recorded while the plaintext
  // is being removed cannot be written to disk.
  const created = !memoryOnlyHistories.has(historyId);
  if (created) memoryOnlyHistories.set(historyId, []);
  try {
    const database = await openDatabase();
    const persisted = await new Promise<DocumentVersion[]>((resolve, reject) => {
      const transaction = database.transaction(VERSION_STORE, "readwrite");
      const store = transaction.objectStore(VERSION_STORE);
      let found: DocumentVersion[] = [];
      const request = store.index("historyId").getAll(historyId);
      request.onsuccess = () => {
        found = request.result as DocumentVersion[];
        found.forEach((version) => store.delete(version.id));
      };
      transaction.oncomplete = () => resolve(found);
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not remove plaintext history"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Could not remove plaintext history"));
    });
    database.close();
    const recorded = memoryOnlyHistories.get(historyId) ?? [];
    const persistedIds = new Set(persisted.map((version) => version.id));
    memoryOnlyHistories.set(historyId, [...persisted, ...recorded.filter((version) => !persistedIds.has(version.id))]);
  } catch (error) {
    if (created && !memoryOnlyHistories.get(historyId)?.length) memoryOnlyHistories.delete(historyId);
    throw error;
  }
}

export function startMemoryOnlyHistory(historyId: string): void {
  if (!memoryOnlyHistories.has(historyId)) memoryOnlyHistories.set(historyId, []);
}

export async function removePersistedDocument(documentId: string): Promise<void> {
  plaintextExcluded.add(documentId);
  const withoutDocument = (value: WorkspaceSession) => {
    const documents = value.documents.filter((document) => document.id !== documentId);
    return {
      ...value,
      documents,
      activeDocumentId: documents.some((d) => d.id === value.activeDocumentId)
        ? value.activeDocumentId
        : (documents[0]?.id ?? ""),
    };
  };
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      const request = transaction.objectStore(STORE).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const value = cursor.value as WorkspaceSession;
        if (Array.isArray(value?.documents)) cursor.update(withoutDocument(value));
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () =>
        reject(transaction.error ?? new Error("Could not remove persisted plaintext"));
    });
  } finally {
    database.close();
  }
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    for (const key of Object.keys(storage)) {
      if (![LEGACY_KEY, RECOVERY_KEY].some((prefix) => key === prefix || key.startsWith(`${prefix}:`))) continue;
      const raw = storage.getItem(key);
      if (raw) storage.setItem(key, JSON.stringify(withoutDocument(JSON.parse(raw))));
    }
  } catch {
    throw new Error("Could not remove plaintext recovery copies; password protection was not completed");
  }
}

export function discardMemoryOnlyHistory(historyId: string): void {
  memoryOnlyHistories.delete(historyId);
}

export async function disableMemoryOnlyHistory(historyId: string): Promise<void> {
  const versions = memoryOnlyHistories.get(historyId);
  if (!versions) return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(VERSION_STORE, "readwrite");
    const store = transaction.objectStore(VERSION_STORE);
    versions.forEach((version) => store.put(version));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not restore document history"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Could not restore document history"));
  });
  database.close();
  memoryOnlyHistories.delete(historyId);
}
