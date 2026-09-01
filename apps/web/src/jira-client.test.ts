import { afterEach, describe, expect, it, vi } from "vitest";
import { jiraAuthorizationUrl, jiraPopupReturnUrl, jiraUpdateIssues, normalizeJiraIssue } from "./jira-client";

afterEach(() => vi.unstubAllGlobals());

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
            issuelinks: [
              {
                type: { inward: "is blocked by", outward: "blocks" },
                inwardIssue: { id: "10041", key: "APP-122" },
              },
              {
                type: { inward: "is blocked by", outward: "blocks" },
                outwardIssue: { id: "10043", key: "APP-124" },
              },
            ],
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
      blockedByIssueIds: ["10041"],
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

  it("publishes large reviews in bounded batches", async () => {
    const requests: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { updates: Array<{ issueId: string; issueKey: string }> };
        requests.push(body);
        return Response.json({
          results: body.updates.map((update) => ({ ...update, ok: true })),
        });
      }),
    );
    const updates = Array.from({ length: 26 }, (_, index) => ({
      issueId: String(10_000 + index),
      issueKey: `APP-${index + 1}`,
      fields: { summary: `Task ${index + 1}` },
    }));

    await expect(
      jiraUpdateIssues("https://integrations.example", { cloudId: "cloud-1", updates }),
    ).resolves.toHaveLength(26);
    expect(requests).toHaveLength(2);
    expect((requests[0] as { updates: unknown[] }).updates).toHaveLength(25);
    expect((requests[1] as { updates: unknown[] }).updates).toHaveLength(1);
  });
});
