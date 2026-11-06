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
    const state = selection({ selectedTaskId: "task-a", selectedDependencyIndex: 1 });
    expect(diagramSelectionReducer(state, { type: "set", key: "selectedTaskId", value: "task-b" })).toEqual(
      selection({ selectedTaskId: "task-b", selectedDependencyIndex: 1 }),
    );
  });

  it("clears a source highlight on another task when a different task is selected", () => {
    const state = selection({ selectedTaskId: "build", sourceHighlightedTaskId: "build" });
    expect(diagramSelectionReducer(state, { type: "set", key: "selectedTaskId", value: "build copy" })).toEqual(
      selection({ selectedTaskId: "build copy" }),
    );
  });

  it("keeps a source highlight on the selected task and on deselection", () => {
    const highlighted = selection({ sourceHighlightedTaskId: "release" });
    expect(
      diagramSelectionReducer(highlighted, { type: "set", key: "selectedTaskId", value: "release" })
        .sourceHighlightedTaskId,
    ).toBe("release");
    const selected = selection({ selectedTaskId: "release", sourceHighlightedTaskId: "release" });
    expect(
      diagramSelectionReducer(selected, { type: "set", key: "selectedTaskId", value: undefined })
        .sourceHighlightedTaskId,
    ).toBe("release");
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
      selectedDependencyIndex: 2,
      sourceHighlightedTaskId: "task-b",
    });
    const next = diagramSelectionReducer(state, { type: "dismiss-inspector-selection" });
    expect(next.selectedTaskId).toBeUndefined();
    expect(next.selectedDependencyIndex).toBeUndefined();
    expect(next.sourceHighlightedTaskId).toBe("task-b");
  });
});
