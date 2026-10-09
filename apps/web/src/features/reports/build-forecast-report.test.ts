import { describe, expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseGanttCalendar } from "../../gantt-calendar";
import { resolveTaskDates } from "../../gantt-schedule";
import { calculateProgressForecast } from "../../gantt-progress-forecast";
import { buildReport } from "./build-report";
import { renderReportHtml } from "./render-report-html";
import { renderReportText } from "./render-report-text";
import type { ReportOptions } from "./report-model";

const options: ReportOptions = {
  reportType: "forecast",
  asOf: "2026-10-08",
  timeZone: "Europe/Stockholm",
  locale: "sv-SE",
  filter: "All tasks",
  people: ["alice"],
  excluded: [],
  unresolved: true,
  milestones: true,
  combined: true,
  unassigned: true,
  notes: false,
  links: false,
  compact: false,
  chart: false,
  replyBy: "",
  introduction: "Forecast update",
  signOff: "Thanks",
};
const source = `@startgantt
saturday are closed
sunday are closed
[API] as [api] on {Alice} starts 2026-10-01
[api] lasts 5 days
[api] is 40% completed
[Tests] as [tests] on {Alice} starts at [api]'s end
[tests] lasts 2 days
[Release] happens at [tests]'s end
@endgantt`;

describe("forecast reports", () => {
  it("matches Forecast dates and remaining work with saved estimates, calendar and dependencies", () => {
    const overrides = { api: 6 };
    const parsed = parseGantt(source).document;
    const calendar = parseGanttCalendar(source);
    const dates = resolveTaskDates(parsed.tasks, parsed.dependencies, undefined, calendar, options.timeZone);
    const expected = calculateProgressForecast(
      parsed.tasks,
      parsed.dependencies,
      dates,
      calendar,
      options.asOf,
      overrides,
    );
    const snapshot = buildReport(source, "doc", "Project", "Delivery", options, { remainingDays: overrides });
    const message = snapshot.messages[0]!;
    expect(message.rows).toHaveLength(3);
    for (const row of message.rows) {
      const item = expected.tasks.get(row.task.id)!;
      expect(row.forecast).toEqual({ start: item.start, end: item.end, issue: item.issue });
      expect(row.metrics).toContain(
        `Remaining work: ${item.remainingDays} working days (${item.manualEstimate ? "saved estimate" : "automatic"})`,
      );
    }
    const text = renderReportText(snapshot, message);
    expect(text).toContain(`Project projected finish: ${expected.forecastFinish}`);
    expect(text).toContain("saved estimate");
    expect(text).not.toContain("Report snapshot:");
    expect(renderReportHtml(snapshot, message)).toContain("<strong>Forecast past planned finish</strong>");
  });
  it("calculates before exclusions and does not disclose outside-audience task names", () => {
    const outside = source.replace("[API]", "[Secret API]").replace("{Alice} starts 2026", "{Bob} starts 2026");
    const snapshot = buildReport(outside, "doc", "Project", "Delivery", { ...options, unassigned: false });
    const message = snapshot.messages[0]!;
    expect(message.rows.map((row) => row.task.label)).toEqual(["Tests"]);
    const text = renderReportText(snapshot, message);
    expect(text).toContain("Outside selected scope");
    expect(text).not.toContain("Secret API");
    expect(text).not.toContain("Bob");
    const full = buildReport(outside, "doc", "Project", "Delivery", { ...options, people: ["alice", "bob"] });
    expect(message.rows[0]!.forecast).toEqual(
      full.messages[0]!.rows.find((row) => row.task.label === "Tests")!.forecast,
    );
  });
  it("flags missing progress and unavailable dates without inventing a forecast", () => {
    const snapshot = buildReport(
      "@startgantt\n[A] starts 2026-10-01\n[A] lasts 2 days\n[B] starts $unknown\n[B] lasts 2 days\n@endgantt",
      "doc",
      "Project",
      "Delivery",
      options,
    );
    const message = snapshot.messages[0]!;
    expect(message.rows.every((row) => row.attention)).toBe(true);
    expect(renderReportText(snapshot, message)).toContain("assumes 0% completion");
    expect(renderReportText(snapshot, message)).toContain("Project forecast is partial");
    expect(message.rows.find((row) => row.task.label === "B")!.forecast?.end).toBeUndefined();
  });
});
