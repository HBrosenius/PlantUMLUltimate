import { bench, describe } from "vitest";
import { applySourceEdits, moveTaskByDays, parseGantt, reorderTask } from "@plantuml-studio/diagram-gantt";
import { readFileSync } from "node:fs";
import { parseGanttCalendar } from "../apps/web/src/gantt-calendar";
import { resolveTaskDates } from "../apps/web/src/gantt-schedule";
import { renderLocalGantt } from "../apps/web/src/render/local-gantt-renderer";

function project(taskCount: number): string {
  const lines = ["@startgantt", "Project starts 2026-09-01"];
  for (let index = 0; index < taskCount; index += 1) {
    const day = String((index % 27) + 1).padStart(2, "0");
    lines.push(`[Task ${index}] starts 2026-09-${day}`, `[Task ${index}] lasts ${(index % 5) + 1} days`);
  }
  lines.push("@endgantt");
  return lines.join("\n");
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

const representativeProject = readFileSync(
  new URL("../tests/fixtures/weekend-aware-large.puml", import.meta.url),
  "utf8",
);

describe("representative project", () => {
  bench("parse realistic 61-line fixture", () => {
    parseGantt(representativeProject);
  });
});

describe("dependency-heavy project", () => {
  const source = dependencyHeavyProject(500);
  bench("parse and resolve 500-task chain", () => {
    const result = parseGantt(source);
    resolveTaskDates(
      result.document.tasks,
      result.document.dependencies,
      result.document.projectStart?.value,
      parseGanttCalendar(source),
    );
  });
});

for (const count of [50, 100, 500, 1000]) {
  const source = project(count);
  const document = parseGantt(source).document;
  describe(`${count} tasks`, () => {
    bench("parse", () => {
      parseGantt(source);
    });
    bench("move one task", () => {
      const task = document.tasks[Math.floor(count / 2)]!;
      applySourceEdits(source, moveTaskByDays(task, 1).edits);
    });
    bench("reorder one task", () => {
      applySourceEdits(source, reorderTask(source, document, document.tasks[count - 1]!, document.tasks[0]!).edits);
    });
    if (count === 50 || count === 1000)
      bench("render with the local fallback", () => {
        renderLocalGantt(source);
      });
  });
}
