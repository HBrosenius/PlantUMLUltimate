import { describe, expect, it } from "vitest";
import { placeDock } from "./dock-placement";

const canvas = { width: 1000, height: 700 };
const dock = { width: 300, height: 40 };

describe("placeDock", () => {
  it("prefers below the selection", () => {
    const placed = placeDock({ left: 400, top: 200, width: 100, height: 30 }, dock, canvas, []);
    expect(placed.side).toBe("below");
    expect(placed.top).toBe(240);
  });

  it("goes above when a neighbour row sits below", () => {
    const anchor = { left: 400, top: 300, width: 100, height: 30 };
    const below = { left: 380, top: 340, width: 300, height: 40 };
    const placed = placeDock(anchor, dock, canvas, [below]);
    expect(placed.side).toBe("above");
    expect(placed.top).toBeLessThan(anchor.top);
  });

  it("goes beside a tall element whose rows above and below are occupied", () => {
    const anchor = { left: 100, top: 100, width: 60, height: 400 };
    const neighbours = [
      { left: 60, top: 40, width: 400, height: 50 },
      { left: 60, top: 510, width: 400, height: 50 },
    ];
    const placed = placeDock(anchor, dock, canvas, neighbours);
    expect(placed.side).toBe("right");
    expect(placed.left).toBeGreaterThanOrEqual(anchor.left + anchor.width);
  });

  it("flips above near the bottom and stays inside the canvas", () => {
    const placed = placeDock({ left: 10, top: 650, width: 40, height: 30 }, dock, canvas, []);
    expect(placed.side).not.toBe("below");
    expect(placed.left).toBeGreaterThanOrEqual(8);
    expect(placed.top + dock.height).toBeLessThanOrEqual(canvas.height);
  });
});
