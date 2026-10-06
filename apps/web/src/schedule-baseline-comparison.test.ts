import { expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import {
  compareBaselineDependencies,
  effectiveBaselineDates,
  dependencyDescription,
  scheduleFinish,
  finishDateShift,
} from "./schedule-baseline-comparison";
import { resolveTaskDates } from "./gantt-schedule";
import { parseGanttCalendar } from "./gantt-calendar";

const parse = (dependency: string) =>
  parseGantt(`@startgantt\nProject starts 2026-10-01\n[A] lasts 2 days\n[B] lasts 3 days\n${dependency}\n@endgantt`)
    .document;
it("reports anchor and lag changes with the current dependency index", () => {
  const old = parse("[B] starts at [A]'s end").dependencies;
  const now = parse("[B] starts 3 days after [A]'s start").dependencies;
  const changes = compareBaselineDependencies(now, old);
  expect(changes).toEqual([{ kind: "changed", before: old[0], after: now[0], currentIndex: 0 }]);
  expect(dependencyDescription(old[0]!)).toBe("End → start · 0 days after");
  expect(dependencyDescription(now[0]!)).toBe("Start → start · 3 days after");
});
it("reports additions/removals and ignores source offsets, ordering and styling", () => {
  const dependencies = parse("[B] starts at [A]'s end").dependencies;
  expect(compareBaselineDependencies(dependencies, [])).toEqual([
    { kind: "added", after: dependencies[0], currentIndex: 0 },
  ]);
  expect(compareBaselineDependencies([], dependencies)).toEqual([{ kind: "removed", before: dependencies[0] }]);
  expect(
    compareBaselineDependencies(
      [
        {
          ...dependencies[0]!,
          sourceRange: { from: 900, to: 950 },
          color: { value: "red", range: { from: 0, to: 1 } },
        },
      ],
      dependencies,
    ),
  ).toEqual([]);
});
it("matches duplicate constraints exactly before comparing remaining constraints", () => {
  const first = parse("[B] starts at [A]'s end").dependencies[0]!;
  const second = parse("[B] starts 3 days after [A]'s end").dependencies[0]!;
  const third = parse("[B] starts 5 days after [A]'s end").dependencies[0]!;
  expect(compareBaselineDependencies([second, first], [first, second])).toEqual([]);
  expect(compareBaselineDependencies([first, third], [first, second])).toEqual([
    { kind: "changed", before: second, after: third, currentIndex: 1 },
  ]);
  expect(
    compareBaselineDependencies([third, { ...third, direction: "before" }], [first, second]).map((item) => item.kind),
  ).toEqual(["removed", "removed", "added", "added"]);
});
it("detects a direction change even at zero lag", () => {
  const first = parse("[B] starts at [A]'s end").dependencies[0]!;
  expect(compareBaselineDependencies([{ ...first, direction: "before" }], [first])[0]?.kind).toBe("changed");
});
it("compares project finish dates and marks incomplete schedules unavailable", () => {
  const document = parse("[B] starts at [A]'s end");
  const resolved = resolveTaskDates(document.tasks, document.dependencies, "2026-10-01", parseGanttCalendar(""));
  expect(scheduleFinish(document.tasks, resolved)).toBe("2026-10-05");
  expect(finishDateShift("2026-10-05", "2026-10-02")).toBe("3 calendar days later");
  expect(finishDateShift("2026-10-01", "2026-10-02")).toBe("1 calendar day earlier");
  expect(finishDateShift("2026-10-02", "2026-10-02")).toBe("Unchanged");
  expect(scheduleFinish(document.tasks, new Map([["a", { end: "2026-10-02", derived: false }]]))).toBeUndefined();
  const invalid = new Map(resolved);
  invalid.set("b", { ...resolved.get("b")!, issue: "Unresolved" });
  expect(scheduleFinish(document.tasks, invalid)).toBeUndefined();
  expect(finishDateShift(undefined, "2026-10-02")).toBe("Comparison unavailable");
});

it("does not invent finish dates for conflicts or invalid calendar dates", () => {
  const tasks = parse("[B] starts at [A]'s end").tasks;
  const dates = new Map([
    ["a", { end: "2026-10-02", derived: false }],
    ["b", { end: "2026-02-30", derived: false }],
  ]);
  expect(scheduleFinish(tasks, dates)).toBeUndefined();
  expect(finishDateShift("2026-02-30", "2026-10-02")).toBe("Comparison unavailable");
  expect(
    scheduleFinish(
      tasks,
      new Map([
        ["a", { end: "2026-10-02", derived: false }],
        ["b", { end: "2026-10-05", derived: false, conflict: { anchor: "end" as const, expected: "2026-10-06" } }],
      ]),
    ),
  ).toBeUndefined();
});

it("compares closed-day starts by their first actual working day without using rendered widths", () => {
  const source =
    "@startgantt\nProject starts 2026-09-01\nsaturday are closed\nsunday are closed\n[A] starts 2026-09-06\n[A] lasts 10 days\n@endgantt";
  const document = parseGantt(source).document;
  const calendar = parseGanttCalendar(source);
  const dates = resolveTaskDates(document.tasks, [], "2026-09-01", calendar);
  expect(effectiveBaselineDates(document.tasks, dates, calendar).get("a")?.start).toBe("2026-09-07");
  expect(dates.get("a")?.start).toBe("2026-09-06");
});

it("does not compare conflicting dates as reliable task changes", () => {
  const tasks = parse("[B] starts at [A]'s end").tasks;
  const dates = new Map([["a", { start: "2026-10-01", end: "2026-10-02", derived: false, issue: "Conflict" }]]);
  expect(effectiveBaselineDates(tasks, dates, parseGanttCalendar("")).get("a")?.start).toBeUndefined();
});
