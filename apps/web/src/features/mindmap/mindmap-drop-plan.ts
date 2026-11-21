import type { MindmapDirection, MindmapDocument, MindmapNode } from "@plantuml-studio/diagram-mindmap";
import { isMirroredDirection } from "./mindmap-render-order";

/** A rectangle in client (screen) coordinates. */
export interface DropBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type DropMode = "before" | "inside" | "after" | "side";

/** Where a dragged branch would land, and how to show it. */
export interface MindmapDropPlan {
  /** Undefined moves the node to the top level, which is never offered for a mindmap. */
  parentId?: string;
  /** The sibling the node goes in front of. Undefined appends it to its parent. */
  beforeId?: string;
  side?: "left" | "right";
  mode: DropMode;
  destination: string;
  placement: { left: number; top: number; width: number; height: number; mode: DropMode };
}

export interface DropPlanInput {
  document: MindmapDocument;
  sourceId: string;
  point: { x: number; y: number };
  /** The drawn label of every node that was found in the SVG. */
  boxes: ReadonlyMap<string, DropBox>;
  /** The whole drawing, so a drop beside the root counts only when it is over the diagram. */
  canvas: DropBox | undefined;
  /** Drop before the node under the pointer, whatever the pointer's position over it. */
  forceBefore?: boolean;
}

const NEAR = 24;
const width = (box: DropBox) => box.right - box.left;
const height = (box: DropBox) => box.bottom - box.top;

/** The distance from a point to a box: zero inside it. */
function distanceTo(box: DropBox, x: number, y: number) {
  return Math.hypot(
    x < box.left ? box.left - x : x > box.right ? x - box.right : 0,
    y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0,
  );
}

/** The node whose label is closest to the point, within a few pixels. */
export function mindmapNodeAt(
  document: MindmapDocument,
  boxes: ReadonlyMap<string, DropBox>,
  x: number,
  y: number,
): MindmapNode | undefined {
  let found: MindmapNode | undefined;
  let best = Number.POSITIVE_INFINITY;
  for (const node of document.nodes) {
    const box = boxes.get(node.id);
    if (!box) continue;
    const distance = distanceTo(box, x, y);
    if (distance <= NEAR && distance < best) {
      found = node;
      best = distance;
    }
  }
  return found;
}

/** `top to bottom` lays siblings out along x and draws the sides above and below the root. */
export const isVerticalDirection = (document: Pick<MindmapDocument, "direction">) =>
  document.direction?.value === "top-to-bottom";

const isInside = (node: MindmapNode, ancestor: MindmapNode) =>
  node.sourceRange.from >= ancestor.sourceRange.from && node.sourceRange.from <= ancestor.subtreeRange.to;

/** The branch siblings of a node that sit in its group: same parent, and for a root's children the same side. */
export function mindmapSiblings(document: MindmapDocument, node: MindmapNode): MindmapNode[] {
  return document.nodes.filter(
    (item) =>
      item.parentId === node.parentId &&
      item.depth === node.depth &&
      (node.depth !== 2 || item.side === node.side) &&
      (node.depth !== 1 || item.depth === 1),
  );
}

/** Which side of the root a point is on, from the picture's own axis. Undefined where sides mean nothing. */
function sideOfPoint(
  document: MindmapDocument,
  root: DropBox,
  x: number,
  y: number,
  margin: number,
): "left" | "right" | undefined {
  if (isMirroredDirection(document)) return undefined;
  if (isVerticalDirection(document))
    return y < root.top - margin ? "left" : y > root.bottom + margin ? "right" : undefined;
  return x < root.left - margin ? "left" : x > root.right + margin ? "right" : undefined;
}

const sideText = (side: "left" | "right", direction: MindmapDirection | undefined) =>
  direction === "top-to-bottom" ? (side === "left" ? "above" : "below") : side;

/**
 * Decides where the dragged branch lands for the pointer position, in the way the WBS preview does:
 * the top third of a label places it before, the bottom third after, the middle nests it, and empty
 * space beside the root puts a first-level branch on that side. Returns undefined for a drop that does
 * nothing (on itself, into its own subtree, or on empty space).
 */
export function planMindmapDrop(input: DropPlanInput): MindmapDropPlan | undefined {
  const { document, sourceId, point, boxes, canvas, forceBefore = false } = input;
  const source = document.nodes.find((item) => item.id === sourceId);
  if (!source || source.depth <= 1) return undefined;
  const direction = document.direction?.value;
  const sides = !isMirroredDirection(document);
  const vertical = isVerticalDirection(document);
  const target = mindmapNodeAt(document, boxes, point.x, point.y);

  if (!target) {
    const parent = document.nodes.find((item) => item.id === source.parentId);
    const root = parent && boxes.get(parent.id);
    if (source.depth !== 2 || !parent || parent.depth !== 1 || !root || !canvas) return undefined;
    const inCanvas =
      point.x >= canvas.left - 24 &&
      point.x <= canvas.right + 24 &&
      point.y >= canvas.top - 24 &&
      point.y <= canvas.bottom + 24;
    const side = inCanvas ? sideOfPoint(document, root, point.x, point.y, 20) : undefined;
    if (!side) return undefined;
    const place = vertical
      ? side === "left"
        ? { left: canvas.left, top: canvas.top, width: width(canvas), height: Math.max(40, root.top - 18 - canvas.top) }
        : {
            left: canvas.left,
            top: root.bottom + 18,
            width: width(canvas),
            height: Math.max(40, canvas.bottom - root.bottom - 18),
          }
      : side === "left"
        ? {
            left: canvas.left,
            top: canvas.top + 8,
            width: Math.max(48, root.left - 18 - canvas.left),
            height: Math.max(40, height(canvas) - 16),
          }
        : {
            left: root.right + 18,
            top: canvas.top + 8,
            width: Math.max(48, canvas.right - root.right - 18),
            height: Math.max(40, height(canvas) - 16),
          };
    return {
      parentId: parent.id,
      side,
      mode: "side",
      destination: `Move to the ${sideText(side, direction)} of ${parent.label}`,
      placement: { ...place, mode: "side" },
    };
  }

  if (target.id === source.id || isInside(target, source)) return undefined;
  const box = boxes.get(target.id);
  if (!box) return undefined;
  const along = vertical ? point.x : point.y;
  const start = vertical ? box.left : box.top;
  const extent = vertical ? width(box) : height(box);
  const fraction = extent ? (along - start) / extent : 0.5;
  // A root has no siblings to sit beside, so a drop on it always nests.
  const mode: DropMode =
    target.depth <= 1 ? "inside" : forceBefore || fraction < 0.3 ? "before" : fraction > 0.7 ? "after" : "inside";

  if (mode === "inside") {
    const side =
      target.depth === 1
        ? sides
          ? (sideOfPoint(document, box, point.x, point.y, 0) ??
            (vertical
              ? point.y < (box.top + box.bottom) / 2
                ? "left"
                : "right"
              : point.x < (box.left + box.right) / 2
                ? "left"
                : "right"))
          : undefined
        : undefined;
    return {
      parentId: target.id,
      ...(side ? { side } : {}),
      mode,
      destination: `Move inside ${target.label}${side ? ` on the ${sideText(side, direction)}` : ""}`,
      placement: {
        left: side === "left" && !vertical ? box.left - 34 : box.right + 10,
        top: vertical && side ? (side === "left" ? box.top - 34 : box.bottom + 8) : box.top + height(box) / 2 - 13,
        width: 24,
        height: 26,
        mode,
      },
    };
  }

  const siblings = mindmapSiblings(document, target);
  const index = siblings.findIndex((item) => item.id === target.id);
  const beforeId = mode === "before" ? target.id : siblings[index + 1]?.id;
  const side =
    target.depth === 2 && sides && (target.side === "left" || target.side === "right") ? target.side : undefined;
  return {
    ...(target.parentId ? { parentId: target.parentId } : {}),
    ...(beforeId ? { beforeId } : {}),
    ...(side ? { side } : {}),
    mode,
    destination: `${mode === "before" ? "Place before" : "Place after"} ${target.label}${side ? ` on the ${sideText(side, direction)}` : ""}`,
    placement: vertical
      ? {
          left: mode === "before" ? box.left - 7 : box.right + 3,
          top: box.top - 10,
          width: 4,
          height: height(box) + 20,
          mode,
        }
      : {
          left: box.left - 10,
          top: mode === "before" ? box.top - 7 : box.bottom + 3,
          width: width(box) + 20,
          height: 4,
          mode,
        },
  };
}
