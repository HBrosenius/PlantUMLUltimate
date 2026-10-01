import { describe, expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import {
  copyTasksText,
  deleteTasks,
  describeBulkResult,
  duplicateTasks,
  moveTasksByDays,
  pasteTasksText,
  setTasksColor,
  setTasksCompletion,
  setTasksResource,
} from "./gantt-bulk-operations";

const source = `@startgantt
Project starts 2026-10-05
[Design] starts 2026-10-05
[Design] lasts 3 days
[Build] starts 2026-10-08
[Build] lasts 5 days
[Test] lasts 2 days
[Test] starts at [Build]'s end
@endgantt`;

describe("Gantt bulk operations", () => {
  it("moves every task with explicit dates and reports the rest", () => {
    const result = moveTasksByDays(source, ["design", "build", "test"], 2);
    expect(result.source).toContain("[Design] starts 2026-10-07");
    expect(result.source).toContain("[Build] starts 2026-10-10");
    expect(result.applied).toEqual(["design", "build"]);
    expect(result.skipped.map((item) => item.label)).toEqual(["Test"]);
    expect(describeBulkResult("Moved", result)).toMatch(/^Moved 2 tasks · skipped Test \(/);
  });

  it("sets colour, completion and resource on all selected tasks", () => {
    let next = setTasksColor(source, ["design", "build"], "LightBlue").source;
    next = setTasksCompletion(next, ["design", "build"], 50).source;
    next = setTasksResource(next, ["design", "build"], "Ada").source;
    const tasks = parseGantt(next).document.symbols.tasks;
    for (const id of ["design", "build"]) {
      expect(tasks.get(id)?.color?.value).toBe("LightBlue");
      expect(tasks.get(id)?.completion?.value).toBe(50);
      expect(tasks.get(id)?.resources?.map((resource) => resource.value)).toEqual(["Ada"]);
    }
    expect(tasks.get("test")?.color).toBeUndefined();
    expect(parseGantt(next).diagnostics.filter((item) => item.severity === "error")).toEqual([]);
  });

  it("deletes and duplicates several tasks", () => {
    const deleted = deleteTasks(source, ["design", "test"]);
    expect(parseGantt(deleted.source).document.tasks.map((task) => task.label)).toEqual(["Build"]);

    const duplicated = duplicateTasks(source, ["design", "build"]);
    expect(duplicated.copies).toEqual(["design copy", "build copy"]);
    expect(parseGantt(duplicated.source).document.tasks.map((task) => task.label)).toEqual([
      "Design",
      "Design copy",
      "Build",
      "Build copy",
      "Test",
    ]);
  });

  it("copies selected tasks with their shared dependencies and pastes them without name clashes", () => {
    const copied = copyTasksText(source, ["build", "test"]);
    expect(copied).toBe(
      "[Build] starts 2026-10-08\n[Build] lasts 5 days\n[Test] lasts 2 days\n[Test] starts at [Build]'s end",
    );
    expect(copyTasksText(source, ["test"])).toBe("[Test] lasts 2 days");

    const pasted = pasteTasksText(source, copied);
    expect(pasted.taskIds).toEqual(["build copy", "test copy"]);
    expect(pasted.source).toContain("[Test copy] starts at [Build copy]'s end\n@endgantt");
    const document = parseGantt(pasted.source);
    expect(document.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect(document.document.tasks.map((task) => task.label)).toEqual([
      "Design",
      "Build",
      "Test",
      "Build copy",
      "Test copy",
    ]);

    const other = pasteTasksText("@startgantt\nProject starts 2026-10-01\n@endgantt", copied);
    expect(other.taskIds).toEqual(["build", "test"]);
  });
});
