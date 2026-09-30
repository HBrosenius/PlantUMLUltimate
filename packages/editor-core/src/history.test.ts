import { describe, expect, it } from "vitest";
import { SourceHistory } from "./history";

describe("SourceHistory", () => {
  it("uses one history for text and visual source changes", () => {
    const history = new SourceHistory();
    history.record("a", "ab", "Type text");
    history.record("ab", "moved", "Move Build 3 days");
    expect(history.undo("moved")).toBe("ab");
    expect(history.undo("ab")).toBe("a");
    expect(history.redo("a")).toBe("ab");
  });

  it("clears redo when a new edit branches history", () => {
    const history = new SourceHistory();
    history.record("a", "b", "Edit");
    expect(history.undo("b")).toBe("a");
    history.record("a", "c", "Different edit");
    expect(history.canRedo).toBe(false);
  });

  it("fails safely when source does not match history", () => {
    const history = new SourceHistory();
    history.record("a", "b", "Edit");
    expect(history.undo("external")).toBeUndefined();
  });

  it("merges continuous typing into one undo step", () => {
    const history = new SourceHistory();
    history.record("a", "ab", "Edit source", undefined, { coalesce: true, now: 0 });
    history.record("ab", "abc", "Edit source", undefined, { coalesce: true, now: 400 });
    history.record("abc", "abcd", "Edit source", undefined, { coalesce: true, now: 900 });
    expect(history.undo("abcd")).toBe("a");
    expect(history.canUndo).toBe(false);
    expect(history.redo("a")).toBe("abcd");
  });

  it("starts a new typing step after a pause, a different edit, or an undo", () => {
    const history = new SourceHistory();
    history.record("a", "ab", "Edit source", undefined, { coalesce: true, now: 0 });
    history.record("ab", "abc", "Edit source", undefined, { coalesce: true, now: 2000 });
    history.record("abc", "moved", "Move task", undefined, { now: 2100 });
    history.record("moved", "moved!", "Edit source", undefined, { coalesce: true, now: 2200 });
    expect(history.undo("moved!")).toBe("moved");
    expect(history.undo("moved")).toBe("abc");
    history.record("abc", "abcX", "Edit source", undefined, { coalesce: true, now: 2300 });
    expect(history.undo("abcX")).toBe("abc");
    expect(history.undo("abc")).toBe("ab");
  });

  it("drops a typing step that returns to the original text", () => {
    const history = new SourceHistory();
    history.record("a", "ab", "Edit source", undefined, { coalesce: true, now: 0 });
    history.record("ab", "a", "Edit source", undefined, { coalesce: true, now: 100 });
    expect(history.canUndo).toBe(false);
  });

  it("keeps a paste separate from the typing around it", () => {
    const history = new SourceHistory();
    history.record("a", "a pasted text", "Edit source", undefined, { coalesce: true, now: 0 });
    history.record("a pasted text", "a pasted text!", "Edit source", undefined, { coalesce: true, now: 100 });
    expect(history.undo("a pasted text!")).toBe("a pasted text");
    expect(history.undo("a pasted text")).toBe("a");
  });

  it("amends the latest edit with a derived follow-up change", () => {
    const history = new SourceHistory();
    expect(history.amendLast("a", "a+legend")).toBe(false);
    history.record("a", "ab", "Add task");
    expect(history.amendLast("ab", "ab+legend")).toBe(true);
    expect(history.undo("ab+legend")).toBe("a");
    expect(history.amendLast("a", "a+legend")).toBe(false);
    expect(history.redo("a")).toBe("ab+legend");
  });
});
