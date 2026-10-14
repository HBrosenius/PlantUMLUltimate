import { expect, it } from "vitest";
import { verticalRangeIndex } from "./vertical-range-index";
it("matches a linear scan, including shared edges, missing bounds and original paint order", () => {
  const items = Array.from({ length: 500 }, (_, index) => ({ id: index, y: (index * 37) % 800, height: index % 39 }));
  const bounds = (item: (typeof items)[number]) => (item.id % 7 ? item : undefined);
  const query = verticalRangeIndex(items, bounds);
  for (let y = -1; y < 840; y++)
    expect(query(y)).toEqual(items.filter((item) => bounds(item) && item.y <= y && y <= item.y + item.height));
});
