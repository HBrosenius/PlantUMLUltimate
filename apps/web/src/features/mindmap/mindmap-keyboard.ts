import type { MindmapDocument, MindmapNode } from "@plantuml-studio/diagram-mindmap";
import { isVerticalDirection, mindmapSiblings } from "./mindmap-drop-plan";
import { isMirroredDirection } from "./mindmap-render-order";

export type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

/** What an arrow key means for a node, read from the picture the engine draws. */
type Step = "previous" | "next" | "child" | "parent";

/** The key that walks away from the root along the node's own axis, and the one that walks back. */
function axisKeys(document: MindmapDocument, node: MindmapNode): { outward: ArrowKey; inward: ArrowKey } {
  if (isMirroredDirection(document)) return { outward: "ArrowLeft", inward: "ArrowRight" };
  const left = node.side === "left";
  if (isVerticalDirection(document))
    return left ? { outward: "ArrowUp", inward: "ArrowDown" } : { outward: "ArrowDown", inward: "ArrowUp" };
  return left ? { outward: "ArrowLeft", inward: "ArrowRight" } : { outward: "ArrowRight", inward: "ArrowLeft" };
}

/** The keys that step to the previous and the next sibling. */
function siblingKeys(document: MindmapDocument): { previous: ArrowKey; next: ArrowKey } {
  return isVerticalDirection(document)
    ? { previous: "ArrowLeft", next: "ArrowRight" }
    : { previous: "ArrowUp", next: "ArrowDown" };
}

function stepFor(document: MindmapDocument, node: MindmapNode, key: ArrowKey): Step | undefined {
  const siblings = siblingKeys(document);
  if (key === siblings.previous) return "previous";
  if (key === siblings.next) return "next";
  if (node.depth === 1) return undefined;
  const { outward, inward } = axisKeys(document, node);
  return key === outward ? "child" : key === inward ? "parent" : undefined;
}

/**
 * The node an arrow key moves to, or undefined when there is none that way. Up and Down (Left and Right
 * in `top to bottom`) walk through the siblings of a node, and the other axis walks into a child and back
 * out to the parent. A branch drawn on the left follows the picture, so there Left walks into a child. A
 * root walks to its first child on the side the key points to.
 */
export function navigateMindmap(document: MindmapDocument, nodeId: string, key: ArrowKey): string | undefined {
  const node = document.nodes.find((item) => item.id === nodeId);
  if (!node) return undefined;
  if (node.depth === 1) {
    const siblings = siblingKeys(document);
    if (key === siblings.previous || key === siblings.next) {
      const roots = document.roots;
      const index = roots.findIndex((item) => item.id === node.id);
      return roots[index + (key === siblings.next ? 1 : -1)]?.id;
    }
    const children = document.nodes.filter((item) => item.parentId === node.id);
    if (isMirroredDirection(document)) return key === "ArrowLeft" ? children[0]?.id : undefined;
    const vertical = isVerticalDirection(document);
    const right = vertical ? "ArrowDown" : "ArrowRight";
    const left = vertical ? "ArrowUp" : "ArrowLeft";
    if (key !== right && key !== left) return undefined;
    return children.find((item) => item.side === (key === right ? "right" : "left"))?.id;
  }
  const step = stepFor(document, node, key);
  if (step === "parent") return node.parentId;
  if (step === "child") return document.nodes.find((item) => item.parentId === node.id)?.id;
  if (step === "previous" || step === "next") {
    const siblings = mindmapSiblings(document, node);
    const index = siblings.findIndex((item) => item.id === node.id);
    return siblings[index + (step === "next" ? 1 : -1)]?.id;
  }
  return undefined;
}

/** A subtree move in the terms of the `move-subtree` operation. */
export interface MindmapKeyboardMove {
  nodeId: string;
  parentId?: string;
  beforeId?: string;
  side?: "left" | "right";
}

const sideOf = (node: MindmapNode): "left" | "right" | undefined =>
  node.side === "left" || node.side === "right" ? node.side : undefined;

/**
 * What Alt plus an arrow key does to a node, as a move, or undefined when nothing can move that way.
 * - Along the siblings: one step earlier or later among the siblings (a root's children keep their side).
 * - A first-level branch with the key that points at a side: it moves to that side (not in `right to left`).
 * - Deeper, away from the root: it becomes the last child of the sibling before it (indent).
 * - Deeper, towards the root: it becomes the sibling after its parent (outdent), never a new root.
 */
export function planMindmapKeyboardMove(
  document: MindmapDocument,
  nodeId: string,
  key: ArrowKey,
): MindmapKeyboardMove | undefined {
  const node = document.nodes.find((item) => item.id === nodeId);
  if (!node || node.depth <= 1) return undefined;
  const sibling = siblingKeys(document);
  const siblings = mindmapSiblings(document, node);
  const index = siblings.findIndex((item) => item.id === node.id);
  const keepSide = node.depth === 2 && !isMirroredDirection(document) ? sideOf(node) : undefined;
  if (key === sibling.previous || key === sibling.next) {
    const earlier = key === sibling.previous;
    const target = siblings[index + (earlier ? -1 : 1)];
    if (!target) return undefined;
    const beforeId = earlier ? target.id : siblings[index + 2]?.id;
    return {
      nodeId,
      ...(node.parentId ? { parentId: node.parentId } : {}),
      ...(beforeId ? { beforeId } : {}),
      ...(keepSide ? { side: keepSide } : {}),
    };
  }
  if (node.depth === 2) {
    if (isMirroredDirection(document)) return undefined;
    const vertical = isVerticalDirection(document);
    const towardsLeft = vertical ? "ArrowUp" : "ArrowLeft";
    const towardsRight = vertical ? "ArrowDown" : "ArrowRight";
    const side = key === towardsLeft ? "left" : key === towardsRight ? "right" : undefined;
    if (!side || side === node.side) return undefined;
    return { nodeId, ...(node.parentId ? { parentId: node.parentId } : {}), side };
  }
  const { outward, inward } = axisKeys(document, node);
  if (key === outward) {
    const previous = siblings[index - 1];
    return previous ? { nodeId, parentId: previous.id } : undefined;
  }
  if (key === inward) {
    const parent = document.nodes.find((item) => item.id === node.parentId);
    if (!parent || parent.depth <= 1 || !parent.parentId) return undefined;
    const aunts = mindmapSiblings(document, parent);
    const beforeId = aunts[aunts.findIndex((item) => item.id === parent.id) + 1]?.id;
    const side = parent.depth === 2 && !isMirroredDirection(document) ? sideOf(parent) : undefined;
    return { nodeId, parentId: parent.parentId, ...(beforeId ? { beforeId } : {}), ...(side ? { side } : {}) };
  }
  return undefined;
}
