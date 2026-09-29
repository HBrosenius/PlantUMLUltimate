import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseGanttCalendar } from "./gantt-calendar";
import { resolveTaskDates } from "./gantt-schedule";
import { calculateProgressForecast } from "./gantt-progress-forecast";
import { GanttForecastView } from "./GanttForecastView";

function render(source: string, overrides: Record<string, number> = {}, selectedTaskId?: string) {
  const document = parseGantt(source).document;
  const calendar = parseGanttCalendar(source);
  const projectStart = document.projectStart?.value;
  const plan = resolveTaskDates(document.tasks, document.dependencies, projectStart, calendar);
  return renderToStaticMarkup(
    <GanttForecastView
      tasks={document.tasks}
      forecast={calculateProgressForecast(document.tasks, document.dependencies, plan, calendar, "2026-09-29", overrides)}
      calendar={calendar}
      asOf="2026-09-29"
      projectStart={projectStart}
      selectedTaskId={selectedTaskId}
      onTaskSelect={() => {}}
      onEditTask={() => {}}
      onRemainingChange={() => {}}
    />,
  );
}

describe("Gantt forecast start-date conflict", () => {
  it("makes an explicit task start before the project start visible", () => {
    const source = `@startgantt
Project starts 2026-09-20
[Architecture] starts 2026-09-01
[Architecture] lasts 4 days
[Backend] starts at [Architecture]'s end
[Backend] lasts 8 days
@endgantt`;
    expect(render(source)).toContain("Start-date conflict.");
    expect(render(source)).toContain("Architecture explicitly starts 2026-09-01");
    expect(render(source.replace("2026-09-01", "2026-09-21"))).not.toContain("Start-date conflict.");
  });
});

describe("Gantt forecast remaining-work override", () => {
  it("shows when an override masks a low Complete value", () => {
    const source = `@startgantt
Project starts 2026-09-20
saturday are closed
sunday are closed
[Architecture] starts 2026-09-21
[Architecture] lasts 4 days
[Architecture] is 100% completed
[Backend] starts at [Architecture]'s end
[Backend] lasts 8 days
[Backend] is 10% completed
@endgantt`;
    const html = render(source, { backend: 4 }, "backend");
    expect(html).toContain('class="gantt-forecast-shift" data-shift="on-plan">+0 working days from plan');
    expect(render(source)).toContain('class="gantt-forecast-shift" data-shift="delayed">+2 working days from plan');
    expect(html).toContain("1 manual remaining-work estimate");
    expect(html).toContain("Manual remaining-work estimate is active");
    expect(html).toContain("automatic 8-day estimate from Complete");
    expect(html).toContain("Use automatic");
  });
});

describe("Gantt forecast missing progress", () => {
  it("does not warn for tasks that have not started", () => {
    const source = `@startgantt
Project starts 2026-09-20
saturday are closed
sunday are closed
[Architecture] starts 2026-09-21
[Architecture] lasts 4 days
[Architecture] is 100% completed
[Backend] starts at [Architecture]'s end
[Backend] lasts 8 days
[Backend] is 10% completed
[Frontend] starts at [Backend]'s end
[Frontend] lasts 10 days
@endgantt`;
    const html = render(source, {}, "frontend");
    expect(html).not.toContain("missing progress");
    expect(html).toContain("Not started · 0% assumed");
    expect(html).toContain("No progress expected yet; the forecast assumes 0%.");
    expect(html).not.toContain("Progress not reported");
  });
});
