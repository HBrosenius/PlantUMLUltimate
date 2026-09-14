import { describe, expect, it } from "vitest";
import { documentVersionDisplayName, ensureInitialDocumentVersion } from "./use-document-versions";

describe("document version display names", () => {
  it("prefers a user-provided label", () => {
    expect(documentVersionDisplayName({ label: "Before review", createdAt: "2026-09-08T12:00:00.000Z" })).toBe(
      "Before review",
    );
  });

  it("falls back to a localized creation time", () => {
    const createdAt = "2026-09-08T12:00:00.000Z";
    expect(documentVersionDisplayName({ createdAt })).toBe(new Date(createdAt).toLocaleString());
  });
});

describe("initial document version", () => {
  it("captures the document source before Version History is opened", async () => {
    const create = async (input: Parameters<typeof import("./workspace-storage").createDocumentVersion>[0]) => ({
      ...input,
      pinned: input.pinned ?? false,
      id: "initial",
      sourceHash: "hash",
      createdAt: "2026-09-14T08:00:00.000Z",
    });
    const initial = {
      historyId: "new-document-history",
      source: "@startgantt\n[Initial] lasts 1 day\n@endgantt",
      fileName: "diagram.puml",
      diagramKind: "gantt" as const,
    };

    const version = await ensureInitialDocumentVersion(initial, async () => [], create);

    expect(version.source).toBe(initial.source);
    expect(version.label).toBe("Initial version");
  });

  it("reuses an existing first version", async () => {
    const existing = { id: "existing" } as Awaited<
      ReturnType<typeof import("./workspace-storage").createDocumentVersion>
    >;
    let created = false;
    const version = await ensureInitialDocumentVersion(
      { historyId: "existing-history", source: "changed", fileName: "diagram.puml", diagramKind: "gantt" },
      async () => [existing],
      async () => {
        created = true;
        return existing;
      },
    );
    expect(version).toBe(existing);
    expect(created).toBe(false);
  });
});
