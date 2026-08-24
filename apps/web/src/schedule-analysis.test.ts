import { describe, expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import {
  baselineBarGeometry,
  analyzeCriticalPath,
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
    const analysis = analyzeCriticalPath(document.tasks, document.dependencies);
    expect(analysis.orderedTaskIds).toEqual(["a", "b"]);
    expect(analysis.projectDuration).toBe(8);
    expect(analysis.slackByTask.get("c")).toBe(3);
  });

  it("accounts for start/start and end/end relationship constraints", () => {
    const document = parseGantt(`@startgantt
[A] lasts 8 days
[B] lasts 8 days and starts at [A]'s start
[C] lasts 3 days and ends at [B]'s end
@endgantt`).document;
    expect([...criticalPathTaskIds(document.tasks, document.dependencies)].sort()).toEqual(["a", "b", "c"]);
  });

  it("uses resolved calendar dates for explicitly dated critical paths", () => {
    const source = `@startgantt
Project starts 2026-08-10
saturday are closed
sunday are closed
[Unified Messaging Analytics Front End] starts 2026-08-13 and ends 2026-09-24
[Unified Messaging Analytics Front End Testing] starts at [Unified Messaging Analytics Front End]'s end
[Unified Messaging Analytics Front End Testing] lasts 21 days
[Unified UnMasked Messaging Download Report Testing] starts 2026-09-16 and ends 2026-09-30
[Unified End To End Testing] starts at [Unified UnMasked Messaging Download Report Testing]'s end
[Unified End To End Testing] lasts 11 days
@endgantt`;
    const document = parseGantt(source).document;
    const calendar = parseGanttCalendar(source);
    const resolved = resolveTaskDates(document.tasks, document.dependencies, "2026-08-10", calendar);
    const analysis = analyzeCriticalPath(document.tasks, document.dependencies, resolved, calendar);
    const analytics = document.tasks.filter((task) => task.label.startsWith("Unified Messaging Analytics Front End"));
    expect(resolved.get(analytics[1]!.id)?.end).toBe("2026-10-23");
    expect([...analysis.taskIds]).toEqual(analytics.map((task) => task.id));
  });

  it("resolves a task from the latest of multiple predecessor constraints", () => {
    const source = `@startgantt
Project starts 2026-09-01
saturday are closed
sunday are closed
[Back End] starts 2026-09-01 and ends 2026-09-02
[Back End Testing] starts at [Back End]'s end
[Back End Testing] lasts 15 days
[Front End] starts 2026-09-01 and ends 2026-09-15
[Front End Testing] starts at [Front End]'s end
[Front End Testing] lasts 15 days
[Front End Testing] starts at [Back End Testing]'s end
@endgantt`;
    const document = parseGantt(source).document;
    const resolved = resolveTaskDates(
      document.tasks,
      document.dependencies,
      "2026-09-01",
      parseGanttCalendar(source),
    );
    const frontEndTesting = document.tasks.find((task) => task.label === "Front End Testing")!;
    expect(resolved.get(frontEndTesting.id)?.start).toBe("2026-09-24");
  });

  it("reports movement against resolved baseline dates", () => {
    const current = new Map([["a", { start: "2026-09-03", end: "2026-09-05", derived: false }]]);
    const baseline = new Map([["a", { start: "2026-09-01", end: "2026-09-03", derived: false }]]);
    expect(calculateTaskVariance(current, baseline)).toEqual([
      { taskId: "a", kind: "changed", startDays: 2, endDays: 2 },
    ]);
  });

  it("treats equal rendered positions as unchanged across closed-day source dates", () => {
    const current = new Map([["a", { start: "2026-09-06", end: "2026-09-18", derived: false }]]);
    const baseline = new Map([["a", { start: "2026-09-05", end: "2026-09-18", derived: false }]]);
    const currentGeometry = new Map([["a", { startDate: "2026-09-07", span: 12 }]]);
    const baselineGeometry = new Map([["a", { startDate: "2026-09-07", span: 12 }]]);
    expect(calculateTaskVariance(current, baseline, currentGeometry, baselineGeometry)).toEqual([
      { taskId: "a", kind: "unchanged", startDays: 0, endDays: 0 },
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
