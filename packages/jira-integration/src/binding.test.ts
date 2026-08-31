import { describe, expect, it } from "vitest";
import {
  issueIdFromJiraTaskAlias,
  jiraBrowseUrl,
  jiraTaskAlias,
  parseJiraDocumentBinding,
  setJiraDocumentBinding,
} from "./binding";

const binding = {
  version: 1,
  bindingId: "binding-1",
  cloudId: "cloud-1",
  siteUrl: "https://acme.atlassian.net",
  jql: "project = APP ORDER BY Rank",
  mode: "pull",
  includeDependencies: true,
  baselines: {
    "10042": {
      updated: "2026-08-31T10:00:00Z",
      state: { key: "APP-123", summary: "Build", dueDate: "2026-09-10", completion: 0 },
    },
  },
} as const;

describe("Jira document binding", () => {
  it("stores non-secret connection metadata as a portable PlantUML comment", () => {
    const source = setJiraDocumentBinding("@startgantt\n[A] lasts 1 day\n@endgantt", binding);
    expect(source.split("\n")[1]).toContain("' @studio-jira");
    expect(parseJiraDocumentBinding(source)).toEqual(binding);
  });

  it("updates an existing directive without changing surrounding source", () => {
    const first = setJiraDocumentBinding("@startgantt\n' keep\n@endgantt", binding);
    const changed = setJiraDocumentBinding(first, { ...binding, jql: "filter = 42" });
    expect(changed.match(/@studio-jira/g)).toHaveLength(1);
    expect(changed).toContain("' keep");
    expect(parseJiraDocumentBinding(changed)?.jql).toBe("filter = 42");
  });

  it("uses immutable numeric issue IDs for aliases", () => {
    expect(jiraTaskAlias("10042")).toBe("jira_10042");
    expect(issueIdFromJiraTaskAlias("JIRA_10042")).toBe("10042");
    expect(jiraBrowseUrl("https://acme.atlassian.net/", "app-123")).toBe("https://acme.atlassian.net/browse/APP-123");
    expect(() => jiraBrowseUrl("https://acme.atlassian.net/jira", "APP-123")).toThrow("HTTPS origin");
  });
});
