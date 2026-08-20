import { describe, expect, it } from "vitest";
import { DEFAULT_SESSION } from "./workspace-storage";
import { parseWorkspaceBackup, serializeWorkspaceBackup } from "./workspace-backup";

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
});
