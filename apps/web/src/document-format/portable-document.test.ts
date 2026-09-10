import { describe, expect, it } from "vitest";
import { decodeDocument, encodeDocument } from "@plantuml-studio/document-format";
import { assemblePortableDocument } from "./portable-document";

describe("portable document assembly", () => {
  it("carries current source, history, settings, and baseline across a round trip", async () => {
    const local = {
      id: "local-v1",
      portableId: "22222222-2222-4222-8222-222222222222",
      historyId: "h",
      source: "old",
      sourceHash: "old-hash",
      fileName: "plan.pumlu",
      diagramKind: "gantt" as const,
      createdAt: "2026-09-09T12:00:00.000Z",
      reason: "manual" as const,
      pinned: true,
    };
    const document = await assemblePortableDocument(
      {
        id: "tab",
        historyId: "h",
        source: "current",
        diagramKind: "gantt",
        fileName: "plan.pumlu",
        dirty: true,
        zoom: 1,
        cursor: { line: 1, column: 1 },
        baselineVersionId: local.id,
        portableDocumentId: "11111111-1111-4111-8111-111111111111",
      },
      [local],
      { resourceCapacities: { Alice: 80 } },
    );
    const decoded = await decodeDocument((await encodeDocument(document)).bytes);
    expect(decoded.document.current.source).toBe("current");
    expect(decoded.contents.get(decoded.document.versions[0]!.contentId)).toBe("old");
    expect(decoded.document.settings.resourceCapacities).toEqual({ Alice: 80 });
    expect(decoded.document.current.baselineVersionId).toBe(local.portableId);
  });
});
