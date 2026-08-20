import { describe, expect, it } from "vitest";
import { applySourceEdits, moveTaskByDays, parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseGanttCalendar } from "./gantt-calendar";
import { resolveTaskDates } from "./gantt-schedule";

function largeProject(taskCount: number): string {
  const lines = ["@startgantt", "Project starts 2026-09-01", "saturday are closed", "sunday are closed"];
  for (let index = 0; index < taskCount; index += 1)
    lines.push(
      `[Task ${index}] starts 2026-09-${String((index % 27) + 1).padStart(2, "0")} and lasts ${(index % 5) + 1} days and is colored in LightBlue`,
    );
  return [...lines, "@endgantt"].join("\n");
}

function dependencyHeavyProject(taskCount: number): string {
  const lines = ["@startgantt", "Project starts 2026-09-01", "saturday are closed", "sunday are closed"];
  for (let index = 0; index < taskCount; index += 1) {
    const task = `Task ${index}`;
    lines.push(index === 0 ? `[${task}] starts 2026-09-01` : `[${task}] starts at [Task ${index - 1}]'s end`);
    lines.push(`[${task}] lasts 1 day`);
  }
  return [...lines, "@endgantt"].join("\n");
}

describe("large-document performance budgets", () => {
  it("parses 1,000 compound tasks within the 100 ms regression budget", () => {
    const source = largeProject(1_000);
    parseGantt(source); // warm module and runtime paths
    const started = performance.now();
    const result = parseGantt(source);
    const duration = performance.now() - started;
    expect(result.document.tasks).toHaveLength(1_000);
    expect(duration).toBeLessThan(100);
  });

  it("moves a task in a 1,000-task model within the 30 ms operation budget", () => {
    const source = largeProject(1_000);
    const document = parseGantt(source).document;
    const started = performance.now();
    const operation = moveTaskByDays(document.tasks[500]!, 1);
    const changed = applySourceEdits(source, operation.edits);
    const duration = performance.now() - started;
    expect(changed).toContain("[Task 500] starts 2026-09-16");
    expect(duration).toBeLessThan(30);
  });

  it("parses and resolves a 500-task dependency chain within a regression budget", () => {
    const source = dependencyHeavyProject(500);
    const started = performance.now();
    const result = parseGantt(source);
    const dates = resolveTaskDates(
      result.document.tasks,
      result.document.dependencies,
      result.document.projectStart?.value,
      parseGanttCalendar(source),
    );
    const duration = performance.now() - started;
    expect(result.document.tasks).toHaveLength(500);
    expect(result.document.dependencies).toHaveLength(499);
    expect(dates.get(result.document.tasks.at(-1)!.id)?.start).toBeDefined();
    expect(duration).toBeLessThan(250);
  });
});
