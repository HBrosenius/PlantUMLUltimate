import { describe, expect, it } from "vitest";
import { reconcileJiraTask } from "./reconcile";

describe("reconcileJiraTask", () => {
  it("separates safe pulls, pending publishes, and conflicts", () => {
    const result = reconcileJiraTask(
      { summary: "Build", startDate: "2026-09-01", dueDate: "2026-09-10", completion: 0 },
      { summary: "Build locally", startDate: "2026-09-01", dueDate: "2026-09-12", completion: 0 },
      { summary: "Build", startDate: "2026-09-02", dueDate: "2026-09-11", completion: 100 },
    );
    expect(result.remoteChanges.map((item) => item.field)).toEqual(["startDate", "completion"]);
    expect(result.localChanges.map((item) => item.field)).toEqual(["summary"]);
    expect(result.conflicts.map((item) => item.field)).toEqual(["dueDate"]);
  });
});
