import type { GanttDependency, GanttDivider, GanttTask, GanttVerticalSeparator } from "@plantuml-studio/diagram-gantt";
import { isWorkingDate, type GanttCalendar } from "../gantt-calendar";

const SVG_NS = "http://www.w3.org/2000/svg";

function numberAttribute(element: Element, name: string): number | undefined {
  const value = Number(element.getAttribute(name));
  return Number.isFinite(value) ? value : undefined;
}

function isVisibleFill(rect: Element): boolean {
  const fill = rect.getAttribute("fill")?.toLowerCase();
  return fill !== undefined && fill !== "none" && fill !== "transparent" && fill !== "#00000000";
}

function durationInDays(task: GanttTask): number | undefined {
  if (!task.duration) return undefined;
  return task.duration.value * (task.duration.unit === "month" ? 30 : task.duration.unit === "week" ? 7 : 1);
}

function timelineDayWidth(document: Document): number | undefined {
  const columns = [...document.querySelectorAll("line")]
    .flatMap((line) => {
      const x1 = numberAttribute(line, "x1");
      const x2 = numberAttribute(line, "x2");
      const y1 = numberAttribute(line, "y1");
      const y2 = numberAttribute(line, "y2");
      return x1 !== undefined &&
        x2 !== undefined &&
        y1 !== undefined &&
        y2 !== undefined &&
        Math.abs(x1 - x2) < 0.01 &&
        Math.abs(y1 - y2) > 10
        ? [x1]
        : [];
    })
    .sort((a, b) => a - b);
  const gaps = columns
    .slice(1)
    .map((value, index) => value - columns[index]!)
    .filter((value) => value > 0.5);
  if (!gaps.length) return undefined;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

export function timelineColumnWidth(centers: readonly number[], fallback?: number): number | undefined {
  const gaps = centers.slice(1).map((value, index) => value - centers[index]!).filter((gap) => gap > 0.5).sort((a, b) => a - b);
  return gaps.length ? gaps[Math.floor(gaps.length / 2)] : fallback;
}

export function dayColumnBounds(center: number, width: number): { left: number; right: number } {
  return { left: center - width / 2, right: center + width / 2 };
}

export function alignClosedDayHatching(svg: SVGSVGElement): void {
  const labels = [...svg.querySelectorAll<SVGTextElement>('[data-timeline-header="top"]')]
    .map((text) => {
      const box = text.getBBox();
      return { text, center: box.x + box.width / 2 };
    })
    .sort((a, b) => a.center - b.center);
  const width = timelineColumnWidth(labels.map((item) => item.center));
  if (!width) return;
  const closed = labels.filter((item) => item.text.getAttribute("data-closed-date") === "true");
  const overlays = [...svg.querySelectorAll<SVGRectElement>(".closed-day-hatching rect")];
  const lowerWeekdayTop = [...svg.querySelectorAll<SVGTextElement>("text")]
    .filter((text) => /^(?:Mo|Tu|We|Th|Fr|Sa|Su)$/i.test(text.textContent?.trim() ?? ""))
    .map((text) => text.getBBox().y)
    .sort((a, b) => b - a)[0];
  closed.forEach((item, index) => {
    const overlay = overlays[index];
    if (!overlay) return;
    const bounds = dayColumnBounds(item.center, width);
    overlay.setAttribute("x", String(bounds.left));
    overlay.setAttribute("width", String(width));
    if (lowerWeekdayTop !== undefined) {
      const top = Number(overlay.getAttribute("y"));
      overlay.setAttribute("height", String(Math.max(0, lowerWeekdayTop - top)));
    }
  });
}

interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

function pathMidpoint(path: SVGPathElement, fallback: Point): Point {
  try {
    const length = path.getTotalLength();
    if (!Number.isFinite(length) || length <= 0) return fallback;
    const point = path.getPointAtLength(length / 2);
    return Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: point.x, y: point.y } : fallback;
  } catch {
    return fallback;
  }
}

function polygonBounds(polygon: SVGPolygonElement): Geometry | undefined {
  const values = (polygon.getAttribute("points") ?? "").match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (values.length < 6) return undefined;
  const xs = values.filter((_, index) => index % 2 === 0);
  const ys = values.filter((_, index) => index % 2 === 1);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function addCanonicalGanttOverlay(
  svg: string,
  tasks: readonly GanttTask[] | undefined,
  dependencies: readonly GanttDependency[] = [],
  dividers: readonly GanttDivider[] = [],
  resourceFilter = "",
  scheduleGhost?: { taskIds: readonly string[]; days: number },
  projectStart?: string,
  calendar?: GanttCalendar,
  verticalSeparators: readonly GanttVerticalSeparator[] = [],
): string {
  if (typeof DOMParser === "undefined" || !tasks?.length) return svg;
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (document.querySelector("parsererror")) return svg;
  const root = document.documentElement;
  const texts = [...root.querySelectorAll("text")];
  const rects = [...root.querySelectorAll("rect")].filter(isVisibleFill);
  const polygons = [...root.querySelectorAll("polygon")];
  const canonicalDependencyPaths = [...root.querySelectorAll("path")].filter((path) => {
    const stroke = path.getAttribute("stroke")?.toLowerCase();
    const fill = path.getAttribute("fill")?.toLowerCase();
    return Boolean(
      path.getAttribute("d") &&
      stroke &&
      stroke !== "none" &&
      stroke !== "transparent" &&
      (fill === "#00000000" || fill === "none" || !fill),
    );
  });
  const canonicalArrowheads = [...root.querySelectorAll("polygon")].filter((polygon) => {
    const stroke = polygon.getAttribute("stroke")?.toLowerCase();
    const fill = polygon.getAttribute("fill")?.toLowerCase();
    return Boolean(
      polygon.getAttribute("points") &&
      stroke &&
      stroke !== "none" &&
      fill &&
      fill !== "none" &&
      fill !== "transparent",
    );
  });
  const geometry = new Map<string, Geometry>();
  const gridDayWidth = timelineDayWidth(document);
  const claimedLabels = new Set<SVGTextElement>();

  const numberedDates = texts.flatMap((text) => {
    const day = Number(text.textContent?.trim());
    const textX = numberAttribute(text, "x");
    const textWidth = numberAttribute(text, "textLength") ?? 0;
    const x = textX === undefined ? undefined : textX + textWidth / 2;
    const y = numberAttribute(text, "y");
    return Number.isInteger(day) && day >= 1 && day <= 31 && x !== undefined && y !== undefined
      ? [{ text, day, x, y }]
      : [];
  });
  const topDateY = numberedDates.length ? Math.min(...numberedDates.map((item) => item.y)) : undefined;
  const topDates = numberedDates
    .filter((item) => topDateY !== undefined && Math.abs(item.y - topDateY) < 1)
    .sort((a, b) => a.x - b.x);
  const bottomDateY = numberedDates.length ? Math.max(...numberedDates.map((item) => item.y)) : undefined;
  const bottomDates = numberedDates
    .filter((item) => bottomDateY !== undefined && Math.abs(item.y - bottomDateY) < 1)
    .sort((a, b) => a.x - b.x);
  // Date-label spacing is the authoritative day column geometry. The SVG also contains
  // vertical task/resource borders; including those in the width calculation can select
  // a half-column gap and make weekend hatching spill into the preceding working day.
  const canonicalDayWidth = timelineColumnWidth(topDates.map((item) => item.x), gridDayWidth);
  const monthNames = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const firstMonth = texts
    .flatMap((text) => {
      const match = text.textContent?.trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
      const month = match?.[1] ? monthNames.indexOf(match[1].toLowerCase()) : -1;
      const x = numberAttribute(text, "x");
      return month >= 0 && match?.[2] && x !== undefined ? [{ month, year: Number(match[2]), x }] : [];
    })
    .sort((a, b) => a.x - b.x)[0];
  const projectDate = projectStart ? new Date(`${projectStart}T00:00:00Z`) : undefined;
  let timelineYear = firstMonth?.year ?? projectDate?.getUTCFullYear();
  let timelineMonth = firstMonth?.month ?? projectDate?.getUTCMonth();
  let previousDay: number | undefined;
  if (timelineYear !== undefined && timelineMonth !== undefined)
    for (const item of topDates) {
      if (previousDay !== undefined && item.day < previousDay) {
        timelineMonth += 1;
        if (timelineMonth > 11) {
          timelineMonth = 0;
          timelineYear += 1;
        }
      }
      const date = `${timelineYear}-${String(timelineMonth + 1).padStart(2, "0")}-${String(item.day).padStart(2, "0")}`;
      item.text.setAttribute("data-timeline-date", date);
      item.text.setAttribute("data-timeline-header", "top");
      item.text.setAttribute("role", "button");
      item.text.setAttribute("tabindex", "0");
      item.text.setAttribute("aria-label", `Highlight ${date}`);
      if (calendar && !isWorkingDate(date, calendar)) item.text.setAttribute("data-closed-date", "true");
      previousDay = item.day;
    }

  for (const item of bottomDates) {
    const matchingTop = topDates.reduce<(typeof topDates)[number] | undefined>(
      (closest, candidate) =>
        !closest || Math.abs(candidate.x - item.x) < Math.abs(closest.x - item.x) ? candidate : closest,
      undefined,
    );
    if (!matchingTop || !canonicalDayWidth || Math.abs(matchingTop.x - item.x) > canonicalDayWidth / 2) continue;
    const date = matchingTop.text.getAttribute("data-timeline-date");
    if (!date) continue;
    item.text.setAttribute("data-timeline-date", date);
    item.text.setAttribute("data-timeline-header", "bottom");
    item.text.setAttribute("role", "button");
    item.text.setAttribute("tabindex", "0");
    item.text.setAttribute("aria-label", `Highlight ${date}`);
    if (calendar && !isWorkingDate(date, calendar)) item.text.setAttribute("data-closed-date", "true");
  }

  const closedDates = topDates.filter((item) => item.text.getAttribute("data-closed-date") === "true");
  if (closedDates.length && canonicalDayWidth) {
    const definitions = document.createElementNS(SVG_NS, "defs");
    const pattern = document.createElementNS(SVG_NS, "pattern");
    pattern.setAttribute("id", "closed-day-hatch");
    pattern.setAttribute("width", "7");
    pattern.setAttribute("height", "7");
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    pattern.setAttribute("patternTransform", "rotate(45)");
    const hatch = document.createElementNS(SVG_NS, "line");
    hatch.setAttribute("x1", "0");
    hatch.setAttribute("y1", "0");
    hatch.setAttribute("x2", "0");
    hatch.setAttribute("y2", "7");
    hatch.setAttribute("stroke", "#64748b");
    hatch.setAttribute("stroke-width", "1.5");
    hatch.setAttribute("opacity", "0.42");
    pattern.append(hatch);
    definitions.append(pattern);
    root.prepend(definitions);

    const viewBox = root.getAttribute("viewBox")?.split(/\s+/).map(Number);
    const diagramBottom = viewBox?.length === 4 ? viewBox[1]! + viewBox[3]! : (numberAttribute(root, "height") ?? 0);
    const timelineTop = (topDateY ?? 0) + 5;
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "closed-day-hatching");
    group.setAttribute("aria-hidden", "true");
    group.setAttribute("pointer-events", "none");
    for (const item of closedDates) {
      const bounds = dayColumnBounds(item.x, canonicalDayWidth);
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", String(bounds.left));
      rect.setAttribute("y", String(timelineTop));
      rect.setAttribute("width", String(canonicalDayWidth));
      rect.setAttribute("height", String(Math.max(0, diagramBottom - timelineTop)));
      rect.setAttribute("fill", "url(#closed-day-hatch)");
      group.append(rect);
    }
    root.append(group);
  }

  for (const task of tasks) {
    const label = texts.find((text) => {
      const value = text.textContent?.trim();
      return !claimedLabels.has(text) && (value === task.label || value?.startsWith(`${task.label} {`));
    });
    if (label) claimedLabels.add(label);
    const textY = label ? numberAttribute(label, "y") : undefined;
    if (!label || textY === undefined) continue;
    const rowBars = rects.filter((rect) => {
      const y = numberAttribute(rect, "y");
      const height = numberAttribute(rect, "height");
      return y !== undefined && height !== undefined && height <= 30 && textY >= y && textY <= y + height;
    });
    const milestoneShapes = task.milestone
      ? polygons.filter((polygon) => {
          const bounds = polygonBounds(polygon);
          return bounds && bounds.height <= 30 && textY >= bounds.y && textY <= bounds.y + bounds.height;
        })
      : [];
    const labelBounds =
      task.milestone && !rowBars.length && !milestoneShapes.length
        ? [
            {
              x: numberAttribute(label, "x") ?? 0,
              y: textY - 12,
              width: Math.max(12, task.label.length * 6.5),
              height: 14,
            },
          ]
        : [];
    if (!rowBars.length && !milestoneShapes.length && !labelBounds.length) continue;
    const bounds = rowBars
      .flatMap((bar) => {
        const x = numberAttribute(bar, "x");
        const y = numberAttribute(bar, "y");
        const width = numberAttribute(bar, "width");
        const height = numberAttribute(bar, "height");
        return x === undefined || y === undefined || width === undefined || height === undefined
          ? []
          : [{ x, y, width, height }];
      })
      .concat(
        milestoneShapes.flatMap((polygon) => polygonBounds(polygon) ?? []),
        labelBounds,
      );
    if (!bounds.length) continue;
    const x = Math.min(...bounds.map((item) => item.x));
    const y = Math.min(...bounds.map((item) => item.y));
    const right = Math.max(...bounds.map((item) => item.x + item.width));
    const bottom = Math.max(...bounds.map((item) => item.y + item.height));
    const visibleWidth = right - x;
    const visibleHeight = bottom - y;
    const hitPaddingX = task.milestone ? Math.max(4, (24 - visibleWidth) / 2) : 0;
    const hitPaddingY = task.milestone ? Math.max(4, (24 - visibleHeight) / 2) : 0;
    const hitX = x - hitPaddingX;
    const hitY = y - hitPaddingY;
    const width = visibleWidth + hitPaddingX * 2;
    const height = visibleHeight + hitPaddingY * 2;
    const resourceMatch =
      !resourceFilter ||
      (task.resources ?? []).some((item) => item.value.toLocaleLowerCase() === resourceFilter.toLocaleLowerCase());
    geometry.set(task.id, { x: hitX, y: hitY, width, height });
    rowBars.forEach((bar) => {
      bar.setAttribute("data-visual-task-id", task.id);
      bar.setAttribute("data-resource-match", String(resourceMatch));
    });
    milestoneShapes.forEach((shape) => {
      shape.setAttribute("data-visual-task-id", task.id);
      shape.setAttribute("data-resource-match", String(resourceMatch));
    });
    label.setAttribute("data-visual-task-id", task.id);
    label.setAttribute("data-resource-match", String(resourceMatch));

    const duration = durationInDays(task);
    const dayWidth = canonicalDayWidth ?? (duration ? (width + 4) / duration : 16);
    if (scheduleGhost?.taskIds.includes(task.id)) {
      const ghost = document.createElementNS(SVG_NS, "rect");
      ghost.setAttribute("class", "schedule-ghost");
      ghost.setAttribute("x", String(x + scheduleGhost.days * dayWidth));
      ghost.setAttribute("y", String(y));
      ghost.setAttribute("width", String(width));
      ghost.setAttribute("height", String(height));
      root.append(ghost);
    }
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "task interaction-task");
    group.setAttribute("data-task-id", task.id);
    group.setAttribute("data-resource-match", String(resourceMatch));
    group.setAttribute(
      "data-draggable",
      task.start?.resolved ||
        (task.milestone && "resolved" in task.milestone && task.milestone.resolved) ||
        dependencies.some((item) => item.successorTaskId === task.id)
        ? "true"
        : "false",
    );
    group.setAttribute("data-duration-unit", task.duration?.unit ?? "day");
    group.setAttribute("data-day-width", String(dayWidth));
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
    group.setAttribute("aria-label", `Select ${task.label}`);
    group.setAttribute(
      "aria-keyshortcuts",
      "Enter Space Alt+ArrowLeft Alt+ArrowRight Control+ArrowUp Control+ArrowDown",
    );

    const hitBar = document.createElementNS(SVG_NS, "rect");
    hitBar.setAttribute("class", "bar interaction-hit");
    hitBar.setAttribute("x", String(hitX));
    hitBar.setAttribute("y", String(hitY));
    hitBar.setAttribute("width", String(width));
    hitBar.setAttribute("height", String(height));
    group.append(hitBar);

    const textX = numberAttribute(label, "x") ?? x;
    const labelHit = document.createElementNS(SVG_NS, "rect");
    labelHit.setAttribute("class", "label-hit interaction-hit");
    labelHit.setAttribute("x", String(textX));
    labelHit.setAttribute("y", String(textY - 12));
    labelHit.setAttribute("width", String(Math.max(12, task.label.length * 6.5)));
    labelHit.setAttribute("height", "14");
    group.append(labelHit);

    if (task.duration) {
      const resize = document.createElementNS(SVG_NS, "rect");
      resize.setAttribute("data-resize-handle", "end");
      resize.setAttribute("class", "resize-handle");
      resize.setAttribute("x", String(x + width - 4));
      resize.setAttribute("y", String(y));
      resize.setAttribute("width", "8");
      resize.setAttribute("height", String(height));
      group.append(resize);
    }

    const dependency = document.createElementNS(SVG_NS, "circle");
    dependency.setAttribute("data-dependency-handle", "end");
    dependency.setAttribute("class", "dependency-handle");
    dependency.setAttribute("cx", String(x + width + 8));
    dependency.setAttribute("cy", String(y + height / 2));
    dependency.setAttribute("r", "5");
    group.append(dependency);

    const dependencyTarget = document.createElementNS(SVG_NS, "circle");
    dependencyTarget.setAttribute("data-dependency-target-handle", "start");
    dependencyTarget.setAttribute("class", "dependency-target-handle");
    dependencyTarget.setAttribute("cx", String(x - 8));
    dependencyTarget.setAttribute("cy", String(y + height / 2));
    dependencyTarget.setAttribute("r", "6");
    group.append(dependencyTarget);
    root.append(group);
  }

  const viewBoxWidth =
    Number(root.getAttribute("viewBox")?.split(/\s+/)[2] ?? root.getAttribute("width")?.replace(/[^\d.]/g, "")) || 800;
  dividers.forEach((divider, index) => {
    const label = texts.find(
      (text) => !text.hasAttribute("data-visual-task-id") && text.textContent?.trim() === divider.label,
    );
    const y = label ? numberAttribute(label, "y") : undefined;
    if (!label || y === undefined) return;
    label.setAttribute("data-visual-divider-index", String(index));
    for (const line of root.querySelectorAll("line")) {
      const y1 = numberAttribute(line, "y1");
      const y2 = numberAttribute(line, "y2");
      if (y1 !== undefined && y2 !== undefined && Math.abs(y1 - y2) < 0.1 && Math.abs(y1 - y) < 14)
        line.setAttribute("data-visual-divider-index", String(index));
    }
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "divider-row interaction-divider");
    group.setAttribute("data-divider-index", String(index));
    group.setAttribute("role", "button");
    group.setAttribute("tabindex", "0");
    group.setAttribute("aria-label", `Move divider ${divider.label}`);
    const hit = document.createElementNS(SVG_NS, "rect");
    hit.setAttribute("class", "divider-hit interaction-hit");
    hit.setAttribute("x", "0");
    hit.setAttribute("y", String(y - 14));
    hit.setAttribute("width", String(viewBoxWidth));
    hit.setAttribute("height", "20");
    group.append(hit);
    root.append(group);
  });

  verticalSeparators.forEach((separator, index) => {
    const reference = tasks.find((task) =>
      [task.label, task.alias?.value].some((value) => value?.trim().toLowerCase() === separator.taskLabel.trim().toLowerCase()),
    );
    const bounds = reference ? geometry.get(reference.id) : undefined;
    if (!bounds || !canonicalDayWidth) return;
    const signedOffset = (separator.direction === "before" ? -1 : 1) * separator.offset;
    const x = (separator.anchor === "start" ? bounds.x : bounds.x + bounds.width) + signedOffset * canonicalDayWidth;
    const viewBox = root.getAttribute("viewBox")?.split(/\s+/).map(Number);
    const top = viewBox?.[1] ?? 0;
    const height = viewBox?.[3] ?? numberAttribute(root, "height") ?? 0;
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "vertical-separator interaction-vertical-separator");
    group.setAttribute("data-vertical-separator-index", String(index));
    group.setAttribute("data-day-width", String(canonicalDayWidth));
    group.setAttribute("role", "button");
    group.setAttribute("tabindex", "0");
    group.setAttribute("aria-label", `Move vertical separator at ${separator.taskLabel}'s ${separator.anchor}`);
    const visible = document.createElementNS(SVG_NS, "line");
    visible.setAttribute("class", "vertical-separator-guide");
    visible.setAttribute("x1", String(x)); visible.setAttribute("x2", String(x));
    visible.setAttribute("y1", String(top)); visible.setAttribute("y2", String(top + height));
    group.append(visible);
    const hit = document.createElementNS(SVG_NS, "line");
    hit.setAttribute("class", "vertical-separator-hit interaction-hit");
    hit.setAttribute("x1", String(x)); hit.setAttribute("x2", String(x));
    hit.setAttribute("y1", String(top)); hit.setAttribute("y2", String(top + height));
    group.append(hit);
    root.append(group);
  });

  const dependencyAnchors = new Map<number, Point>();
  dependencies.forEach((dependency, index) => {
    const predecessor = geometry.get(dependency.predecessorTaskId);
    const successor = geometry.get(dependency.successorTaskId);
    if (!predecessor || !successor) return;
    const predecessorUsesStart =
      dependency.relation === "start-after-start" || dependency.relation === "end-after-start";
    const successorUsesEnd = dependency.relation === "end-after-end" || dependency.relation === "end-after-start";
    const x1 = predecessorUsesStart ? predecessor.x : predecessor.x + predecessor.width;
    const y1 = predecessor.y + predecessor.height / 2;
    const x2 = successorUsesEnd ? successor.x + successor.width : successor.x;
    const y2 = successor.y + successor.height / 2;
    const bend = Math.max(12, Math.abs(x2 - x1) / 3);
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("class", "dependency interaction-dependency");
    path.setAttribute("data-dependency-index", String(index));
    path.setAttribute("tabindex", "0");
    path.setAttribute("role", "button");
    path.setAttribute(
      "aria-label",
      `Select dependency from ${dependency.predecessor.value} to ${dependency.successor.value}`,
    );
    path.setAttribute("data-predecessor-task-id", dependency.predecessorTaskId);
    path.setAttribute("data-successor-task-id", dependency.successorTaskId);
    path.setAttribute("data-predecessor-anchor", predecessorUsesStart ? "start" : "end");
    path.setAttribute("data-successor-anchor", successorUsesEnd ? "end" : "start");
    path.setAttribute("data-x1", String(x1));
    path.setAttribute("data-y1", String(y1));
    path.setAttribute("data-x2", String(x2));
    path.setAttribute("data-y2", String(y2));
    const previewPathData = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
    const pathData = canonicalDependencyPaths[index]?.getAttribute("d") ?? previewPathData;
    path.setAttribute("data-preview-d", previewPathData);
    path.setAttribute("data-original-d", pathData);
    path.setAttribute("d", pathData);
    const arrowhead = canonicalArrowheads[index];
    if (arrowhead) {
      arrowhead.setAttribute("data-dependency-index", String(index));
      arrowhead.setAttribute("data-canonical-dependency-arrowhead", "true");
      arrowhead.setAttribute("role", "button");
      arrowhead.setAttribute(
        "aria-label",
        `Select dependency from ${dependency.predecessor.value} to ${dependency.successor.value}`,
      );
    }
    root.append(path);
    dependencyAnchors.set(index, pathMidpoint(path, { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }));
  });

  const annotations: Array<{ text: string; anchorX: number; anchorY: number; owner: string }> = [];
  for (const task of tasks) {
    const bounds = geometry.get(task.id);
    const taskLabel = !bounds
      ? texts.find((text) => {
          const value = text.textContent?.trim();
          return value === task.label || value?.startsWith(`${task.label} {`);
        })
      : undefined;
    const labelX = taskLabel ? numberAttribute(taskLabel, "x") : undefined;
    const labelY = taskLabel ? numberAttribute(taskLabel, "y") : undefined;
    if (!bounds && (labelX === undefined || labelY === undefined)) continue;
    for (const note of task.notes ?? [])
      if (note.text.trim())
        annotations.push({
          text: note.text,
          anchorX: bounds ? bounds.x + bounds.width : labelX! + Math.max(24, task.label.length * 6.5),
          anchorY: bounds ? bounds.y + bounds.height / 2 : labelY!,
          owner: `task:${task.id}`,
        });
  }
  dependencies.forEach((dependency, index) => {
    const predecessor = geometry.get(dependency.predecessorTaskId);
    const successor = geometry.get(dependency.successorTaskId);
    if (!predecessor || !successor) return;
    const predecessorUsesStart =
      dependency.relation === "start-after-start" || dependency.relation === "end-after-start";
    const successorUsesEnd = dependency.relation === "end-after-end" || dependency.relation === "end-after-start";
    const fallbackAnchor = {
      x:
        ((predecessorUsesStart ? predecessor.x : predecessor.x + predecessor.width) +
          (successorUsesEnd ? successor.x + successor.width : successor.x)) /
        2,
      y: (predecessor.y + predecessor.height / 2 + successor.y + successor.height / 2) / 2,
    };
    const anchor = dependencyAnchors.get(index) ?? fallbackAnchor;
    for (const note of dependency.notes ?? [])
      if (note.text.trim())
        annotations.push({
          text: note.text,
          anchorX: anchor.x,
          anchorY: anchor.y,
          owner: `dependency:${index}`,
        });
  });
  if (annotations.length) {
    const railX = Math.max(...[...geometry.values()].map((item) => item.x + item.width), viewBoxWidth * 0.65) + 32;
    let previousBottom = 12;
    let maxWidth = 0;
    for (const annotation of annotations.sort((a, b) => a.anchorY - b.anchorY)) {
      const lines = annotation.text.split(/\r?\n/);
      const width = Math.max(90, ...lines.map((line) => Math.min(300, line.length * 7 + 18)));
      const height = lines.length * 15 + 12;
      const y = Math.max(annotation.anchorY - height / 2, previousBottom + 8);
      previousBottom = y + height;
      maxWidth = Math.max(maxWidth, width);
      const group = document.createElementNS(SVG_NS, "g");
      group.setAttribute("class", "fallback-note");
      group.setAttribute("data-note-owner", annotation.owner);
      const connector = document.createElementNS(SVG_NS, "path");
      connector.setAttribute("class", "note-connector");
      connector.setAttribute("d", `M ${annotation.anchorX} ${annotation.anchorY} L ${railX - 7} ${y + height / 2}`);
      group.append(connector);
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", String(railX));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(width));
      rect.setAttribute("height", String(height));
      rect.setAttribute("rx", "3");
      group.append(rect);
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", String(railX + 9));
      label.setAttribute("y", String(y + 17));
      lines.forEach((line, lineIndex) => {
        const span = document.createElementNS(SVG_NS, "tspan");
        span.setAttribute("x", String(railX + 9));
        span.setAttribute("dy", lineIndex === 0 ? "0" : "15");
        span.textContent = line;
        label.append(span);
      });
      group.append(label);
      root.append(group);
    }
    const parts = root.getAttribute("viewBox")?.split(/\s+/).map(Number);
    if (parts?.length === 4 && parts.every(Number.isFinite)) {
      const width = Math.max(parts[2]!, railX + maxWidth + 12);
      const height = Math.max(parts[3]!, previousBottom + 12);
      const originalWidth = parts[2]!;
      root.setAttribute("viewBox", `${parts[0]} ${parts[1]} ${width} ${height}`);
      root.setAttribute("width", String(width));
      root.setAttribute("height", String(height));
      root.setAttribute("data-timeline-width", String(originalWidth));
      root.setAttribute("style", `${root.getAttribute("style") ?? ""};min-width:${(width / originalWidth) * 100}%`);
    }
  }
  return new XMLSerializer().serializeToString(root);
}
