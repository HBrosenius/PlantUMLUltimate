import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  activeWorkspace,
  DEFAULT_SESSION,
  DEFAULT_WORKSPACE,
  documentDisplayNames,
  createDocumentVersion,
  discardMemoryOnlyHistory,
  enableMemoryOnlyHistory,
  deleteDocumentVersion,
  loadDocumentVersions,
  loadWorkspace,
  migrateGanttDependencyPlacement,
  migrateInvalidWbsDirection,
  normalizeSession,
  normalizeWorkspace,
  saveWorkspace,
  saveWorkspaceRecovery,
  removePersistedDocument,
  updateDocumentVersion,
  type WorkspaceSession,
} from "./workspace-storage";
import { DEFAULT_SOURCE } from "./model";

beforeEach(() => {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: undefined });
});

it("recovers the newest fallback after database writes return", async () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => values.delete(key),
    },
  });
  await saveWorkspace(DEFAULT_SESSION);
  const database = globalThis.indexedDB;
  const storage = globalThis.localStorage;
  storage.setItem = (key, value) => {
    if (key.startsWith("plantuml-studio.workspace.recovery.v6")) throw new Error("Quota");
    values.set(key, value);
  };
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: {
      open() {
        throw new Error("Unavailable");
      },
    },
  });
  await saveWorkspace({
    ...DEFAULT_SESSION,
    documents: [{ ...DEFAULT_SESSION.documents[0]!, source: "NEWEST FALLBACK" }],
  });
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: database });
  expect((await loadWorkspace()).documents[0]!.source).toBe("NEWEST FALLBACK");
});

it("settles an unresponsive database open with in-memory recovery", async () => {
  vi.useFakeTimers();
  try {
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: { open: () => ({}) } });
    const restored = loadWorkspace();
    await vi.advanceTimersByTimeAsync(3001);
    expect(await restored).toEqual(DEFAULT_SESSION);
  } finally {
    vi.useRealTimers();
  }
});

it("closes Saturday and Sunday in new diagrams by default", () => {
  expect(DEFAULT_SOURCE).toContain("saturday are closed\nsunday are closed");
  expect(DEFAULT_SESSION.documents[0]?.source).toBe(DEFAULT_SOURCE);
});

describe("normalizeWorkspace", () => {
  it("fills fields added after an older snapshot", () => {
    const workspace = normalizeWorkspace({ source: "@startgantt\n@endgantt", viewMode: "code" });
    expect(workspace.fileName).toBe("untitled.pumlu");
    expect(workspace.cursor).toEqual({ line: 1, column: 1 });
    expect(workspace.viewMode).toBe("code");
  });

  it("clamps persisted layout values", () => {
    expect(normalizeWorkspace({ splitPercent: 500, zoom: 0 }).splitPercent).toBe(80);
    expect(normalizeWorkspace({ zoom: 9 }).zoom).toBe(9);
    expect(normalizeWorkspace({ zoom: 15 }).zoom).toBe(10);
  });

  it("falls back safely for invalid values", () => {
    expect(normalizeWorkspace(null)).toBe(DEFAULT_WORKSPACE);
  });
});

describe("normalizeSession", () => {
  it("migrates a legacy single-document workspace", () => {
    const session = normalizeSession({
      source: "@startgantt\n@endgantt",
      fileName: "legacy.puml",
      dirty: true,
      viewMode: "code",
    });
    expect(session.documents).toHaveLength(1);
    expect(activeWorkspace(session)).toMatchObject({ fileName: "legacy.puml", dirty: true, viewMode: "code" });
  });

  it("restores multiple documents and a valid active tab", () => {
    const session = normalizeSession({
      version: 5,
      documents: [
        { id: "a", source: "A", fileName: "a.puml" },
        { id: "b", source: "B", fileName: "b.puml" },
      ],
      activeDocumentId: "b",
      viewMode: "split",
    });
    expect(session.documents.map((item) => item.id)).toEqual(["a", "b"]);
    expect(activeWorkspace(session).source).toBe("B");
  });

  it("restores forecast settings and drops invalid remaining-work values", () => {
    const session = normalizeSession({
      version: 7,
      documents: [
        {
          id: "gantt",
          source: "@startgantt\n@endgantt",
          fileName: "plan.pumlu",
          progressForecast: {
            enabled: true,
            asOf: "2026-09-29",
            timeZone: "Europe/Stockholm",
            remainingDays: { design: 3, invalid: -2 },
          },
        },
      ],
      activeDocumentId: "gantt",
    });
    expect(session.documents[0]?.progressForecast).toEqual({
      enabled: true,
      asOf: "2026-09-29",
      timeZone: "Europe/Stockholm",
      remainingDays: { design: 3 },
    });
    const invalid = normalizeSession({
      version: 7,
      documents: [
        {
          id: "gantt",
          source: "@startgantt\n@endgantt",
          progressForecast: { enabled: true, asOf: "2026-02-30", timeZone: "Made/Up", remainingDays: {} },
        },
      ],
    });
    expect(invalid.documents[0]?.progressForecast).toEqual({ enabled: true, remainingDays: {} });
  });

  it("restores WBS documents as a first-class diagram kind", () => {
    const session = normalizeSession({
      version: 5,
      documents: [{ id: "wbs", source: "@startwbs\n* Project\n@endwbs", fileName: "plan.puml" }],
      activeDocumentId: "wbs",
    });
    expect(session.documents[0]?.diagramKind).toBe("wbs");
  });

  it("migrates dependencies in every open Gantt document once", () => {
    const first =
      "@startgantt\n[Frontend] starts at [Testing]'s end\n[Frontend] lasts 3 days\n[Testing] lasts 2 days\n@endgantt";
    const second = "@startgantt\n[A] lasts 1 day\n[B] starts at [A]'s end\n[B] lasts 1 day\n@endgantt";
    const session = normalizeSession({
      version: 4,
      documents: [
        { id: "first", source: first, fileName: "first.puml", dirty: false },
        { id: "second", source: second, fileName: "second.puml", dirty: false },
        { id: "sequence", source: "@startuml\nA -> B\n@enduml", fileName: "sequence.puml", dirty: false },
      ],
      activeDocumentId: "first",
    });

    expect(session.version).toBe(7);
    expect(session.documents[0]?.source.indexOf("[Frontend] starts at [Testing]'s end")).toBeGreaterThan(
      session.documents[0]?.source.indexOf("[Testing] lasts 2 days") ?? -1,
    );
    expect(session.documents[1]?.source.indexOf("[B] starts at [A]'s end")).toBeGreaterThan(
      session.documents[1]?.source.indexOf("[B] lasts 1 day") ?? -1,
    );
    expect(session.documents.map((document) => document.dirty)).toEqual([true, true, false]);
    expect(normalizeSession(session)).toEqual(session);
  });

  it("removes invalid diagram-wide direction commands from every open WBS document", () => {
    const session = normalizeSession({
      version: 5,
      documents: [
        { id: "left", source: "@startwbs\nleft side\n* Project\n@endwbs", fileName: "left.puml" },
        {
          id: "legacy",
          source: "@startwbs\nleft to right direction\n* Project\n@endwbs",
          fileName: "legacy.puml",
        },
      ],
      activeDocumentId: "left",
    });

    expect(session.documents.map((document) => document.source)).toEqual([
      "@startwbs\n* Project\n@endwbs",
      "@startwbs\n* Project\n@endwbs",
    ]);
    expect(session.documents.every((document) => document.dirty)).toBe(true);
    expect(migrateInvalidWbsDirection(session.documents[0]!.source)).toBe(session.documents[0]!.source);
  });
});

describe("migrateGanttDependencyPlacement", () => {
  it("moves attached dependency notes with the constraint and leaves arrow shorthand unchanged", () => {
    const source = `@startgantt
[B] starts at [A]'s end
note bottom
Handoff
end note
[B] lasts 2 days
[A] lasts 3 days
[A] -> [B]
@endgantt`;
    const changed = migrateGanttDependencyPlacement(source);

    expect(changed).toContain("[A] -> [B]\n[B] starts at [A]'s end\nnote bottom\nHandoff\nend note\n@endgantt");
  });
});

describe("documentDisplayNames", () => {
  it("numbers duplicate filenames in their persisted tab order", () => {
    const names = documentDisplayNames([
      { id: "a", fileName: "plan.puml" },
      { id: "b", fileName: "notes.puml" },
      { id: "c", fileName: "plan.puml" },
    ]);
    expect([...names.values()]).toEqual(["plan.puml (1)", "notes.puml", "plan.puml (2)"]);
  });
});

describe("workspace persistence", () => {
  it("round-trips multiple tabs and their document-local state through IndexedDB", async () => {
    const session: WorkspaceSession = {
      version: 7,
      startupMode: "restore",
      activeDocumentId: "second",
      viewMode: "diagram",
      splitPercent: 63,
      theme: "dark",
      advancedMode: true,
      defaultDiagramTheme: "",
      onboarded: true,
      documents: [
        {
          id: "first",
          historyId: "history-first",
          diagramKind: "gantt",
          source: "@startgantt\n[A] lasts 2 days\n@endgantt",
          fileName: "first.puml",
          dirty: false,
          zoom: 1,
          cursor: { line: 2, column: 4 },
        },
        {
          id: "second",
          historyId: "history-second",
          diagramKind: "gantt",
          source: "@startgantt\n[B] lasts 3 days\n@endgantt",
          fileName: "second.puml",
          dirty: true,
          zoom: 1.5,
          cursor: { line: 2, column: 8 },
        },
      ],
    };
    await saveWorkspace(session);
    await expect(loadWorkspace()).resolves.toEqual(session);
  });

  it("prefers the synchronous recovery snapshot after an immediate edit", async () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const before = { ...DEFAULT_SESSION, theme: "light" as const };
    const after = {
      ...before,
      documents: before.documents.map((document) => ({ ...document, source: "immediate edit", dirty: true })),
    };
    await saveWorkspace(before);
    saveWorkspaceRecovery(after);
    await expect(loadWorkspace()).resolves.toEqual(after);
  });

  it("falls back to the newer IndexedDB session when the recovery copy exceeds quota", async () => {
    const values = new Map<string, string>();
    let quotaExceeded = false;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          if (quotaExceeded) throw new DOMException("Quota exceeded", "QuotaExceededError");
          values.set(key, value);
        },
        removeItem: (key: string) => values.delete(key),
      },
    });
    const before = { ...DEFAULT_SESSION, theme: "light" as const };
    const after = {
      ...before,
      documents: before.documents.map((document) => ({ ...document, source: "large edit", dirty: true })),
    };
    await saveWorkspace(before);
    quotaExceeded = true;
    expect(saveWorkspaceRecovery(after)).toBe(false);
    await expect(saveWorkspace(after)).resolves.toBeUndefined();
    await expect(loadWorkspace()).resolves.toEqual(after);
  });

  it("removes plaintext for a document before encryption is claimed", async () => {
    const privateDocument = {
      ...DEFAULT_SESSION.documents[0]!,
      id: "private",
      source: "PRIVATE-PERSISTENCE-SENTINEL",
      fileName: "private.pumlu",
    };
    await saveWorkspace({ ...DEFAULT_SESSION, documents: [DEFAULT_SESSION.documents[0]!, privateDocument] });
    await removePersistedDocument(privateDocument.id);
    const persisted = await loadWorkspace();
    expect(persisted.documents).toHaveLength(1);
    expect(JSON.stringify(persisted)).not.toContain("PRIVATE-PERSISTENCE-SENTINEL");
  });
});

describe("document versions", () => {
  it("persists distinct version events even when their content is identical", async () => {
    await createDocumentVersion({
      historyId: "history-a",
      source: "first",
      fileName: "a.puml",
      diagramKind: "gantt",
      reason: "collaboration",
      author: { id: "alice-id", name: "Alice", color: "#2563eb" },
      // Explicit times: two versions created within the same millisecond would sort arbitrarily.
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    await createDocumentVersion({
      historyId: "history-a",
      source: "first",
      fileName: "a.puml",
      diagramKind: "gantt",
      reason: "manual",
      label: "Baseline",
      createdAt: "2026-01-01T00:00:01.000Z",
    });
    await createDocumentVersion({
      historyId: "history-b",
      source: "other",
      fileName: "b.puml",
      diagramKind: "gantt",
      reason: "saved",
    });
    const versions = await loadDocumentVersions("history-a");
    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({
      source: "first",
      label: "Baseline",
      pinned: true,
    });
    expect(versions[1]).toMatchObject({ author: { id: "alice-id", name: "Alice", color: "#2563eb" } });
  });

  it("renames, pins, deletes, and retains only the newest automatic versions", async () => {
    const historyId = "history-retention";
    for (let index = 0; index < 32; index += 1) {
      await createDocumentVersion({
        historyId,
        source: `source-${index}`,
        fileName: "retention.puml",
        diagramKind: "gantt",
        reason: "saved",
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      });
    }
    let versions = await loadDocumentVersions(historyId);
    expect(versions).toHaveLength(30);
    expect(versions.at(-1)?.source).toBe("source-2");

    const selected = versions.at(-1)!;
    await updateDocumentVersion(selected.id, { label: "Keep this", pinned: true });
    await createDocumentVersion({
      historyId,
      source: "source-32",
      fileName: "retention.puml",
      diagramKind: "gantt",
      reason: "saved",
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 32)).toISOString(),
    });
    versions = await loadDocumentVersions(historyId);
    expect(versions).toHaveLength(31);
    expect(versions.find((version) => version.id === selected.id)).toMatchObject({ label: "Keep this", pinned: true });

    await deleteDocumentVersion(selected.id);
    expect((await loadDocumentVersions(historyId)).some((version) => version.id === selected.id)).toBe(false);
  });

  it("keeps only the newest automatic restore points protected", async () => {
    const historyId = "history-restore-points";
    for (let index = 0; index < 45; index += 1) {
      await createDocumentVersion({
        historyId,
        source: `restore-${index}`,
        fileName: "restore.puml",
        diagramKind: "gantt",
        reason: "before-restore",
        pinned: true,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      });
    }
    await createDocumentVersion({
      historyId,
      source: "manual",
      fileName: "restore.puml",
      diagramKind: "gantt",
      reason: "manual",
      createdAt: new Date(Date.UTC(2025, 0, 1)).toISOString(),
    });
    const versions = await loadDocumentVersions(historyId);
    expect(versions.some((version) => version.reason === "manual")).toBe(true);
    expect(versions.filter((version) => version.reason === "before-restore")).toHaveLength(40);
    expect(versions.at(-2)?.source).toBe("restore-5");
  });

  it("reports unavailable persistent version storage clearly", async () => {
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined });
    await expect(loadDocumentVersions("history-unavailable")).rejects.toThrow(
      "Persistent storage is unavailable in this browser",
    );
  });
});

describe("storage health reporting", () => {
  it("reports a workspace save that fails in both browser stores", async () => {
    const { getStorageHealth, resetStorageHealth } = await import("./storage-health");
    resetStorageHealth();
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        },
        removeItem: () => undefined,
      },
    });
    await expect(saveWorkspace(DEFAULT_SESSION)).rejects.toThrow();
    expect(getStorageHealth().failing).toEqual(["workspace"]);
    resetStorageHealth();
  });
});

describe("enabling memory-only history", () => {
  it("never persists a version recorded while plaintext history is being removed", async () => {
    const historyId = "history-encrypting";
    const base = { historyId, fileName: "secret.puml", diagramKind: "gantt" as const, reason: "saved" as const };
    await createDocumentVersion({ ...base, source: "before", createdAt: "2026-01-01T00:00:00.000Z" });
    const enabling = enableMemoryOnlyHistory(historyId);
    await createDocumentVersion({ ...base, source: "during", createdAt: "2026-01-01T00:00:01.000Z" });
    await enabling;
    expect((await loadDocumentVersions(historyId)).map((version) => version.source)).toEqual(["during", "before"]);
    discardMemoryOnlyHistory(historyId);
    expect(await loadDocumentVersions(historyId)).toEqual([]);
  });
});

it("retains explicit file-copy outcomes without guessing older recovery provenance", () => {
  for (const fileCopy of ["new", "file", "download"] as const) {
    const document = { ...DEFAULT_SESSION.documents[0]!, fileCopy };
    expect(normalizeSession({ ...DEFAULT_SESSION, documents: [document] }).documents[0]?.fileCopy).toBe(fileCopy);
  }
  const { fileCopy: _fileCopy, ...older } = DEFAULT_SESSION.documents[0]!;
  expect(normalizeSession({ ...DEFAULT_SESSION, documents: [older] }).documents[0]?.fileCopy).toBeUndefined();
});

it("disambiguates provisional diagram names independently from file names", () => {
  const documents = [
    {
      id: "one",
      fileName: "untitled.pumlu",
      fileCopy: "new" as const,
      diagramKind: "gantt" as const,
      displayName: "Release plan",
    },
    { id: "two", fileName: "untitled.pumlu", fileCopy: "new" as const, diagramKind: "sequence" as const },
    {
      id: "three",
      fileName: "untitled.pumlu",
      fileCopy: "new" as const,
      diagramKind: "gantt" as const,
      displayName: "Release plan",
    },
  ];
  expect([...documentDisplayNames(documents).values()]).toEqual([
    "Release plan (1)",
    "Sequence diagram",
    "Release plan (2)",
  ]);
  expect(documentDisplayNames([{ ...documents[1]!, fileName: "Payment flow" }]).get("two")).toBe("Payment flow");
  const restored = normalizeSession({
    ...DEFAULT_SESSION,
    documents: documents.map((item) => ({ ...DEFAULT_SESSION.documents[0], ...item })),
  });
  expect(restored.documents[0]?.displayName).toBe("Release plan");
  expect(restored.documents[0]?.fileName).toBe("untitled.pumlu");
});

it("retains initialized zoom and pending initial fit separately across recovery", () => {
  for (const zoomInitialized of [true, false]) {
    const session = normalizeSession({
      ...DEFAULT_SESSION,
      documents: [{ ...DEFAULT_SESSION.documents[0]!, zoom: 1.65, zoomInitialized }],
    });
    expect(session.documents[0]?.zoom).toBe(1.65);
    expect(session.documents[0]?.zoomInitialized).toBe(zoomInitialized);
  }
  const { zoomInitialized: _initialized, ...older } = DEFAULT_SESSION.documents[0]!;
  const session = normalizeSession({ ...DEFAULT_SESSION, documents: [{ ...older, zoom: 1.65 }] });
  expect(session.documents[0]?.zoomInitialized).toBeUndefined();
  expect(session.documents[0]?.zoom).toBe(1.65);
});
