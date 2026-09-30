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
});
