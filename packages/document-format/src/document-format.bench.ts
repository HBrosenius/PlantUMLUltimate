import { bench, describe } from "vitest";
import { encodeContentHistory, encodeDocument, hashSource, type PortableDocument } from "./index";

async function corpus(sourceBytes: number, versions: number): Promise<PortableDocument> {
  const base = "@startgantt\n" + "[Task] lasts 1 day\n".repeat(Math.ceil(sourceBytes / 20)) + "@endgantt";
  const sources = Array.from({ length: versions }, (_, index) => `${base}\n' revision ${index}`);
  const encoded = await encodeContentHistory(sources);
  return {
    schemaVersion: 1,
    documentId: "11111111-1111-4111-8111-111111111111",
    savedAt: "2026-09-09T12:00:00.000Z",
    current: { source: sources.at(-1)!, sourceHash: await hashSource(sources.at(-1)!), diagramKind: "gantt" },
    settings: { resourceCapacities: {} },
    historyPolicy: { maxVersions: Math.max(10, versions), maxLogicalBytes: 64 * 1024 * 1024 },
    versions: encoded.contentIds.map((contentId, sequence) => ({
      id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
      contentId,
      createdAt: `2026-09-09T12:00:00.${String(sequence).padStart(3, "0")}Z`,
      sequence,
      reason: "saved",
      pinned: false,
      diagramKind: "gantt",
    })),
    contents: encoded.contents,
  };
}

const small = await corpus(10_000, 10);
const medium = await corpus(100_000, 100);

describe("portable document encoding", () => {
  bench("10 KiB × 10 versions, hybrid + gzip", async () => {
    await encodeDocument(small);
  });
  bench("100 KiB × 100 versions, hybrid + gzip", async () => {
    await encodeDocument(medium);
  });
});
