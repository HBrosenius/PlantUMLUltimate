import { describe, expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { applyScenarioVisualOperation, updateScenarioTask } from "./delivery-scenario-edit";

const source = `@startgantt
Project starts 2026-09-01
[Build] on {Alice:50%} starts 2026-09-02
[Build] lasts 3 days
[Build] is 10% completed
@endgantt`;

describe("updateScenarioTask", () => {
  it("updates structured schedule and resource fields as one source transaction", () => {
    const result = updateScenarioTask(source, "build", {
      duration: "2",
      durationUnit: "week",
      startDate: "2026-09-03",
      endDate: "",
      completion: "40",
      resources: [
        { name: "Alice", allocation: "75" },
        { name: "Bob", allocation: "100" },
      ],
    });

    expect(result.error).toBeUndefined();
    const task = parseGantt(result.source).document.symbols.tasks.get("build")!;
    expect(task).toMatchObject({
      start: { value: "2026-09-03" },
      duration: { value: 2, unit: "week" },
      completion: { value: 40 },
      resources: [
        { value: "Alice", allocation: 75 },
        { value: "Bob", allocation: 100 },
      ],
    });
  });

  it("preserves a dependency-driven start when the form omits startDate", () => {
    const dependent = "@startgantt\n[A] lasts 2 days\n[B] starts at [A]'s end\n[B] lasts 3 days\n@endgantt";
    const result = updateScenarioTask(dependent, "b", {
      duration: "5",
      durationUnit: "day",
      endDate: "",
      completion: "",
      resources: [],
    });

    expect(result.source).toContain("[B] starts at [A]'s end");
    expect(parseGantt(result.source).document.symbols.tasks.get("b")?.duration?.value).toBe(5);
  });

  it("rejects invalid values without changing the scenario", () => {
    expect(
      updateScenarioTask(source, "build", {
        duration: "0",
        durationUnit: "day",
        startDate: "2026-09-02",
        endDate: "",
        completion: "",
        resources: [],
      }),
    ).toEqual({ source, error: "Duration must be a positive whole number" });
  });
});

describe("applyScenarioVisualOperation", () => {
  it("moves and resizes tasks in the scenario source", () => {
    const moved = applyScenarioVisualOperation(source, { kind: "move-task", taskId: "build", days: 2 });
    expect(moved.source).toContain("starts 2026-09-04");
    const resized = applyScenarioVisualOperation(moved.source, { kind: "resize-task", taskId: "build", days: 2 });
    expect(parseGantt(resized.source).document.symbols.tasks.get("build")?.duration?.value).toBe(5);
  });

  it("moves a dependency-driven task by changing its offset", () => {
    const dependent = "@startgantt\n[A] lasts 2 days\n[B] starts at [A]'s end\n[B] lasts 3 days\n@endgantt";
    const result = applyScenarioVisualOperation(dependent, { kind: "move-task", taskId: "b", days: 2 });
    expect(result.error).toBeUndefined();
    expect(result.source).toContain("starts 2 days after [A]'s end");
  });
});
