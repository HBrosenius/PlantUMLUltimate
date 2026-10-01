import { describe, expect, it } from "vitest";
import { DocumentFormatError, planRetention, type RetentionVersion } from "./index";

function version(sequence: number, source = String(sequence), pinned = false): RetentionVersion {
  return {
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    ...(sequence ? { parentVersionId: `00000000-0000-4000-8000-${String(sequence - 1).padStart(12, "0")}` } : {}),
    source,
    sourceHash: source.padEnd(64, "0").slice(0, 64),
    createdAt: `2026-09-09T12:00:${String(sequence).padStart(2, "0")}.000Z`,
    sequence,
    reason: "saved",
    pinned,
    diagramKind: "gantt",
  };
}

describe("planRetention", () => {
  it("keeps protected entries then fills newest-first in stable sequence order", () => {
    const result = planRetention([version(3), version(0, "zero", true), version(2), version(1)], {
      maxVersions: 3,
      maxLogicalBytes: 1024 * 1024,
    });
    expect(result.retained.map((item) => item.sequence)).toEqual([0, 2, 3]);
    expect(result.droppedIds).toEqual([version(1).id]);
  });

  it("protects and remaps the baseline and nearest retained parent", () => {
    const result = planRetention(
      [version(0), version(1), version(2), version(3)],
      {
        maxVersions: 2,
        maxLogicalBytes: 1024 * 1024,
      },
      version(1).id,
    );
    expect(result.retained.map((item) => item.sequence)).toEqual([1, 3]);
    expect(result.retained[1]).toMatchObject({ parentVersionId: version(1).id, ancestryTruncated: true });
  });

  it("counts distinct sources once and rejects protected overflow", () => {
    const repeated = [version(0, "same", true), version(1, "same", true), version(2, "same", true)];
    expect(() => planRetention(repeated, { maxVersions: 2, maxLogicalBytes: 1024 * 1024 })).toThrowError(
      DocumentFormatError,
    );
    try {
      planRetention(repeated, { maxVersions: 2, maxLogicalBytes: 1024 * 1024 });
    } catch (error) {
      expect((error as DocumentFormatError).code).toBe("protected-history-overflow");
    }
  });
});

describe("retention selection at scale", () => {
  // The previous quadratic selection, kept as a reference for equivalence.
  const reference = (versions: RetentionVersion[], maxVersions: number, maxLogicalBytes: number) => {
    const encoder = new TextEncoder();
    const bytes = (items: RetentionVersion[]) => {
      const sources = new Map<string, number>();
      for (const item of items) sources.set(item.sourceHash, encoder.encode(item.source).byteLength);
      return (
        items.reduce((total, item) => {
          const { source: _source, ...metadata } = item;
          return total + encoder.encode(JSON.stringify(metadata)).byteLength;
        }, 0) + [...sources.values()].reduce((total, size) => total + size, 0)
      );
    };
    const ordered = [...versions].sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
    const selected = new Set(ordered.filter((item) => item.pinned).map((item) => item.id));
    for (const candidate of [...ordered].reverse()) {
      if (selected.has(candidate.id)) continue;
      const next = ordered.filter((item) => selected.has(item.id) || item.id === candidate.id);
      if (next.length <= maxVersions && bytes(next) <= maxLogicalBytes) selected.add(candidate.id);
    }
    return ordered.filter((item) => selected.has(item.id)).map((item) => item.id);
  };

  it("selects the same versions as the reference algorithm", () => {
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let round = 0; round < 20; round += 1) {
      const versions = Array.from({ length: 40 }, (_, index) =>
        version(
          index + 1,
          "x".repeat(1 + Math.floor(random() * 400)) + String(Math.floor(random() * 6)),
          random() < 0.1,
        ),
      );
      const maxVersions = 5 + Math.floor(random() * 30);
      const maxLogicalBytes = 3_000 + Math.floor(random() * 12_000);
      const policy = { maxVersions, maxLogicalBytes };
      let expected: string[] | undefined;
      try {
        expected = reference(versions, maxVersions, maxLogicalBytes);
        expect(planRetention(versions, policy).retained.map((item) => item.id)).toEqual(expected);
      } catch (error) {
        if (!(error instanceof DocumentFormatError)) throw error;
      }
    }
  });
});
