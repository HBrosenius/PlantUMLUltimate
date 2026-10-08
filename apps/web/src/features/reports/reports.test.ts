import { describe, expect, it, vi } from "vitest";
import { buildTaskCheckIn } from "./build-task-check-in";
import { renderReportText } from "./render-report-text";
import { renderReportHtml } from "./render-report-html";
import { safeReportUrl } from "./report-format";
import { copyReport } from "./report-clipboard";
import { defaultIntroduction, defaultSignOff, type ReportOptions } from "./report-model";
const options: ReportOptions = {
  asOf: "2026-10-08",
  timeZone: "Europe/Stockholm",
  filter: "Ongoing",
  people: ["alice", "bob"],
  excluded: [],
  unresolved: true,
  milestones: false,
  combined: false,
  unassigned: false,
  notes: false,
  links: false,
  chart: false,
  compact: false,
  replyBy: "",
  introduction: defaultIntroduction,
  signOff: defaultSignOff,
};
const source = `@startgantt
[Past] on {Alice} {Bob} starts 2026-10-01
[Past] ends 2026-10-07
[Today] on {Alice} starts today
[Today] lasts 1 day
[Future] on {Bob} starts 2026-10-12
[Future] lasts 2 days
[Early] on {Bob} starts 2026-10-12
[Early] lasts 2 days
[Early] is 10% completed
[Done] on {Alice} starts 2026-10-01
[Done] lasts 1 day
[Done] is 100% completed
[Unknown] on {Alice} starts $unknown
[Unknown] lasts 2 days
@endgantt`;
const build = (changes: Partial<ReportOptions> = {}, text = source) =>
  buildTaskCheckIn(text, "doc", "Document", "Roadmap", { ...options, ...changes });
describe("task check-in reports", () => {
  it("includes past finish with missing progress, early progress, today and unresolved work", () => {
    const snapshot = build();
    expect(snapshot.candidates.map((r) => r.task.label)).toEqual(
      expect.arrayContaining(["Past", "Today", "Early", "Unknown"]),
    );
    expect(snapshot.candidates.map((r) => r.task.label)).not.toContain("Done");
    expect(snapshot.candidates.map((r) => r.task.label)).not.toContain("Future");
    expect(snapshot.candidates.find((r) => r.task.label === "Past")?.status).toContain("progress not reported");
    expect(snapshot.candidates.find((r) => r.task.label === "Today")?.start).toBe(options.asOf);
  });
  it("uses strict overdue boundaries and explicit completed progress", () => {
    expect(build({ filter: "Overdue", unresolved: false }).candidates.map((r) => r.task.label)).toEqual(["Past"]);
    expect(build({ filter: "Completed" }).candidates.map((r) => r.task.label)).toEqual(["Done"]);
    expect(build({ filter: "Upcoming", unresolved: false }).candidates.map((r) => r.task.label)).toEqual(["Future"]);
  });
  it("isolates recipients, counts shared assignments once per recipient, and honors exclusions", () => {
    const snapshot = build({ unresolved: false });
    expect(snapshot.uniqueTasks).toBe(3);
    expect(snapshot.assignments).toBe(4);
    const alice = snapshot.messages.find((m) => m.id === "alice")!;
    expect(alice.rows.map((r) => r.task.label)).not.toContain("Early");
    expect(alice.rows.find((r) => r.task.label === "Past")?.shared).toEqual(["Bob"]);
    expect(build({ excluded: ["past"] }).messages.every((m) => m.rows.every((r) => r.task.id !== "past"))).toBe(true);
  });
  it("exports identical readable fields and escapes custom text", () => {
    const snapshot = build({ introduction: '<script>alert("x")</script>' });
    const message = snapshot.messages[0]!;
    const html = renderReportHtml(snapshot, message),
      text = renderReportText(snapshot, message);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    for (const row of message.rows) {
      expect(text).toContain(row.task.label);
      expect(html).toContain(row.task.label);
    }
    expect(text).toContain("Not reported");
    expect(safeReportUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeReportUrl("https://example.com/invite?token=private")).toBeUndefined();
  });
  it("never generates empty messages", () => {
    expect(build({ people: [] }).messages).toEqual([]);
  });
  it("deduplicates assignment identity and surfaces name variants", () => {
    const snapshot = build(
      { filter: "All tasks" },
      "@startgantt\n[A] on {Alice} {alice} starts 2026-10-01\n[A] lasts 1 day\n[B] on {alice} starts 2026-10-01\n[B] lasts 1 day\n@endgantt",
    );
    expect(snapshot.recipients).toHaveLength(1);
    expect(snapshot.assignments).toBe(2);
    expect(snapshot.messages[0]!.rows).toHaveLength(2);
    expect(snapshot.warnings[0]).toContain("Verify");
  });
  it("does not invent an unassigned recipient and includes milestones only on request", () => {
    const text = "@startgantt\n[A] starts 2026-10-01\n[A] lasts 1 day\n[M] happens 2026-10-08\n@endgantt";
    expect(build({ filter: "All tasks" }, text).messages).toEqual([]);
    const snapshot = build({ filter: "All tasks", combined: true, unassigned: true, milestones: true }, text);
    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.messages[0]!.rows).toHaveLength(2);
    expect(snapshot.recipients).toEqual([]);
  });
  it("retains every task in large text reports", () => {
    const text = `@startgantt\n${Array.from({ length: 300 }, (_, index) => `[Task ${index}] on {Alice} starts 2026-10-01\n[Task ${index}] lasts 1 day`).join("\n")}\n@endgantt`;
    const snapshot = build({ filter: "All tasks" }, text);
    expect(snapshot.messages[0]!.rows).toHaveLength(300);
    expect(renderReportText(snapshot, snapshot.messages[0]!)).toContain("Task 299");
  });
  it("reports clipboard unavailability without false success", async () => {
    vi.stubGlobal("isSecureContext", false);
    await expect(copyReport("html", "plain")).rejects.toThrow("unavailable");
    vi.unstubAllGlobals();
  });
});
