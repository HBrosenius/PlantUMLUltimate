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
});
