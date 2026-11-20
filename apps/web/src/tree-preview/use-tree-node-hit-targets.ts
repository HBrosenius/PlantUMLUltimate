import { useLayoutEffect, type DependencyList, type RefObject } from "react";

/** The part of a parsed tree node the label matching needs. */
export interface TreeHitNode {
  id: string;
  label: string;
}

export interface TreeNodeHitBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A node found in the rendered SVG. */
export interface TreeNodeHitTarget {
  /** The first `<text>` of the label. It receives focus and the hit box is placed in front of it. */
  text: SVGTextElement;
  /** Every `<text>` of the label: one per line of a multi-line label. */
  texts: SVGTextElement[];
  /** Union of the bounding boxes of `texts`. */
  bounds: TreeNodeHitBounds;
}

export interface TreeNodeHitTargetOptions {
  /** The attribute written on the matched text and on the hit box, such as `data-wbs-node-id`. */
  attribute: string;
  /** Class of the transparent hit box drawn behind each label. */
  hitClass: string;
  /** Class that marks the selected node. It is cleared from a freshly matched text. */
  selectedClass: string;
  /** Elements from an earlier pass that are removed before matching (the hit box class and any extras). */
  staleSelector: string;
  /** Accessible name of a node's text. */
  ariaLabel(node: TreeHitNode): string;
}

/**
 * Matches labels to rendered `<text>` elements one at a time, in the order they are requested.
 * A text is used once, so duplicate labels (`Pros`, `Cons`) go to successive nodes. PlantUML renders a
 * multi-line `*: line one\nline two;` label as one `<text>` per line, so a label containing "\n" is
 * matched against a run of consecutive, unclaimed elements whose trimmed contents equal its lines.
 */
export function createTreeLabelMatcher<T extends { textContent: string | null }>(texts: readonly T[]) {
  const claimed = new Set<T>();
  return (label: string): T[] | undefined => {
    const lines = label.split("\n");
    let found: T[] | undefined;
    if (lines.length === 1) {
      const text = texts.find((candidate) => !claimed.has(candidate) && candidate.textContent?.trim() === label);
      found = text ? [text] : undefined;
    } else {
      for (let start = 0; start + lines.length <= texts.length; start += 1) {
        const run = texts.slice(start, start + lines.length);
        if (run.some((candidate) => claimed.has(candidate))) continue;
        if (run.every((candidate, index) => candidate.textContent?.trim() === lines[index])) {
          found = run;
          break;
        }
      }
    }
    found?.forEach((candidate) => claimed.add(candidate));
    return found;
  };
}

const unionOf = (boxes: TreeNodeHitBounds[]): TreeNodeHitBounds =>
  boxes.slice(1).reduce(
    (union, box) => {
      const x = Math.min(union.x, box.x);
      const y = Math.min(union.y, box.y);
      return {
        x,
        y,
        width: Math.max(union.x + union.width, box.x + box.width) - x,
        height: Math.max(union.y + union.height, box.y + box.height) - y,
      };
    },
    { x: boxes[0]!.x, y: boxes[0]!.y, width: boxes[0]!.width, height: boxes[0]!.height },
  );

/**
 * Marks every node's text in the rendered SVG: the node id attribute, focus and role, an accessible name
 * and a hit box in front of the label. Returns the nodes that were found, in the order given.
 */
export function bindTreeNodeHitTargets(
  host: HTMLElement,
  nodes: readonly TreeHitNode[],
  options: TreeNodeHitTargetOptions,
): Map<string, TreeNodeHitTarget> {
  host.querySelectorAll(options.staleSelector).forEach((item) => item.remove());
  const targets = new Map<string, TreeNodeHitTarget>();
  const match = createTreeLabelMatcher([...host.querySelectorAll<SVGTextElement>("svg text")]);
  for (const node of nodes) {
    const texts = match(node.label);
    if (!texts || texts.length === 0) continue;
    const text = texts[0]!;
    texts.forEach((candidate) => {
      candidate.setAttribute(options.attribute, node.id);
      candidate.classList.remove(options.selectedClass);
    });
    text.setAttribute("tabindex", "0");
    text.setAttribute("role", "button");
    text.setAttribute("aria-label", options.ariaLabel(node));
    const bounds = unionOf(texts.map((candidate) => candidate.getBBox()));
    const hit = globalThis.document.createElementNS("http://www.w3.org/2000/svg", "rect");
    hit.setAttribute("x", String(bounds.x - 12));
    hit.setAttribute("y", String(bounds.y - 8));
    hit.setAttribute("width", String(bounds.width + 24));
    hit.setAttribute("height", String(bounds.height + 16));
    hit.setAttribute("rx", "7");
    hit.setAttribute("class", options.hitClass);
    hit.setAttribute("aria-hidden", "true");
    hit.setAttribute(options.attribute, node.id);
    text.parentNode?.insertBefore(hit, text);
    targets.set(node.id, { text, texts, bounds });
  }
  return targets;
}

/**
 * Binds the nodes of a tree preview (WBS, and later mindmap) to the rendered SVG after every layout in
 * which `deps` change. `deps` are the caller's own triggers (the SVG, the nodes and anything else that
 * redraws the overlay), so the caller keeps exactly the re-render behaviour it had before. Effects run
 * in declaration order, so a caller's later effect can read `targets.current` to add its own overlays.
 */
export function useTreeNodeHitTargets(
  host: RefObject<HTMLElement | null>,
  nodes: readonly TreeHitNode[],
  options: TreeNodeHitTargetOptions,
  targets: { current: Map<string, TreeNodeHitTarget> },
  deps: DependencyList,
): void {
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    targets.current = bindTreeNodeHitTargets(element, nodes, options);
    // The caller chooses `deps` on purpose: they are the redraw triggers, not the closed-over values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
