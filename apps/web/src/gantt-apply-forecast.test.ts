import { describe, expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { prepareForecastApply } from "./gantt-apply-forecast";
import { calculateProgressForecast } from "./gantt-progress-forecast";
import { parseGanttCalendar } from "./gantt-calendar";
import { resolveTaskDates } from "./gantt-schedule";

const linkedSource = `@startgantt
Project starts 2026-09-20
sunday are closed
saturday are closed
[Architecture] starts 2026-09-21
[Architecture] lasts 4 days
[Architecture] is 100% completed
[Backend] lasts 8 days
[Backend] starts at [Architecture]'s end
[Backend] is 10% completed
[Frontend] lasts 10 days
[Frontend] starts at [Backend]'s end
[Testing] lasts 5 days
[Testing] starts at [Frontend]'s end
@endgantt`;

describe("prepareForecastApply", () => {
  it("extends the delayed cause, preserves its start and downstream links, and saves its estimate", () => {
    const review = prepareForecastApply(linkedSource, "2026-09-30", {});
    expect(review.error).toBeUndefined();
    expect(review.sourceAfter).toBeDefined();
    expect(review.sourceAfter).toContain("[Backend] starts at [Architecture]'s end");
    expect(review.sourceAfter).toContain("[Frontend] starts at [Backend]'s end");
    expect(review.sourceAfter).toContain("[Testing] starts at [Frontend]'s end");
    expect(review.overridesAfter.backend).toBe(8);
    expect(review.rows.find((row) => row.taskId === "backend")?.sourceAction).toContain("lasts");
    expect(review.rows.find((row) => row.taskId === "frontend")?.sourceAction).toBeUndefined();
    const updated = parseGantt(review.sourceAfter!).document;
    const calendar = parseGanttCalendar(review.sourceAfter!);
    const plan = resolveTaskDates(updated.tasks, updated.dependencies, updated.projectStart?.value, calendar);
    const nextForecast = calculateProgressForecast(
      updated.tasks,
      updated.dependencies,
      plan,
      calendar,
      "2026-09-30",
      review.overridesAfter,
    );
    expect(nextForecast.forecastFinish).toBe(nextForecast.plannedFinish);
  });

  it("moves an explicit successor date and shows it in the review", () => {
    const source = linkedSource.replace("[Frontend] starts at [Backend]'s end", "[Frontend] starts 2026-09-25");
    const review = prepareForecastApply(source, "2026-09-30", {});
    expect(review.error).toBeUndefined();
    expect(review.rows.find((row) => row.taskId === "frontend")?.sourceAction).toContain("starts");
    expect(review.sourceAfter).toContain("[Frontend] starts 2026-");
    expect(parseGantt(review.sourceAfter!).diagnostics.filter((item) => item.severity === "error")).toEqual([]);
  });

  it("moves an overdue fixed milestone date through a reviewed source edit", () => {
    const source = `${linkedSource.replace("@endgantt", "[Release] happens 2026-09-29\n@endgantt")}`;
    const review = prepareForecastApply(source, "2026-09-30", {});
    expect(review.error).toBeUndefined();
    expect(review.rows.find((row) => row.taskId === "release")?.sourceAction).toBe("happens 2026-09-30");
    expect(review.sourceAfter).toContain("[Release] happens 2026-09-30");
  });

  it("blocks an unresolvable source instead of offering Apply", () => {
    const review = prepareForecastApply("@startgantt\n[Task] starts nonsense\n@endgantt", "2026-09-30", {});
    expect(review.error).toBeDefined();
    expect(review.sourceAfter).toBeUndefined();
  });

  it("applies a 75%-complete six-day architecture task without changing linked testing", () => {
    const source = `@startgantt

Project starts 2026-09-20
printscale daily
sunday are closed
saturday are closed
today is colored in #AAF
' plantuml-ultimate: legend hidden

[Architecture] starts 2026-09-21
[Architecture] lasts 6 days
[Architecture] is 75% completed

[Backend] lasts 8 days

[Frontend] lasts 10 days

[Testing] lasts 5 days

[Backend] starts at [Architecture]'s end
[Backend] is 10% completed
[Frontend] starts at [Backend]'s end
[Testing] starts at [Frontend]'s end
@endgantt`;
    const review = prepareForecastApply(source, "2026-09-30", {});
    expect(review.error).toBeUndefined();
    expect(review.sourceAfter).toBeDefined();
    const withSavedTestingEstimate = prepareForecastApply(source, "2026-09-30", { testing: 3 });
    expect(withSavedTestingEstimate.error).toBeUndefined();
    expect(withSavedTestingEstimate.sourceAfter).toContain("[Testing] lasts 3 days");
    expect(withSavedTestingEstimate.sourceAfter).toContain("[Testing] starts at [Frontend]'s end");
    expect(withSavedTestingEstimate.overridesAfter.testing).toBe(3);
    const updated = parseGantt(withSavedTestingEstimate.sourceAfter!).document;
    const calendar = parseGanttCalendar(withSavedTestingEstimate.sourceAfter!);
    const plan = resolveTaskDates(updated.tasks, updated.dependencies, updated.projectStart?.value, calendar);
    const nextForecast = calculateProgressForecast(
      updated.tasks,
      updated.dependencies,
      plan,
      calendar,
      "2026-09-30",
      withSavedTestingEstimate.overridesAfter,
    );
    expect(nextForecast.forecastFinish).toBe(nextForecast.plannedFinish);
  });

  it("increases resource-adjusted effort for a delayed cause and keeps its assignment", () => {
    const source = `@startgantt
Project starts 2026-09-21
saturday are closed
sunday are closed
[Build] starts 2026-09-21
[Build] on {Alice:50%} lasts 4 days
[Build] is 50% completed
@endgantt`;
    const review = prepareForecastApply(source, "2026-10-01", {});
    expect(review.error).toBeUndefined();
    expect(review.sourceAfter).toContain("[Build] on {Alice:50%} lasts 6 days");
    expect(review.roundingNotes).toEqual([]);
    expect(review.overridesAfter.build).toBe(4);
  });

  it("reduces resource-adjusted effort on a linked successor with a saved estimate", () => {
    const source = `@startgantt
Project starts 2026-09-21
saturday are closed
sunday are closed
[Design] starts 2026-09-21
[Design] lasts 4 days
[Design] is 50% completed
[Build] on {Alice:50%} lasts 4 days
[Build] starts at [Design]'s end
@endgantt`;
    const review = prepareForecastApply(source, "2026-09-30", { build: 4 });
    expect(review.error).toBeUndefined();
    expect(review.sourceAfter).toContain("[Build] on {Alice:50%} lasts 2 days");
    expect(review.sourceAfter).toContain("[Build] starts at [Design]'s end");
    expect(review.overridesAfter.build).toBe(4);
  });

  it("shows one-day allocation rounding and the actual applied finish", () => {
    const source = `@startgantt
Project starts 2026-09-21
saturday are closed
sunday are closed
[Build] starts 2026-09-21
[Build] on {Alice:50%} lasts 4 days
[Build] is 50% completed
@endgantt`;
    const review = prepareForecastApply(source, "2026-09-30", {});
    expect(review.error).toBeUndefined();
    expect(review.sourceAfter).toContain("[Build] on {Alice:50%} lasts 6 days");
    expect(review.proposedFinish).toBe("2026-10-06");
    expect(review.roundingNotes[0]).toContain("from 2026-10-05 to 2026-10-06");
    const updated = parseGantt(review.sourceAfter!).document;
    const calendar = parseGanttCalendar(review.sourceAfter!);
    const plan = resolveTaskDates(updated.tasks, updated.dependencies, updated.projectStart?.value, calendar);
    const nextForecast = calculateProgressForecast(
      updated.tasks,
      updated.dependencies,
      plan,
      calendar,
      "2026-09-30",
      review.overridesAfter,
    );
    expect(nextForecast.forecastFinish).toBe(nextForecast.plannedFinish);
  });

  it("carries allocation rounding through linked successors", () => {
    const source = `@startgantt
Project starts 2026-09-21
saturday are closed
sunday are closed
[Build] starts 2026-09-21
[Build] on {Alice:50%} lasts 4 days
[Build] is 50% completed
[Testing] starts at [Build]'s end
[Testing] lasts 2 days
@endgantt`;
    const review = prepareForecastApply(source, "2026-09-30", {});
    expect(review.error).toBeUndefined();
    expect(review.proposedFinish).toBe("2026-10-08");
    expect(review.rows.find((row) => row.taskId === "testing")?.proposedEnd).toBe("2026-10-08");
    expect(review.rows.find((row) => row.taskId === "testing")?.sourceAction).toBeUndefined();
    expect(review.sourceAfter).toContain("[Testing] starts at [Build]'s end");
  });

  it("uses the combined allocation of multiple assigned resources", () => {
    const source = `@startgantt
Project starts 2026-09-21
saturday are closed
sunday are closed
[Build] starts 2026-09-21
[Build] on {Alice:50%} {Bob} lasts 4 days
[Build] is 50% completed
@endgantt`;
    const review = prepareForecastApply(source, "2026-09-25", {});
    expect(review.error).toBeUndefined();
    expect(review.sourceAfter).toContain("[Build] on {Alice:50%} {Bob} lasts 8 days");
    expect(review.roundingNotes).toEqual([]);
  });

  it("blocks a large allocation rounding gap with an actionable message", () => {
    const source = `@startgantt
Project starts 2026-09-21
saturday are closed
sunday are closed
[Build] starts 2026-09-21
[Build] on {Alice:10%} lasts 1 day
[Build] is 50% completed
@endgantt`;
    const review = prepareForecastApply(source, "2026-10-02", {});
    expect(review.error).toContain("10% allocation using whole-day effort");
    expect(review.sourceAfter).toBeUndefined();
  });
});
