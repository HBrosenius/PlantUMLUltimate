import { describe, expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseGanttCalendar } from "./gantt-calendar";
import { resolveTaskDates } from "./gantt-schedule";
import { calculateProgressForecast } from "./gantt-progress-forecast";

function run(source: string, asOf: string, overrides: Record<string, number> = {}) {
  const document = parseGantt(source).document;
  const calendar = parseGanttCalendar(source);
  const plan = resolveTaskDates(document.tasks, document.dependencies, document.projectStart?.value, calendar);
  return calculateProgressForecast(document.tasks, document.dependencies, plan, calendar, asOf, overrides);
}

const source = `@startgantt
Project starts 2026-09-22
saturday are closed
sunday are closed
[Design] lasts 5 days
[Design] is 60% completed
[Build] starts at [Design]'s end
[Build] lasts 4 days
[Release] happens at [Build]'s end
[Docs] starts 2026-09-25
[Docs] lasts 4 days
@endgantt`;

describe("progress forecast", () => {
  it("reproduces the September 20 project-start example", () => {
    const exact = `@startgantt
Project starts 2026-09-20
printscale daily
sunday are closed
saturday are closed
today is colored in #AAF
' plantuml-ultimate: legend hidden
[Architecture] starts 2026-09-01
[Architecture] lasts 4 days
[Architecture] is 100% completed
[Backend] lasts 8 days
[Frontend] lasts 10 days
[Testing] lasts 5 days
[Backend] starts at [Architecture]'s end
[Backend] is 50% completed
[Frontend] starts at [Backend]'s end
[Testing] starts at [Frontend]'s end
@endgantt`;
    const document = parseGantt(exact).document;
    const calendar = parseGanttCalendar(exact);
    const plan = resolveTaskDates(document.tasks, document.dependencies, document.projectStart?.value, calendar);
    const forecast = calculateProgressForecast(document.tasks, document.dependencies, plan, calendar, "2026-09-29");
    expect(plan.get("architecture")).toMatchObject({ start: "2026-09-01", end: "2026-09-04" });
    expect(plan.get("backend")).toMatchObject({ start: "2026-09-07", end: "2026-09-16" });
    expect(forecast.tasks.get("backend")).toMatchObject({ start: "2026-09-29", end: "2026-10-02", remainingDays: 4 });
    const corrected = run(
      exact.replace("[Architecture] starts 2026-09-01", "[Architecture] starts 2026-09-21"),
      "2026-09-29",
    );
    expect(corrected.tasks.get("backend")).toMatchObject({
      plannedStart: "2026-09-25",
      plannedEnd: "2026-10-06",
      end: "2026-10-06",
    });
    expect(corrected.forecastFinish).toBe(corrected.plannedFinish);
    const behind = run(
      exact
        .replace("[Architecture] starts 2026-09-01", "[Architecture] starts 2026-09-21")
        .replace("[Backend] is 50% completed", "[Backend] is 10% completed"),
      "2026-09-29",
    );
    expect(behind.tasks.get("backend")).toMatchObject({
      plannedEnd: "2026-10-06",
      end: "2026-10-08",
      remainingDays: 8,
    });
    expect(behind.plannedFinish).toBe("2026-10-27");
    expect(behind.forecastFinish).toBe("2026-10-29");
    expect(behind.missingProgress).toBe(0);
    expect(behind.tasks.get("frontend")?.missingCompletion).toBe(false);
    expect(behind.tasks.get("testing")?.missingCompletion).toBe(false);
    const manual = run(
      exact
        .replace("[Architecture] starts 2026-09-01", "[Architecture] starts 2026-09-21")
        .replace("[Backend] is 50% completed", "[Backend] is 10% completed"),
      "2026-09-29",
      { backend: 4 },
    );
    expect(manual.tasks.get("backend")).toMatchObject({
      manualEstimate: true,
      remainingDays: 4,
      automaticRemainingDays: 8,
      end: "2026-10-06",
    });
    expect(manual.forecastFinish).toBe(manual.plannedFinish);
  });
  it("extends incomplete work and moves only linked successors", () => {
    const result = run(source, "2026-09-29");
    expect(result.tasks.get("design")).toMatchObject({ end: "2026-09-30", remainingDays: 2 });
    expect(result.tasks.get("build")).toMatchObject({
      start: "2026-10-01",
      end: "2026-10-06",
      causeTaskIds: ["design"],
    });
    expect(result.tasks.get("docs")?.causeTaskIds).toEqual([]);
    expect(result.tasks.get("release")!.end! > result.tasks.get("release")!.plannedEnd!).toBe(true);
    expect(result.missingProgress).toBe(1);
    expect(result.tasks.get("build")?.missingCompletion).toBe(false);
    expect(result.tasks.get("release")?.missingCompletion).toBe(false);
  });

  it("uses a manual remaining-work override and can clear it", () => {
    const automatic = run(source, "2026-09-29");
    const manual = run(source, "2026-09-29", { design: 4 });
    expect(manual.tasks.get("design")).toMatchObject({ end: "2026-10-02", manualEstimate: true });
    expect(manual.tasks.get("build")!.end! > automatic.tasks.get("build")!.end!).toBe(true);
  });

  it("does not create a delay from completed work", () => {
    const completed = source.replace("[Design] is 60% completed", "[Design] is 100% completed");
    const result = run(completed, "2026-09-29");
    expect(result.tasks.get("design")).toMatchObject({ end: "2026-09-28", remainingDays: 0 });
    expect(result.tasks.get("build")).toMatchObject({ start: "2026-09-29", end: "2026-10-02" });
  });

  it("moves past an explicit planned date and flags missing progress", () => {
    const result = run(source, "2026-10-01");
    expect(result.tasks.get("docs")).toMatchObject({
      missingCompletion: true,
      plannedEnd: "2026-09-30",
      end: "2026-10-06",
    });
    expect(result.tasks.get("design")?.end).toBe("2026-10-02");
  });

  it("forecasts a milestone linked to a predecessor's start", () => {
    const result = run(
      `@startgantt
Project starts 2026-09-01
[A] lasts 3 days
[A] is 50% completed
[M] happens at [A]'s start
@endgantt`,
      "2026-09-03",
    );
    expect(result.tasks.get("m")).toMatchObject({
      plannedStart: "2026-09-01",
      start: "2026-09-03",
      end: "2026-09-03",
      causeTaskIds: ["a"],
    });
  });

  it("places an incomplete overdue milestone on the status date, even when work is closed", () => {
    const milestone = `@startgantt
Project starts 2026-09-21
saturday are closed
sunday are closed
[Gate] happens 2026-09-24
[Work] starts at [Gate]'s end
[Work] lasts 2 days
@endgantt`;
    const closedDay = run(milestone, "2026-09-26", { gate: 3 });
    expect(closedDay.tasks.get("gate")).toMatchObject({
      plannedEnd: "2026-09-24",
      start: "2026-09-26",
      end: "2026-09-26",
      remainingDays: 0,
      manualEstimate: false,
    });
    const later = run(milestone, "2026-09-29");
    expect(later.tasks.get("gate")?.end).toBe("2026-09-29");
    expect(later.tasks.get("work")?.start).toBe("2026-09-30");
    expect(
      run(milestone.replace("[Gate] happens", "[Gate] is 100% completed\n[Gate] happens"), "2026-09-29").tasks.get(
        "gate",
      )?.end,
    ).toBe("2026-09-24");
  });

  it("keeps a future incomplete milestone on its planned date", () => {
    const result = run("@startgantt\n[Gate] happens 2026-10-05\n@endgantt", "2026-09-29");
    expect(result.tasks.get("gate")).toMatchObject({
      plannedEnd: "2026-10-05",
      start: "2026-10-05",
      end: "2026-10-05",
    });
  });

  it("reports a dependency cycle instead of inventing forecast dates", () => {
    const result = run(
      `@startgantt
Project starts 2026-09-01
[A] starts at [B]'s end
[A] lasts 2 days
[B] starts at [A]'s end
[B] lasts 2 days
@endgantt`,
      "2026-09-03",
    );
    expect(result.unavailable).toBe(2);
    expect(result.tasks.get("a")?.issue).toBe("Dependency cycle");
    expect(result.tasks.get("b")?.end).toBeUndefined();
  });
});
