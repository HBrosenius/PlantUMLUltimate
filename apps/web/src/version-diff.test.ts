import { describe, expect, it } from "vitest";
import { diffVersionSources } from "./version-diff";

describe("diffVersionSources", () => {
  it("identifies unchanged, removed, and added lines", () => {
    expect(diffVersionSources("a\nb\nc", "a\nchanged\nc")).toEqual([
      { kind: "equal", left: "a", right: "a", leftNumber: 1, rightNumber: 1 },
      { kind: "added", right: "changed", rightNumber: 2 },
      { kind: "removed", left: "b", leftNumber: 2 },
      { kind: "equal", left: "c", right: "c", leftNumber: 3, rightNumber: 3 },
    ]);
  });

  it("falls back to a bounded coarse diff for very large changed regions", () => {
    const left = ["same", ...Array.from({ length: 2_001 }, (_, index) => `left ${index}`), "end"].join("\n");
    const right = ["same", ...Array.from({ length: 2_001 }, (_, index) => `right ${index}`), "end"].join("\n");
    const diff = diffVersionSources(left, right);
    expect(diff[0]).toMatchObject({ kind: "equal", left: "same" });
    expect(diff.at(-1)).toMatchObject({ kind: "equal", left: "end" });
    expect(diff.filter((line) => line.kind === "removed")).toHaveLength(2_001);
    expect(diff.filter((line) => line.kind === "added")).toHaveLength(2_001);
  });
});
