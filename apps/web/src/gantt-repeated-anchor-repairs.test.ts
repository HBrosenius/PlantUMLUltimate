import { expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { ganttQuickFixes } from "./gantt-language";

const apply = (source: string, fix: { from: number; to: number; replacement: string }) =>
  source.slice(0, fix.from) + fix.replacement + source.slice(fix.to);

it("removes a repeated 's end anchor", () => {
  const source =
    "@startgantt\n[A] lasts 5 days\n[B] starts at [A]'s end's end\n[B] lasts 5 days\n@endgantt";
  expect(parseGantt(source).diagnostics.some((item) => item.severity === "error")).toBe(true);
  const fix = ganttQuickFixes(source).find((item) => item.label === "Remove repeated 's end/'s start");
  expect(fix).toBeDefined();
  const repaired = apply(source, fix!);
  expect(repaired).toBe(source.replace("'s end's end", "'s end"));
  expect(parseGantt(repaired).diagnostics.filter((item) => item.severity === "error")).toEqual([]);
});

it("offers to remove each duplicate start constraint from different predecessors", () => {
  const source = `@startgantt
[A] lasts 5 days
[B] lasts 5 days
[C] starts at [A]'s end
[C] lasts 3 days
[C] starts at [B]'s end
@endgantt`;
  const diagnostics = parseGantt(source).diagnostics.filter((item) => item.code === "duplicate-start");
  expect(diagnostics).toHaveLength(2);
  const fixes = ganttQuickFixes(source).filter((item) => item.label === "Remove this start constraint");
  expect(fixes).toHaveLength(2);
  expect(new Set(fixes.map((item) => item.choiceGroup)).size).toBe(1);
  const repaired = apply(source, fixes[0]!);
  expect(repaired).toBe(source.replace("[C] starts at [A]'s end\n", ""));
  expect(parseGantt(repaired).diagnostics.filter((item) => item.code === "duplicate-start")).toEqual([]);
});

it("does not offer removal when the start constraint shares its line with other clauses", () => {
  const source = `@startgantt
[A] lasts 5 days
[B] lasts 5 days
[C] starts at [A]'s end and lasts 3 days
[C] starts at [B]'s end
@endgantt`;
  expect(parseGantt(source).diagnostics.filter((item) => item.code === "duplicate-start")).toHaveLength(2);
  const fixes = ganttQuickFixes(source).filter((item) => item.label === "Remove this start constraint");
  expect(fixes).toHaveLength(1);
});

it("ignores a single start constraint and end-anchored ones", () => {
  const source = `@startgantt
[A] lasts 5 days
[B] lasts 5 days
[C] starts at [A]'s end
[C] ends at [B]'s end
@endgantt`;
  expect(parseGantt(source).diagnostics.filter((item) => item.code === "duplicate-start")).toEqual([]);
});
