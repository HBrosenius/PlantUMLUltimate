import { describe, expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { ganttQuickFixes, ganttDiagnostics } from "./gantt-language";
import { parseGanttCalendar } from "./gantt-calendar";
import { resolveTaskDates } from "./gantt-schedule";
import { analyzeCriticalPath } from "./schedule-analysis";
import { calculateProgressForecast } from "./gantt-progress-forecast";
import { buildResourceWorkloads } from "./ResourceWorkloadPanel";

describe("fixed-date dependency conflicts", () => {
  it.each(["\n", "\r\n"])("offers validated fixes while preserving inline clauses with newline %j", (newline) => {
    const source = [
      "@startgantt",
      "saturday are closed",
      "sunday are closed",
      "[A] starts 2026-09-25 and lasts 1 day",
      "[B] starts 2026-09-24 and lasts 2 days and is 50% completed",
      "[B] starts at [A]'s end",
      "@endgantt",
    ].join(newline);
    const fixes = ganttQuickFixes(source).filter((fix) => fix.message.includes("conflicts"));
    expect(fixes.map((fix) => fix.label)).toEqual([
      "Let dependency determine start date",
      "Move fixed dates to satisfy dependency",
    ]);
    for (const fix of fixes) {
      const repaired = source.slice(0, fix.from) + fix.replacement + source.slice(fix.to);
      expect(repaired).toContain("lasts 2 days and is 50% completed");
      expect(repaired).toContain("[B] starts at [A]'s end");
      expect(ganttDiagnostics(repaired).filter((item) => item.severity === "error")).toEqual([]);
      const document = parseGantt(repaired).document;
      expect(
        resolveTaskDates(document.tasks, document.dependencies, undefined, parseGanttCalendar(repaired)).get("b"),
      ).toMatchObject({ start: "2026-09-28", end: "2026-09-29" });
    }
    expect(ganttDiagnostics(source).find((item) => item.message.includes("conflicts"))?.actions).toHaveLength(2);
  });

  it("moves an explicit window while preserving work days and task pauses", () => {
    const source =
      "@startgantt\nsaturday are closed\nsunday are closed\n[A] starts 2026-09-25 and lasts 1 day\n[B] starts 2026-09-21 and ends 2026-09-24 and is 50% completed\n[B] pauses on tuesday\n[B] starts at [A]'s end\n@endgantt";
    const fix = ganttQuickFixes(source).find((fix) => fix.label === "Move fixed dates to satisfy dependency")!;
    expect(fix).toBeDefined();
    const repaired = source.slice(0, fix.from) + fix.replacement + source.slice(fix.to);
    expect(repaired).toContain("starts 2026-09-28 and ends 2026-10-01 and is 50% completed");
    expect(repaired).toContain("[B] pauses on tuesday");
    expect(ganttDiagnostics(repaired).filter((item) => item.severity === "error")).toEqual([]);
  });

  it.each([
    ["starts at [A]'s end", "2026-09-22", "2026-09-23", "2026-09-24"],
    ["starts at [A]'s start", "2026-09-20", "2026-09-22", "2026-09-21"],
    ["ends at [A]'s end", "2026-09-21", "2026-09-22", "2026-09-23"],
    ["ends at [A]'s start", "2026-09-19", "2026-09-20", "2026-09-21"],
    ["starts 2 days after [A]'s end", "2026-09-24", "2026-09-26", "2026-09-25"],
    ["starts 2 days before [A]'s end", "2026-09-22", "2026-09-24", "2026-09-21"],
  ])("flags %s against conflicting fixed dates", (relationship, start, end, boundary) => {
    const source = `@startgantt\n[A] starts 2026-09-21 and lasts 3 days\n[B] on {Alice} starts ${start} and ends ${end}\n[B] ${relationship}\n[C] starts at [B]'s end and lasts 1 day\n@endgantt`;
    const document = parseGantt(source).document;
    const calendar = parseGanttCalendar(source);
    const dates = resolveTaskDates(document.tasks, document.dependencies, undefined, calendar);
    expect(dates.get("b")?.issue).toContain("conflicts");
    expect(dates.get("b")?.issue).toContain(boundary);
    expect(dates.get("b")?.start).toBeUndefined();
    expect(dates.get("c")?.end).toBeUndefined();
    const diagnostics = ganttDiagnostics(source).filter((item) => item.message.includes("conflicts"));
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.map((item) => source.slice(item.from, item.to))).toContain(`[B] ${relationship}`);
    expect(diagnostics.map((item) => source.slice(item.from, item.to))).toContain(
      relationship.startsWith("starts") ? start : end,
    );
    expect(analyzeCriticalPath(document.tasks, document.dependencies, dates, calendar).taskIds.size).toBe(0);
    expect(
      calculateProgressForecast(document.tasks, document.dependencies, dates, calendar, "2026-09-21").tasks.get("b")
        ?.issue,
    ).toContain("conflicts");
    expect(buildResourceWorkloads(document.tasks, dates, calendar)[0]?.days).toEqual([]);
  });

  it.each(["2026-09-28", "2026-09-29"])("accepts a start satisfying the weekend boundary: %s", (start) => {
    const source = `@startgantt\nsaturday are closed\nsunday are closed\n[A] starts 2026-09-25 and lasts 1 day\n[B] starts ${start} and lasts 1 day\n[B] starts at [A]'s end\n@endgantt`;
    expect(ganttDiagnostics(source).filter((item) => item.message.includes("conflicts"))).toEqual([]);
  });

  it("rejects a fixed start during the weekend following a predecessor", () => {
    const source =
      "@startgantt\nsaturday are closed\nsunday are closed\n[A] starts 2026-09-25 and lasts 1 day\n[B] starts 2026-09-26 and lasts 1 day\n[B] starts at [A]'s end\n@endgantt";
    expect(ganttDiagnostics(source).find((item) => item.message.includes("conflicts"))?.message).toContain(
      "2026-09-28",
    );
  });
});
