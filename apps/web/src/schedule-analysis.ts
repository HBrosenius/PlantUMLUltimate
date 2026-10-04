import type { GanttDependency, GanttTask } from "@plantuml-studio/diagram-gantt";
import { dependencyDate, resolveTaskDates, type ResolvedTaskDates } from "./gantt-schedule";
import { isWorkingDate, taskPauses, shiftDate, parseGanttCalendar, type GanttCalendar } from "./gantt-calendar";

export interface TaskVariance {
  taskId: string;
  kind: "unchanged" | "changed" | "added" | "removed";
  startDays: number;
  endDays: number;
}

const dateDays = (value?: string) => (value ? Math.round(Date.parse(`${value}T00:00:00Z`) / 86_400_000) : undefined);

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

export interface RenderedBaselineGeometry {
  span: number;
  startDate?: string;
  height?: number;
}

function normalizeColumnOffset(offset: number, dayWidth: number): number {
  return ((((offset + dayWidth / 2) % dayWidth) + dayWidth) % dayWidth) - dayWidth / 2;
}

export function extractRenderedTaskGeometry(
  svg: string | undefined,
  resolved: ReadonlyMap<string, ResolvedTaskDates>,
): Map<string, RenderedBaselineGeometry> {
  const geometry = new Map<string, RenderedBaselineGeometry>();
  if (!svg || typeof DOMParser === "undefined") return geometry;
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (document.querySelector("parsererror")) return geometry;
  const dates = [...document.querySelectorAll<SVGElement>('[data-timeline-header="top"][data-timeline-date]')].flatMap(
    (element) => {
      const date = element.getAttribute("data-timeline-date");
      const x = Number(element.getAttribute("data-timeline-x"));
      return date && Number.isFinite(x) ? [{ date, x }] : [];
    },
  );
  const offsets: number[] = [];
  for (const group of document.querySelectorAll<SVGGElement>("[data-task-id]")) {
    const id = group.getAttribute("data-task-id");
    const bar = group.querySelector<SVGRectElement>(".bar");
    const width = Number(bar?.getAttribute("width"));
    const x = Number(bar?.getAttribute("x"));
    const dayWidth = Number(group.getAttribute("data-day-width"));
    const height = Number(bar?.getAttribute("height"));
    const sourceStart = id ? resolved.get(id)?.start : undefined;
    const sourceColumn = sourceStart ? dates.find((item) => item.date === sourceStart) : undefined;
    if (sourceColumn && Number.isFinite(x) && dayWidth > 0)
      offsets.push(normalizeColumnOffset(x - sourceColumn.x, dayWidth));
    if (id && width > 0 && dayWidth > 0)
      geometry.set(id, { span: (width + 4) / dayWidth, ...(height > 0 ? { height } : {}) });
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
  currentGeometry: ReadonlyMap<string, RenderedBaselineGeometry> = new Map(),
  baselineGeometry: ReadonlyMap<string, RenderedBaselineGeometry> = new Map(),
): TaskVariance[] {
  const taskIds = new Set([...current.keys(), ...baseline.keys()]);
  const result: TaskVariance[] = [];
  for (const taskId of taskIds) {
    const dates = current.get(taskId);
    const previous = baseline.get(taskId);
    if (!previous) {
      result.push({ taskId, kind: "added", startDays: 0, endDays: 0 });
      continue;
    }
    if (!dates) {
      result.push({ taskId, kind: "removed", startDays: 0, endDays: 0 });
      continue;
    }
    const rendered = currentGeometry.get(taskId);
    const renderedBaseline = baselineGeometry.get(taskId);
    const visualStart = rendered?.startDate ?? dates.start;
    const visualBaselineStart = renderedBaseline?.startDate ?? previous.start;
    const start = dateDays(visualStart),
      oldStart = dateDays(visualBaselineStart);
    const end =
      start !== undefined && rendered?.span !== undefined
        ? start + Math.max(0, Math.round(rendered.span) - 1)
        : dateDays(dates.end);
    const oldEnd =
      oldStart !== undefined && renderedBaseline?.span !== undefined
        ? oldStart + Math.max(0, Math.round(renderedBaseline.span) - 1)
        : dateDays(previous.end);
    if (start === undefined || oldStart === undefined || end === undefined || oldEnd === undefined) continue;
    result.push({
      taskId,
      kind: start === oldStart && end === oldEnd ? "unchanged" : "changed",
      startDays: start - oldStart,
      endDays: end - oldEnd,
    });
  }
  return result;
}

export interface CriticalPathAnalysis {
  taskIds: Set<string>;
  orderedTaskIds: string[];
  projectDuration: number;
  slackByTask: Map<string, number>;
  blockers: Array<{ taskId: string; reason: string }>;
}

export function analyzeCriticalPath(
  tasks: readonly GanttTask[],
  dependencies: readonly GanttDependency[],
  resolvedDates?: ReadonlyMap<string, ResolvedTaskDates>,
  calendar?: GanttCalendar,
): CriticalPathAnalysis {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  calendar ??= parseGanttCalendar("");
  // Undated diagrams use a shared reference date; actual project dates supplied
  // by the caller always take precedence over this duration-only comparison.
  const anchor =
    tasks
      .flatMap((task) => [task.start, task.end].filter((date) => date?.resolved).map((date) => date!.value))
      .sort()[0] ?? "2000-01-03";
  resolvedDates ??= resolveTaskDates(tasks, dependencies, anchor, calendar);
  const empty = (blockers: CriticalPathAnalysis["blockers"] = []): CriticalPathAnalysis => ({
    taskIds: new Set(),
    orderedTaskIds: [],
    projectDuration: 0,
    slackByTask: new Map(),
    blockers,
  });
  const blockers = tasks.flatMap((task) => {
    const dates = resolvedDates!.get(task.id);
    const start = dateDays(dates?.start);
    const end = dateDays(dates?.end);
    const reason =
      dates?.issue ??
      (start === undefined || end === undefined || !Number.isFinite(start) || !Number.isFinite(end)
        ? "Task dates cannot be resolved"
        : end < start
          ? "Task ends before it starts"
          : undefined);
    return reason ? [{ taskId: task.id, reason }] : [];
  });
  if (blockers.length) return empty(blockers);
  const incoming = new Map(tasks.map((task) => [task.id, 0]));
  const outgoing = new Map(tasks.map((task) => [task.id, [] as { successor: string; dependency: GanttDependency }[]]));
  for (const dependency of dependencies) {
    if (!byId.has(dependency.predecessorTaskId) || !byId.has(dependency.successorTaskId)) continue;
    const from = dependency.direction === "before" ? dependency.successorTaskId : dependency.predecessorTaskId;
    const to = dependency.direction === "before" ? dependency.predecessorTaskId : dependency.successorTaskId;
    outgoing.get(from)!.push({ successor: to, dependency });
    incoming.set(to, (incoming.get(to) ?? 0) + 1);
  }
  const queue = [...incoming].filter(([, count]) => count === 0).map(([id]) => id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const edge of outgoing.get(id) ?? []) {
      incoming.set(edge.successor, incoming.get(edge.successor)! - 1);
      if (incoming.get(edge.successor) === 0) queue.push(edge.successor);
    }
  }
  if ([...incoming.values()].some((count) => count > 0))
    return empty(
      [...incoming]
        .filter(([, count]) => count > 0)
        .map(([taskId]) => ({ taskId, reason: "Dependency cycle prevents schedule analysis" })),
    );
  if (resolvedDates && calendar) {
    const scheduled = tasks.flatMap((task) => {
      const dates = resolvedDates.get(task.id);
      const start = dateDays(dates?.start);
      const end = dateDays(dates?.end);
      return start !== undefined && end !== undefined ? [{ task, start, end }] : [];
    });
    if (scheduled.length) {
      const projectStart = Math.min(...scheduled.map((item) => item.start));
      const projectFinish = Math.max(...scheduled.map((item) => item.end));
      const finishDate = new Date(projectFinish * 86_400_000).toISOString().slice(0, 10);
      const latestDates = new Map<string, { start: string; end: string }>();
      const slackByTask = new Map<string, number>();
      for (const id of [...order].reverse()) {
        const task = byId.get(id)!;
        const actual = resolvedDates.get(id)!;
        const pauses = taskPauses(task);
        const working = (date: string) => isWorkingDate(date, calendar!) && !pauses.has(date);
        let days = 0;
        let date = actual.start!;
        for (let step = 0; step < 10_000 && date <= actual.end!; step++) {
          if (working(date)) days++;
          date = shiftDate(date, 1)!;
        }
        if (date <= actual.end!) return empty([{ taskId: id, reason: "Schedule span exceeds the analysis limit" }]);
        // Milestones are events; their dates do not consume a working day.
        const event = Boolean(task.milestone && !task.duration);
        const walk = (anchor: string, direction: number) => {
          if (event || !days) return anchor;
          let value = anchor;
          let remaining = days;
          for (let step = 0; step < 10_000 && remaining > 0; step++) {
            if (working(value)) remaining--;
            if (remaining) value = shiftDate(value, direction)!;
          }
          return remaining ? undefined : value;
        };
        let endLimit = finishDate;
        let startLimit: string | undefined;
        for (const edge of outgoing.get(id) ?? []) {
          const dependency = edge.dependency;
          const other = latestDates.get(edge.successor)!;
          const predecessorAnchor = dependency.relation.endsWith("after-start") ? "start" : "end";
          const successorAnchor = dependency.relation.startsWith("start-") ? "start" : "end";
          let limit: string | undefined;
          let anchor: "start" | "end";
          if (dependency.direction === "before") {
            anchor = successorAnchor;
            limit = dependencyDate(other[predecessorAnchor], dependency, calendar!);
          } else {
            anchor = predecessorAnchor;
            // Find the latest predecessor anchor whose relationship still fits the
            // successor's latest window, including zero-lag weekend boundaries.
            let low = dateDays(actual[anchor])!;
            let high = projectFinish;
            while (low < high) {
              const mid = Math.ceil((low + high) / 2);
              const candidate = new Date(mid * 86_400_000).toISOString().slice(0, 10);
              const boundary = dependencyDate(candidate, dependency, calendar!);
              if (boundary && boundary <= other[successorAnchor]) low = mid;
              else high = mid - 1;
            }
            limit = new Date(low * 86_400_000).toISOString().slice(0, 10);
          }
          if (!limit) return empty([{ taskId: id, reason: "Dependency date cannot be resolved" }]);
          if (anchor === "end") endLimit = endLimit < limit ? endLimit : limit;
          else startLimit = startLimit && startLimit < limit ? startLimit : limit;
        }
        let latestStart = walk(endLimit, -1);
        if (!latestStart) return empty([{ taskId: id, reason: "No working date available for slack calculation" }]);
        if (startLimit && latestStart > startLimit) {
          latestStart = startLimit;
        }
        const latestEnd = walk(latestStart, 1);
        if (!latestEnd) return empty([{ taskId: id, reason: "No working date available for slack calculation" }]);
        latestDates.set(id, { start: latestStart, end: latestEnd });
        let slack = 0;
        date = actual.start!;
        if (!event && days) {
          for (let step = 0; step < 10_000 && !working(date); step++) date = shiftDate(date, 1)!;
        }
        for (let step = 0; step < 10_000 && date < latestStart; step++) {
          date = shiftDate(date, 1)!;
          if (event || working(date)) slack++;
        }
        slackByTask.set(id, slack);
      }
      const taskIds = new Set(
        scheduled.filter((item) => (slackByTask.get(item.task.id) ?? 1) === 0).map((item) => item.task.id),
      );
      return {
        taskIds,
        orderedTaskIds: order
          .filter((id) => taskIds.has(id))
          .sort((a, b) => (dateDays(resolvedDates.get(a)?.start) ?? 0) - (dateDays(resolvedDates.get(b)?.start) ?? 0)),
        projectDuration: projectFinish - projectStart + 1,
        slackByTask,
        blockers: [],
      };
    }
  }
  return empty();
}

export function criticalPathTaskIds(
  tasks: readonly GanttTask[],
  dependencies: readonly GanttDependency[],
  resolvedDates?: ReadonlyMap<string, ResolvedTaskDates>,
  calendar?: GanttCalendar,
): Set<string> {
  return analyzeCriticalPath(tasks, dependencies, resolvedDates, calendar).taskIds;
}

export function decorateScheduleAnalysis(
  svg: string,
  criticalIds: ReadonlySet<string>,
  variance: readonly TaskVariance[],
  current: ReadonlyMap<string, ResolvedTaskDates>,
  baseline: ReadonlyMap<string, ResolvedTaskDates>,
  renderedBaselineGeometry: ReadonlyMap<string, RenderedBaselineGeometry> = new Map(),
  baselineLabels: ReadonlyMap<string, string> = new Map(),
): string {
  if (typeof DOMParser === "undefined") return svg;
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (document.querySelector("parsererror")) return svg;
  const root = document.documentElement;
  const timelineDates = [
    ...root.querySelectorAll<SVGElement>('[data-timeline-header="top"][data-timeline-date]'),
  ].flatMap((element) => {
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
    const now = current.get(id),
      old = baseline.get(id);
    const hit = group.querySelector<SVGRectElement>(".bar");
    if (
      !change ||
      change.kind === "unchanged" ||
      change.kind === "added" ||
      change.kind === "removed" ||
      !hit ||
      !now?.start ||
      !old?.start ||
      !old.end
    )
      continue;
    const dayWidth = Number(group.getAttribute("data-day-width") ?? 16);
    const renderedGeometry = renderedBaselineGeometry.get(id);
    const baselineStart = renderedGeometry?.startDate ?? old.start;
    const span = renderedGeometry?.span ?? Math.max(1, dateDays(old.end)! - dateDays(old.start)! + 1);
    const geometry = baselineBarGeometry(Number(hit.getAttribute("x")), dayWidth, change.startDays, span);
    geometry.x = timelineBaselineX(timelineDates, baselineStart, dayWidth, firstBarX, geometry.x);
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    marker.setAttribute("class", "baseline-bar");
    marker.setAttribute("data-baseline-task-id", id);
    marker.setAttribute("data-baseline-dates", `${baselineStart} – ${old.end}`);
    marker.setAttribute("data-baseline-visible", String(timelineDates.some((item) => item.date === baselineStart)));
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
    if (
      criticalIds.has(path.getAttribute("data-predecessor-task-id") ?? "") &&
      criticalIds.has(path.getAttribute("data-successor-task-id") ?? "")
    )
      path.setAttribute("data-critical-path", "true");
  }
  appendRemovedBaselineLane(
    document,
    root,
    variance,
    baseline,
    renderedBaselineGeometry,
    baselineLabels,
    timelineDates,
    firstBarX,
  );
  return new XMLSerializer().serializeToString(root);
}

function appendRemovedBaselineLane(
  document: Document,
  root: Element,
  variance: readonly TaskVariance[],
  baseline: ReadonlyMap<string, ResolvedTaskDates>,
  rendered: ReadonlyMap<string, RenderedBaselineGeometry>,
  labels: ReadonlyMap<string, string>,
  timelineDates: readonly { date: string; x: number }[],
  firstBarX: number,
): void {
  const removed = variance.filter((item) => item.kind === "removed" && rendered.has(item.taskId));
  const viewBox = root.getAttribute("viewBox")?.trim().split(/\s+/).map(Number);
  if (!removed.length || viewBox?.length !== 4) return;
  const dayWidth = Number(root.querySelector<SVGGElement>("[data-task-id]")?.getAttribute("data-day-width") ?? 16);
  const laneTop = viewBox[1]! + viewBox[3]! + 7;
  const extraHeight = 22 + removed.length * 19;
  root.setAttribute("viewBox", `${viewBox[0]} ${viewBox[1]} ${viewBox[2]} ${viewBox[3]! + extraHeight}`);
  const lane = document.createElementNS("http://www.w3.org/2000/svg", "g");
  lane.setAttribute("class", "removed-baseline-lane");
  const heading = document.createElementNS("http://www.w3.org/2000/svg", "text");
  heading.setAttribute("x", "4");
  heading.setAttribute("y", String(laneTop + 10));
  heading.setAttribute("class", "removed-baseline-heading");
  heading.textContent = "Removed baseline tasks";
  lane.append(heading);
  removed.forEach((change, index) => {
    const dates = baseline.get(change.taskId);
    const geometry = rendered.get(change.taskId);
    if (!dates?.start || !dates.end || !geometry) return;
    const start = geometry.startDate ?? dates.start;
    const x = timelineBaselineX(timelineDates, start, dayWidth, firstBarX, 2);
    const y = laneTop + 15 + index * 19;
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    marker.setAttribute("class", "baseline-bar removed-baseline-bar");
    marker.setAttribute("data-baseline-task-id", change.taskId);
    marker.setAttribute("data-baseline-dates", `${start} – ${dates.end}`);
    marker.setAttribute("x", String(x));
    marker.setAttribute("y", String(y));
    marker.setAttribute("width", String(Math.max(1, geometry.span * dayWidth - 4)));
    marker.setAttribute("height", String(geometry.height ?? 13));
    lane.append(marker);
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(x + 4));
    label.setAttribute("y", String(y + (geometry.height ?? 13) - 2));
    label.setAttribute("class", "removed-baseline-label");
    label.textContent = labels.get(change.taskId) ?? change.taskId;
    lane.append(label);
  });
  root.append(lane);
}
