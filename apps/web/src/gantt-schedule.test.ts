import { afterEach, describe, expect, it, vi } from "vitest";
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
    expect(dates.get("b")).toMatchObject({ start: "2026-09-08", end: "2026-09-10", derived: true });
  });
  it("extends elapsed dates to account for partial resource allocation", () => {
    const source =
      "@startgantt\nProject starts 2026-09-01\n[More tasks] on {Kalle:75%} starts 2026-09-01\n[More tasks] lasts 20 days\n@endgantt";
    const document = parseGantt(source).document;
    expect(
      resolveTaskDates(document.tasks, document.dependencies, "2026-09-01", parseGanttCalendar(source)).get(
        "more tasks",
      ),
    ).toMatchObject({ start: "2026-09-01", end: "2026-09-27" });
  });

  it("calculates a task backwards when its end is linked to another task", () => {
    const source =
      "@startgantt\nProject starts 2026-09-01\nsaturday are closed\nsunday are closed\n[A] starts 2026-09-07\n[A] lasts 3 days\n[B] lasts 3 days\n[B] ends at [A]'s end\n@endgantt";
    const document = parseGantt(source).document;
    const dates = resolveTaskDates(
      document.tasks,
      document.dependencies,
      document.projectStart?.value,
      parseGanttCalendar(source),
    );
    expect(dates.get("a")).toMatchObject({ start: "2026-09-07", end: "2026-09-09" });
    expect(dates.get("b")).toMatchObject({ start: "2026-09-07", end: "2026-09-09", derived: true });
  });

  it("honors closed and paused dates while calculating backwards", () => {
    const source =
      "@startgantt\nProject starts 2026-09-01\nsaturday are closed\nsunday are closed\n[A] starts 2026-09-07\n[A] lasts 5 days\n[B] lasts 4 days\n[B] pauses on 2026-09-09\n[B] ends at [A]'s end\n@endgantt";
    const document = parseGantt(source).document;
    const dates = resolveTaskDates(
      document.tasks,
      document.dependencies,
      document.projectStart?.value,
      parseGanttCalendar(source),
    );
    expect(dates.get("b")).toMatchObject({ start: "2026-09-07", end: "2026-09-11" });
  });

  describe("today in the forecast time zone", () => {
    afterEach(() => vi.useRealTimers());

    it("resolves today relative to the given time zone so it matches the forecast status date", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
      expect(resolveDateExpression("today", undefined, "Pacific/Kiritimati")).toBe("2026-10-01");
      expect(resolveDateExpression("today+1", undefined, "Pacific/Pago_Pago")).toBe("2026-10-01");
      const source = "@startgantt\n[A] starts today\n[A] lasts 1 day\n@endgantt";
      const gantt = parseGantt(source).document;
      const dates = resolveTaskDates(
        gantt.tasks,
        gantt.dependencies,
        undefined,
        parseGanttCalendar(source),
        "Pacific/Kiritimati",
      );
      expect(dates.get("a")).toMatchObject({ start: "2026-10-01", end: "2026-10-01" });
    });
  });
});
