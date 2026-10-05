import { describe, expect, it } from "vitest";
import { isCurrentFix, type FixSnapshot } from "./source-fix-snapshot";
const fix = { from: 0, to: 10, replacement: "@startgantt", message: "Repair tag" };
const snapshot: FixSnapshot = { source: "@startgant", kind: "gantt", documentId: "one", revision: 1, fixes: [fix] };

describe("source fix snapshots", () => {
  it("permits only a suggestion from the current source revision", () => {
    expect(isCurrentFix(snapshot, snapshot, fix)).toBe(true);
    expect(isCurrentFix(snapshot, { ...snapshot, source: "' comment\n@startgant" }, fix)).toBe(false);
    expect(isCurrentFix(snapshot, { ...snapshot, revision: 2 }, fix)).toBe(false);
  });
  it("rejects a suggestion after undo restores identical text or a tab changes", () => {
    expect(isCurrentFix(snapshot, { ...snapshot, revision: 3 }, fix)).toBe(false);
    expect(isCurrentFix(snapshot, { ...snapshot, documentId: "two" }, fix)).toBe(false);
    expect(isCurrentFix(snapshot, { ...snapshot, kind: "wbs" }, fix)).toBe(false);
  });
  it("rejects unknown suggestions and invalid replacement ranges", () => {
    expect(isCurrentFix(snapshot, snapshot, { ...fix })).toBe(false);
    for (const range of [
      { from: -1, to: 1 },
      { from: 5, to: 2 },
      { from: 0, to: 100 },
    ]) {
      const invalid = { ...fix, ...range };
      const current = { ...snapshot, fixes: [invalid] };
      expect(isCurrentFix(current, current, invalid)).toBe(false);
    }
  });
});
