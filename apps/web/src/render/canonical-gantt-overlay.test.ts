// @vitest-environment jsdom

import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { describe, expect, it } from "vitest";
import { addCanonicalGanttOverlay, dayColumnBounds, timelineColumnWidth } from "./canonical-gantt-overlay";

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

describe("addCanonicalGanttOverlay with themed rounded-rect bars", () => {
  const tasks = parseGantt("@startgantt\n[Backend] lasts 4 days\n@endgantt").document.tasks;

  it("makes a task selectable when its bar is a filled rounded-rect <path> (weekend-split themed bars)", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<text x="10" y="30" font-size="12">Backend</text>' +
      '<path d="M50,20 L150,20 A4,4 0 0 1 154,24 L154,36 A4,4 0 0 1 150,40 L50,40 A4,4 0 0 1 46,36 L46,24 A4,4 0 0 1 50,20" fill="#4DABF5" stroke="#2196F3"/>' +
      "</svg>";
    const result = addCanonicalGanttOverlay(svg, tasks);
    expect(result).toContain(`data-task-id="${tasks[0]!.id}"`);
    expect(result).toContain(`data-visual-task-id="${tasks[0]!.id}"`);
  });

  it("makes a task selectable when its bar is an unfilled outline <path> (outline themes)", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<text x="10" y="30" font-size="12">Backend</text>' +
      '<path d="M50,20 L150,20 A4,4 0 0 1 154,24 L154,36 A4,4 0 0 1 150,40 L50,40 A4,4 0 0 1 46,36 L46,24 A4,4 0 0 1 50,20" fill="#00000000" stroke="#2196F3"/>' +
      "</svg>";
    const result = addCanonicalGanttOverlay(svg, tasks);
    expect(result).toContain(`data-task-id="${tasks[0]!.id}"`);
    expect(result).toContain(`data-visual-task-id="${tasks[0]!.id}"`);
  });
});

describe("Gantt task completion", () => {
  it("marks 100% tasks and fills only the completed portion of partial tasks", () => {
    const tasks = parseGantt(`@startgantt
[Architecture] lasts 4 days
[Architecture] is 100% completed
[Backend] lasts 4 days
[Backend] is 50% completed
[Frontend] lasts 4 days
[Frontend] is 0% completed
[Testing] lasts 4 days
@endgantt`).document.tasks;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <text x="10" y="30">Architecture</text>
      <rect x="120" y="20" width="100" height="13" fill="#aaa" />
      <text x="10" y="60">Backend</text>
      <rect x="120" y="50" width="40" height="13" fill="#123456" />
      <rect x="180" y="50" width="40" height="13" fill="#123456" />
      <text x="10" y="90">Frontend</text>
      <rect x="120" y="80" width="100" height="13" fill="#aaa" />
      <text x="10" y="120">Testing</text>
      <rect x="120" y="110" width="100" height="13" fill="#aaa" />
    </svg>`;
    const result = new DOMParser().parseFromString(addCanonicalGanttOverlay(svg, tasks), "image/svg+xml");
    expect(result.querySelector(`[data-visual-task-id="${tasks[0]!.id}"] .gantt-completion-label`)?.textContent).toBe(
      "100% ✓ Done",
    );
    expect(result.querySelector(`[data-completion-marker="${tasks[0]!.id}"]`)).not.toBeNull();
    expect(result.querySelector(`[data-visual-task-id="${tasks[1]!.id}"] .gantt-completion-label`)?.textContent).toBe(
      "50%",
    );
    expect(result.querySelector(`[data-completion-marker="${tasks[1]!.id}"]`)).toBeNull();
    expect(result.querySelector(`[data-visual-task-id="${tasks[2]!.id}"] .gantt-completion-label`)?.textContent).toBe(
      "0%",
    );
    expect(result.querySelector(`[data-visual-task-id="${tasks[3]!.id}"] .gantt-completion-label`)).toBeNull();
    const progress = result.querySelector(`[data-progress-task-id="${tasks[1]!.id}"]`);
    expect(progress?.getAttribute("x")).toBe("120");
    expect(progress?.getAttribute("width")).toBe("50");
    expect(progress?.getAttribute("fill")).toBe("#ffffff");
    expect(result.querySelectorAll("clipPath rect")).toHaveLength(2);
    expect(result.querySelector(`[data-task-id="${tasks[1]!.id}"]`)?.getAttribute("aria-label")).toBe(
      "Select Backend, 50% complete",
    );
    const second = new DOMParser().parseFromString(addCanonicalGanttOverlay(svg, tasks), "image/svg+xml");
    expect(second.querySelector(`[data-progress-task-id="${tasks[1]!.id}"]`)?.getAttribute("clip-path")).not.toBe(
      progress?.getAttribute("clip-path"),
    );
    expect(result.querySelector(`[data-progress-task-id="${tasks[0]!.id}"]`)).toBeNull();
    expect(result.querySelector(`[data-progress-task-id="${tasks[2]!.id}"]`)).toBeNull();
  });
});
