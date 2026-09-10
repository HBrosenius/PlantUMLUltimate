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
