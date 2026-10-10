import { expect, it } from "vitest";
import { initialDiagramZoom } from "./initial-diagram-zoom";

it("fits compact diagrams without enlarging them", () => {
  expect(initialDiagramZoom(800, 600, 800, 600)).toBeCloseTo(568 / 600);
  expect(initialDiagramZoom(300, 200, 800, 600)).toBe(1);
});
it("keeps long Sequence timelines readable instead of shrinking them to viewport height", () => {
  expect(initialDiagramZoom(600, 5000, 800, 600)).toBe(1);
});
it("limits initial shrinking for wide diagrams and narrow viewports", () => {
  expect(initialDiagramZoom(4000, 600, 800, 600)).toBe(0.75);
  expect(initialDiagramZoom(600, 5000, 390, 600)).toBe(0.75);
});

it("uses natural SVG size when CSS has stretched a narrow Sequence diagram", () => {
  expect(initialDiagramZoom(600, 12000, 800, 600, 180)).toBeCloseTo(0.3);
  expect(initialDiagramZoom(300, 1200, 390, 600, 900)).toBeCloseTo(2.25);
});
