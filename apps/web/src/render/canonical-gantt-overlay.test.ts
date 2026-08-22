import { describe, expect, it } from "vitest";
import { dayColumnBounds, timelineColumnWidth } from "./canonical-gantt-overlay";

describe("shared timeline column geometry", () => {
  it.each([8, 16, 23.5, 31.25])("derives stable day width at %s SVG units", (width) => {
    const centers = Array.from({ length: 31 }, (_, index) => 100 + index * width);
    expect(timelineColumnWidth(centers)).toBeCloseTo(width);
  });

  it("keeps adjacent Friday, weekend, and Monday boundaries exact", () => {
    const width = 16;
    const friday = dayColumnBounds(100, width);
    const saturday = dayColumnBounds(116, width);
    const sunday = dayColumnBounds(132, width);
    const monday = dayColumnBounds(148, width);
    expect(saturday.left).toBe(friday.right);
    expect(saturday.right).toBe(sunday.left);
    expect(sunday.right).toBe(monday.left);
  });

  it("is invariant under zoom and horizontal scrolling", () => {
    const bounds = dayColumnBounds(412.75, 17.5);
    for (const zoom of [0.5, 0.8, 1, 1.35, 2, 3]) {
      const scroll = 137;
      const screenLeft = bounds.left * zoom - scroll;
      const screenRight = bounds.right * zoom - scroll;
      expect(screenRight - screenLeft).toBeCloseTo(17.5 * zoom);
    }
  });

  it.each([28, 29, 30, 31])("keeps exact boundaries across a %s-day month", (days) => {
    const width = 13.25;
    const centers = Array.from({ length: days + 2 }, (_, index) => 50 + index * width);
    const derived = timelineColumnWidth(centers)!;
    centers.slice(1).forEach((center, index) => {
      expect(dayColumnBounds(centers[index]!, derived).right).toBeCloseTo(dayColumnBounds(center, derived).left);
    });
  });
});
