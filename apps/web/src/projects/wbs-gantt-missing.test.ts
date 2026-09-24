import { describe, expect, it } from "vitest";
import { collectMissingWbsGanttItems } from "./wbs-gantt-missing";

describe("WBS–Gantt coverage", () => {
  it("lists unlinked work in diagram order and updates when a link is added", () => {
    const wbs = {
      id: "wbs",
      name: "Breakdown",
      source: "@startwbs\n*(root) Project\n**(design) Design\n**(build) Build\n@endwbs",
    };
    const gantt = {
      id: "gantt",
      name: "Schedule",
      source:
        "@startgantt\n[Project] as [wbs_root] requires 5 days\n[Design] as [wbs_design] requires 5 days\n[Review] lasts 3 days\n@endgantt",
    };
    const links = [
      { wbsAlias: "root", ganttAlias: "wbs_root" },
      { wbsAlias: "design", ganttAlias: "wbs_design" },
    ];
    expect(collectMissingWbsGanttItems(wbs, gantt, links).map((item) => `${item.kind}:${item.label}`)).toEqual([
      "wbs:Build",
      "gantt:Review",
    ]);
    expect(
      collectMissingWbsGanttItems(wbs, gantt, [...links, { wbsAlias: "build", ganttAlias: "review" }]),
    ).toHaveLength(0);
  });
});
