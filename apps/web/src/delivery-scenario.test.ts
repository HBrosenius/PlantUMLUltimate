import { describe, expect, it } from "vitest";
import { compareDeliveryScenarios } from "./delivery-scenario";

const plan = (buildDays: number, extra = "") => `@startgantt
Project starts 2026-09-01
saturday are closed
sunday are closed
[Design] lasts 2 days
[Build] starts at [Design]'s end
[Build] lasts ${buildDays} days
[Release] happens at [Build]'s end
${extra}@endgantt`;

describe("compareDeliveryScenarios", () => {
  it("reports downstream milestone movement and traces it to the changed task", () => {
    const result = compareDeliveryScenarios(plan(3), plan(5));

    expect(result.taskChanges.find((item) => item.taskId === "build")).toMatchObject({
      kind: "changed",
      changedFields: expect.arrayContaining(["duration", "resolvedEnd"]),
      endDeltaDays: 2,
    });
    expect(result.milestoneChanges).toMatchObject([
      {
        taskId: "release",
        deltaDays: 2,
        causes: expect.arrayContaining([
          expect.objectContaining({ kind: "task", taskId: "build", detail: "Changed duration" }),
        ]),
      },
    ]);
    expect(result.criticalPath.durationDeltaDays).toBe(2);
  });

  it("reports dependency changes", () => {
    const current = "@startgantt\nProject starts 2026-09-01\n[A] lasts 2 days\n[B] lasts 2 days\n@endgantt";
    const scenario =
      "@startgantt\nProject starts 2026-09-01\n[A] lasts 2 days\n[B] starts at [A]'s end\n[B] lasts 2 days\n@endgantt";

    expect(compareDeliveryScenarios(current, scenario).dependencyChanges).toEqual([
      { kind: "added", predecessorTaskId: "a", successorTaskId: "b", relation: "start-after-end" },
    ]);
  });

  it("reports calendar-driven milestone movement with an explainable cause", () => {
    const current = plan(3);
    const scenario = current.replace("sunday are closed", "sunday are closed\n2026-09-04 is closed");
    const result = compareDeliveryScenarios(current, scenario);

    expect(result.milestoneChanges[0]).toMatchObject({
      taskId: "release",
      deltaDays: 1,
      causes: expect.arrayContaining([expect.objectContaining({ kind: "calendar", label: "Working calendar" })]),
    });
  });

  it("reports newly introduced and resolved resource conflicts", () => {
    const base = `@startgantt
Project starts 2026-09-01
[A] starts 2026-09-01
[A] lasts 2 days
[A] on {Alice:60%}
[B] starts 2026-09-06
[B] lasts 2 days
[B] on {Alice:50%}
@endgantt`;
    const overlap = base.replace("[B] starts 2026-09-06", "[B] starts 2026-09-02");

    expect(compareDeliveryScenarios(base, overlap).resourceConflictChanges).toMatchObject([
      { kind: "new", resource: "Alice", after: { peak: 110 } },
    ]);
    expect(compareDeliveryScenarios(overlap, base).resourceConflictChanges).toMatchObject([
      { kind: "resolved", resource: "Alice", before: { peak: 110 } },
    ]);
  });

  it("surfaces parser issues instead of silently comparing invalid input", () => {
    const result = compareDeliveryScenarios(plan(3), plan(3).replace("[Build]'s end", "[Missing]'s end"));
    expect(result.issues).toEqual(expect.arrayContaining([expect.stringContaining("Unknown task reference")]));
  });
});
