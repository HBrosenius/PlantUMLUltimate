// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { decorateJiraLinkMarkers } from "./jira-link-marker";

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg"><g data-task-id="a"><rect class="bar" x="50" y="10" width="40" height="13"/></g></svg>';
const marker = { taskId: "a", status: "live-progress" as const, issueKey: "SIN-25", statusName: "In Progress" };

describe("decorateJiraLinkMarkers", () => {
  it("adds a status badge to the left of the bar", () => {
    const out = new DOMParser().parseFromString(decorateJiraLinkMarkers(svg, [marker], false), "image/svg+xml");
    const badge = out.querySelector(".jira-link-marker rect");
    expect(badge?.getAttribute("fill")).toBe("#2563eb");
    expect(Number(badge?.getAttribute("x"))).toBeLessThan(50);
    expect(out.querySelector(".jira-link-marker title")?.textContent).toBe("SIN-25 · In Progress");
    expect(out.querySelector("[data-jira-key]")).toBeNull();
  });

  it("adds the issue key pill after the bar when enabled", () => {
    const out = new DOMParser().parseFromString(decorateJiraLinkMarkers(svg, [marker], true), "image/svg+xml");
    expect(out.querySelector("[data-jira-key]")?.textContent).toBe("SIN-25");
  });

  it("leaves unrelated tasks and synced statuses alone", () => {
    expect(decorateJiraLinkMarkers(svg, [{ ...marker, taskId: "zzz" }], true)).toBe(svg);
    expect(decorateJiraLinkMarkers(svg, [{ ...marker, status: "synchronized" }], true)).toBe(svg);
  });

  it("puts the badge on the right when the bar starts at the left edge", () => {
    const edge =
      '<svg xmlns="http://www.w3.org/2000/svg"><g data-task-id="a"><rect class="bar" x="2" y="10" width="40" height="13"/></g></svg>';
    const out = new DOMParser().parseFromString(decorateJiraLinkMarkers(edge, [marker], true), "image/svg+xml");
    const [badge, pill] = [...out.querySelectorAll(".jira-link-marker > rect")];
    expect(Number(badge?.getAttribute("x"))).toBeGreaterThanOrEqual(42);
    expect(Number(pill?.getAttribute("x"))).toBeGreaterThan(Number(badge?.getAttribute("x")));
  });

  it("draws glyphs as shapes, not text", () => {
    const out = new DOMParser().parseFromString(decorateJiraLinkMarkers(svg, [marker], false), "image/svg+xml");
    expect(out.querySelector(".jira-link-marker circle")).not.toBeNull();
    expect(out.querySelector(".jira-link-marker text")).toBeNull();
  });
});
