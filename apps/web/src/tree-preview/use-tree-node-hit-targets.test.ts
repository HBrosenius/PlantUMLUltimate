import { describe, expect, it } from "vitest";
import { createTreeLabelMatcher } from "./use-tree-node-hit-targets";

const texts = (...values: string[]) => values.map((textContent) => ({ textContent }));

describe("createTreeLabelMatcher", () => {
  it("matches a trimmed label once, so duplicate labels go to successive nodes", () => {
    const rendered = texts("Root", "Pros ", "Cons", "Pros", "Cons");
    const match = createTreeLabelMatcher(rendered);
    expect(match("Root")).toEqual([rendered[0]]);
    expect(match("Pros")?.[0]).toBe(rendered[1]);
    expect(match("Cons")?.[0]).toBe(rendered[2]);
    expect(match("Pros")?.[0]).toBe(rendered[3]);
    expect(match("Cons")?.[0]).toBe(rendered[4]);
    expect(match("Pros")).toBeUndefined();
  });

  it("matches a multi-line label as a run of consecutive unclaimed texts", () => {
    const rendered = texts("line one", "Other", "line one", "line two", "line two");
    const match = createTreeLabelMatcher(rendered);
    expect(match("line one\nline two")).toEqual([rendered[2], rendered[3]]);
    expect(match("line one")?.[0]).toBe(rendered[0]);
    expect(match("line one\nline two")).toBeUndefined();
  });

  it("returns nothing for a label that is not rendered", () => {
    expect(createTreeLabelMatcher(texts("A"))("B")).toBeUndefined();
    expect(createTreeLabelMatcher(texts("A"))("A\nB")).toBeUndefined();
  });
});
