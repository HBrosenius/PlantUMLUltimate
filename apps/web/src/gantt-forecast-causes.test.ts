import { describe, expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { summarizeFinishCauses } from "./gantt-forecast-causes";
import { calculateProgressForecast, type ForecastTask, type ProgressForecast } from "./gantt-progress-forecast";
import { parseGanttCalendar } from "./gantt-calendar";
import { resolveTaskDates } from "./gantt-schedule";

function forecast(items: ForecastTask[], plannedFinish: string, forecastFinish: string): ProgressForecast {
  return {
    tasks: new Map(items.map((item) => [item.taskId, item])),
    plannedFinish,
    forecastFinish,
    missingProgress: 0,
    unavailable: 0,
  };
}

function item(taskId: string, plannedEnd: string, end: string, causeTaskIds: string[] = []): ForecastTask {
  return {
    taskId,
    plannedStart: "2026-09-01",
    plannedEnd,
    start: "2026-09-01",
    end,
    completion: 50,
    missingCompletion: false,
    remainingDays: 2,
    manualEstimate: false,
    causeTaskIds,
  };
}

describe("project finish causes", () => {
  it("finds both binding causes in a calculated diamond dependency", () => {
    const source = `@startgantt
Project starts 2026-09-21
saturday are closed
sunday are closed
[Design] starts 2026-09-21
[Design] lasts 4 days
[Design] is 50% completed
[Data] starts 2026-09-21
[Data] lasts 4 days
[Data] is 50% completed
[Build] starts at [Design]'s end
[Build] starts at [Data]'s end
[Build] lasts 2 days
[Release] happens at [Build]'s end
@endgantt`;
    const gantt = parseGantt(source).document;
    const calendar = parseGanttCalendar(source);
    const plan = resolveTaskDates(gantt.tasks, gantt.dependencies, gantt.projectStart?.value, calendar);
    const result = summarizeFinishCauses(
      gantt.tasks,
      calculateProgressForecast(gantt.tasks, gantt.dependencies, plan, calendar, "2026-09-28"),
    );
    expect(result.causes.map((cause) => cause.taskId)).toEqual(["design", "data"]);
    expect(result.affectedMilestoneIds).toEqual(["release"]);
  });

  it("counts both binding roots once and deduplicates their shared milestone", () => {
    const tasks = parseGantt(`@startgantt
[Design] lasts 2 days
[Data] lasts 2 days
[Build] starts at [Design]'s end
[Build] starts at [Data]'s end
[Build] lasts 2 days
[Release] happens at [Build]'s end
[Docs] lasts 1 day
@endgantt`).document.tasks;
    const result = summarizeFinishCauses(
      tasks,
      forecast(
        [
          item("design", "2026-09-02", "2026-09-04"),
          item("data", "2026-09-02", "2026-09-04"),
          item("build", "2026-09-04", "2026-09-07", ["design", "data"]),
          item("release", "2026-09-04", "2026-09-07", ["build"]),
          item("docs", "2026-09-03", "2026-09-05"),
        ],
        "2026-09-04",
        "2026-09-07",
      ),
    );
    expect(result.causes.map((cause) => cause.taskId)).toEqual(["design", "data"]);
    expect(result.causes.map((cause) => cause.affectedMilestoneIds)).toEqual([["release"], ["release"]]);
    expect(result.affectedMilestoneIds).toEqual(["release"]);
    expect(result.causes[0]?.affectedTaskIds).toEqual(["design", "build", "release"]);
  });

  it("attributes a late finish to the unfinished task when its predecessor stayed on plan", () => {
    const tasks = parseGantt(`@startgantt
[Design] lasts 2 days
[Build] starts at [Design]'s end
[Build] lasts 2 days
@endgantt`).document.tasks;
    const result = summarizeFinishCauses(
      tasks,
      forecast(
        [item("design", "2026-09-02", "2026-09-02"), item("build", "2026-09-04", "2026-09-07", ["design"])],
        "2026-09-04",
        "2026-09-07",
      ),
    );
    expect(result.causes.map((cause) => cause.taskId)).toEqual(["build"]);
  });

  it("has no finish-impacting causes when the project is on plan", () => {
    const tasks = parseGantt("@startgantt\n[Design] lasts 2 days\n@endgantt").document.tasks;
    expect(
      summarizeFinishCauses(tasks, forecast([item("design", "2026-09-02", "2026-09-02")], "2026-09-02", "2026-09-02")),
    ).toEqual({ causes: [], affectedMilestoneIds: [] });
  });
});
