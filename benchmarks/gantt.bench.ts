import { bench, describe } from "vitest";
import { applySourceEdits, moveTaskByDays, parseGantt, reorderTask } from "@plantuml-studio/diagram-gantt";

function project(taskCount: number): string {
  const lines = ["@startgantt", "Project starts 2026-09-01"];
  for (let index = 0; index < taskCount; index += 1) {
    const day = String((index % 27) + 1).padStart(2, "0");
    lines.push(`[Task ${index}] starts 2026-09-${day}`, `[Task ${index}] lasts ${(index % 5) + 1} days`);
  }
  lines.push("@endgantt");
  return lines.join("\n");
}

for (const count of [50, 100, 500, 1000]) {
  const source = project(count);
  describe(`${count} tasks`, () => {
    bench("parse", () => {
      parseGantt(source);
    });
    bench("move one task", () => {
      const task = parseGantt(source).document.tasks[Math.floor(count / 2)]!;
      applySourceEdits(source, moveTaskByDays(task, 1).edits);
    });
    bench("reorder one task", () => {
      const document = parseGantt(source).document;
      applySourceEdits(source, reorderTask(source, document, document.tasks[count - 1]!, document.tasks[0]!).edits);
    });
  });
}
