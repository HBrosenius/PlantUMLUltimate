import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  activeWorkspace,
  DEFAULT_SESSION,
  DEFAULT_WORKSPACE,
  documentDisplayNames,
  createDocumentVersion,
  deleteDocumentVersion,
  loadDocumentVersions,
  loadWorkspace,
  normalizeSession,
  normalizeWorkspace,
  saveWorkspace,
  updateDocumentVersion,
  type WorkspaceSession,
} from "./workspace-storage";
import { DEFAULT_SOURCE } from "./model";

beforeEach(() => Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() }));

it("closes Saturday and Sunday in new diagrams by default", () => {
  expect(DEFAULT_SOURCE).toContain("saturday are closed\nsunday are closed");
  expect(DEFAULT_SESSION.documents[0]?.source).toBe(DEFAULT_SOURCE);
});

describe("normalizeWorkspace", () => {
  it("fills fields added after an older snapshot", () => {
    const workspace = normalizeWorkspace({ source: "@startgantt\n@endgantt", viewMode: "code" });
    expect(workspace.fileName).toBe("untitled.puml");
    expect(workspace.cursor).toEqual({ line: 1, column: 1 });
    expect(workspace.viewMode).toBe("code");
  });

  it("clamps persisted layout values", () => {
    expect(normalizeWorkspace({ splitPercent: 500, zoom: 0 }).splitPercent).toBe(80);
    expect(normalizeWorkspace({ zoom: 9 }).zoom).toBe(3);
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
      version: 4,
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
      version: 4,
      activeDocumentId: "second",
      viewMode: "diagram",
      splitPercent: 63,
      theme: "dark",
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
});

describe("document versions", () => {
  it("persists versions by history and promotes duplicate manual checkpoints", async () => {
    await createDocumentVersion({
      historyId: "history-a",
      source: "first",
      fileName: "a.puml",
      diagramKind: "gantt",
      reason: "opened",
    });
    await createDocumentVersion({
      historyId: "history-a",
      source: "first",
      fileName: "a.puml",
      diagramKind: "gantt",
      reason: "manual",
      label: "Baseline",
    });
    await createDocumentVersion({
      historyId: "history-b",
      source: "other",
      fileName: "b.puml",
      diagramKind: "gantt",
      reason: "saved",
    });
    const versions = await loadDocumentVersions("history-a");
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ source: "first", label: "Baseline", pinned: true });
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

  it("reports unavailable persistent version storage clearly", async () => {
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined });
    await expect(loadDocumentVersions("history-unavailable")).rejects.toThrow(
      "Persistent storage is unavailable in this browser",
    );
  });
});
