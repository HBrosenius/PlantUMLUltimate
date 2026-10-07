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
      forecast={calculateProgressForecast(
        document.tasks,
        document.dependencies,
        plan,
        calendar,
        "2026-09-29",
        overrides,
      )}
      plannedDates={plan}
      calendar={calendar}
      resourceCapacities={{}}
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
    expect(html).toContain("1 saved remaining-work estimate");
    expect(html).toContain("Saved remaining-work estimate is active");
    expect(html).toContain("automatic 8-day estimate from Complete");
    expect(html).toContain("Use automatic");
  });
});

describe("Gantt forecast task delays", () => {
  it("shows delayed tasks separately from an unchanged project finish", () => {
    const source = `@startgantt
Project starts 2026-09-21
saturday are closed
sunday are closed
[Long track] starts 2026-09-21
[Long track] lasts 20 days
[Long track] is 100% completed
[Short track] starts 2026-09-21
[Short track] lasts 3 days
[Short track] is 50% completed
@endgantt`;
    const html = render(source);
    expect(html).toContain('data-shift="on-plan">+0 working days from plan');
    expect(html).toContain("1 task delayed");
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

describe("Gantt project finish causes", () => {
  it("names the unfinished root and its affected milestone in the default inspector", () => {
    const source = `@startgantt
Project starts 2026-09-21
saturday are closed
sunday are closed
[Design] starts 2026-09-21
[Design] lasts 4 days
[Design] is 50% completed
[Build] starts at [Design]'s end
[Build] lasts 3 days
[Release] happens at [Build]'s end
@endgantt`;
    const html = render(source);
    expect(html).toContain('aria-label="Project finish causes"');
    expect(html).toContain("1 root cause affecting finish");
    expect(html).toContain("Milestones: Release");
    expect(html).toContain("The project shift is counted once.");
    expect(render(source, {}, "build")).toContain('aria-label="View project finish causes"');
  });
});

describe("overdue Gantt milestones", () => {
  it("names the missed date and describes the milestone without inventing remaining work", () => {
    const source = `@startgantt
Project starts 2026-09-21
saturday are closed
sunday are closed
[Gate] happens 2026-09-24
[Work] starts at [Gate]'s end
[Work] lasts 2 days
@endgantt`;
    const selected = render(source, {}, "gate");
    expect(selected).toContain("Milestone date");
    expect(selected).toContain("missed; forecast is");
    expect(selected).toContain("Milestone not reported complete.");
    expect(selected).not.toContain("No work remains.");
    const date = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(
      new Date("2026-09-29T00:00:00Z"),
    );
    expect(render(source)).toContain(`Milestone not complete · Forecast ${date}`);
  });
});

describe("planned finish warnings", () => {
  it("identifies late tasks and milestones with both forecast and planned dates", () => {
    const html = render(
      "@startgantt\nProject starts 2026-09-21\n[Build] starts 2026-09-21 and lasts 2 days and is 50% completed\n[Release] happens 2026-09-25\n@endgantt",
    );
    expect(html).toContain('aria-label="Planned finish warnings"');
    expect(html).toContain("2 planned finish dates forecast to be missed");
    expect(html).toContain("Release (milestone)");
    expect(html).toContain("planned finish 2026-09-25, forecast finish 2026-09-29");
    expect(html).toContain("4 calendar days late");
  });

  it("does not warn for completed tasks or future on-time milestones", () => {
    const html = render(
      "@startgantt\nProject starts 2026-09-21\n[Done] starts 2026-09-21 and lasts 2 days and is 100% completed\n[Release] happens 2026-10-01\n@endgantt",
    );
    expect(html).not.toContain('aria-label="Planned finish warnings"');
  });

  it("does not manufacture a deadline warning for an unavailable forecast", () => {
    const html = render("@startgantt\n[A] starts $unknown and lasts 2 days\n@endgantt");
    expect(html).not.toContain('aria-label="Planned finish warnings"');
    expect(html).toContain("cannot forecast");
  });
});
