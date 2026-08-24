import { describe, expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import {
  baselineBarGeometry,
  calculateTaskVariance,
  criticalPathTaskIds,
  timelineBaselineX,
} from "./schedule-analysis";
import { resolveTaskDates } from "./gantt-schedule";
import { parseGanttCalendar } from "./gantt-calendar";

describe("schedule analysis", () => {
  it("finds the longest dependency chain", () => {
    const document = parseGantt(`@startgantt
[A] lasts 3 days
[B] lasts 5 days and starts at [A]'s end
[C] lasts 2 days and starts at [A]'s end
@endgantt`).document;
    expect([...criticalPathTaskIds(document.tasks, document.dependencies)].sort()).toEqual(["a", "b"]);
  });

  it("accounts for start/start and end/end relationship constraints", () => {
    const document = parseGantt(`@startgantt
[A] lasts 8 days
[B] lasts 8 days and starts at [A]'s start
[C] lasts 3 days and ends at [B]'s end
@endgantt`).document;
    expect([...criticalPathTaskIds(document.tasks, document.dependencies)].sort()).toEqual(["a", "b", "c"]);
  });

  it("reports movement against resolved baseline dates", () => {
    const current = new Map([["a", { start: "2026-09-03", end: "2026-09-05", derived: false }]]);
    const baseline = new Map([["a", { start: "2026-09-01", end: "2026-09-03", derived: false }]]);
    expect(calculateTaskVariance(current, baseline)).toEqual([
      { taskId: "a", kind: "changed", startDays: 2, endDays: 2 },
    ]);
  });

  it("classifies tasks added and removed since the baseline", () => {
    const current = new Map([["new", { start: "2026-09-02", end: "2026-09-03", derived: false }]]);
    const baseline = new Map([["old", { start: "2026-09-01", end: "2026-09-02", derived: false }]]);
    expect(calculateTaskVariance(current, baseline)).toEqual([
      { taskId: "new", kind: "added", startDays: 0, endDays: 0 },
      { taskId: "old", kind: "removed", startDays: 0, endDays: 0 },
    ]);
  });

  it("resolves a stored baseline independently", () => {
    const source = "@startgantt\nProject starts 2026-09-01\n[A] lasts 2 days\n@endgantt";
    const document = parseGantt(source).document;
    expect(
      resolveTaskDates(document.tasks, document.dependencies, "2026-09-01", parseGanttCalendar(source)).get("a")?.end,
    ).toBe("2026-09-02");
  });

  it("draws baseline bars with the canonical task inset and full task height", () => {
    expect(baselineBarGeometry(50, 16, 3, 2)).toEqual({ x: 2, width: 28 });
  });

  it("scales a measured fractional PlantUML span without rounding it", () => {
    expect(baselineBarGeometry(80, 13.5, 2, 4.5)).toEqual({ x: 53, width: 56.75 });
  });

  it("anchors the ghost to its baseline timeline column instead of the current task", () => {
    const columns = [
      { date: "2026-09-01", x: 5.22 },
      { date: "2026-09-02", x: 21.22 },
    ];
    expect(timelineBaselineX(columns, "2026-09-01", 16, 2, 500)).toBe(2);
    expect(timelineBaselineX(columns, "2026-09-02", 16, 2, 500)).toBe(18);
    expect(timelineBaselineX(columns, "2026-08-31", 16, 2, 500)).toBe(500);
  });
});
