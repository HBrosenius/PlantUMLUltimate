import { describe, expect, it } from "vitest";
import { jiraAuthorizationUrl, jiraPopupReturnUrl, normalizeJiraIssue } from "./jira-client";

describe("Jira client", () => {
  it("normalizes configured date, status, and assignee fields", () => {
    expect(
      normalizeJiraIssue(
        {
          id: "10042",
          key: "APP-123",
          fields: {
            summary: "Implement SSO",
            updated: "2026-08-31T10:00:00.000Z",
            duedate: "2026-09-12",
            customfield_10042: "2026-09-01",
            status: { statusCategory: { key: "indeterminate" } },
            assignee: { accountId: "abc", displayName: "Ada" },
          },
        },
        "customfield_10042",
      ),
    ).toEqual({
      id: "10042",
      key: "APP-123",
      summary: "Implement SSO",
      updated: "2026-08-31T10:00:00.000Z",
      startDate: "2026-09-01",
      dueDate: "2026-09-12",
      completion: 50,
      assignee: { accountId: "abc", displayName: "Ada" },
    });
  });

  it("constructs an OAuth start URL without putting credentials in it", () => {
    expect(jiraAuthorizationUrl("https://integrations.example/", "https://app.example/editor?a=1")).toBe(
      "https://integrations.example/oauth/start?return_url=https%3A%2F%2Fapp.example%2Feditor%3Fa%3D1",
    );
  });

  it("strips collaboration fragments from the OAuth return URL", () => {
    expect(jiraPopupReturnUrl("https://app.example/editor?theme=dark#collaboration-secret")).toBe(
      "https://app.example/editor?theme=dark&jira_popup=1",
    );
  });
});
