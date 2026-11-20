import { expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { ganttQuickFixes } from "./gantt-language";
import { parseGanttCalendar } from "./gantt-calendar";
import { resolveTaskDates } from "./gantt-schedule";

const apply = (source: string, fix: { from: number; to: number; replacement: string }) =>
  source.slice(0, fix.from) + fix.replacement + source.slice(fix.to);

it("removes a repeated 's end anchor", () => {
  const source = "@startgantt\n[A] lasts 5 days\n[B] starts at [A]'s end's end\n[B] lasts 5 days\n@endgantt";
  expect(parseGantt(source).diagnostics.some((item) => item.severity === "error")).toBe(true);
  const fix = ganttQuickFixes(source).find((item) => item.label === "Remove repeated 's end/'s start");
  expect(fix).toBeDefined();
  const repaired = apply(source, fix!);
  expect(repaired).toBe(source.replace("'s end's end", "'s end"));
  expect(parseGantt(repaired).diagnostics.filter((item) => item.severity === "error")).toEqual([]);
});

it("accepts start constraints from several predecessors and starts after the latest", () => {
  const source = `@startgantt
Project starts 2026-08-03
[A] lasts 5 days
[B] lasts 8 days
[C] starts at [A]'s end
[C] lasts 3 days
[C] starts at [B]'s end
@endgantt`;
  const parsed = parseGantt(source);
  expect(parsed.diagnostics.filter((item) => item.severity !== "info")).toEqual([]);
  expect(ganttQuickFixes(source).filter((item) => /start constraint/i.test(item.label ?? ""))).toEqual([]);
  const startOfC = (text: string) => {
    const { document } = parseGantt(text);
    const dates = resolveTaskDates(document.tasks, document.dependencies, "2026-08-03", parseGanttCalendar(text));
    return dates.get(document.tasks.find((task) => task.label === "C")!.id)?.start;
  };
  // [B] ends later than [A], so it drives [C]'s start whichever order the lines come in.
  expect(startOfC(source)).toBeDefined();
  expect(startOfC(source)).toBe(startOfC(source.replace("[C] starts at [A]'s end\n", "")));
});
