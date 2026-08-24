import type { GanttDependency, GanttTask } from "@plantuml-studio/diagram-gantt";
import { taskElapsedDays, type ResolvedTaskDates } from "./gantt-schedule";

export interface TaskVariance {
  taskId: string;
  startDays: number;
  endDays: number;
}

const dateDays = (value?: string) => value ? Math.round(Date.parse(`${value}T00:00:00Z`) / 86_400_000) : undefined;

export function baselineBarGeometry(currentX: number, dayWidth: number, startDays: number, span: number) {
  return { x: currentX - startDays * dayWidth, width: Math.max(1, span * dayWidth - 4) };
}

export function timelineBaselineX(
  timelineDates: readonly { date: string; x: number }[],
  baselineStart: string,
  dayWidth: number,
  firstBarX: number,
  fallbackX: number,
): number {
  const index = timelineDates.findIndex((item) => item.date === baselineStart);
  return index >= 0 ? firstBarX + index * dayWidth : fallbackX;
}

export interface RenderedBaselineGeometry { span: number; startDate?: string }

function normalizeColumnOffset(offset: number, dayWidth: number): number {
  return ((offset + dayWidth / 2) % dayWidth + dayWidth) % dayWidth - dayWidth / 2;
}

export function extractRenderedTaskGeometry(
  svg: string | undefined,
  resolved: ReadonlyMap<string, ResolvedTaskDates>,
): Map<string, RenderedBaselineGeometry> {
  const geometry = new Map<string, RenderedBaselineGeometry>();
  if (!svg || typeof DOMParser === "undefined") return geometry;
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (document.querySelector("parsererror")) return geometry;
  const dates = [...document.querySelectorAll<SVGElement>('[data-timeline-header="top"][data-timeline-date]')].flatMap((element) => {
    const date = element.getAttribute("data-timeline-date");
    const x = Number(element.getAttribute("data-timeline-x"));
    return date && Number.isFinite(x) ? [{ date, x }] : [];
  });
  const offsets: number[] = [];
  for (const group of document.querySelectorAll<SVGGElement>("[data-task-id]")) {
    const id = group.getAttribute("data-task-id");
    const bar = group.querySelector<SVGRectElement>(".bar");
    const width = Number(bar?.getAttribute("width"));
    const x = Number(bar?.getAttribute("x"));
    const dayWidth = Number(group.getAttribute("data-day-width"));
    const sourceStart = id ? resolved.get(id)?.start : undefined;
    const sourceColumn = sourceStart ? dates.find((item) => item.date === sourceStart) : undefined;
    if (sourceColumn && Number.isFinite(x) && dayWidth > 0)
      offsets.push(normalizeColumnOffset(x - sourceColumn.x, dayWidth));
    if (id && width > 0 && dayWidth > 0) geometry.set(id, { span: (width + 4) / dayWidth });
  }
  offsets.sort((a, b) => a - b);
  const offset = offsets.length ? offsets[Math.floor(offsets.length / 2)]! : 0;
  for (const group of document.querySelectorAll<SVGGElement>("[data-task-id]")) {
    const id = group.getAttribute("data-task-id");
    const barX = Number(group.querySelector<SVGRectElement>(".bar")?.getAttribute("x"));
    const current = id ? geometry.get(id) : undefined;
    if (!id || !current || !Number.isFinite(barX)) continue;
    const closest = dates.reduce<{ date: string; distance: number } | undefined>((best, item) => {
      const distance = Math.abs(item.x + offset - barX);
      return !best || distance < best.distance ? { date: item.date, distance } : best;
    }, undefined);
    geometry.set(id, { ...current, ...(closest ? { startDate: closest.date } : {}) });
  }
  return geometry;
}

export function calculateTaskVariance(
  current: ReadonlyMap<string, ResolvedTaskDates>,
  baseline: ReadonlyMap<string, ResolvedTaskDates>,
): TaskVariance[] {
  return [...current].flatMap(([taskId, dates]) => {
    const previous = baseline.get(taskId);
    const start = dateDays(dates.start), oldStart = dateDays(previous?.start);
    const end = dateDays(dates.end), oldEnd = dateDays(previous?.end);
    return start === undefined || oldStart === undefined || end === undefined || oldEnd === undefined
      ? []
      : [{ taskId, startDays: start - oldStart, endDays: end - oldEnd }];
  });
}

export function criticalPathTaskIds(tasks: readonly GanttTask[], dependencies: readonly GanttDependency[]): Set<string> {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const incoming = new Map(tasks.map((task) => [task.id, 0]));
  const outgoing = new Map(tasks.map((task) => [task.id, [] as string[]]));
  for (const dependency of dependencies) {
    if (!byId.has(dependency.predecessorTaskId) || !byId.has(dependency.successorTaskId)) continue;
    outgoing.get(dependency.predecessorTaskId)!.push(dependency.successorTaskId);
    incoming.set(dependency.successorTaskId, (incoming.get(dependency.successorTaskId) ?? 0) + 1);
  }
  const queue = [...incoming].filter(([, count]) => count === 0).map(([id]) => id);
  const distance = new Map<string, number>();
  const previous = new Map<string, string>();
  let terminal: string | undefined;
  while (queue.length) {
    const id = queue.shift()!;
    const finish = (distance.get(id) ?? 0) + (taskElapsedDays(byId.get(id)!) ?? 1);
    if (!terminal || finish > (distance.get(terminal) ?? 0) + (taskElapsedDays(byId.get(terminal)!) ?? 1)) terminal = id;
    for (const next of outgoing.get(id) ?? []) {
      if (finish > (distance.get(next) ?? 0)) {
        distance.set(next, finish);
        previous.set(next, id);
      }
      incoming.set(next, incoming.get(next)! - 1);
      if (incoming.get(next) === 0) queue.push(next);
    }
  }
  if ([...incoming.values()].some((count) => count > 0)) return new Set();
  const result = new Set<string>();
  while (terminal) {
    result.add(terminal);
    terminal = previous.get(terminal);
  }
  return result;
}

export function decorateScheduleAnalysis(
  svg: string,
  criticalIds: ReadonlySet<string>,
  variance: readonly TaskVariance[],
  current: ReadonlyMap<string, ResolvedTaskDates>,
  baseline: ReadonlyMap<string, ResolvedTaskDates>,
  renderedBaselineGeometry: ReadonlyMap<string, RenderedBaselineGeometry> = new Map(),
): string {
  if (typeof DOMParser === "undefined") return svg;
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (document.querySelector("parsererror")) return svg;
  const root = document.documentElement;
  const timelineDates = [...root.querySelectorAll<SVGElement>('[data-timeline-header="top"][data-timeline-date]')]
    .flatMap((element) => {
      const date = element.getAttribute("data-timeline-date");
      const x = Number(element.getAttribute("data-timeline-x"));
      return date && Number.isFinite(x) ? [{ date, x }] : [];
    });
  const firstBarCandidates = [...root.querySelectorAll<SVGGElement>("[data-task-id]")].flatMap((group) => {
    const id = group.getAttribute("data-task-id");
    const start = id ? current.get(id)?.start : undefined;
    const index = start ? timelineDates.findIndex((item) => item.date === start) : -1;
    const barX = Number(group.querySelector<SVGRectElement>(".bar")?.getAttribute("x"));
    const dayWidth = Number(group.getAttribute("data-day-width") ?? 16);
    return index >= 0 && Number.isFinite(barX) ? [barX - index * dayWidth] : [];
  });
  const firstBarX = firstBarCandidates.length ? Math.min(...firstBarCandidates) : 0;
  for (const group of root.querySelectorAll<SVGGElement>("[data-task-id]")) {
    const id = group.getAttribute("data-task-id") ?? "";
    if (criticalIds.has(id)) group.setAttribute("data-critical-path", "true");
    const change = variance.find((item) => item.taskId === id);
    const now = current.get(id), old = baseline.get(id);
    const hit = group.querySelector<SVGRectElement>(".bar");
    if (!change || !hit || !now?.start || !old?.start || !old.end) continue;
    const dayWidth = Number(group.getAttribute("data-day-width") ?? 16);
    const renderedGeometry = renderedBaselineGeometry.get(id);
    const baselineStart = renderedGeometry?.startDate ?? old.start;
    const span = renderedGeometry?.span ?? Math.max(1, (dateDays(old.end)! - dateDays(old.start)! + 1));
    const geometry = baselineBarGeometry(Number(hit.getAttribute("x")), dayWidth, change.startDays, span);
    geometry.x = timelineBaselineX(timelineDates, baselineStart, dayWidth, firstBarX, geometry.x);
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    marker.setAttribute("class", "baseline-bar");
    marker.setAttribute("data-baseline-task-id", id);
    marker.setAttribute("data-baseline-dates", `${baselineStart} – ${old.end}`);
    marker.setAttribute("x", String(geometry.x));
    marker.setAttribute("y", hit.getAttribute("y") ?? "0");
    marker.setAttribute("width", String(geometry.width));
    marker.setAttribute("height", hit.getAttribute("height") ?? "1");
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `Baseline: ${baselineStart} – ${old.end}`;
    marker.append(title);
    // Baselines belong to the fixed timeline, not the draggable task group. Keeping
    // them at the SVG root prevents the task's temporary drag transform from moving
    // its historical position as well.
    const interactionLayer = root.querySelector(".interaction-task");
    if (interactionLayer) root.insertBefore(marker, interactionLayer);
    else root.append(marker);
  }
  for (const path of root.querySelectorAll<SVGElement>("[data-predecessor-task-id][data-successor-task-id]")) {
    if (criticalIds.has(path.getAttribute("data-predecessor-task-id") ?? "") && criticalIds.has(path.getAttribute("data-successor-task-id") ?? ""))
      path.setAttribute("data-critical-path", "true");
  }
  return new XMLSerializer().serializeToString(root);
}
