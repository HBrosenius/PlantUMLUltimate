import { describe, expect, it } from "vitest";
import { createTreeLabelMatcher, normalizeTreeLabel } from "./use-tree-node-hit-targets";

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

describe("createTreeLabelMatcher with runs", () => {
  it("does not join runs unless asked to, so WBS keeps its exact matching", () => {
    const rendered = texts("italic", "and", "strike");
    expect(createTreeLabelMatcher(rendered)("//italic// and --strike--")).toBeUndefined();
    expect(createTreeLabelMatcher(rendered, { matchRuns: true })("//italic// and --strike--")).toEqual(rendered);
  });

  it("claims joined runs once, so a later node with the same markup takes the next ones", () => {
    const rendered = texts("a", "b", "a", "b");
    const match = createTreeLabelMatcher(rendered, { matchRuns: true });
    expect(match("**a** //b//")).toEqual([rendered[0], rendered[1]]);
    expect(match("**a** //b//")).toEqual([rendered[2], rendered[3]]);
    expect(match("**a** //b//")).toBeUndefined();
  });

  it("prefers an exact match over joining runs", () => {
    const rendered = texts("ab", "a", "b");
    expect(createTreeLabelMatcher(rendered, { matchRuns: true })("ab")).toEqual([rendered[0]]);
  });
});

describe("normalizeTreeLabel", () => {
  it("drops markup and whitespace and resolves code points and links", () => {
    expect(normalizeTreeLabel("<color:red>Hot</color> <&flag> and <U+00E9>")).toBe("Hotandé");
    expect(normalizeTreeLabel("[[http://x.test The link]]")).toBe("Thelink");
    expect(normalizeTreeLabel("[[http://x.test]]")).toBe("http://x.test");
    expect(normalizeTreeLabel("//it// **bold** --gone-- __u__ ~~w~~")).toBe("itboldgoneuw");
  });
});
