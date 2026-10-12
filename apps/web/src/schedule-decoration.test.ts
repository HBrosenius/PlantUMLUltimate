// @vitest-environment jsdom

import { expect, it } from "vitest";
import { decorateScheduleAnalysis } from "./schedule-analysis";

const svg = `<svg xmlns="http://www.w3.org/2000/svg"><g data-task-id="a" data-day-width="16"><rect class="bar" x="50" y="20" width="28" height="12"/></g></svg>`;

it("preserves SVG bytes when there are no schedule decorations to draw", () => {
  expect(
    decorateScheduleAnalysis(
      svg,
      new Set(),
      [
        { taskId: "a", kind: "added", startDays: 0, endDays: 0 },
        { taskId: "b", kind: "unchanged", startDays: 0, endDays: 0 },
      ],
      new Map(),
      new Map(),
    ),
  ).toBe(svg);
});

it("still marks critical tasks when there is no baseline variance", () => {
  const result = decorateScheduleAnalysis(svg, new Set(["a"]), [], new Map(), new Map());
  const document = new DOMParser().parseFromString(result, "image/svg+xml");
  expect(document.querySelector('[data-task-id="a"]')?.getAttribute("data-critical-path")).toBe("true");
});

it("still draws changed baseline bars when critical-path highlighting is off", () => {
  const result = decorateScheduleAnalysis(
    svg,
    new Set(),
    [{ taskId: "a", kind: "changed", startDays: 1, endDays: 1 }],
    new Map([["a", { start: "2026-10-02", end: "2026-10-03", derived: false }]]),
    new Map([["a", { start: "2026-10-01", end: "2026-10-02", derived: false }]]),
  );
  const document = new DOMParser().parseFromString(result, "image/svg+xml");
  expect(document.querySelector('[data-baseline-task-id="a"]')?.getAttribute("x")).toBe("34");
});
