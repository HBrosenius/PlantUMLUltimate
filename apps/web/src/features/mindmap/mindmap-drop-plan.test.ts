import { describe, expect, it } from "vitest";
import { applySourceEdits } from "@plantuml-studio/diagram-gantt";
import { parseMindmap, type MindmapDocument } from "@plantuml-studio/diagram-mindmap";
import { applicationMindmapAdapter } from "../../diagram-adapters";
import { mindmapEmissionOrder } from "@plantuml-studio/diagram-mindmap";
import { planMindmapDrop, mindmapNodeAt, type DropBox } from "./mindmap-drop-plan";

/** Boxes laid out like the engine's left to right picture: the root in the middle, depth to either side. */
function layout(document: MindmapDocument) {
  const boxes = new Map<string, DropBox>();
  const vertical = document.direction?.value === "top-to-bottom";
  let row = 0;
  for (const node of mindmapEmissionOrder(document)) {
    const offset = (node.side === "left" ? -1 : 1) * (node.depth - 1) * 150;
    const left = vertical ? row * 100 : 400 + offset;
    const top = vertical ? (node.side === "left" ? -1 : 1) * (node.depth - 1) * 60 + 300 : row * 50;
    boxes.set(node.id, { left, top, right: left + 80, bottom: top + 30 });
    row += 1;
  }
  const all = [...boxes.values()];
  const canvas = {
    left: Math.min(...all.map((box) => box.left)) - 10,
    top: Math.min(...all.map((box) => box.top)) - 10,
    right: Math.max(...all.map((box) => box.right)) + 10,
    bottom: Math.max(...all.map((box) => box.bottom)) + 10,
  };
  return { boxes, canvas };
}

const SOURCE = [
  "@startmindmap",
  "* Root",
  "** A",
  "*** A1",
  "*** A2",
  "** B",
  "*** B1",
  "-- C",
  "--- C1",
  "-- D",
  "++ E",
  "@endmindmap",
].join("\n");
const centre = (box: DropBox) => ({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 });

describe("planMindmapDrop", () => {
  const document = parseMindmap(SOURCE);
  const { boxes, canvas } = layout(document);
  const id = (name: string) => document.nodes.find((node) => node.label === name)!.id;
  const plan = (source: string, x: number, y: number, forceBefore = false) =>
    planMindmapDrop({ document, sourceId: id(source), point: { x, y }, boxes, canvas, forceBefore });

  it("places before, nests inside and places after by where the pointer is over a label", () => {
    const b = boxes.get(id("B"))!;
    const before = plan("A", centre(b).x, b.top + 2);
    expect(before).toMatchObject({ mode: "before", parentId: id("Root"), beforeId: id("B"), side: "right" });
    expect(before?.destination).toBe("Place before B on the right");
    const inside = plan("A1", centre(b).x, centre(b).y);
    expect(inside).toMatchObject({ mode: "inside", parentId: id("B") });
    expect(inside?.side).toBeUndefined();
    const after = plan("A", centre(b).x, b.bottom - 2);
    expect(after).toMatchObject({ mode: "after", parentId: id("Root"), side: "right" });
    expect(after?.beforeId).toBe(id("E"));
  });

  it("puts a drop after the last branch of a side at the end of that side", () => {
    const d = boxes.get(id("D"))!;
    const plan_ = plan("A", centre(d).x, d.bottom - 2);
    expect(plan_).toMatchObject({ mode: "after", parentId: id("Root"), side: "left" });
    expect(plan_?.beforeId).toBeUndefined();
  });

  it("forces a drop before the node whatever the pointer position", () => {
    const b = boxes.get(id("B"))!;
    expect(plan("A1", centre(b).x, centre(b).y, true)).toMatchObject({ mode: "before", beforeId: id("B") });
  });

  it("nests under the root on the side of the pointer", () => {
    const root = boxes.get(id("Root"))!;
    expect(plan("A1", root.left + 5, centre(root).y)).toMatchObject({
      mode: "inside",
      parentId: id("Root"),
      side: "left",
    });
    expect(plan("A1", root.right - 5, centre(root).y)).toMatchObject({ side: "right" });
  });

  it("changes the side of a first-level branch by dropping beside the root", () => {
    const root = boxes.get(id("Root"))!;
    const left = plan("A", root.left - 60, centre(root).y);
    expect(left).toMatchObject({ mode: "side", parentId: id("Root"), side: "left" });
    expect(left?.destination).toBe("Move to the left of Root");
    expect(plan("C", root.right + 60, centre(root).y)).toMatchObject({ mode: "side", side: "right" });
  });

  it("offers no side drop for a deeper branch, outside the diagram, or in the empty middle", () => {
    const root = boxes.get(id("Root"))!;
    expect(plan("A1", root.left - 60, centre(root).y)).toBeUndefined();
    expect(plan("A", canvas.left - 200, centre(root).y)).toBeUndefined();
    expect(plan("A", centre(root).x, canvas.bottom + 10)).toBeUndefined();
  });

  it("ignores a drop on itself, into its own subtree, and a drag of the root", () => {
    const a = boxes.get(id("A"))!;
    expect(plan("A", centre(a).x, centre(a).y)).toBeUndefined();
    expect(plan("A", centre(boxes.get(id("A1"))!).x, centre(boxes.get(id("A1"))!).y)).toBeUndefined();
    expect(plan("Root", centre(a).x, centre(a).y)).toBeUndefined();
  });

  it("finds the node under or close to a point", () => {
    const a = boxes.get(id("A"))!;
    expect(mindmapNodeAt(document, boxes, a.left + 1, a.top + 1)?.label).toBe("A");
    expect(mindmapNodeAt(document, boxes, a.left - 10, a.top + 5)?.label).toBe("A");
    expect(mindmapNodeAt(document, boxes, -500, -500)).toBeUndefined();
  });

  it("offers no side where sides mean nothing, and reads siblings along x in top to bottom", () => {
    const mirrored = parseMindmap("@startmindmap\nright to left direction\n* Root\n** A\n** B\n@endmindmap");
    const m = layout(mirrored);
    const root = m.boxes.get("mindmap-0")!;
    expect(
      planMindmapDrop({
        document: mirrored,
        sourceId: "mindmap-1",
        point: { x: root.left - 60, y: centre(root).y },
        boxes: m.boxes,
        canvas: m.canvas,
      }),
    ).toBeUndefined();
    const vertical = parseMindmap("@startmindmap\ntop to bottom direction\n* Root\n** A\n** B\n** C\n@endmindmap");
    const v = layout(vertical);
    const c = v.boxes.get("mindmap-3")!;
    const early = planMindmapDrop({
      document: vertical,
      sourceId: "mindmap-1",
      point: { x: c.left + 2, y: centre(c).y },
      boxes: v.boxes,
      canvas: v.canvas,
    });
    expect(early).toMatchObject({ mode: "before", beforeId: "mindmap-3" });
    expect(early?.placement.height).toBeGreaterThan(early?.placement.width ?? 0);
  });
});

// Every drop the planner can produce, for every dragged branch, must give source the engine accepts and
// keep every node: the planner feeds the same move operation the S2 renderer audit covers.
describe("drop plans through the move operation", () => {
  const sources: Record<string, string> = {
    mixed: SOURCE,
    "left side keyword": [
      "@startmindmap",
      "* Root",
      "** A",
      "*** A1",
      "left side",
      "** B",
      "*** B1",
      "** C",
      "++ D",
      "@endmindmap",
    ].join("\n"),
    "multi-line label": ["@startmindmap", "* Root", "** A", "**:two", "lines;", "*** deep", "** B", "@endmindmap"].join(
      "\n",
    ),
    crlf: SOURCE.replace(/\n/g, "\r\n"),
    "top to bottom": [
      "@startmindmap",
      "top to bottom direction",
      "* Root",
      "** A",
      "*** A1",
      "** B",
      "-- C",
      "@endmindmap",
    ].join("\n"),
    "two roots": ["@startmindmap", "* One", "** a", "** b", "* Two", "** c", "@endmindmap"].join("\n"),
  };
  for (const [name, source] of Object.entries(sources)) {
    it(`never produces a broken mindmap from ${name}`, () => {
      const document = parseMindmap(source);
      const { boxes, canvas } = layout(document);
      const points: Array<{ x: number; y: number }> = [];
      for (const box of boxes.values()) {
        const { x, y } = centre(box);
        points.push(
          { x, y },
          { x, y: box.top + 1 },
          { x, y: box.bottom - 1 },
          { x: box.left + 1, y },
          { x: box.right - 1, y },
        );
      }
      for (const box of [...boxes.values()].slice(0, 1))
        points.push(
          { x: box.left - 60, y: box.top },
          { x: box.right + 60, y: box.top },
          { x: box.left, y: box.top - 60 },
          { x: box.left, y: box.bottom + 60 },
        );
      let moves = 0;
      for (const node of document.nodes.filter((item) => item.depth > 1)) {
        for (const point of points) {
          for (const forceBefore of [false, true]) {
            const plan = planMindmapDrop({ document, sourceId: node.id, point, boxes, canvas, forceBefore });
            if (!plan) continue;
            const operation = applicationMindmapAdapter.applyVisualOperation(
              {
                kind: "move-subtree",
                nodeId: node.id,
                ...(plan.parentId ? { parentId: plan.parentId } : {}),
                ...(plan.beforeId ? { beforeNodeId: plan.beforeId } : {}),
                ...(plan.side ? { side: plan.side } : {}),
              },
              document,
              source,
            );
            if (operation.unavailableReason) continue;
            const next = applySourceEdits(source, operation.edits);
            if (next === source) continue;
            moves += 1;
            const result = parseMindmap(next);
            const context = `${name}: move ${node.label} ${JSON.stringify(plan.destination)}\n${next}`;
            expect(
              result.diagnostics.filter((item) => item.severity === "error"),
              context,
            ).toEqual([]);
            expect(result.nodes.map((item) => item.label).sort(), context).toEqual(
              document.nodes.map((item) => item.label).sort(),
            );
            if (source.includes("\r\n")) expect(next.replace(/\r\n/g, ""), context).not.toContain("\n");
          }
        }
      }
      expect(moves).toBeGreaterThan(5);
    });
  }
});
