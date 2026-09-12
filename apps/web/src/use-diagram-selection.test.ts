import { describe, expect, it } from "vitest";
import {
  diagramSelectionReducer,
  initialDiagramSelectionState,
  type DiagramSelectionState,
} from "./use-diagram-selection";

function selection(overrides: Partial<DiagramSelectionState>): DiagramSelectionState {
  return { ...initialDiagramSelectionState, ...overrides };
}

describe("diagram selection transitions", () => {
  it("updates one selection without disturbing the others", () => {
    const state = selection({ selectedTaskId: "task-a", selectedClassObjectId: "class-a" });
    expect(diagramSelectionReducer(state, { type: "set", key: "selectedTaskId", value: "task-b" })).toEqual(
      selection({ selectedTaskId: "task-b", selectedClassObjectId: "class-a" }),
    );
  });

  it("supports functional selection updates", () => {
    const state = selection({ selectedDependencyIndex: 2 });
    expect(
      diagramSelectionReducer(state, {
        type: "set",
        key: "selectedDependencyIndex",
        value: (value) => (typeof value === "number" ? value + 1 : 0),
      }).selectedDependencyIndex,
    ).toBe(3);
  });

  it("clears only tab-transient selections when activating another document", () => {
    const state = selection({
      selectedTaskId: "remembered-task",
      selectedDependencyIndex: 2,
    });
    expect(diagramSelectionReducer(state, { type: "reset-transient-tab-selection" })).toEqual(
      selection({ selectedTaskId: "remembered-task" }),
    );
  });

  it("dismisses inspector selections while preserving source highlights", () => {
    const state = selection({
      selectedTaskId: "task-a",
      selectedClassObjectId: "class-a",
      sourceHighlightedTaskId: "task-b",
    });
    const next = diagramSelectionReducer(state, { type: "dismiss-inspector-selection" });
    expect(next.selectedTaskId).toBeUndefined();
    expect(next.selectedClassObjectId).toBeUndefined();
    expect(next.sourceHighlightedTaskId).toBe("task-b");
  });
});
