import { expect, it } from "vitest";
import { consumeJiraOAuthResult } from "./use-jira-integration";

it("consumes Jira OAuth parameters without disturbing other URL state", () => {
  const result = consumeJiraOAuthResult("https://studio.example/app?view=split&jira=connected&jira_popup=1#room");
  expect(result.oauth).toEqual({ result: "connected", popup: true });
  expect(result.cleanUrl).toBe("https://studio.example/app?view=split#room");
});

it("leaves URLs without Jira OAuth results unchanged", () => {
  const url = "https://studio.example/app?view=split#room";
  expect(consumeJiraOAuthResult(url)).toEqual({ cleanUrl: url });
});
