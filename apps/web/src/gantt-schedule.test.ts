import { describe, expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseGanttCalendar } from "./gantt-calendar";
import { resolveDateExpression, resolveTaskDates } from "./gantt-schedule";

describe("resolveTaskDates", () => {
  it("resolves D offsets from the project start", () => {
    expect(resolveDateExpression("D+15", "2026-09-01")).toBe("2026-09-16");
    expect(resolveDateExpression("D-1", "2026-09-01")).toBe("2026-08-31");
  });
  it("extends a task end date across explicit pause dates", () => {
    const source =
      "@startgantt\nProject starts 2026-09-01\n[A] starts 2026-09-01\n[A] lasts 3 days\n[A] pauses on 2026-09-02\n@endgantt";
    const document = parseGantt(source).document;
    expect(
      resolveTaskDates(document.tasks, document.dependencies, "2026-09-01", parseGanttCalendar(source)).get("a"),
    ).toMatchObject({ start: "2026-09-01", end: "2026-09-04" });
  });
  it("derives starts and working-day ends through a dependency chain", () => {
    const source =
      "@startgantt\nProject starts 2026-09-04\nsaturday are closed\nsunday are closed\n[A] lasts 2 days\n[B] starts at [A]'s end\n[B] lasts 3 days\n@endgantt";
    const document = parseGantt(source).document;
    const dates = resolveTaskDates(
      document.tasks,
      document.dependencies,
      document.projectStart?.value,
      parseGanttCalendar(source),
    );
    expect(dates.get("a")).toMatchObject({ start: "2026-09-04", end: "2026-09-07", derived: true });
    expect(dates.get("b")).toMatchObject({ start: "2026-09-07", end: "2026-09-09", derived: true });
  });
});
