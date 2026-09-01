import { describe, expect, it } from "vitest";
import { findJiraTaskDivergences } from "@plantuml-studio/jira-integration";
import { applyJiraScheduleChange } from "./jira-schedule-edits";

const source = `@startgantt
Project starts 2026-09-01
[Imported] as [jira_42875] on {Minna Wilkinson:100%} lasts 1 day
[jira_42875] links to [[https://acme.atlassian.net/browse/MES-1 MES-1]]
@endgantt`;
const baseline = {
  "42875": { updated: "2026-09-01T09:18:54Z", state: { key: "MES-1", summary: "Imported" } },
};
const issue = { id: "42875", key: "MES-1", summary: "Imported", updated: "2026-09-01T09:18:54Z" };

describe("applyJiraScheduleChange", () => {
  it("materializes mapped start and due dates when moving an imported task", () => {
    const result = applyJiraScheduleChange(source, "jira_42875", "Move", 2);
    expect(result.unavailableReason).toBeUndefined();
    expect(result.source).toContain("[jira_42875] starts 2026-09-03");
    expect(result.source).toContain("[jira_42875] ends 2026-09-03");
    expect(
      findJiraTaskDivergences(result.source, [issue], baseline)[0]?.localChanges.map(({ field }) => field),
    ).toEqual(["startDate", "dueDate"]);
  });

  it("materializes a mapped due date when resizing an imported task", () => {
    const result = applyJiraScheduleChange(source, "jira_42875", "Resize", 3, 3);
    expect(result.unavailableReason).toBeUndefined();
    expect(result.source).toContain("lasts 4 day");
    expect(result.source).toContain("[jira_42875] ends 2026-09-04");
    expect(
      findJiraTaskDivergences(result.source, [issue], baseline)[0]?.localChanges.map(({ field }) => field),
    ).toEqual(["dueDate"]);
  });
});
