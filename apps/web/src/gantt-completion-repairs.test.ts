import { expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { ganttDiagnostics, ganttQuickFixes } from "./gantt-language";

const fixes = (source: string) =>
  ganttQuickFixes(source).filter((fix) => fix.label === "Add is before completion percentage");

it("inserts is into a chained completion clause while preserving spacing and task values", () => {
  const source = "@startgantt\n[Frontend] starts 2026-10-01 and lasts 5 days  and  50% completed\n@endgantt";
  expect(ganttDiagnostics(source).some((item) => item.severity === "error")).toBe(true);
  const suggestions = fixes(source);
  expect(suggestions).toHaveLength(1);
  const fix = suggestions[0]!;
  const repaired = source.slice(0, fix.from) + fix.replacement + source.slice(fix.to);
  expect(repaired).toBe(source.replace("50% completed", "is 50% completed"));
  expect(ganttDiagnostics(repaired).filter((item) => item.severity === "error")).toEqual([]);
  const task = parseGantt(repaired).document.tasks[0]!;
  expect(task.start?.value).toBe("2026-10-01");
  expect(task.duration?.value).toBe(5);
  expect(task.completion?.value).toBe(50);
});

it("repairs standalone completion at both percentage boundaries", () => {
  for (const percentage of [0, 50, 100]) {
    const source = `@startgantt\n[A] lasts 5 days\n[A] ${percentage}% completed\n@endgantt`;
    expect(fixes(source)).toHaveLength(1);
    const fix = fixes(source)[0]!;
    const repaired = source.slice(0, fix.from) + fix.replacement + source.slice(fix.to);
    expect(repaired).toBe(source.replace(`[A] ${percentage}%`, `[A] is ${percentage}%`));
    expect(ganttDiagnostics(repaired).filter((item) => item.severity === "error")).toEqual([]);
  }
});

it("does not guess invalid percentages or unrelated clauses", () => {
  for (const clause of [
    "is 50% completed",
    "150% completed",
    "-5% completed",
    "50 completed",
    "50% complet",
    "50% completed extra",
  ]) {
    expect(fixes(`@startgantt\n[A] lasts 5 days and ${clause}\n@endgantt`)).toEqual([]);
  }
});
