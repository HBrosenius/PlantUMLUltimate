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
    const resolved = resolveTaskDates(document.tasks, document.dependencies, "2026-09-01", parseGanttCalendar(source));
    const frontEndTesting = document.tasks.find((task) => task.label === "Front End Testing")!;
    expect(resolved.get(frontEndTesting.id)?.start).toBe("2026-09-24");
  });

  it("counts recurring pauses over the resolved calendar span rather than counting statements", () => {
    const source = `@startgantt
Project starts 2026-09-21
saturday are closed
sunday are closed
[A] lasts 10 days
[A] pauses on monday
[A] pauses on 2026-09-21
[B] starts at [A]'s end
[B] lasts 1 day
[C] starts 2026-09-21
[C] lasts 10 days
@endgantt`;
    const document = parseGantt(source).document;
    const calendar = parseGanttCalendar(source);
    const dates = resolveTaskDates(document.tasks, document.dependencies, document.projectStart?.value, calendar);
    expect(dates.get("a")?.end).toBe("2026-10-07");
    expect(dates.get("b")?.end).toBe("2026-10-08");
    const analysis = analyzeCriticalPath(document.tasks, document.dependencies, dates, calendar);
    expect(analysis.orderedTaskIds).toEqual(["a", "b"]);
    expect(analysis.projectDuration).toBe(18);
    expect(analysis.slackByTask.get("c")).toBe(4);
    expect(analyzeCriticalPath(document.tasks, document.dependencies, undefined, calendar)).toEqual(analysis);
  });

  it("does not invent a critical path for partially unresolved or reversed schedules", () => {
    const source = "@startgantt\n[A] lasts 2 days\n[B] starts $unknown\n[B] lasts 3 days\n@endgantt";
    const document = parseGantt(source).document;
    for (const dates of [
      new Map([["a", { start: "2026-09-21", end: "2026-09-22", derived: true }]]),
      new Map([
        ["a", { start: "2026-09-23", end: "2026-09-22", derived: true }],
        ["b", { start: "2026-09-21", end: "2026-09-24", derived: true }],
      ]),
    ]) {
      const analysis = analyzeCriticalPath(document.tasks, document.dependencies, dates, parseGanttCalendar(source));
      expect(analysis.taskIds.size).toBe(0);
      expect(analysis.slackByTask.size).toBe(0);
      expect(analysis.projectDuration).toBe(0);
      expect(analysis.blockers.length).toBeGreaterThan(0);
    }
  });

  it("counts a weekend gap as one available day of slack", () => {
    const source =
      "@startgantt\nsaturday are closed\nsunday are closed\n[A] starts 2026-09-25 and lasts 1 day\n[B] starts 2026-09-28 and lasts 1 day\n@endgantt";
    const document = parseGantt(source).document;
    const calendar = parseGanttCalendar(source);
    const dates = resolveTaskDates(document.tasks, [], undefined, calendar);
    const analysis = analyzeCriticalPath(document.tasks, [], dates, calendar);
    expect(analysis.slackByTask.get("a")).toBe(1);
    expect(analysis.taskIds.has("a")).toBe(false);
  });

  it("marks a task critical when a pause blocks its apparent calendar slack", () => {
    const source =
      "@startgantt\nsaturday are closed\nsunday are closed\n[A] starts 2026-09-25 and lasts 1 day\n[B] starts 2026-09-24 and lasts 1 day\n[B] pauses on friday\n@endgantt";
    const document = parseGantt(source).document;
    const calendar = parseGanttCalendar(source);
    const dates = resolveTaskDates(document.tasks, [], undefined, calendar);
    const analysis = analyzeCriticalPath(document.tasks, [], dates, calendar);
    expect(analysis.slackByTask.get("b")).toBe(0);
    expect(analysis.taskIds.has("b")).toBe(true);
  });

  it("reports the specific resolver issue as a selectable task blocker", () => {
    const document = parseGantt("@startgantt\n[A] lasts 2 days\n@endgantt").document;
    const analysis = analyzeCriticalPath(
      document.tasks,
      [],
      new Map([["a", { derived: true, issue: "Start date cannot be resolved: $unknown" }]]),
      parseGanttCalendar(""),
    );
    expect(analysis.blockers).toEqual([{ taskId: "a", reason: "Start date cannot be resolved: $unknown" }]);
  });

  it("uses every relationship between a pair when propagating slack", () => {
    const source = `@startgantt
[A] starts 2026-09-21 and lasts 2 days
[B] starts 2026-09-23 and lasts 4 days
[B] starts at [A]'s start
[B] ends 4 days after [A]'s end
@endgantt`;
    const document = parseGantt(source).document;
    const calendar = parseGanttCalendar(source);
    const dates = resolveTaskDates(document.tasks, document.dependencies, undefined, calendar);
    expect(analyzeCriticalPath(document.tasks, document.dependencies, dates, calendar).orderedTaskIds).toEqual([
      "a",
      "b",
    ]);
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
