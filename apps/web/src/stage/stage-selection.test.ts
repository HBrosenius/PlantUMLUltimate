import { describe, expect, it, vi } from "vitest";
import { describeStageSelection, dockActionsFor, type DockHandlers } from "./stage-selection";

const handlers = (): DockHandlers => ({
  readOnly: false,
  resizeTask: vi.fn(),
  moveTask: vi.fn(),
  addDependency: vi.fn(),
  duplicateTask: vi.fn(),
  deleteTask: vi.fn(),
  deleteDependency: vi.fn(),
  deleteDivider: vi.fn(),
  moveSequenceMessage: vi.fn(),
  moveSequenceParticipant: vi.fn(),
  deleteSequenceMessage: vi.fn(),
  deleteSequenceParticipant: vi.fn(),
  deleteSequenceStructure: vi.fn(),
});

describe("describeStageSelection", () => {
  it("spans every declaration of a gantt task for the lens", () => {
    const selection = describeStageSelection({
      diagramKind: "gantt",
      task: {
        id: "build",
        label: "Build",
        sourceRange: { from: 40, to: 60 },
        declarations: [{ range: { from: 40, to: 60 } }, { range: { from: 61, to: 95 } }],
      },
    });
    expect(selection).toMatchObject({ kind: "gantt-task", id: "build", range: { from: 40, to: 95 } });
    expect(selection?.anchor).toContain('data-task-id="build"');
  });

  it("describes milestones, messages and participants", () => {
    expect(
      describeStageSelection({
        diagramKind: "gantt",
        task: { id: "m", label: "Ship", milestone: {}, sourceRange: { from: 1, to: 2 }, declarations: [] },
      })?.kind,
    ).toBe("gantt-milestone");
    expect(
      describeStageSelection({
        diagramKind: "sequence",
        message: { id: "message-0", label: "", sourceRange: { from: 3, to: 9 } },
      }),
    ).toMatchObject({ kind: "sequence-message", label: "Message", range: { from: 3, to: 9 } });
    expect(
      describeStageSelection({
        diagramKind: "sequence",
        participant: { id: "api", label: "API", sourceRange: { from: 0, to: 4 } },
      })?.kind,
    ).toBe("sequence-participant");
  });

  it("returns nothing without a selection and falls back for other families", () => {
    expect(describeStageSelection({ diagramKind: "gantt" })).toBeUndefined();
    expect(describeStageSelection({ diagramKind: "class", otherId: "A", selectionRange: { from: 1, to: 5 } })).toEqual({
      kind: "other",
      id: "A",
      label: "Selection",
      range: { from: 1, to: 5 },
    });
  });
});

describe("dockActionsFor", () => {
  it("offers 3 to 5 reusable task actions and routes them to the feature handlers", () => {
    const h = handlers();
    const selection = describeStageSelection({
      diagramKind: "gantt",
      task: { id: "build", label: "Build", sourceRange: { from: 1, to: 2 }, declarations: [] },
    })!;
    const actions = dockActionsFor(selection, h);
    expect(actions.length).toBeGreaterThanOrEqual(3);
    expect(actions.length).toBeLessThanOrEqual(5);
    actions.find((action) => action.id === "longer")!.run();
    expect(h.resizeTask).toHaveBeenCalledWith("build", 1);
    actions.find((action) => action.id === "delete")!.run();
    expect(h.deleteTask).toHaveBeenCalled();
  });

  it("disables edits when the document is view-only and has no actions for unspecialised families", () => {
    const h = { ...handlers(), readOnly: true };
    const selection = describeStageSelection({
      diagramKind: "sequence",
      message: { id: "message-1", label: "Hi", sourceRange: { from: 1, to: 2 } },
    })!;
    expect(dockActionsFor(selection, h).every((action) => action.disabled)).toBe(true);
    expect(dockActionsFor({ kind: "other", id: "x", label: "x" }, handlers())).toEqual([]);
  });
});
