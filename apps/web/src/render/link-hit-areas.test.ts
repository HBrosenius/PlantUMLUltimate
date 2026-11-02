import { describe, expect, it } from "vitest";
import { subtractLinkBounds } from "./link-hit-areas";
const bounds = { x: 0, y: 0, width: 10, height: 10 };
const area = (pieces: ReturnType<typeof subtractLinkBounds>) => pieces.reduce((sum, p) => sum + p.width * p.height, 0);
describe("diagram link hit areas", () => {
  it("retains the original target when links do not overlap it", () => {
    expect(subtractLinkBounds(bounds, [{ x: 20, y: 20, width: 3, height: 4 }])).toEqual([bounds]);
  });
  it("preserves dragging outside the linked region", () => {
    const pieces = subtractLinkBounds(bounds, [{ x: 2, y: 2, width: 6, height: 6 }]);
    expect(area(pieces)).toBe(64);
    expect(pieces.some((p) => p.x <= 1 && p.y <= 1 && p.x + p.width >= 1 && p.y + p.height >= 1)).toBe(true);
    expect(pieces.some((p) => p.x < 5 && p.y < 5 && p.x + p.width > 5 && p.y + p.height > 5)).toBe(false);
  });
  it("does not reopen the overlap between two links", () => {
    const pieces = subtractLinkBounds(bounds, [
      { x: 2, y: 2, width: 6, height: 6 },
      { x: 4, y: 4, width: 5, height: 5 },
    ]);
    expect(area(pieces)).toBe(55);
    expect(pieces.some((p) => p.x < 6 && p.y < 6 && p.x + p.width > 6 && p.y + p.height > 6)).toBe(false);
  });
  it("removes only covered targets and clips links extending beyond the target", () => {
    expect(subtractLinkBounds(bounds, [{ x: -1, y: -1, width: 12, height: 12 }])).toEqual([]);
    expect(area(subtractLinkBounds(bounds, [{ x: -1, y: -1, width: 6, height: 6 }]))).toBe(75);
  });
});
