import { describe, expect, it } from "vitest";
import { collectWbsGanttIssues } from "./wbs-gantt-health";

describe("WBS–Gantt project issues", () => {
  const wbs = "@startwbs\n*(root) Project\n**(a) A\n**(b) B\na -> b\nb -> a\n@endwbs";
  const gantt =
    "@startgantt\n[Project] as [g_root] requires 5 days\n[A] as [g_a] requires 5 days\n[B] as [g_b] requires 5 days\n@endgantt";
  const links = [
    { wbsAlias: "root", ganttAlias: "g_root" },
    { wbsAlias: "a", ganttAlias: "g_a" },
    { wbsAlias: "b", ganttAlias: "g_b" },
  ];

  it("locates broken task links and dependency cycles", () => {
    const issues = collectWbsGanttIssues(wbs, gantt.replace("[B] as [g_b] requires 5 days\n", ""), links);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ diagram: "wbs", kind: "node", message: expect.stringContaining("g_b is missing") }),
        expect.objectContaining({ diagram: "wbs", kind: "relationship", message: expect.stringContaining("cycle") }),
      ]),
    );
  });

  it("locates a Gantt task whose linked WBS node is gone", () => {
    const issues = collectWbsGanttIssues(wbs.replace("**(b) B\n", ""), gantt, links);
    expect(issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ diagram: "gantt", kind: "task", key: "g_b" })]),
    );
  });
});
