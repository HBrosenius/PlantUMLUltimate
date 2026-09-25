import { describe, expect, it } from "vitest";
import { parseWbs } from "@plantuml-studio/diagram-wbs";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { DEFAULT_WBS_SOURCE } from "./model";
import { parseGanttCalendar } from "./gantt-calendar";
import { resolveTaskDates } from "./gantt-schedule";
import {
  addMissingGanttTasksToWbs,
  convertWbsToGantt,
  ensureLinkedGanttProjectStart,
  relinkWbsGanttTask,
} from "./wbs-gantt";

describe("WBS to Gantt conversion", () => {
  it("adds only a selected WBS node and its missing ancestors", () => {
    const initial = convertWbsToGantt("@startwbs\n*(project) Project\n@endwbs");
    const wbs = initial.wbsSource.replace("@endwbs", "**(design) Design\n***(draft) Draft\n**(build) Build\n@endwbs");
    const imported = convertWbsToGantt(wbs, initial.ganttSource, initial.links, [], "keep-scheduled", true, ["wbs-2"]);
    expect(imported.ganttSource).toContain("[↳ Design] as [wbs_design]");
    expect(imported.ganttSource).toContain("[↳ ↳ Draft] as [wbs_draft]");
    expect(imported.ganttSource).not.toContain("[↳ Build] as [wbs_build]");
    expect(imported.links).toHaveLength(3);
  });

  it("adds only the selected unlinked Gantt task to WBS", () => {
    const initial = convertWbsToGantt("@startwbs\n*(project) Project\n@endwbs");
    const gantt = initial.ganttSource.replace(
      "@endgantt",
      "[Review] as [review] requires 3 days\n[Launch] as [launch] requires 2 days\n@endgantt",
    );
    const imported = addMissingGanttTasksToWbs(initial.wbsSource, gantt, initial.links, [], ["review"]);
    expect(imported.wbsSource).toContain("Review");
    expect(imported.wbsSource).not.toContain("Launch");
    expect(imported.addedCount).toBe(1);
  });

  it("nests missing Gantt tasks beneath their single linked predecessor without adding WBS arrows", () => {
    const converted = convertWbsToGantt("@startwbs\n*(project) Project\n**(design) Design\n@endwbs");
    const gantt = converted.ganttSource.replace(
      "@endgantt",
      "[Review] as [review] requires 3 days\n[Launch] requires 2 days\n[Review] starts at [wbs_design]'s end\n[Launch] starts at [Review]'s end\n@endgantt",
    );
    const first = addMissingGanttTasksToWbs(converted.wbsSource, gantt, converted.links);
    expect(first.addedCount).toBe(2);
    expect(parseWbs(first.wbsSource).nodes.map((node) => node.label)).toEqual([
      "Project",
      "Design",
      "Review",
      "Launch",
    ]);
    expect(first.links).toHaveLength(4);
    const nodes = parseWbs(first.wbsSource).nodes;
    expect(nodes.find((node) => node.label === "Review")?.parentId).toBe(
      nodes.find((node) => node.label === "Design")?.id,
    );
    expect(nodes.find((node) => node.label === "Launch")?.parentId).toBe(
      nodes.find((node) => node.label === "Review")?.id,
    );
    expect(parseWbs(first.wbsSource).relationships).toHaveLength(0);
    expect(parseGantt(first.ganttSource).document.dependencies).toHaveLength(3);
    const again = addMissingGanttTasksToWbs(first.wbsSource, first.ganttSource, first.links, first.dependencies);
    expect(again.addedCount).toBe(0);
    expect(again.wbsSource).toBe(first.wbsSource);
    expect(again.links).toEqual(first.links);
  });

  it("places a task after Quality assurance beneath that WBS node", () => {
    const converted = convertWbsToGantt(DEFAULT_WBS_SOURCE);
    const gantt = converted.ganttSource.replace(
      "@endgantt",
      "[Review] as [review] requires 5 days\n[Review] starts at [wbs_quality_assurance]'s end\n@endgantt",
    );
    const imported = addMissingGanttTasksToWbs(converted.wbsSource, gantt, converted.links);
    const nodes = parseWbs(imported.wbsSource).nodes;
    expect(nodes.find((node) => node.label === "Review")?.parentId).toBe(
      nodes.find((node) => node.label === "Quality assurance")?.id,
    );
    expect(parseWbs(imported.wbsSource).relationships).toHaveLength(0);
    expect(parseGantt(imported.ganttSource).document.dependencies).toHaveLength(10);
    const synced = convertWbsToGantt(
      imported.wbsSource,
      imported.ganttSource,
      imported.links,
      imported.dependencies,
      "keep-scheduled",
      false,
    );
    expect(parseGantt(synced.ganttSource).document.dependencies).toHaveLength(10);
  });

  it("falls back to the WBS root without an arrow when a task has multiple predecessors", () => {
    const converted = convertWbsToGantt("@startwbs\n*(project) Project\n**(a) A\n**(b) B\n@endwbs");
    const gantt = converted.ganttSource.replace(
      "@endgantt",
      "[Review] as [review] requires 5 days\n[Review] starts at [wbs_a]'s end\n[Review] starts at [wbs_b]'s end\n@endgantt",
    );
    const imported = addMissingGanttTasksToWbs(converted.wbsSource, gantt, converted.links);
    const nodes = parseWbs(imported.wbsSource).nodes;
    expect(nodes.find((node) => node.label === "Review")?.parentId).toBe(nodes[0]?.id);
    expect(parseWbs(imported.wbsSource).relationships).toHaveLength(0);
  });
  it("relinks a WBS node while explicitly keeping or removing its former Gantt task", () => {
    const converted = convertWbsToGantt("@startwbs\n*(project) Project\n**(design) Design\n@endwbs");
    const source = converted.ganttSource.replace("@endgantt", "[Replacement] as [replacement] lasts 2 days\n@endgantt");
    const kept = relinkWbsGanttTask(source, converted.links, "design", "replacement", "keep");
    expect(kept.error).toBeUndefined();
    expect(kept.links).toContainEqual({ wbsAlias: "design", ganttAlias: "replacement" });
    expect(parseGantt(kept.ganttSource).document.tasks).toHaveLength(3);
    const deleted = relinkWbsGanttTask(source, converted.links, "design", "replacement", "delete");
    expect(deleted.error).toBeUndefined();
    expect(deleted.links).toContainEqual({ wbsAlias: "design", ganttAlias: "replacement" });
    expect(parseGantt(deleted.ganttSource).document.tasks.map((task) => task.alias?.value)).toEqual([
      "wbs_project",
      "replacement",
    ]);
    expect(relinkWbsGanttTask(source, converted.links, "project", "wbs_design").error).toBe(
      "That Gantt task is already linked to another WBS node",
    );
  });
  it("assigns a stable alias when linking a task without one", () => {
    const result = relinkWbsGanttTask("@startgantt\n[Design] lasts 2 days\n@endgantt", [], "design", "design");
    expect(result.error).toBeUndefined();
    expect(result.links).toEqual([{ wbsAlias: "design", ganttAlias: "wbs_link_design" }]);
    expect(parseGantt(result.ganttSource).document.tasks[0]?.alias?.value).toBe("wbs_link_design");
  });
  it("infers a project start when the first dated leaf is scheduled", () => {
    const converted = convertWbsToGantt("@startwbs\n*(project) Project\n**(design) Design\n@endwbs");
    expect(ensureLinkedGanttProjectStart(converted.ganttSource)).toBe(converted.ganttSource);
    const dated = converted.ganttSource.replace("@endgantt", "[wbs_design] starts 2026-09-24\n@endgantt");
    const inferred = ensureLinkedGanttProjectStart(dated);
    expect(inferred).toContain("@startgantt\nProject starts 2026-09-24\n");
    expect(parseGantt(inferred).document.projectStart?.value).toBe("2026-09-24");
    expect(ensureLinkedGanttProjectStart(inferred)).toBe(inferred);
    const explicit = dated.replace("@startgantt\n", "@startgantt\nProject starts 2026-09-01\n");
    expect(ensureLinkedGanttProjectStart(explicit)).toBe(explicit);
  });
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
    expect(gantt.dependencies).toHaveLength(4);
    expect(result.warnings).toContain("Dependency build → draft would create a cycle.");
  });

  it("adds new nodes without duplicating existing tasks on another import", () => {
    const first = convertWbsToGantt("@startwbs\n* Project\n** Design\n@endwbs");
    const next = convertWbsToGantt(first.wbsSource.replace("@endwbs", "** Build\n@endwbs"), first.ganttSource);
    expect(parseGantt(next.ganttSource).document.tasks).toHaveLength(3);
    expect(next.links).toHaveLength(3);
    expect(convertWbsToGantt(next.wbsSource, next.ganttSource).ganttSource).toBe(next.ganttSource);
  });

  it("does not recreate an intentionally unlinked WBS node during background synchronization", () => {
    const first = convertWbsToGantt("@startwbs\n*(project) Project\n**(design) Design\n@endwbs");
    const gantt = first.ganttSource.replace("[↳ Design] as [wbs_design] requires 5 days\n", "");
    const remaining = first.links.filter((link) => link.wbsAlias !== "design");
    const synced = convertWbsToGantt(first.wbsSource, gantt, remaining, first.dependencies, "keep-scheduled", false);
    expect(synced.links).toEqual(remaining);
    expect(parseGantt(synced.ganttSource).document.tasks).toHaveLength(1);
    const imported = convertWbsToGantt(first.wbsSource, synced.ganttSource, remaining);
    expect(imported.links).toHaveLength(2);
    expect(parseGantt(imported.ganttSource).document.tasks).toHaveLength(2);
  });

  it("uses parent tasks as predecessors without rolling parent dates up from children", () => {
    const result = convertWbsToGantt("@startwbs\n*(project) Project\n**(a) A\n**(b) B\n@endwbs");
    expect(result.dependencies).toEqual([
      { from: "project", to: "a" },
      { from: "project", to: "b" },
    ]);
    const scheduled = result.ganttSource.replace(
      "[Project] as [wbs_project] requires 5 days",
      "[Project] as [wbs_project] starts 2026-09-23 and requires 5 days",
    );
    const gantt = parseGantt(scheduled).document;
    const dates = resolveTaskDates(
      gantt.tasks,
      gantt.dependencies,
      gantt.projectStart?.value,
      parseGanttCalendar(scheduled),
    );
    const parentEnd = dates.get("wbs_project")?.end;
    const firstStart = dates.get("wbs_a")?.start;
    const secondStart = dates.get("wbs_b")?.start;
    expect(parentEnd).toBeDefined();
    expect(firstStart).toBeDefined();
    expect(secondStart).toBeDefined();
    expect(firstStart! > parentEnd!).toBe(true);
    expect(secondStart! > parentEnd!).toBe(true);
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
    const updated = convertWbsToGantt(
      "@startwbs\n*(project) Project\n@endwbs",
      first.ganttSource,
      first.links,
      first.dependencies,
    );
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
    expect(parseGantt(updated.ganttSource).document.dependencies).toHaveLength(2);
    expect(updated.dependencies).toEqual([
      { from: "p", to: "a" },
      { from: "p", to: "b" },
    ]);
  });
});
