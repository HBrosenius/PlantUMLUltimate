import { afterEach, expect, it, vi } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { ganttDiagnostics, ganttQuickFixes } from "./gantt-language";
import { ganttAnalysisContext } from "./gantt-analysis-context";
import { resolveTaskDates } from "./gantt-schedule";
vi.mock("./gantt-schedule", async (original) => {
  const module = await original<typeof import("./gantt-schedule")>();
  return { ...module, resolveTaskDates: vi.fn(module.resolveTaskDates) };
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
it("resolves a valid source once for diagnostics, fixes and compatible UI consumers", () => {
  const source = "@startgantt\nProject starts 2026-10-01\n[A] lasts 2 days\n@endgantt";
  const parsed = parseGantt(source);
  ganttDiagnostics(source, parsed);
  ganttQuickFixes(source, parsed);
  expect(ganttAnalysisContext(source, parsed).dates.get(parsed.document.tasks[0]!.id)?.end).toBe("2026-10-02");
  expect(resolveTaskDates).toHaveBeenCalledTimes(1);
});
it("isolates time zones, midnight and changed sources even with a reused model", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T23:30:00Z"));
  const source = "@startgantt\n[A] starts today and lasts 1 day\n@endgantt";
  const parsed = parseGantt(source);
  const utc = ganttAnalysisContext(source, parsed, "UTC");
  const stockholm = ganttAnalysisContext(source, parsed, "Europe/Stockholm");
  const lazyParsed = parseGantt(source);
  const lazySnapshot = ganttAnalysisContext(source, lazyParsed, "UTC");
  expect(utc.dates.get(parsed.document.tasks[0]!.id)?.start).toBe("2026-10-01");
  expect(stockholm.dates.get(parsed.document.tasks[0]!.id)?.start).toBe("2026-10-02");
  expect(ganttAnalysisContext(source, parsed, "UTC")).toBe(utc);
  vi.setSystemTime(new Date("2026-10-02T01:00:00Z"));
  expect(lazySnapshot.dates.get(lazyParsed.document.tasks[0]!.id)?.start).toBe("2026-10-01");
  expect(ganttAnalysisContext(source, parsed, "UTC")).not.toBe(utc);
  expect(ganttAnalysisContext(source + "\nsaturday are closed", parsed, "UTC").calendar.closedWeekdays.has(6)).toBe(
    true,
  );
});
