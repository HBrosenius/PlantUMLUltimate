import { describe, expect, it } from "vitest";
import type { PortableVersion } from "@plantuml-studio/document-format";
import { mapPortableHistoryToLocal } from "./history-mapping";

const versions: PortableVersion[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    contentId: "a".repeat(64),
    createdAt: "2026-09-09T12:00:00.000Z",
    sequence: 0,
    reason: "opened",
    pinned: false,
    diagramKind: "gantt",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    parentVersionId: "11111111-1111-4111-8111-111111111111",
    contentId: "b".repeat(64),
    createdAt: "2026-09-09T12:01:00.000Z",
    sequence: 1,
    reason: "saved",
    pinned: true,
    diagramKind: "gantt",
  },
];

describe("portable history mapping", () => {
  it("remaps parent and baseline while isolating duplicate opens", () => {
    let counter = 0;
    const ids = () => `local-${counter++}`;
    const sources = new Map([
      ["a".repeat(64), "one"],
      ["b".repeat(64), "two"],
    ]);
    const first = mapPortableHistoryToLocal(versions, sources, "plan.pumlu", versions[1]!.id, ids);
    const second = mapPortableHistoryToLocal(versions, sources, "plan.pumlu", versions[1]!.id, ids);
    expect(first.historyId).not.toBe(second.historyId);
    expect(first.versions[1]!.parentVersionId).toBe(first.versions[0]!.id);
    expect(first.baselineVersionId).toBe(first.versions[1]!.id);
    expect(first.versions.map((item) => item.id)).not.toEqual(second.versions.map((item) => item.id));
  });
});
