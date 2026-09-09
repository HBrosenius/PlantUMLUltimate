import { describe, expect, it } from "vitest";
import { DEFAULT_SESSION } from "./workspace-storage";
import { parseWorkspaceBackup, parseWorkspaceBackupBundle, serializeWorkspaceBackup } from "./workspace-backup";

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
      [{
        id: "private-version", historyId: encrypted.historyId, source: sentinel,
        sourceHash: "hash", fileName: encrypted.fileName, diagramKind: "gantt",
        createdAt: "2026-09-09T12:00:00.000Z", reason: "manual", label: "PRIVATE-LABEL", pinned: true,
      }],
    );
    expect(backup).not.toContain(sentinel);
    expect(backup).not.toContain("PRIVATE-LABEL");
    expect(backup).not.toContain("private-title.pumlu");
    expect(JSON.parse(backup).omittedEncryptedDocuments).toBe(1);
  });
});
