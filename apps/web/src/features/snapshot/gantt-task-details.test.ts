// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { ganttTaskDetails, markSnapshotTasks } from "./gantt-task-details";

describe("ganttTaskDetails", () => {
  const source = [
    "@startgantt",
    "Project starts 2026-09-07",
    "[Design] requires 3 days",
    "[Build] requires 5 days and is 40% completed",
    "[Build] starts at [Design]'s end",
    "[Ann] is on [Build]",
    "@endgantt",
  ].join("\n");

  it("works out each task's card as the preview does, keyed by the SVG task id", () => {
    const details = ganttTaskDetails(source);
    const ids = parseGantt(source).document.tasks.map((task) => task.id);
    expect(details.map((task) => task.id)).toEqual(ids);
    const build = details.find((task) => task.label === "Build")!;
    expect(build.completion).toBe("40%");
    expect(build.duration).toBe("5 days");
    expect(build.predecessors).toBe("Design");
    expect(build.dates).toMatch(/^2026-09-\d\d → 2026-09-\d\d$/);
    expect(build.slack).toContain("total");
    expect(details.find((task) => task.label === "Design")!.successors).toBe("Build");
  });

  it("returns nothing for a source without tasks", () => {
    expect(ganttTaskDetails("@startgantt\n@endgantt")).toEqual([]);
  });
});

describe("markSnapshotTasks", () => {
  const source = ["@startgantt", "[Backend] requires 5 days", "@endgantt"].join("\n");
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60">' +
    '<text x="10" y="30" font-size="12">Backend</text>' +
    '<rect x="50" y="20" width="100" height="20" fill="#4DABF5" stroke="#2196F3"/>' +
    "</svg>";

  it("adds an invisible hit area with the task id over each bar and leaves the drawing alone", () => {
    const id = parseGantt(source).document.tasks[0]!.id;
    const marked = markSnapshotTasks(svg, source);
    const doc = new DOMParser().parseFromString(marked, "image/svg+xml");
    const hit = doc.querySelector(`g.snapshot-task[data-task-id="${id}"] rect.bar`);
    expect(hit?.getAttribute("fill")).toBe("transparent");
    expect(hit?.getAttribute("width")).toBe("100");
    expect(doc.querySelector('rect[fill="#4DABF5"]')).not.toBeNull();
    expect(doc.querySelectorAll("[data-task-id]")).toHaveLength(1);
  });

  it("returns the svg unchanged when there are no tasks", () => {
    expect(markSnapshotTasks(svg, ["@startgantt", "@endgantt"].join("\n"))).toBe(svg);
  });
});
