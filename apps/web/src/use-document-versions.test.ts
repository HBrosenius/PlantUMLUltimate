import { describe, expect, it } from "vitest";
import {
  documentVersionDisplayName,
  ensureInitialDocumentVersion,
  recordVersionHistoryReview,
} from "./use-document-versions";

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

describe("version history review checkpoints", () => {
  it("records the source reviewed by the user for the next comparison", async () => {
    let captured: Parameters<typeof import("./workspace-storage").createDocumentVersion>[0] | undefined;
    const document = {
      historyId: "history",
      source: "after",
      fileName: "diagram.puml",
      diagramKind: "gantt" as const,
    };
    await recordVersionHistoryReview(document, [{ id: "before", source: "before" } as never], async (input) => {
      captured = input;
      return {
        ...input,
        pinned: input.pinned ?? false,
        id: "reviewed",
        sourceHash: "hash",
        createdAt: "2026-09-14T09:00:00.000Z",
      };
    });
    expect(captured).toMatchObject({
      historyId: "history",
      parentVersionId: "before",
      source: "after",
      label: "Last reviewed",
      reason: "opened",
    });
  });

  it("does not duplicate an unchanged reviewed source", async () => {
    let created = false;
    const result = await recordVersionHistoryReview(
      { historyId: "history", source: "same", fileName: "diagram.puml", diagramKind: "gantt" },
      [{ source: "same" } as never],
      async () => {
        created = true;
        return {} as never;
      },
    );
    expect(result).toBeUndefined();
    expect(created).toBe(false);
  });
});
