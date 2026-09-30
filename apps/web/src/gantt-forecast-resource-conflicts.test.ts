import { describe, expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseGanttCalendar } from "./gantt-calendar";
import { calculateProgressForecast } from "./gantt-progress-forecast";
import { compareForecastResourceConflicts } from "./gantt-forecast-resource-conflicts";
import { resolveTaskDates } from "./gantt-schedule";
import { buildResourceOverAllocations } from "./ResourceWorkloadPanel";

function compare(source: string, capacity = 100) {
  const gantt = parseGantt(source).document;
  const calendar = parseGanttCalendar(source);
  const plan = resolveTaskDates(gantt.tasks, gantt.dependencies, gantt.projectStart?.value, calendar);
  const forecast = calculateProgressForecast(gantt.tasks, gantt.dependencies, plan, calendar, "2026-09-30");
  return compareForecastResourceConflicts(gantt.tasks, forecast, plan, calendar, { Alice: capacity }, "2026-09-30");
}

describe("forecast resource conflicts", () => {
  it("finds new daily conflicts caused by moving unfinished work, excluding completed work", () => {
    const source = `@startgantt
Project starts 2026-09-21
saturday are closed
sunday are closed
[Done] on {Alice} starts 2026-09-30
[Done] lasts 2 days
[Done] is 100% completed
[Backend] on {Alice} starts 2026-09-21
[Backend] lasts 3 days
[Backend] is 50% completed
[Review] on {Alice} starts 2026-09-30
[Review] lasts 2 days
@endgantt`;
    const result = compare(source);
    expect(result.unavailable).toBe(false);
    expect(result.conflicts).toEqual([
      {
        resource: "Alice",
        date: "2026-09-30",
        capacity: 100,
        plannedAllocation: 100,
        forecastAllocation: 200,
        kind: "new",
        tasks: [
          { id: "backend", label: "Backend" },
          { id: "review", label: "Review" },
        ],
      },
      {
        resource: "Alice",
        date: "2026-10-01",
        capacity: 100,
        plannedAllocation: 100,
        forecastAllocation: 200,
        kind: "new",
        tasks: [
          { id: "backend", label: "Backend" },
          { id: "review", label: "Review" },
        ],
      },
    ]);
    expect(compare(source, 200).conflicts).toEqual([]);
  });

  it("distinguishes conflicts already present in the plan", () => {
    const source = `@startgantt
Project starts 2026-09-30
[Backend] on {Alice} starts 2026-09-30
[Backend] lasts 2 days
[Review] on {Alice} starts 2026-09-30
[Review] lasts 2 days
@endgantt`;
    expect(compare(source).conflicts).toMatchObject([
      { date: "2026-09-30", kind: "existing", plannedAllocation: 200, forecastAllocation: 200 },
      { date: "2026-10-01", kind: "existing", plannedAllocation: 200, forecastAllocation: 200 },
    ]);
  });

  it("uses resolved planned dates for tasks with an explicit finish", () => {
    const source = `@startgantt
Project starts 2026-09-21
saturday are closed
sunday are closed
[Backend] on {Alice} starts 2026-09-21
[Backend] ends 2026-09-23
[Backend] is 50% completed
[Review] on {Alice} starts 2026-09-30
[Review] lasts 2 days
@endgantt`;
    expect(compare(source).conflicts).toMatchObject([
      { date: "2026-09-30", kind: "new", plannedAllocation: 100, forecastAllocation: 200 },
      { date: "2026-10-01", kind: "new", plannedAllocation: 100, forecastAllocation: 200 },
    ]);
  });

  it("labels plan conflicts of start/end-dated tasks as existing, agreeing with the resource panel", () => {
    const source = `@startgantt
Project starts 2026-09-21
[A] on {Alice} starts 2026-10-05 and ends 2026-10-07
[B] on {Alice} starts 2026-10-05 and ends 2026-10-07
@endgantt`;
    const result = compare(source);
    expect(result.conflicts.map((item) => [item.date, item.plannedAllocation, item.kind])).toEqual([
      ["2026-10-05", 200, "existing"],
      ["2026-10-06", 200, "existing"],
      ["2026-10-07", 200, "existing"],
    ]);
    const gantt = parseGantt(source).document;
    const calendar = parseGanttCalendar(source);
    const plan = resolveTaskDates(gantt.tasks, gantt.dependencies, gantt.projectStart?.value, calendar);
    expect(buildResourceOverAllocations(gantt.tasks, { Alice: 100 }, plan, calendar)).toMatchObject([
      { name: "Alice", peak: 200, days: 3 },
    ]);
  });
});
