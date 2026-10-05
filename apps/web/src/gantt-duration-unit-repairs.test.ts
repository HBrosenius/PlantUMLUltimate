import { expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { ganttDiagnostics, ganttQuickFixes } from "./gantt-language";

const unitFixes = (source: string) =>
  ganttQuickFixes(source).filter((fix) => /^Add (?:days?|weeks?|months?) unit/.test(fix.label ?? ""));
const apply = (source: string, fix: ReturnType<typeof unitFixes>[number]) =>
  source.slice(0, fix.from) + fix.replacement + source.slice(fix.to);

it("repairs the missing unit in a chained statement, ranking other tasks' units first", () => {
  const source =
    "@startgantt\n[A] lasts 2 weeks\n[B] lasts 3 weeks\n[C] lasts 2 days\n[Frontend] starts 2026-10-01 and lasts 5  and is 50% completed\n@endgantt";
  expect(ganttDiagnostics(source).some((item) => item.severity === "error")).toBe(true);
  const fixes = unitFixes(source);
  expect(fixes.map((fix) => fix.label)).toEqual([
    "Add weeks unit (used by 2 other tasks)",
    "Add days unit (used by 1 other task)",
    "Add months unit",
  ]);
  for (const [index, unit] of ["weeks", "days", "months"].entries()) {
    const repaired = apply(source, fixes[index]!);
    expect(repaired).toBe(source.replace("lasts 5", `lasts 5 ${unit}`));
    expect(ganttDiagnostics(repaired).filter((item) => item.severity === "error")).toEqual([]);
    const task = parseGantt(repaired).document.tasks.find((item) => item.label === "Frontend")!;
    expect(task.start?.value).toBe("2026-10-01");
    expect(task.duration?.value).toBe(5);
    expect(task.completion?.value).toBe(50);
  }
});
it("supports standalone requires and singular units", () => {
  const source = "@startgantt\n[A] lasts 2 months\n[B] requires 1\n@endgantt";
  const fixes = unitFixes(source);
  expect(fixes[0]!.label).toBe("Add month unit (used by 1 other task)");
  expect(apply(source, fixes[0]!)).toBe(source.replace("requires 1", "requires 1 month"));
});
it("uses a stable fallback order with no project evidence", () => {
  const source = "@startgantt\n[Frontend] lasts 5\n@endgantt";
  expect(unitFixes(source).map((fix) => fix.label)).toEqual(["Add days unit", "Add weeks unit", "Add months unit"]);
});
it("does not count comments or earlier durations of the task being repaired", () => {
  const source =
    "@startgantt\n' [Comment] lasts 8 weeks\n[Frontend] lasts 2 weeks\n[A] lasts 2 days\n[Frontend] starts 2026-10-01 and lasts 5 and is 50% completed\n@endgantt";
  expect(unitFixes(source)[0]!.label).toBe("Add days unit (used by 1 other task)");
});
it("leaves valid units, values, and unrelated errors alone", () => {
  for (const duration of ["5 days", "5 weeks", "5 months", "-5", "five", "0", "5 hours"]) {
    expect(unitFixes(`@startgantt\n[A] lasts ${duration}\n@endgantt`)).toEqual([]);
  }
});

it("does not infer units from task labels", () => {
  const source = "@startgantt\n[A lasts 8 weeks] lasts 2 months\n[Frontend] lasts 5\n@endgantt";
  expect(unitFixes(source)[0]!.label).toBe("Add months unit (used by 1 other task)");
});
