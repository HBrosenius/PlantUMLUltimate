import { describe, expect, it } from "vitest";
import { createJiraBaselines, findJiraTaskDivergences, reconcileJiraTask } from "./reconcile";

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

  it("finds local edits and same-field conflicts against a stored Jira baseline", () => {
    const original = {
      id: "10042",
      key: "APP-123",
      summary: "Build",
      updated: "2026-08-31T10:00:00Z",
      startDate: "2026-09-01",
      dueDate: "2026-09-10",
      completion: 0,
    };
    const source = `@startgantt
[Build locally] as [jira_10042] starts 2026-09-01
[jira_10042] ends 2026-09-12
[jira_10042] is 0% completed
[jira_10042] links to [[https://acme.atlassian.net/browse/APP-123 APP-123]]
@endgantt`;
    const divergences = findJiraTaskDivergences(
      source,
      [{ ...original, updated: "2026-09-01T10:00:00Z", dueDate: "2026-09-11" }],
      createJiraBaselines([original]),
    );
    expect(divergences[0]?.localChanges.map((change) => change.field)).toEqual(["summary"]);
    expect(divergences[0]?.conflicts.map((change) => change.field)).toEqual(["dueDate"]);
  });
});
