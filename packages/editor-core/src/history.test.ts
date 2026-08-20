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
});
