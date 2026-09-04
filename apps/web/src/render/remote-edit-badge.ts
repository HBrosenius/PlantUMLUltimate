const SVG_NS = "http://www.w3.org/2000/svg";

export function decorateRemoteEditBadge(svg: string, taskId: string, color: string, name: string): string {
  if (typeof DOMParser === "undefined") return svg;
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (document.querySelector("parsererror")) return svg;
  const root = document.documentElement;
  const group = root.querySelector<SVGGElement>(`[data-task-id="${CSS.escape(taskId)}"]`);
  const bar = group?.querySelector<SVGRectElement>(".bar");
  if (!group || !bar) return svg;
  const barX = Number(bar.getAttribute("x") ?? 0);
  const barY = Number(bar.getAttribute("y") ?? 0);
  const width = Math.max(20, name.length * 6.2 + 12);
  const badge = document.createElementNS(SVG_NS, "g");
  badge.setAttribute("class", "remote-edit-badge");
  badge.setAttribute("pointer-events", "none");
  const pill = document.createElementNS(SVG_NS, "rect");
  pill.setAttribute("x", String(barX));
  pill.setAttribute("y", String(barY - 15));
  pill.setAttribute("width", String(width));
  pill.setAttribute("height", "14");
  pill.setAttribute("rx", "3");
  pill.setAttribute("fill", color);
  badge.append(pill);
  const label = document.createElementNS(SVG_NS, "text");
  label.setAttribute("x", String(barX + 6));
  label.setAttribute("y", String(barY - 5));
  label.setAttribute("fill", "#fff");
  label.setAttribute("font-size", "10");
  label.setAttribute("font-family", "system-ui, sans-serif");
  label.textContent = name;
  badge.append(label);
  group.append(badge);
  return new XMLSerializer().serializeToString(root);
}
