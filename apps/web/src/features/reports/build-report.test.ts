import { describe, expect, it } from "vitest";
import { buildReport } from "./build-report";
import { renderReportHtml } from "./render-report-html";
import { renderReportText } from "./render-report-text";
import type { ReportOptions } from "./report-model";

const options: ReportOptions = {
  reportType: "progress",
  asOf: "2026-10-08",
  timeZone: "Europe/Stockholm",
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
  introduction: "",
  signOff: "",
};
const source = `@startgantt
[API] on {Alice} starts 2026-10-01
[API] ends 2026-10-07
[API] is 60% completed
[Tests] on {Alice} starts 2026-10-08
[Tests] ends 2026-10-10
[Tests] is 25% completed
[Docs] on {Alice} starts 2026-10-08
[Docs] ends 2026-10-12
[Release] happens 2026-10-12
@endgantt`;
const build = (changes: Partial<ReportOptions> = {}, text = source) =>
  buildReport(text, "document", "Project", "Delivery", { ...options, ...changes });

describe("schedule reports", () => {
  it("reconciles the worked example without inventing historical progress", () => {
    const snapshot = build();
    const message = snapshot.messages[0]!;
    const text = renderReportText(snapshot, message);
    expect(text).toContain("1.15 known remaining + up to 1 unknown");
    expect(text).toContain("range 1.15–2.15");
    expect(text).toContain("2026-10-08: 2 task equivalents");
    expect(text).toContain("Past due: 0.4 known");
    expect(text).toContain("Only a current observation exists");
    expect(message.rows).toHaveLength(3);
    expect(renderReportHtml(snapshot, message)).toContain("1.15 known remaining");
    expect(text).not.toContain("Confirm: On track");
  });
  it("retains unresolved work in an unscheduled bucket and preserves zero and full completion", () => {
    const text = renderReportText(
      build(
        {},
        `@startgantt
[Zero] starts 2026-10-08
[Zero] lasts 1 day
[Zero] is 0% completed
[Done] starts 2026-10-08
[Done] lasts 1 day
[Done] is 100% completed
[Unknown] starts $unknown
[Unknown] lasts 1 day
@endgantt`,
      ),
      build(
        {},
        `@startgantt
[Zero] starts 2026-10-08
[Zero] lasts 1 day
[Zero] is 0% completed
[Done] starts 2026-10-08
[Done] lasts 1 day
[Done] is 100% completed
[Unknown] starts $unknown
[Unknown] lasts 1 day
@endgantt`,
      ).messages[0]!,
    );
    expect(text).toContain("Unscheduled: 0 known + up to 1 unknown");
    expect(text).toContain("dated plan coverage 2/3");
    expect(text).not.toContain("Past due:");
  });
  it("does not infer milestone achievement from past dates", () => {
    const snapshot = build({ reportType: "milestones", asOf: "2026-10-13" });
    const message = snapshot.messages[0]!;
    expect(message.rows.map((row) => row.task.label)).toEqual(["Release"]);
    expect(renderReportText(snapshot, message)).toContain("Achievement: Not established");
  });
  it("does not change project criticality when people are filtered", () => {
    const text = `@startgantt
[Long] on {Bob} starts 2026-10-01
[Long] lasts 10 days
[Short] on {Alice} starts 2026-10-01
[Short] lasts 1 day
@endgantt`;
    const snapshot = build({ reportType: "critical-path", unassigned: false, nearCriticalDays: 2 }, text);
    expect(snapshot.messages[0]!.rows).toHaveLength(0);
    expect(renderReportText(snapshot, snapshot.messages[0]!)).not.toContain("Bob");
  });
  it("discloses unavailable analysis for unresolved dates", () => {
    const snapshot = build(
      { reportType: "critical-path" },
      "@startgantt\n[A] starts $unknown\n[A] lasts 2 days\n@endgantt",
    );
    expect(renderReportText(snapshot, snapshot.messages[0]!)).toContain("Critical path unavailable");
  });
  it("reuses resource allocations without scaling by completion or disclosing excluded people", () => {
    const snapshot = build(
      { reportType: "workload" },
      `@startgantt
[A] on {Alice} {Bob} starts 2026-10-08
[A] lasts 2 days
[A] is 100% completed
[B] on {Alice} starts 2026-10-08
[B] lasts 2 days
@endgantt`,
    );
    const text = renderReportText(snapshot, snapshot.messages[0]!);
    expect(text).toContain("200% allocated against 100% capacity");
    expect(text).not.toContain("Bob");
    expect(snapshot.uniqueTasks).toBe(2);
  });
  it("matches renamed baseline tasks only by stable aliases and keeps removals separate", () => {
    const current = `@startgantt\n[Renamed] as [stable] on {Alice} starts 2026-10-08\n[stable] lasts 2 days\n@endgantt`;
    const baseline = `@startgantt\n[Original] as [stable] on {Alice} starts 2026-10-01\n[stable] lasts 2 days\n[Removed] as [removed] on {Alice} starts 2026-10-01\n[removed] lasts 1 day\n@endgantt`;
    const snapshot = buildReport(
      current,
      "doc",
      "Project",
      "Gantt",
      { ...options, reportType: "baseline" },
      { baselineSource: baseline, baselineName: "Agreed plan" },
    );
    const text = renderReportText(snapshot, snapshot.messages[0]!);
    expect(text).toContain("Name before: Original; after: Renamed");
    expect(text).toContain("7 calendar days at finish");
    expect(text).toContain("Removed from selected scope (or reassigned): Removed. This is not completed work.");
  });
  it("keeps individual workload exports restricted to their recipient even when both people are selected", () => {
    const snapshot = build(
      { reportType: "workload", combined: false, people: ["alice", "bob"] },
      "@startgantt\n[A] on {Alice} {Bob} starts 2026-10-08\n[A] lasts 2 days\n@endgantt",
    );
    const message = snapshot.messages.find((m) => m.id === "alice")!;
    expect(renderReportText(snapshot, message)).not.toContain("Bob");
    expect(renderReportHtml(snapshot, message)).not.toContain("Bob");
  });
});
