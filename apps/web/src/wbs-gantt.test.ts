import { describe, expect, it } from "vitest";
import { parseWbs } from "@plantuml-studio/diagram-wbs";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { applyWbsGroupRollups, convertWbsToGantt, rollupWbsGroupDates } from "./wbs-gantt";

describe("WBS to Gantt conversion", () => {
  it("creates an entry without explicit dates for each nested node and retains valid dependencies", () => {
    const source = `@startwbs
*(project) Project
**(design) Design
***(draft) Draft
**(build) Build
draft -> build
build -> draft
@endwbs`;
    const result = convertWbsToGantt(source);
    expect(parseWbs(result.wbsSource).nodes).toHaveLength(4);
    const gantt = parseGantt(result.ganttSource).document;
    expect(gantt.tasks.map((task) => task.alias?.value)).toEqual([
      "wbs_project",
      "wbs_design",
      "wbs_draft",
      "wbs_build",
    ]);
    expect(gantt.tasks.every((task) => !task.start && task.duration?.value === 5)).toBe(true);
    expect(gantt.dependencies).toHaveLength(1);
    expect(result.warnings).toContain("Dependency build → draft would create a cycle.");
  });

  it("adds new nodes without duplicating existing tasks on another import", () => {
    const first = convertWbsToGantt("@startwbs\n* Project\n** Design\n@endwbs");
    const next = convertWbsToGantt(first.wbsSource.replace("@endwbs", "** Build\n@endwbs"), first.ganttSource);
    expect(parseGantt(next.ganttSource).document.tasks).toHaveLength(3);
    expect(next.links).toHaveLength(3);
    expect(convertWbsToGantt(next.wbsSource, next.ganttSource).ganttSource).toBe(next.ganttSource);
  });

  it("rolls parent dates up from scheduled children", () => {
    const result = convertWbsToGantt("@startwbs\n*(project) Project\n**(a) A\n**(b) B\n@endwbs");
    const dates = rollupWbsGroupDates(
      result.wbsSource,
      result.links,
      new Map([
        ["wbs_a", { start: "2026-09-02", end: "2026-09-04", derived: false }],
        ["wbs_b", { start: "2026-09-01", end: "2026-09-07", derived: false }],
      ]),
    );
    expect(dates.get("wbs_project")).toEqual({ start: "2026-09-01", end: "2026-09-07", derived: true });
    expect(applyWbsGroupRollups(result.ganttSource, result.wbsSource, result.links, dates)).toContain(
      "[Project] as [wbs_project] starts 2026-09-01 and ends 2026-09-07",
    );
  });

  it("updates WBS order while retaining Gantt scheduling", () => {
    const first = convertWbsToGantt("@startwbs\n*(project) Project\n**(a) A\n**(b) B\n@endwbs");
    const scheduled = first.ganttSource
      .replace("[↳ A] as [wbs_a] requires 5 days", "[↳ A] as [wbs_a] requires 3 days")
      .replace("@endgantt", "[↳ A] starts 2026-09-02\n@endgantt");
    const updated = convertWbsToGantt("@startwbs\n*(project) Project\n**(b) B\n**(a) Alpha\n@endwbs", scheduled);
    const tasks = parseGantt(updated.ganttSource).document.tasks;
    expect(tasks.map((task) => task.alias?.value)).toEqual(["wbs_project", "wbs_b", "wbs_a"]);
    expect(tasks.find((task) => task.alias?.value === "wbs_a")?.duration?.value).toBe(3);
    expect(updated.ganttSource).toContain("[↳ Alpha] as [wbs_a] requires 3 days");
    expect(updated.ganttSource).toContain("starts 2026-09-02");
  });

  it("reuses a manually linked task when filling the rest of a WBS", () => {
    const existing = "@startgantt\n[Design] as [manual_design] lasts 2 days\n@endgantt";
    const result = convertWbsToGantt("@startwbs\n*(project) Project\n**(design) Design\n@endwbs", existing, [
      { wbsAlias: "design", ganttAlias: "manual_design" },
    ]);
    expect(parseGantt(result.ganttSource).document.tasks).toHaveLength(2);
    expect(parseGantt(result.ganttSource).document.tasks.map((task) => task.alias?.value)).toEqual([
      "wbs_project",
      "manual_design",
    ]);
    expect(result.links).toContainEqual({ wbsAlias: "design", ganttAlias: "manual_design" });
  });

  it("removes generated tasks when their WBS nodes are deleted", () => {
    const first = convertWbsToGantt("@startwbs\n*(project) Project\n**(design) Design\n@endwbs");
    const updated = convertWbsToGantt("@startwbs\n*(project) Project\n@endwbs", first.ganttSource, first.links);
    expect(parseGantt(updated.ganttSource).document.tasks.map((task) => task.alias?.value)).toEqual(["wbs_project"]);
    expect(updated.links).toHaveLength(1);
  });

  it("keeps scheduled tasks as unlinked work when their WBS nodes are deleted", () => {
    const first = convertWbsToGantt("@startwbs\n*(project) Project\n**(design) Design\n@endwbs");
    const scheduled = first.ganttSource.replace(
      "[↳ Design] as [wbs_design] requires 5 days",
      "[↳ Design] as [wbs_design] requires 8 days",
    );
    const updated = convertWbsToGantt("@startwbs\n*(project) Project\n@endwbs", scheduled, first.links);
    expect(parseGantt(updated.ganttSource).document.tasks.map((task) => task.alias?.value)).toEqual([
      "wbs_project",
      "wbs_design",
    ]);
    expect(updated.links).toHaveLength(1);
    expect(updated.warnings).toContain(
      "Kept scheduled Gantt task ↳ Design after its WBS node was removed; it is now unlinked.",
    );
  });

  it("lets a linked subtree deletion keep or delete its Gantt tasks", () => {
    const first = convertWbsToGantt("@startwbs\n*(project) Project\n**(design) Design\n@endwbs");
    const remainingWbs = "@startwbs\n*(project) Project\n@endwbs";
    const kept = convertWbsToGantt(remainingWbs, first.ganttSource, first.links, [], "keep");
    expect(parseGantt(kept.ganttSource).document.tasks.map((task) => task.alias?.value)).toEqual([
      "wbs_project",
      "wbs_design",
    ]);
    expect(kept.links).toHaveLength(1);
    const deleted = convertWbsToGantt(remainingWbs, first.ganttSource, first.links, [], "delete");
    expect(parseGantt(deleted.ganttSource).document.tasks.map((task) => task.alias?.value)).toEqual(["wbs_project"]);
    expect(deleted.links).toHaveLength(1);
    const manual = convertWbsToGantt(
      remainingWbs,
      "@startgantt\n[Project] as [wbs_project] requires 5 days\n[Design] as [manual_design] requires 3 days\n@endgantt",
      [
        { wbsAlias: "project", ganttAlias: "wbs_project" },
        { wbsAlias: "design", ganttAlias: "manual_design" },
      ],
      [],
      "delete",
    );
    expect(parseGantt(manual.ganttSource).document.tasks.map((task) => task.alias?.value)).toEqual(["wbs_project"]);
  });

  it("removes an imported dependency when its WBS arrow is removed", () => {
    const first = convertWbsToGantt("@startwbs\n*(p) Project\n**(a) A\n**(b) B\na -> b\n@endwbs");
    const updated = convertWbsToGantt(
      "@startwbs\n*(p) Project\n**(a) A\n**(b) B\n@endwbs",
      first.ganttSource,
      first.links,
      first.dependencies,
    );
    expect(parseGantt(updated.ganttSource).document.dependencies).toHaveLength(0);
    expect(updated.dependencies).toHaveLength(0);
  });
});
