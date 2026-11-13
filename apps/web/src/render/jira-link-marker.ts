import type { GanttDependency, GanttTask } from "@plantuml-studio/diagram-gantt";
import type { JiraDiagramStatus } from "@plantuml-studio/jira-integration";
import { addCanonicalGanttOverlay } from "./canonical-gantt-overlay";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface JiraLinkMarker {
  taskId: string;
  status: JiraDiagramStatus;
  issueKey: string;
  statusName?: string | undefined;
}

const STYLE: Record<string, { color: string; label: string }> = {
  "live-todo": { color: "#64748b", label: "To Do" },
  "live-progress": { color: "#2563eb", label: "In Progress" },
  "live-done": { color: "#16a34a", label: "Done" },
  "live-unknown": { color: "#94a3b8", label: "Status unavailable" },
};

export interface JiraBarPlacement {
  parent: Element;
  x: number;
  y: number;
  width: number;
  height: number;
}

function element(document: XMLDocument, name: string, attributes: Record<string, string>): SVGElement {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node as SVGElement;
}

// Glyphs are drawn as shapes, not text characters, so they render the same in exports and PDFs
// whatever fonts are available.
function drawGlyph(document: XMLDocument, badge: Element, status: string, cx: number, cy: number, size: number): void {
  const r = size * 0.28;
  const white = { stroke: "#ffffff", "stroke-width": "1.4", "stroke-linecap": "round", "stroke-linejoin": "round" };
  if (status === "live-todo") {
    badge.append(element(document, "circle", { cx: String(cx), cy: String(cy), r: String(r), fill: "none", ...white }));
  } else if (status === "live-progress") {
    badge.append(element(document, "circle", { cx: String(cx), cy: String(cy), r: String(r), fill: "none", ...white }));
    badge.append(
      element(document, "path", {
        d: `M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r} Z`,
        fill: "#ffffff",
      }),
    );
  } else if (status === "live-done") {
    badge.append(
      element(document, "path", {
        d: `M ${cx - r} ${cy} L ${cx - r / 3} ${cy + r * 0.75} L ${cx + r} ${cy - r * 0.7}`,
        fill: "none",
        ...white,
      }),
    );
  } else {
    const mark = element(document, "text", {
      x: String(cx),
      y: String(cy + size * 0.28),
      "text-anchor": "middle",
      fill: "#ffffff",
      "font-size": String(size - 3),
      "font-family": "system-ui, sans-serif",
      "font-weight": "700",
    });
    mark.textContent = "?";
    badge.append(mark);
  }
}

function locateInGroup(root: Element) {
  return (taskId: string): JiraBarPlacement | undefined => {
    const group = root.querySelector<SVGGElement>(`[data-task-id="${CSS.escape(taskId)}"]`);
    const bar = group?.querySelector<SVGRectElement>(".bar");
    if (!group || !bar) return undefined;
    return {
      parent: group,
      x: Number(bar.getAttribute("x") ?? 0),
      y: Number(bar.getAttribute("y") ?? 0),
      width: Number(bar.getAttribute("width") ?? 0),
      height: Number(bar.getAttribute("height") ?? 12),
    };
  };
}

/**
 * Marks each Jira-linked task bar with a status badge at its left end and, optionally, a pill with
 * the issue key at its right end. When the bar starts at the chart's left edge there is no room
 * for a badge there, so it goes on the right instead. Attributes are inline so the markers survive
 * SVG/PNG export. Markers ignore pointer events: the task's link overlay stays the click target.
 */
export function decorateJiraLinkMarkers(
  svg: string,
  markers: readonly JiraLinkMarker[],
  showKeys: boolean,
  locate: (root: Element) => (taskId: string) => JiraBarPlacement | undefined = locateInGroup,
): string {
  if (!markers.length || typeof DOMParser === "undefined") return svg;
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (document.querySelector("parsererror")) return svg;
  const root = document.documentElement;
  const find = locate(root);
  let changed = false;
  for (const marker of markers) {
    const style = STYLE[marker.status];
    const placement = style ? find(marker.taskId) : undefined;
    if (!style || !placement) continue;
    const { parent, x, y, width, height } = placement;
    const size = Math.max(12, Math.min(16, height));
    const top = y + (height - size) / 2;
    const roomOnLeft = x - size - 2 >= 0;
    const badgeX = roomOnLeft ? x - size - 2 : x + width + 2;
    const badge = element(document, "g", { class: "jira-link-marker", "pointer-events": "none" });
    badge.append(
      element(document, "rect", {
        x: String(badgeX),
        y: String(top),
        width: String(size),
        height: String(size),
        rx: "3",
        fill: style.color,
        stroke: "#ffffff",
        "stroke-width": "1",
        ...(marker.status === "live-unknown" ? { "stroke-dasharray": "2 2" } : {}),
      }),
    );
    drawGlyph(document, badge, marker.status, badgeX + size / 2, top + size / 2, size);
    const title = element(document, "title", {});
    title.textContent = `${marker.issueKey} · ${marker.statusName ?? style.label}`;
    badge.append(title);
    if (showKeys) {
      const pillX = roomOnLeft ? x + width + 4 : badgeX + size + 3;
      const pillWidth = Math.max(24, marker.issueKey.length * 6 + 10);
      badge.append(
        element(document, "rect", {
          x: String(pillX),
          y: String(top),
          width: String(pillWidth),
          height: String(size),
          rx: "3",
          fill: style.color,
        }),
      );
      const key = element(document, "text", {
        x: String(pillX + pillWidth / 2),
        y: String(top + size - 3.5),
        "text-anchor": "middle",
        fill: "#ffffff",
        "font-size": "10",
        "font-family": "system-ui, sans-serif",
        "data-jira-key": marker.issueKey,
      });
      key.textContent = marker.issueKey;
      badge.append(key);
    }
    parent.append(badge);
    changed = true;
  }
  return changed ? new XMLSerializer().serializeToString(root) : svg;
}

/**
 * Same markers for an export. The renderer's raw SVG has no task groups, so the canonical overlay
 * is used only to locate each bar; the markers are then drawn onto the untouched raw SVG.
 */
export function decorateJiraLinkMarkersForExport(
  rawSvg: string,
  markers: readonly JiraLinkMarker[],
  showKeys: boolean,
  tasks: readonly GanttTask[],
  dependencies: readonly GanttDependency[],
): string {
  if (!markers.length || typeof DOMParser === "undefined") return rawSvg;
  const located = new DOMParser().parseFromString(
    addCanonicalGanttOverlay(rawSvg, tasks, dependencies),
    "image/svg+xml",
  );
  if (located.querySelector("parsererror")) return rawSvg;
  const findInOverlay = locateInGroup(located.documentElement);
  return decorateJiraLinkMarkers(rawSvg, markers, showKeys, (root) => (taskId) => {
    const placement = findInOverlay(taskId);
    return placement ? { ...placement, parent: root } : undefined;
  });
}

/** Markers for every task whose status came live from Jira. */
export function jiraMarkersFrom(
  statuses: ReadonlyMap<string, JiraDiagramStatus>,
  details: ReadonlyMap<string, { issueKey: string; statusName?: string | undefined; unavailable?: string | undefined }>,
  messages: Readonly<Record<string, string>>,
): JiraLinkMarker[] {
  return [...statuses].flatMap(([taskId, status]) => {
    const detail = details.get(taskId);
    if (!detail || !status.startsWith("live-")) return [];
    return [
      {
        taskId,
        status,
        issueKey: detail.issueKey,
        statusName: detail.statusName ?? (detail.unavailable ? messages[detail.unavailable] : undefined),
      },
    ];
  });
}
