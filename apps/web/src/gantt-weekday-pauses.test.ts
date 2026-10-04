import { describe, expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseGanttCalendar } from "./gantt-calendar";
import { resolveTaskDates } from "./gantt-schedule";
import { buildResourceWorkloads } from "./ResourceWorkloadPanel";
import { calculateProgressForecast } from "./gantt-progress-forecast";
import { compareForecastResourceConflicts } from "./gantt-forecast-resource-conflicts";
import { prepareForecastApply } from "./gantt-apply-forecast";

const calendarSource = "saturday are closed\nsunday are closed\n2026-09-22 is opened";

describe("weekday pauses across schedule calculations", () => {
  it.each([
    ["starts 2026-09-21", "2026-09-21", "2026-09-28"],
    ["ends 2026-09-28", "2026-09-21", "2026-09-28"],
  ])("resolves %s and dependent tasks without consuming paused weekdays", (anchor, start, end) => {
    const source = `@startgantt\n${calendarSource}\n[A] ${anchor}\n[A] lasts 5 days\n[A] pauses on TUESDAY\n[B] starts at [A]'s end\n[B] lasts 1 day\n@endgantt`;
    const document = parseGantt(source).document;
    const plan = resolveTaskDates(document.tasks, document.dependencies, undefined, parseGanttCalendar(source));
    expect(plan.get("a")).toMatchObject({ start, end });
    expect(plan.get("b")).toMatchObject({ start: "2026-09-29", end: "2026-09-29" });
  });

  it.each(["lasts 5 days", "ends 2026-09-28"])("assigns workload for %s only on available days", (constraint) => {
    const source = `@startgantt\n${calendarSource}\n[A] on {Alice} starts 2026-09-21\n[A] ${constraint}\n[A] pauses on tuesday\n[A] pauses on 2026-09-22\n@endgantt`;
    const document = parseGantt(source).document;
    const calendar = parseGanttCalendar(source);
    const plan = resolveTaskDates(document.tasks, document.dependencies, undefined, calendar);
    expect(buildResourceWorkloads(document.tasks, plan, calendar)[0]?.days.map((day) => day.date)).toEqual([
      "2026-09-21",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-28",
    ]);
  });

  it("keeps forecast, resource comparisons and applied dates consistent for an explicit date window", () => {
    const source = `@startgantt\n${calendarSource}\n[A] on {Alice} starts 2026-09-21\n[A] ends 2026-09-25\n[A] pauses on tuesday\n[A] is 0% completed\n@endgantt`;
    const document = parseGantt(source).document;
    const calendar = parseGanttCalendar(source);
    const plan = resolveTaskDates(document.tasks, document.dependencies, undefined, calendar);
    const forecast = calculateProgressForecast(document.tasks, document.dependencies, plan, calendar, "2026-09-28");
    expect(forecast.tasks.get("a")).toMatchObject({ start: "2026-09-28", end: "2026-10-02", remainingDays: 4 });
    const comparison = compareForecastResourceConflicts(
      document.tasks,
      forecast,
      plan,
      calendar,
      { Alice: 50 },
      "2026-09-28",
    );
    expect(comparison.unavailable).toBe(false);
    expect(comparison.conflicts.map((item) => item.date)).toEqual([
      "2026-09-28",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
    const review = prepareForecastApply(source, "2026-09-28", {});
    expect(review.error).toBeUndefined();
    expect(review.sourceAfter).toContain("[A] pauses on tuesday");
    const applied = parseGantt(review.sourceAfter!).document;
    expect(resolveTaskDates(applied.tasks, applied.dependencies, undefined, calendar).get("a")).toMatchObject({
      start: "2026-09-28",
      end: "2026-10-02",
    });
  });

  it("leaves an all-paused task unresolved instead of hanging", () => {
    const pauses = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
      .map((day) => `[A] pauses on ${day}`)
      .join("\n");
    const source = `@startgantt\n[A] starts 2026-09-21\n[A] lasts 1 day\n${pauses}\n@endgantt`;
    const document = parseGantt(source).document;
    const calendar = parseGanttCalendar(source);
    const plan = resolveTaskDates(document.tasks, document.dependencies, undefined, calendar);
    expect(plan.get("a")?.end).toBeUndefined();
    expect(
      calculateProgressForecast(document.tasks, document.dependencies, plan, calendar, "2026-09-21").tasks.get("a")
        ?.issue,
    ).toBeDefined();
  });
});
