import { describe, expect, it } from "vitest";
import { resolveThreeWayMerge, threeWayMerge } from "./external-file-merge";

describe("threeWayMerge", () => {
  it("combines independent local and external edits", () => {
    const merge = threeWayMerge("one\ntwo\nthree", "ONE\ntwo\nthree", "one\ntwo\nTHREE");
    expect(merge.conflicts).toHaveLength(0);
    expect(resolveThreeWayMerge(merge, [])).toBe("ONE\ntwo\nTHREE");
  });

  it("recognizes the same edit on both sides", () => {
    const merge = threeWayMerge("one\ntwo", "one\nTWO", "one\nTWO");
    expect(merge.conflicts).toHaveLength(0);
    expect(resolveThreeWayMerge(merge, [])).toBe("one\nTWO");
  });

  it("offers both versions of an overlapping edit", () => {
    const merge = threeWayMerge("one\ntwo\nthree", "one\nLOCAL\nthree", "one\nEXTERNAL\nthree");
    expect(merge.conflicts).toEqual([{ base: ["two"], local: ["LOCAL"], external: ["EXTERNAL"] }]);
    expect(resolveThreeWayMerge(merge, ["local"])).toBe("one\nLOCAL\nthree");
    expect(resolveThreeWayMerge(merge, ["external"])).toBe("one\nEXTERNAL\nthree");
  });

  it("merges independent insertions and deletions", () => {
    const merge = threeWayMerge("one\ntwo\nthree", "zero\none\ntwo\nthree", "one\nthree");
    expect(merge.conflicts).toHaveLength(0);
    expect(resolveThreeWayMerge(merge, [])).toBe("zero\none\nthree");
  });

  it("preserves CRLF content as logical lines without creating duplicate changes", () => {
    const merge = threeWayMerge("one\r\ntwo", "ONE\r\ntwo", "one\r\nTWO");
    expect(merge.conflicts).toHaveLength(0);
    expect(resolveThreeWayMerge(merge, [])).toBe("ONE\r\nTWO");
  });
});
