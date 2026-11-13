import { describe, expect, it } from "vitest";
import {
  jiraDateDrift,
  jiraKeysJql,
  jiraLinkedExtras,
  jiraLiveStatus,
  linkedJiraIssues,
  parseJiraBrowseLink,
} from "./linked";

describe("linked Jira issues", () => {
  it("parses browse links", () => {
    expect(parseJiraBrowseLink("https://acme.atlassian.net/browse/msg-12")).toEqual({
      issueKey: "MSG-12",
      siteOrigin: "https://acme.atlassian.net",
    });
    expect(parseJiraBrowseLink("http://acme.atlassian.net/browse/MSG-12")).toBeUndefined();
    expect(parseJiraBrowseLink("https://example.com/other")).toBeUndefined();
  });

  it("skips synced tasks and non-Jira links", () => {
    const tasks = [
      { id: "a", links: [{ url: "https://x.atlassian.net/browse/A-1" }] },
      { id: "b", alias: { value: "jira_5" }, links: [{ url: "https://x.atlassian.net/browse/B-2" }] },
      { id: "c", links: [{ url: "https://example.com" }] },
    ];
    expect(linkedJiraIssues(tasks)).toEqual([{ taskId: "a", issueKey: "A-1", siteOrigin: "https://x.atlassian.net" }]);
  });

  it("maps categories and builds safe JQL", () => {
    expect(jiraLiveStatus("indeterminate")).toBe("live-progress");
    expect(jiraLiveStatus(undefined)).toBe("live-unknown");
    expect(jiraKeysJql(["A-1", "A-1", "bad) OR (x", "B-2"])).toBe("key in (A-1, B-2)");
  });
});

describe("hover-card extras", () => {
  it("reads optional fields defensively", () => {
    expect(
      jiraLinkedExtras(
        {
          issuetype: { name: "Epic" },
          priority: { name: "High" },
          duedate: "2026-12-12",
          customfield_1: "2026-12-01T00:00:00.000Z",
          updated: "2026-11-10T10:00:00.000Z",
          progress: { total: 100, percent: 41.6 },
          issuelinks: [
            {
              type: { inward: "is blocked by" },
              inwardIssue: { fields: { status: { statusCategory: { key: "new" } } } },
            },
          ],
        },
        "customfield_1",
      ),
    ).toEqual({
      issueType: "Epic",
      priority: "High",
      dueDate: "2026-12-12",
      startDate: "2026-12-01",
      updated: "2026-11-10T10:00:00.000Z",
      progressPercent: 42,
      blocked: true,
    });
    expect(jiraLinkedExtras({ progress: { total: 0, percent: 0 }, duedate: 5 })).toEqual({ blocked: false });
  });

  it("ignores blockers that are already done", () => {
    const done = {
      type: { inward: "is blocked by" },
      inwardIssue: { fields: { status: { statusCategory: { key: "done" } } } },
    };
    expect(jiraLinkedExtras({ issuelinks: [done] }).blocked).toBe(false);
  });

  it("computes date drift in days", () => {
    expect(jiraDateDrift("2026-12-12", "2026-12-10")).toBe(2);
    expect(jiraDateDrift("2026-12-08", "2026-12-10")).toBe(-2);
    expect(jiraDateDrift(undefined, "2026-12-10")).toBeUndefined();
  });
});
