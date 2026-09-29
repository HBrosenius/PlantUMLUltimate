// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseGanttCalendar } from "../gantt-calendar";
import { calculateProgressForecast } from "../gantt-progress-forecast";
import { resolveTaskDates } from "../gantt-schedule";
import { addCanonicalGanttOverlay } from "./canonical-gantt-overlay";
import { addGanttForecastOverlay } from "./gantt-forecast-overlay";

describe("Gantt forecast on the editable diagram", () => {
  it("aligns both schedules, extends the SVG, and marks the actual cause chain", () => {
    const source = `@startgantt
Project starts 2026-09-21
printscale daily
saturday are closed
sunday are closed
[Design] starts 2026-09-21
[Design] lasts 4 days
[Design] is 50% completed
[Build] starts at [Design]'s end
[Build] lasts 3 days
@endgantt`;
    const gantt = parseGantt(source).document;
    const calendar = parseGanttCalendar(source);
    const plan = resolveTaskDates(gantt.tasks, gantt.dependencies, gantt.projectStart?.value, calendar);
    const forecast = calculateProgressForecast(gantt.tasks, gantt.dependencies, plan, calendar, "2026-09-28");
    const dates = Array.from(
      { length: 10 },
      (_, index) => `<text x="${200 + index * 20}" y="10">${21 + index}</text>`,
    ).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120" width="400" height="120">
      <text x="190" y="5">September 2026</text>${dates}
      <text x="10" y="30">Design</text><rect x="190" y="20" width="80" height="16" fill="#abcdef" />
      <text x="10" y="60">Build</text><rect x="270" y="50" width="100" height="16" fill="#abcdef" />
    </svg>`;
    const planSvg = addCanonicalGanttOverlay(
      svg,
      gantt.tasks,
      gantt.dependencies,
      [],
      "",
      undefined,
      gantt.projectStart?.value,
      calendar,
    );
    const rendered = new DOMParser().parseFromString(
      addGanttForecastOverlay(planSvg, forecast, "2026-09-28", calendar, "build"),
      "image/svg+xml",
    );
    expect(rendered.querySelectorAll(".gantt-forecast-task-mark")).toHaveLength(2);
    expect(rendered.querySelector('[data-forecast-task-id="design"]')?.getAttribute("data-cause-chain")).toBe("true");
    expect(rendered.querySelector('[data-forecast-task-id="build"]')?.getAttribute("data-selected")).toBe("true");
    expect(rendered.querySelectorAll(".gantt-forecast-cause-link")).toHaveLength(1);
    expect(rendered.querySelectorAll(".gantt-forecast-missed-marker")).toHaveLength(2);
    expect(
      rendered.querySelector('[data-forecast-task-id="design"] .gantt-forecast-plan-stripe')?.getAttribute("x"),
    ).toBe("190");
    expect(
      rendered.querySelector('[data-forecast-task-id="design"] .gantt-forecast-overdue-stripe')?.getAttribute("x"),
    ).toBe("330");
    expect(rendered.querySelector(".gantt-forecast-asof-guide")?.getAttribute("x1")).toBe("330");
    expect(Number(rendered.documentElement.getAttribute("viewBox")?.split(" ")[2])).toBeGreaterThan(400);
    expect(rendered.querySelector('[data-task-id="design"] .bar')).not.toBeNull();
  });
});
