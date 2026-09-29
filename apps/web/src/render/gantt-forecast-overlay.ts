import type { ProgressForecast } from "../gantt-progress-forecast";
import { isWorkingDate, type GanttCalendar } from "../gantt-calendar";

const SVG_NS = "http://www.w3.org/2000/svg";
const DAY_MS = 86_400_000;
let overlayInstance = 0;

function dayNumber(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / DAY_MS;
}

function numberAttribute(element: Element, name: string): number | undefined {
  const raw = element.getAttribute(name);
  if (raw === null) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function causeChain(id: string, forecast: ProgressForecast, seen = new Set<string>()): Set<string> {
  if (seen.has(id)) return seen;
  seen.add(id);
  for (const predecessor of forecast.tasks.get(id)?.causeTaskIds ?? []) causeChain(predecessor, forecast, seen);
  return seen;
}

function dateColumnWidth(root: Element): number | undefined {
  const dates = [...root.querySelectorAll<SVGTextElement>('[data-timeline-header="top"]')]
    .map((element) => ({
      date: element.getAttribute("data-timeline-date"),
      x: numberAttribute(element, "data-timeline-x"),
    }))
    .filter((item): item is { date: string; x: number } => Boolean(item.date) && item.x !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));
  const widths = dates.slice(1).flatMap((item, index) => {
    const days = dayNumber(item.date) - dayNumber(dates[index]!.date);
    const width = (item.x - dates[index]!.x) / days;
    return days > 0 && Number.isFinite(width) && width > 0 ? [width] : [];
  });
  return widths.length ? widths.sort((a, b) => a - b)[Math.floor(widths.length / 2)] : undefined;
}

function svgElement(document: Document, name: string, attributes: Record<string, string>): SVGElement {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function extendDateAxis(
  document: Document,
  root: Element,
  unit: number | undefined,
  farRight: number,
  calendar: GanttCalendar,
) {
  if (!unit) return;
  const headers = [...root.querySelectorAll<SVGTextElement>('[data-timeline-header="top"]')];
  const last = headers.at(-1);
  const lastDate = last?.getAttribute("data-timeline-date");
  const lastX = last ? numberAttribute(last, "data-timeline-x") : undefined;
  const topY = last ? numberAttribute(last, "y") : undefined;
  if (!lastDate || lastX === undefined || topY === undefined) return;
  const bottom = [...root.querySelectorAll<SVGTextElement>('[data-timeline-header="bottom"]')].at(-1);
  const axis = svgElement(document, "g", { class: "gantt-forecast-extended-axis" });
  const lastDay = dayNumber(lastDate);
  const count = Math.min(730, Math.ceil((farRight - lastX) / unit));
  for (let offset = 1; offset <= count; offset++) {
    const x = lastX + unit * offset;
    if (x > farRight - unit * 0.4) break;
    const date = new Date((lastDay + offset) * DAY_MS).toISOString().slice(0, 10);
    const closed = !isWorkingDate(date, calendar);
    for (const template of [last, bottom]) {
      if (!template) continue;
      const label = template.cloneNode(true) as SVGTextElement;
      label.setAttribute("x", String(x));
      label.setAttribute("data-timeline-x", String(x));
      label.setAttribute("data-timeline-date", date);
      label.setAttribute("aria-label", `Highlight ${date}`);
      if (closed) label.setAttribute("data-closed-date", "true");
      else label.removeAttribute("data-closed-date");
      label.textContent = String(new Date(`${date}T00:00:00Z`).getUTCDate());
      axis.append(label);
    }
    const weekday = svgElement(document, "text", {
      class: "gantt-forecast-axis-weekday",
      x: String(x),
      y: String(topY - 12),
    });
    weekday.textContent = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" })
      .format(new Date(`${date}T00:00:00Z`))
      .slice(0, 2);
    axis.append(weekday);
    if (date.endsWith("-01")) {
      const month = svgElement(document, "text", {
        class: "gantt-forecast-axis-month",
        x: String(x),
        y: String(topY - 25),
      });
      month.textContent = new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${date}T00:00:00Z`),
      );
      axis.append(month);
    }
  }
  root.append(axis);
}

export function addGanttForecastOverlay(
  svg: string,
  forecast: ProgressForecast,
  asOf: string,
  calendar: GanttCalendar,
  selectedTaskId?: string,
): string {
  if (typeof DOMParser === "undefined") return svg;
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (document.querySelector("parsererror")) return svg;
  const root = document.documentElement;
  const dayWidthFromHeader = dateColumnWidth(root);
  const selectedChain = selectedTaskId ? causeChain(selectedTaskId, forecast) : new Set<string>();
  const rows = [...root.querySelectorAll<SVGGElement>(".interaction-task[data-task-id]")];
  const patternId = `gantt-forecast-overdue-${++overlayInstance}`;
  const definitions = svgElement(document, "defs", {});
  const pattern = svgElement(document, "pattern", {
    id: patternId,
    width: "8",
    height: "8",
    patternUnits: "userSpaceOnUse",
    patternTransform: "rotate(45)",
  });
  pattern.append(svgElement(document, "rect", { width: "8", height: "8", fill: "#fde68a" }));
  pattern.append(
    svgElement(document, "line", { x1: "0", y1: "0", x2: "0", y2: "8", stroke: "#b45309", "stroke-width": "4" }),
  );
  definitions.append(pattern);
  root.prepend(definitions);
  root.setAttribute("data-progress-forecast", "true");

  const marks = svgElement(document, "g", { class: "gantt-forecast-overlay" });
  let farRight = 0;
  let top = Number.POSITIVE_INFINITY;
  let bottom = 0;
  let asOfX: number | undefined;

  for (const row of rows) {
    const id = row.getAttribute("data-task-id");
    if (!id) continue;
    const item = forecast.tasks.get(id);
    const bar = row.querySelector<SVGRectElement>(".bar");
    if (!item?.plannedStart || !item.plannedEnd || !item.start || !item.end || !bar) continue;
    const x = numberAttribute(bar, "x");
    const y = numberAttribute(bar, "y");
    const width = numberAttribute(bar, "width");
    const height = numberAttribute(bar, "height");
    if (x === undefined || y === undefined || width === undefined || height === undefined) continue;
    const plannedDays = dayNumber(item.plannedEnd) - dayNumber(item.plannedStart) + 1;
    const unit = dayWidthFromHeader ?? numberAttribute(row, "data-day-width") ?? width / Math.max(1, plannedDays);
    if (!Number.isFinite(unit) || unit <= 0) continue;
    const forecastX = x + (dayNumber(item.start) - dayNumber(item.plannedStart)) * unit;
    const forecastRight = forecastX + Math.max(unit * 0.65, (dayNumber(item.end) - dayNumber(item.start) + 1) * unit);
    const plannedRight = x + width;
    const stripeHeight = Math.min(4.5, Math.max(2.5, height * 0.24));
    const planY = y + 1;
    const forecastY = y + height - stripeHeight - 1;
    const selected = selectedTaskId === id;
    const inChain = selectedChain.has(id);
    if (inChain) row.setAttribute("data-forecast-cause-chain", "true");
    top = Math.min(top, y);
    bottom = Math.max(bottom, y + height);
    farRight = Math.max(farRight, forecastRight);
    if (asOfX === undefined) asOfX = x + (dayNumber(asOf) - dayNumber(item.plannedStart)) * unit;

    const group = svgElement(document, "g", {
      class: "gantt-forecast-task-mark",
      "data-forecast-task-id": id,
      "data-selected": String(selected),
      "data-cause-chain": String(inChain),
    });
    group.append(
      svgElement(document, "rect", {
        class: "gantt-forecast-plan-stripe",
        x: String(x),
        y: String(planY),
        width: String(width),
        height: String(stripeHeight),
        rx: "1",
      }),
    );
    const lateStart = Math.max(dayNumber(item.start), dayNumber(item.plannedEnd) + 1);
    const lateX = forecastX + (lateStart - dayNumber(item.start)) * unit;
    const regularRight = Math.min(forecastRight, lateX);
    if (regularRight > forecastX)
      group.append(
        svgElement(document, "rect", {
          class: item.completion === 100 ? "gantt-forecast-done-stripe" : "gantt-forecast-result-stripe",
          x: String(forecastX),
          y: String(forecastY),
          width: String(regularRight - forecastX),
          height: String(stripeHeight),
          rx: "1",
        }),
      );
    if (lateX < forecastRight)
      group.append(
        svgElement(document, "rect", {
          class: "gantt-forecast-overdue-stripe",
          x: String(Math.max(forecastX, lateX)),
          y: String(forecastY),
          width: String(forecastRight - Math.max(forecastX, lateX)),
          height: String(stripeHeight),
          fill: `url(#${patternId})`,
        }),
      );
    if (item.end > item.plannedEnd) {
      group.append(
        svgElement(document, "line", {
          class: "gantt-forecast-missed-marker",
          x1: String(plannedRight),
          x2: String(plannedRight),
          y1: String(y - 2),
          y2: String(y + height + 3),
        }),
      );
    }
    const title = svgElement(document, "title", {});
    title.textContent = `Plan ${item.plannedStart} to ${item.plannedEnd}; forecast ${item.start} to ${item.end}${item.end > item.plannedEnd ? "; planned finish missed" : ""}`;
    group.prepend(title);
    marks.append(group);
  }

  if (!marks.childElementCount) return svg;
  for (const path of root.querySelectorAll<SVGPathElement>(".interaction-dependency")) {
    const predecessor = path.getAttribute("data-predecessor-task-id");
    const successor = path.getAttribute("data-successor-task-id");
    if (!predecessor || !successor || !selectedChain.has(predecessor) || !selectedChain.has(successor)) continue;
    if (!forecast.tasks.get(successor)?.causeTaskIds.includes(predecessor)) continue;
    path.setAttribute("data-forecast-cause-chain", "true");
    const line = svgElement(document, "path", {
      class: "gantt-forecast-cause-link",
      d: path.getAttribute("data-original-d") ?? path.getAttribute("d") ?? "",
      "pointer-events": "none",
    });
    marks.prepend(line);
  }
  root.append(marks);
  if (asOfX !== undefined && Number.isFinite(asOfX) && top < Number.POSITIVE_INFINITY) {
    const line = svgElement(document, "line", {
      class: "gantt-forecast-asof-guide",
      x1: String(asOfX),
      x2: String(asOfX),
      y1: String(top - 12),
      y2: String(bottom + 7),
      "pointer-events": "none",
    });
    root.append(line);
    farRight = Math.max(farRight, asOfX);
  }
  extendDateAxis(document, root, dayWidthFromHeader, farRight, calendar);
  const viewBox = root.getAttribute("viewBox")?.split(/\s+/).map(Number);
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite)) {
    const originalWidth = viewBox[2]!;
    const neededWidth = Math.max(originalWidth, farRight - viewBox[0]! + 28);
    if (neededWidth > originalWidth) {
      const timelineWidth = numberAttribute(root, "data-timeline-width") ?? originalWidth;
      root.setAttribute("viewBox", `${viewBox[0]} ${viewBox[1]} ${neededWidth} ${viewBox[3]}`);
      root.setAttribute("width", String(neededWidth));
      root.setAttribute("data-timeline-width", String(timelineWidth));
      root.setAttribute(
        "style",
        `${root.getAttribute("style") ?? ""};min-width:${(neededWidth / timelineWidth) * 100}%`,
      );
    }
  }
  return new XMLSerializer().serializeToString(root);
}
