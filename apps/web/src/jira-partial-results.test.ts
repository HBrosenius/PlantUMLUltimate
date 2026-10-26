import { afterEach, expect, it, vi } from "vitest";
import { jiraUpdateIssues } from "./jira-client";
afterEach(() => vi.unstubAllGlobals());
it("retains confirmed successes and uncertain writes when a later batch fails", async () => {
  const updates = Array.from({ length: 26 }, (_, i) => ({
    issueId: String(i + 1),
    issueKey: `AUDIT-${i + 1}`,
    fields: { summary: "Reviewed change" },
  }));
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        results: updates.slice(0, 25).map((item) => ({ issueId: item.issueId, issueKey: item.issueKey, ok: true })),
      }),
    )
    .mockResolvedValueOnce(Response.json({ error: "Service temporarily unavailable" }, { status: 503 }));
  vi.stubGlobal("fetch", request);
  const results = await jiraUpdateIssues("https://example.test", { cloudId: "audit", updates });
  expect(request).toHaveBeenCalledTimes(2);
  expect(results.filter((result) => result.ok)).toHaveLength(25);
  expect(results[25]).toMatchObject({ issueKey: "AUDIT-26", ok: false, outcome: "uncertain" });
});
