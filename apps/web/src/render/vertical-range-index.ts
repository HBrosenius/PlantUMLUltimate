/** Immutable point-query index. Results retain original SVG paint order and inclusive edges. */
export function verticalRangeIndex<T>(
  items: readonly T[],
  bounds: (item: T) => { y: number; height: number } | undefined,
) {
  const sorted = items
    .flatMap((item, order) => {
      const box = bounds(item);
      return box ? [{ item, order, start: box.y, end: box.y + box.height }] : [];
    })
    .sort((a, b) => a.start - b.start);
  type Node = { entry: (typeof sorted)[number]; maximumEnd: number; left?: Node | undefined; right?: Node | undefined };
  const build = (from: number, to: number): Node | undefined => {
    if (from >= to) return undefined;
    const middle = (from + to) >>> 1;
    const entry = sorted[middle]!;
    const left = build(from, middle),
      right = build(middle + 1, to);
    return {
      entry,
      left,
      right,
      maximumEnd: Math.max(entry.end, left?.maximumEnd ?? -Infinity, right?.maximumEnd ?? -Infinity),
    };
  };
  const root = build(0, sorted.length);
  return (y: number): T[] => {
    const found: typeof sorted = [];
    const visit = (node: Node | undefined) => {
      if (!node || node.maximumEnd < y) return;
      visit(node.left);
      if (node.entry.start > y) return;
      if (node.entry.end >= y) found.push(node.entry);
      visit(node.right);
    };
    visit(root);
    return found.sort((a, b) => a.order - b.order).map(({ item }) => item);
  };
}
