import { describe, expect, it, vi } from "vitest";
import { describeStageSelection, dockActionsFor, type DockHandlers } from "./stage-selection";

const handlers = (remove: Partial<DockHandlers["remove"]> = {}): DockHandlers => ({
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
  renameInLens: vi.fn(),
  addLinked: vi.fn(),
  addClassMember: vi.fn(),
  addWbsNode: vi.fn(),
  remove,
});

describe("stage selection for the other families", () => {
  it("describes class, WBS and separator selections with anchors and ranges", () => {
    const cls = describeStageSelection({
      diagramKind: "class",
      items: { "class-entity": { id: "Order", name: "Order", sourceRange: { from: 4, to: 30 } } },
    });
    expect(cls).toMatchObject({ kind: "class-entity", id: "Order", label: "Order", range: { from: 4, to: 30 } });
    expect(cls?.anchor).toBe('[data-class-object-id="Order"]');
    const wbs = describeStageSelection({
      diagramKind: "wbs",
      items: { "wbs-node": { id: "n1", label: "Plan", sourceRange: { from: 0, to: 8 } } },
    });
    expect(wbs?.anchor).toBe('[data-wbs-node-id="n1"]');
    expect(
      describeStageSelection({
        diagramKind: "gantt",
        items: { "gantt-separator": { sourceRange: { from: 9, to: 20 } } },
      }),
    ).toMatchObject({ kind: "gantt-separator", range: { from: 9, to: 20 } });
  });

  it("gives each element type 3-5 actions from existing operations", () => {
    const remove = vi.fn();
    const h = handlers({ "wbs-node": remove, "class-entity": remove });
    const wbs = describeStageSelection({
      diagramKind: "wbs",
      items: { "wbs-node": { id: "n1", label: "Plan", sourceRange: { from: 0, to: 8 } } },
    })!;
    const actions = dockActionsFor(wbs, h);
    expect(actions.map((action) => action.id)).toEqual(["rename", "child", "sibling", "delete"]);
    actions.find((action) => action.id === "child")!.run();
    expect(h.addWbsNode).toHaveBeenCalledWith("child");
    actions.find((action) => action.id === "delete")!.run();
    expect(remove).toHaveBeenCalled();
    const cls = describeStageSelection({
      diagramKind: "class",
      items: { "class-entity": { id: "A", name: "A", sourceRange: { from: 0, to: 4 } } },
    })!;
    expect(dockActionsFor(cls, h).map((action) => action.id)).toEqual(["rename", "member", "relate", "delete"]);
  });

  it("omits Delete when no operation exists and still allows rename", () => {
    const selection = describeStageSelection({
      diagramKind: "usecase",
      items: { "usecase-element": { id: "u", label: "Pay", sourceRange: { from: 0, to: 4 } } },
    })!;
    expect(dockActionsFor(selection, handlers()).map((action) => action.id)).toEqual(["rename", "relate"]);
  });

  it("describes and acts on C4 selections", () => {
    const remove = vi.fn();
    const h = handlers({ "c4-element": remove, "c4-boundary": remove, "c4-relationship": remove });
    const element = describeStageSelection({
      diagramKind: "c4",
      items: { "c4-element": { id: "web", label: "Web app", range: { from: 4, to: 30 } } },
    })!;
    expect(element).toMatchObject({ kind: "c4-element", id: "web", label: "Web app", range: { from: 4, to: 30 } });
    expect(element.anchor).toBe('[data-c4-object-id="web"]');
    expect(dockActionsFor(element, h).map((action) => action.id)).toEqual(["rename", "relate", "delete"]);
    dockActionsFor(element, h)
      .find((action) => action.id === "relate")!
      .run();
    expect(h.addLinked).toHaveBeenCalled();
    const link = describeStageSelection({
      diagramKind: "c4",
      items: { "c4-relationship": { id: "rel:2", label: "Calls", range: { from: 40, to: 60 } } },
    })!;
    expect(link.anchor).toBe('[data-c4-object-id="rel:2"]');
    expect(dockActionsFor(link, h).map((action) => action.id)).toEqual(["delete"]);
    const boundary = describeStageSelection({
      diagramKind: "c4",
      items: { "c4-boundary": { id: "shop", label: "Shop", range: { from: 0, to: 80 } } },
    })!;
    expect(dockActionsFor(boundary, h).map((action) => action.id)).toEqual(["rename", "delete"]);
  });
});
