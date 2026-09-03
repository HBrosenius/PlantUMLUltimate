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
  managedDependencyKeys: ["jira_10041>jira_10042"],
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

  it("trims trailing whitespace from the directive without regressing on CRLF sources", () => {
    const withTrailingSpace = `@startgantt\n' @studio-jira ${JSON.stringify(binding)}   \t \n@endgantt`;
    expect(parseJiraDocumentBinding(withTrailingSpace)).toEqual(binding);
    const withCRLF = `@startgantt\r\n' @studio-jira ${JSON.stringify(binding)}  \r\n@endgantt\r\n`;
    expect(parseJiraDocumentBinding(withCRLF)).toEqual(binding);
  });

  it("parses a pathological directive line in linear time (no ReDoS)", () => {
    // Regression test for a polynomial regular expression (CodeQL #38/#39): a lazy capture
    // immediately followed by an overlapping `[ \t]*` used to force O(n^2) backtracking on an
    // attacker-controlled line shaped like "<non-space><many spaces><non-space>". Untrusted
    // PlantUML source can contain arbitrarily long lines, so this must stay near-instant.
    const pathological = `@startgantt\n' @studio-jira Y${" ".repeat(50_000)}X\n@endgantt\n`;
    const start = performance.now();
    parseJiraDocumentBinding(pathological);
    expect(performance.now() - start).toBeLessThan(200);
  });

  it("uses immutable numeric issue IDs for aliases", () => {
    expect(jiraTaskAlias("10042")).toBe("jira_10042");
    expect(issueIdFromJiraTaskAlias("JIRA_10042")).toBe("10042");
    expect(jiraBrowseUrl("https://acme.atlassian.net/", "app-123")).toBe("https://acme.atlassian.net/browse/APP-123");
    expect(() => jiraBrowseUrl("https://acme.atlassian.net/jira", "APP-123")).toThrow("HTTPS origin");
  });
});
