import { describe, expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import {
  calendarResizeTarget,
  isWorkingDate,
  parseGanttCalendar,
  workingDayDuration,
  workingEndDate,
} from "./gantt-calendar";

describe("Gantt calendar resize", () => {
  it("skips closed weekends while changing one working day", () => {
    const source =
      "@startgantt\nsaturday are closed\nsunday are closed\n[Task] starts 2026-09-03\n[Task] lasts 2 days\n@endgantt";
    expect(calendarResizeTarget(parseGantt(source).document.tasks[0]!, 1, parseGanttCalendar(source))).toEqual({
      calendarDays: 3,
      durationDelta: 1,
      endDate: "2026-09-07",
    });
  });
  it("supports closed and reopened date ranges", () => {
    const calendar = parseGanttCalendar("2026-09-05 to 2026-09-07 are closed\n2026-09-06 is opened");
    expect(isWorkingDate("2026-09-05", calendar)).toBe(false);
    expect(isWorkingDate("2026-09-06", calendar)).toBe(true);
    expect(isWorkingDate("2026-09-07", calendar)).toBe(false);
  });
  it("honors specifically opened weekend dates", () => {
    const source =
      "@startgantt\nsaturday are closed\n2026-09-05 is opened\n[Task] starts 2026-09-03\n[Task] lasts 2 days\n@endgantt";
    expect(calendarResizeTarget(parseGantt(source).document.tasks[0]!, 1, parseGanttCalendar(source))?.endDate).toBe(
      "2026-09-05",
    );
  });
  it("converts inclusively between end dates and working-day durations", () => {
    const calendar = parseGanttCalendar("saturday are closed\nsunday are closed");
    expect(workingDayDuration("2026-09-04", "2026-09-08", calendar)).toBe(3);
    expect(workingEndDate("2026-09-04", 3, calendar)).toBe("2026-09-08");
  });
});
