import { expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseGanttCalendar } from "./gantt-calendar";
import { dependencyDate, resolveTaskDates } from "./gantt-schedule";
import { calculateProgressForecast } from "./gantt-progress-forecast";
import { analyzeCriticalPath } from "./schedule-analysis";

it.each([
  ["after", 0, "2026-09-28"],
  ["before", 0, "2026-09-24"],
  ["after", 2, "2026-09-27"],
  ["before", 2, "2026-09-23"],
  ["after", -2, "2026-09-23"],
  ["before", -2, "2026-09-27"],
] as const)("resolves %s offset %s consistently", (direction, offset, expected) => {
  const source =
    "@startgantt\nsaturday are closed\nsunday are closed\n[A] starts 2026-09-25 and lasts 1 day\n[B] starts at [A]'s end and lasts 1 day\n@endgantt";
  const document = parseGantt(source).document;
  const dependency = { ...document.dependencies[0]!, direction, offset: { value: offset, range: { from: 0, to: 0 } } };
  const calendar = parseGanttCalendar(source);
  expect(dependencyDate("2026-09-25", dependency, calendar)).toBe(expected);
  expect(resolveTaskDates(document.tasks, [dependency], undefined, calendar).get("b")?.start).toBe(expected);
});

it("chooses the tightest before boundary and preserves task pauses", () => {
  const source =
    "@startgantt\nsaturday are closed\nsunday are closed\n[A] starts 2026-10-02 and lasts 1 day\n[B] starts 2026-09-30 and lasts 1 day\n[C] starts 2 days before [A]'s start\n[C] starts 1 day before [B]'s start\n[C] lasts 2 days\n[C] pauses on tuesday\n@endgantt";
  const document = parseGantt(source).document;
  const calendar = parseGanttCalendar(source);
  const dates = resolveTaskDates(document.tasks, document.dependencies, undefined, calendar);
  expect(dates.get("c")).toMatchObject({ start: "2026-09-29", end: "2026-10-01" });
  const analysis = analyzeCriticalPath(document.tasks, document.dependencies, dates, calendar);
  expect(analysis.blockers).toEqual([]);
  expect(analysis.taskIds.has("c")).toBe(false);
  expect(analysis.taskIds.has("a")).toBe(true);
});

it("accepts feasible mixed boundaries and reports impossible combinations", () => {
  for (const end of ["2026-09-29", "2026-09-26"]) {
    const source = `@startgantt\n[A] starts 2026-09-25 and lasts 1 day\n[B] starts ${end} and lasts 1 day\n[C] starts 2 days after [A]'s start\n[C] starts 1 day before [B]'s start\n[C] lasts 1 day\n@endgantt`;
    const document = parseGantt(source).document;
    const calendar = parseGanttCalendar(source);
    const dates = resolveTaskDates(document.tasks, document.dependencies, undefined, calendar);
    if (end === "2026-09-29") expect(dates.get("c")?.start).toBe("2026-09-27");
    else {
      expect(dates.get("c")?.issue).toContain("conflicts");
      expect(analyzeCriticalPath(document.tasks, document.dependencies, dates, calendar).blockers).toEqual(
        expect.arrayContaining([expect.objectContaining({ taskId: "c" })]),
      );
    }
  }
});

it("withholds forecast dates that can no longer satisfy a before deadline", () => {
  const source =
    "@startgantt\n[A] starts 2026-10-02 and lasts 1 day\n[B] starts 1 day before [A]'s start and lasts 1 day\n@endgantt";
  const document = parseGantt(source).document;
  const calendar = parseGanttCalendar(source);
  const plan = resolveTaskDates(document.tasks, document.dependencies, undefined, calendar);
  const forecast = calculateProgressForecast(document.tasks, document.dependencies, plan, calendar, "2026-10-03");
  expect(forecast.tasks.get("b")?.issue).toContain("before relationship");
  expect(forecast.tasks.get("b")?.start).toBeUndefined();
});
