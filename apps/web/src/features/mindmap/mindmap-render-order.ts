import {
  isMirroredDirection,
  mindmapEmissionOrder,
  type MindmapDocument,
  type MindmapNode,
} from "@plantuml-studio/diagram-mindmap";

/** The depth-2 node that decides a node's side: the node itself or its ancestor at depth 2. */
function sideOwner(nodes: ReadonlyMap<string, MindmapNode>, node: MindmapNode): MindmapNode | undefined {
  let current: MindmapNode | undefined = node;
  while (current && current.depth > 2) current = current.parentId ? nodes.get(current.parentId) : undefined;
  return current?.depth === 2 ? current : undefined;
}

export { isMirroredDirection };

/**
 * The order in which the engine writes a mindmap's node labels into the SVG, which is what the
 * preview needs to give duplicate labels (`Pros`, `Cons`) to the right node.
 *
 * `left to right` and `top to bottom`: per root, the root, every right-side node in source order,
 * then every left-side node in source order (`mindmapEmissionOrder`).
 *
 * `right to left` and `bottom to top` (drawn identically): `left side` means nothing there, and
 * the engine draws every `+` branch first and then every other branch, each group in source order.
 * Measured with the pinned engine, for example `++ P1`, `** S1`, `++ P2`, `-- M1` is drawn
 * `P1, P2, S1, M1`.
 */
export function mindmapRenderOrder(document: MindmapDocument): MindmapNode[] {
  if (!isMirroredDirection(document)) return mindmapEmissionOrder(document);
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const groups: MindmapNode[][] = [];
  for (const node of document.nodes) {
    if (node.depth === 1 || groups.length === 0) groups.push([]);
    groups[groups.length - 1]!.push(node);
  }
  return groups.flatMap((group) => {
    const root = group[0]!.depth === 1 ? [group[0]!] : [];
    const rest = group.slice(root.length);
    const plus = (node: MindmapNode) => sideOwner(byId, node)?.marker.startsWith("+") === true;
    return [...root, ...rest.filter(plus), ...rest.filter((node) => !plus(node))];
  });
}
