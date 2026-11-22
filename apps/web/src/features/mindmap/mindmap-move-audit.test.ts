/**
 * Collects every source the drag planner and the keyboard moves can produce from a set of documents, so the
 * pinned engine can check that it draws them all. The unit suite only checks that they parse without errors
 * and keep their nodes. To check them against the engine:
 *
 *   MINDMAP_MOVES_FILE=moves.json npx vitest run apps/web/src/features/mindmap/mindmap-move-audit.test.ts
 *   node scripts/audit-mindmap-moves.mjs moves.json
 */
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applySourceEdits } from "@plantuml-studio/diagram-gantt";
import { mindmapEmissionOrder, parseMindmap, type MindmapDocument } from "@plantuml-studio/diagram-mindmap";
import { applicationMindmapAdapter } from "../../diagram-adapters";
import { planMindmapDrop, type DropBox } from "./mindmap-drop-plan";
import { planMindmapKeyboardMove, type ArrowKey } from "./mindmap-keyboard";

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

const SOURCES: Record<string, string> = {
  mixed: [
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
  ].join("\n"),
  leftside: [
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
  multiline: ["@startmindmap", "* Root", "** A", "**:two", "lines;", "*** deep", "** B", "@endmindmap"].join("\n"),
  ttb: ["@startmindmap", "top to bottom direction", "* Root", "** A", "*** A1", "** B", "-- C", "@endmindmap"].join(
    "\n",
  ),
  rtl: ["@startmindmap", "right to left direction", "* Root", "** A", "*** A1", "++ B", "-- C", "@endmindmap"].join(
    "\n",
  ),
  tworoots: ["@startmindmap", "* One", "** a", "** b", "* Two", "** c", "@endmindmap"].join("\n"),
  colours: [
    "@startmindmap",
    "* Root",
    "**[#lightblue] A",
    "***_ A1",
    "-- C <<big>>",
    "--[#pink]_ D",
    "@endmindmap",
  ].join("\n"),
};

describe("planner and keyboard moves", () => {
  it("produces sources that parse cleanly and keep every node", () => {
    const out: Record<string, { source: string; nodes: number }> = {};
    const add = (key: string, source: string, nodes: number) => {
      out[key] = { source, nodes };
    };
    for (const [name, source] of Object.entries(SOURCES)) {
      const document = parseMindmap(source);
      const { boxes, canvas } = layout(document);
      const points: Array<{ x: number; y: number }> = [];
      for (const box of boxes.values()) {
        const cx = (box.left + box.right) / 2;
        const cy = (box.top + box.bottom) / 2;
        points.push({ x: cx, y: cy }, { x: cx, y: box.top + 1 }, { x: cx, y: box.bottom - 1 });
      }
      const root = [...boxes.values()][0]!;
      points.push(
        { x: root.left - 60, y: root.top },
        { x: root.right + 60, y: root.top },
        { x: root.left, y: root.top - 60 },
        { x: root.left, y: root.bottom + 60 },
      );
      const tryMove = (label: string, op: Parameters<typeof applicationMindmapAdapter.applyVisualOperation>[0]) => {
        const result = applicationMindmapAdapter.applyVisualOperation(op, document, source);
        if (result.unavailableReason) return;
        const next = applySourceEdits(source, result.edits);
        if (next !== source) add(`${name}:${label}`, next, document.nodes.length);
      };
      for (const node of document.nodes.filter((item) => item.depth > 1)) {
        for (const point of points) {
          for (const forceBefore of [false, true]) {
            const plan = planMindmapDrop({ document, sourceId: node.id, point, boxes, canvas, forceBefore });
            if (!plan) continue;
            tryMove(`drag ${node.id} ${plan.destination}`, {
              kind: "move-subtree",
              nodeId: node.id,
              ...(plan.parentId ? { parentId: plan.parentId } : {}),
              ...(plan.beforeId ? { beforeNodeId: plan.beforeId } : {}),
              ...(plan.side ? { side: plan.side } : {}),
            });
          }
        }
        for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as ArrowKey[]) {
          const move = planMindmapKeyboardMove(document, node.id, key);
          if (!move) continue;
          tryMove(`key ${node.id} ${key}`, {
            kind: "move-subtree",
            nodeId: move.nodeId,
            ...(move.parentId ? { parentId: move.parentId } : {}),
            ...(move.beforeId ? { beforeNodeId: move.beforeId } : {}),
            ...(move.side ? { side: move.side } : {}),
          });
        }
      }
    }
    // Unique sources only.
    let produced = 0;
    for (const { source, nodes } of Object.values(out)) {
      const result = parseMindmap(source);
      expect(result.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
      expect(result.nodes).toHaveLength(nodes);
      produced += 1;
    }
    expect(produced).toBeGreaterThan(100);
    const unique = new Map<string, { key: string; nodes: number }>();
    for (const [key, value] of Object.entries(out))
      if (!unique.has(value.source)) unique.set(value.source, { key, nodes: value.nodes });
    const result = Object.fromEntries([...unique].map(([source, info]) => [info.key, { source, nodes: info.nodes }]));
    if (process.env.MINDMAP_MOVES_FILE) writeFileSync(process.env.MINDMAP_MOVES_FILE, JSON.stringify(result));
  });
});
