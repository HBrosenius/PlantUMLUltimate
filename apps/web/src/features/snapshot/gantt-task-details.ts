import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { taskHoverDetails } from "../../DiagramPreview";
import { ganttAnalysisContext } from "../../gantt-analysis-context";
import { analyzeCriticalPath } from "../../schedule-analysis";
import { addCanonicalGanttOverlay } from "../../render/canonical-gantt-overlay";

/** The Gantt hover card of one task, flattened to text for a snapshot page. */
export interface SnapshotTaskDetails {
  /** The task's `data-task-id` in the rendered SVG. */
  id: string;
  label: string;
  dates: string;
  duration: string;
  completion: string;
  resources: string;
  predecessors: string;
  successors: string;
  /** Total and free slack, when the schedule can be analysed. */
  slack?: string | undefined;
}

/**
 * Works out every task's hover card from a Gantt source the same way the preview does: resolved dates,
 * then the critical path for slack, then `taskHoverDetails`. Returns nothing when the source has no tasks.
 */
export function ganttTaskDetails(source: string): SnapshotTaskDetails[] {
  const parsed = parseGantt(source);
  const { tasks, dependencies } = parsed.document;
  if (!tasks.length) return [];
  const context = ganttAnalysisContext(source, parsed);
  const dates = context.dates;
  const analysis = analyzeCriticalPath(tasks, dependencies, dates, context.calendar);
  const names = (items: ReadonlyArray<{ label: string }>) => items.map((item) => item.label).join(", ") || "None";
  return tasks.flatMap((task) => {
    const details = taskHoverDetails(task, dependencies, tasks, dates.get(task.id), analysis);
    if (!details) return [];
    return [
      {
        id: task.id,
        label: details.label,
        dates: details.dates,
        duration: details.duration,
        completion: details.completion,
        resources: details.resources,
        predecessors: names(details.predecessors),
        successors: names(details.successors),
        ...(details.slack ? { slack: `${details.slack.total} total · ${details.slack.free} free` } : {}),
      },
    ];
  });
}

/**
 * Gives each task bar of an exported Gantt SVG an invisible hit area carrying its `data-task-id`, so the
 * snapshot page can attach the task's card. The export SVG has no task ids; like the Jira export markers,
 * the bars are located through the preview's overlay and the clean SVG is only added to, never restyled.
 */
export function markSnapshotTasks(svg: string, source: string): string {
  if (typeof DOMParser === "undefined") return svg;
  const { tasks, dependencies } = parseGantt(source).document;
  if (!tasks.length) return svg;
  const parser = new DOMParser();
  const located = parser.parseFromString(addCanonicalGanttOverlay(svg, tasks, dependencies), "image/svg+xml");
  const clean = parser.parseFromString(svg, "image/svg+xml");
  if (located.querySelector("parsererror") || clean.querySelector("parsererror")) return svg;
  const root = clean.documentElement;
  const ns = "http://www.w3.org/2000/svg";
  let marked = 0;
  for (const task of tasks) {
    const bar = located.querySelector(`[data-task-id="${CSS.escape(task.id)}"] .bar`);
    const width = Number(bar?.getAttribute("width") ?? 0);
    const height = Number(bar?.getAttribute("height") ?? 0);
    if (!bar || !(width > 0) || !(height > 0)) continue;
    const group = clean.createElementNS(ns, "g");
    group.setAttribute("class", "snapshot-task");
    group.setAttribute("data-task-id", task.id);
    const hit = clean.createElementNS(ns, "rect");
    hit.setAttribute("class", "bar");
    for (const name of ["x", "y"]) hit.setAttribute(name, bar.getAttribute(name) ?? "0");
    hit.setAttribute("width", String(width));
    hit.setAttribute("height", String(height));
    hit.setAttribute("rx", "2");
    hit.setAttribute("fill", "transparent");
    hit.setAttribute("pointer-events", "all");
    group.appendChild(hit);
    root.appendChild(group);
    marked++;
  }
  return marked ? new XMLSerializer().serializeToString(root) : svg;
}
