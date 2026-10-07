import { describe, expect, it } from "vitest";
import { DEFAULT_SESSION } from "./workspace-storage";
import {
  parseWorkspaceBackup,
  parseWorkspaceBackupBundle,
  prepareWorkspaceRestore,
  serializeWorkspaceBackup,
} from "./workspace-backup";

describe("workspace backups", () => {
  it("round-trips every open document and shared setting", () => {
    const session = {
      ...DEFAULT_SESSION,
      theme: "dark" as const,
      documents: [
        ...DEFAULT_SESSION.documents,
        {
          ...DEFAULT_SESSION.documents[0]!,
          id: "second",
          historyId: "history-second",
          fileName: "second.puml",
          source: "@startgantt\n[B] lasts 2 days\n@endgantt",
        },
      ],
      activeDocumentId: "second",
    };
    expect(parseWorkspaceBackup(serializeWorkspaceBackup(session, "2026-08-20T12:00:00.000Z"))).toEqual(session);
  });
  it("rejects malformed and unrelated JSON", () => {
    expect(() => parseWorkspaceBackup("not json")).toThrow("valid JSON");
    expect(() => parseWorkspaceBackup('{"version":1}')).toThrow("not a supported");
  });

  it.each([
    {},
    { documents: [] },
    { documents: [null] },
    {
      documents: [DEFAULT_SESSION.documents[0], { id: "broken", source: 12 }],
    },
    { documents: [DEFAULT_SESSION.documents[0], DEFAULT_SESSION.documents[0]] },
  ])("rejects malformed sessions without substituting or discarding documents: %j", (session) => {
    expect(() =>
      parseWorkspaceBackupBundle(
        JSON.stringify({
          kind: "plantuml-studio-workspace",
          version: 2,
          session,
          versions: [],
        }),
      ),
    ).toThrow();
  });

  it("rejects malformed history containers and null authors with a useful error", () => {
    const backup = JSON.parse(serializeWorkspaceBackup(DEFAULT_SESSION));
    for (const versions of [null, {}, "history"]) {
      expect(() => parseWorkspaceBackupBundle(JSON.stringify({ ...backup, versions }))).toThrow(
        "invalid document history",
      );
    }
    expect(() => parseWorkspaceBackupBundle(JSON.stringify({ ...backup, versions: [{ author: null }] }))).toThrow(
      "invalid document history",
    );
  });

  it.each([
    { resourceCapacities: { Alex: "many" } },
    { progressForecast: { enabled: true, remainingDays: { task: -2 } } },
    { wbsGanttLinks: [{ wbsAlias: "plan" }] },
    { linkedWbsDocumentId: "missing" },
    { cursor: { line: "one", column: 1 } },
    { historyId: {} },
  ])("rejects malformed document metadata instead of silently dropping it: %j", (settings) => {
    const session = { ...DEFAULT_SESSION, documents: [{ ...DEFAULT_SESSION.documents[0]!, ...settings }] };
    expect(() =>
      parseWorkspaceBackupBundle(
        JSON.stringify({
          kind: "plantuml-studio-workspace",
          version: 2,
          session,
          versions: [],
        }),
      ),
    ).toThrow();
  });

  it("accepts valid forecast settings regardless of JSON property order", () => {
    const progressForecast = { remainingDays: { task: 2 }, enabled: true };
    const session = { ...DEFAULT_SESSION, documents: [{ ...DEFAULT_SESSION.documents[0]!, progressForecast }] };
    expect(
      parseWorkspaceBackupBundle(serializeWorkspaceBackup(session)).session.documents[0]!.progressForecast,
    ).toEqual(progressForecast);
  });

  it("preserves linked diagrams and history while isolating restore identifiers", () => {
    const wbs = {
      ...DEFAULT_SESSION.documents[0]!,
      id: "wbs",
      historyId: "history-wbs",
      diagramKind: "wbs" as const,
      source: "@startwbs\n* Plan\n@endwbs",
    };
    const gantt = {
      ...DEFAULT_SESSION.documents[0]!,
      id: "gantt",
      historyId: "history-gantt",
      linkedWbsDocumentId: "wbs",
      wbsGanttLinks: [{ wbsAlias: "plan", ganttAlias: "task" }],
      baselineVersionId: "v1",
    };
    const session = { ...DEFAULT_SESSION, documents: [wbs, gantt], activeDocumentId: "gantt" };
    const versions = [
      {
        id: "v1",
        historyId: gantt.historyId,
        source: gantt.source,
        sourceHash: "hash",
        fileName: gantt.fileName,
        diagramKind: gantt.diagramKind,
        createdAt: "2026-10-06T08:00:00Z",
        reason: "manual" as const,
        pinned: true,
      },
      {
        id: "v2",
        historyId: gantt.historyId,
        source: gantt.source,
        sourceHash: "hash",
        fileName: gantt.fileName,
        diagramKind: gantt.diagramKind,
        createdAt: "2026-10-06T09:00:00Z",
        reason: "manual" as const,
        pinned: false,
        parentVersionId: "v1",
      },
    ];
    const restored = prepareWorkspaceRestore(parseWorkspaceBackupBundle(serializeWorkspaceBackup(session, versions)));
    expect(restored.session.documents[1]!.linkedWbsDocumentId).toBe(restored.session.documents[0]!.id);
    expect(restored.session.documents[1]!.wbsGanttLinks).toEqual(gantt.wbsGanttLinks);
    expect(restored.session.activeDocumentId).toBe(restored.session.documents[1]!.id);
    expect(restored.session.documents[1]!.baselineVersionId).toBe(restored.versions[0]!.id);
    expect(restored.versions[1]!.parentVersionId).toBe(restored.versions[0]!.id);
    expect(restored.versions[0]!.historyId).toBe(restored.session.documents[1]!.historyId);
    expect(restored.versions[0]!.id).not.toBe("v1");
    expect(restored.session.documents.every((document) => document.dirty)).toBe(true);
    expect(session.documents[1]!.id).toBe("gantt");
  });
  it("includes document versions while still accepting version 1 backups", () => {
    const version = {
      id: "v1",
      historyId: "history-welcome",
      source: "source",
      sourceHash: "hash",
      fileName: "untitled.puml",
      diagramKind: "gantt" as const,
      createdAt: "2026-08-24T08:00:00.000Z",
      reason: "manual" as const,
      pinned: true,
    };
    expect(parseWorkspaceBackupBundle(serializeWorkspaceBackup(DEFAULT_SESSION, [version])).versions).toEqual([
      version,
    ]);
    const legacy = JSON.stringify({
      kind: "plantuml-studio-workspace",
      version: 1,
      createdAt: "2026-08-24T08:00:00.000Z",
      session: DEFAULT_SESSION,
    });
    expect(parseWorkspaceBackupBundle(legacy)).toEqual({ session: DEFAULT_SESSION, versions: [] });
  });

  it("rejects malformed or cross-document version history", () => {
    const invalidVersion = {
      id: "v1",
      historyId: "history-from-another-workspace",
      source: "source",
      sourceHash: "hash",
      fileName: "untitled.puml",
      diagramKind: "gantt",
      createdAt: "not-a-date",
      reason: "manual",
      pinned: "yes",
    };
    const backup = JSON.parse(serializeWorkspaceBackup(DEFAULT_SESSION)) as Record<string, unknown>;
    backup.versions = [invalidVersion];
    expect(() => parseWorkspaceBackupBundle(JSON.stringify(backup))).toThrow("invalid document history");
  });

  it("omits every encrypted plaintext field and its history", () => {
    const sentinel = "PRIVATE-SOURCE-SENTINEL";
    const encrypted = {
      ...DEFAULT_SESSION.documents[0]!,
      id: "private-document",
      historyId: "private-history",
      source: sentinel,
      fileName: "private-title.pumlu",
      encrypted: true,
    };
    const backup = serializeWorkspaceBackup(
      { ...DEFAULT_SESSION, documents: [DEFAULT_SESSION.documents[0]!, encrypted] },
      [
        {
          id: "private-version",
          historyId: encrypted.historyId,
          source: sentinel,
          sourceHash: "hash",
          fileName: encrypted.fileName,
          diagramKind: "gantt",
          createdAt: "2026-09-09T12:00:00.000Z",
          reason: "manual",
          label: "PRIVATE-LABEL",
          pinned: true,
        },
      ],
    );
    expect(backup).not.toContain(sentinel);
    expect(backup).not.toContain("PRIVATE-LABEL");
    expect(backup).not.toContain("private-title.pumlu");
    expect(JSON.parse(backup).omittedEncryptedDocuments).toBe(1);
  });
});
