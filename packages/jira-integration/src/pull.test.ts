import { describe, expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { buildJiraPullPlan } from "./pull";

const issue = {
  id: "10042",
  key: "APP-123",
  summary: "Implement [SSO]",
  updated: "2026-08-31T10:00:00.000Z",
  startDate: "2026-09-01",
  dueDate: "2026-09-12",
  completion: 50,
  assignee: { accountId: "abc", displayName: "Ada" },
};

describe("buildJiraPullPlan", () => {
  it("imports an issue as valid, linked PlantUML", () => {
    const result = buildJiraPullPlan("@startgantt\n@endgantt", "https://acme.atlassian.net", [issue], {
      includeAssignee: true,
    });
    expect(result.warnings).toEqual([]);
    expect(result.source).toContain("[Implement (SSO)] as [jira_10042] on {Ada:100%} starts 2026-09-01");
    expect(result.source).toContain("[jira_10042] ends 2026-09-12");
    expect(result.source).toContain("[[https://acme.atlassian.net/browse/APP-123 APP-123]]");
    expect(parseGantt(result.source).diagnostics).toEqual([]);
  });

  it("refreshes mapped fields while preserving comments and non-Jira links", () => {
    const source = `@startgantt
' keep
[Old summary] as [jira_10042] starts 2026-09-01
[jira_10042] ends 2026-09-10
[jira_10042] links to [[https://example.com Spec]]
[jira_10042] links to [[https://acme.atlassian.net/browse/OLD-1 OLD-1]]
@endgantt`;
    const result = buildJiraPullPlan(source, "https://acme.atlassian.net", [issue]);
    expect(result.source).toContain("' keep");
    expect(result.source).toContain("[Implement (SSO)] as [jira_10042]");
    expect(result.source).toContain("[jira_10042] ends 2026-09-12");
    expect(result.source).toContain("https://example.com Spec");
    expect(result.source).not.toContain("OLD-1");
    expect(parseGantt(result.source).diagnostics).toEqual([]);
  });

  it("can create blocking dependencies after all issues are imported", () => {
    const result = buildJiraPullPlan(
      "@startgantt\n@endgantt",
      "https://acme.atlassian.net",
      [issue, { ...issue, id: "10043", key: "APP-124", summary: "Test SSO", blockedByIssueIds: ["10042"] }],
      { includeDependencies: true },
    );
    const document = parseGantt(result.source).document;
    expect(document.dependencies).toContainEqual(
      expect.objectContaining({ predecessorTaskId: "jira_10042", successorTaskId: "jira_10043" }),
    );
  });

  it("updates a renamed Jira key without changing the stable task alias", () => {
    const imported = buildJiraPullPlan("@startgantt\n@endgantt", "https://acme.atlassian.net", [issue]);
    const refreshed = buildJiraPullPlan(imported.source, "https://acme.atlassian.net", [{ ...issue, key: "CORE-123" }]);
    expect(refreshed.source).toContain("as [jira_10042]");
    expect(refreshed.source).toContain("/browse/CORE-123 CORE-123");
    expect(refreshed.source).not.toContain("APP-123");
    expect(refreshed.changes[0]).toEqual(expect.objectContaining({ kind: "updated", fields: ["key"] }));
  });
});
