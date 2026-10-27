import { expect, it } from "vitest";
import { applySourceEdits, parseGantt } from "@plantuml-studio/diagram-gantt";
import { deleteGanttTaskKeepingDates } from "./gantt-delete";

it("keeps dependent tasks on the dates they were drawn on", () => {
  const source =
    "@startgantt\nProject starts 2026-10-05\n[A] lasts 2 days\n[G] starts 2 days after [A]'s end\n[A] -> [C]\n[C] lasts 1 day\n@endgantt";
  const document = parseGantt(source).document;
  const a = document.tasks.find((task) => task.id === "a")!;
  // A runs 10-05..10-06, so G is drawn on 10-09 and C on 10-07.
  expect(applySourceEdits(source, deleteGanttTaskKeepingDates(source, document, a).edits)).toBe(
    "@startgantt\nProject starts 2026-10-05\n[G] starts 2026-10-09\n[C] starts 2026-10-07\n[C] lasts 1 day\n@endgantt",
  );
});

it("anchors a milestone tied to the deleted task where PlantUML draws it", () => {
  const source = "@startgantt\nProject starts 2026-10-05\n[A] lasts 2 days\n[M] happens at [A]'s end\n@endgantt";
  const document = parseGantt(source).document;
  const a = document.tasks.find((task) => task.id === "a")!;
  // PlantUML draws "happens at [A]'s end" on A's last day, the same as "happens 2026-10-06".
  expect(applySourceEdits(source, deleteGanttTaskKeepingDates(source, document, a).edits)).toBe(
    "@startgantt\nProject starts 2026-10-05\n[M] happens 2026-10-06\n@endgantt",
  );
});
