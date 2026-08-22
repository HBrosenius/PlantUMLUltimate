import type { GanttTask } from "@plantuml-studio/diagram-gantt";

export interface LegendEntry { color: string; label: string }

const ROW = /^\s*\|\s*<#([^>]+)>\s*\|\s*(.*?)\s*\|\s*$/;
const HEADER = /^\s*\|=?\s*Color\s*\|=?\s*Task Type\s*\|\s*$/i;
const HEADER_ROW = "|= Color |= Task Type |";

export function usedLegendColors(tasks: readonly GanttTask[]): string[] {
  const values = new Map<string, string>();
  for (const task of tasks) {
    const color = task.color?.value.trim();
    if (color && !values.has(color.toLowerCase())) values.set(color.toLowerCase(), color.replace(/^#/, ""));
  }
  return [...values.values()];
}

export function parseLegendEntries(source: string): LegendEntry[] {
  const match = /(^|\n)([ \t]*legend\s*\r?\n)([\s\S]*?)(\r?\n[ \t]*endlegend\b)/i.exec(source);
  if (!match?.[3]) return [];
  return match[3].split(/\r?\n/).flatMap((line) => {
    const row = line.match(ROW);
    return row?.[1] !== undefined ? [{ color: row[1], label: row[2]?.trim() || row[1] }] : [];
  });
}

export function synchronizeLegend(
  source: string,
  tasks: readonly GanttTask[],
  labels: ReadonlyMap<string, string> = new Map(),
): string {
  const colors = usedLegendColors(tasks);
  const existing = parseLegendEntries(source);
  const knownLabels = new Map(existing.map((entry) => [entry.color.toLowerCase(), entry.label]));
  for (const [color, label] of labels) knownLabels.set(color.toLowerCase(), label.trim() || color);
  const rows = colors.map((color) => `|<#${color}> | ${knownLabels.get(color.toLowerCase()) ?? color} |`);
  const block = /(^|\n)([ \t]*legend\s*\r?\n)([\s\S]*?)(\r?\n[ \t]*endlegend\b[^\n\r]*)/i.exec(source);
  if (block?.index !== undefined && block[2] !== undefined && block[3] !== undefined && block[4] !== undefined) {
    const preserved = block[3].split(/\r?\n/).filter((line) => !ROW.test(line) && !HEADER.test(line));
    const body = [...preserved.filter((line) => line.trim()), ...(rows.length ? [HEADER_ROW] : []), ...rows].join(source.includes("\r\n") ? "\r\n" : "\n");
    const replacement = rows.length || preserved.some((line) => line.trim())
      ? `${block[1] ?? ""}${block[2]}${body}${block[4]}`
      : "";
    return source.slice(0, block.index) + replacement + source.slice(block.index + block[0].length);
  }
  if (!rows.length) return source;
  const end = /(^|\r?\n)([ \t]*)@endgantt\b/i.exec(source);
  if (!end || end.index === undefined) return source;
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const at = end.index + (end[1]?.length ?? 0);
  return source.slice(0, at) + `legend${newline}${HEADER_ROW}${newline}${rows.join(newline)}${newline}endlegend${newline}${newline}` + source.slice(at);
}

export function removeLegend(source: string): string {
  return source.replace(/(^|\n)[ \t]*legend\s*\r?\n[\s\S]*?\r?\n[ \t]*endlegend\b[^\n\r]*(?:\r?\n)?/i, "$1");
}

export function makeLegendLabelsInteractive(svg: string, entries: readonly LegendEntry[]): string {
  if (typeof DOMParser === "undefined" || !entries.length) return svg;
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (document.querySelector("parsererror")) return svg;
  const available = new Map(entries.map((entry) => [entry.label.trim(), entry.color]));
  for (const label of document.querySelectorAll("text")) {
    const color = available.get(label.textContent?.trim() ?? "");
    if (!color) continue;
    label.setAttribute("data-legend-color", color);
    label.setAttribute("role", "button");
    label.setAttribute("tabindex", "0");
    label.setAttribute("aria-label", `Edit legend label for ${color}`);
    label.setAttribute("style", `${label.getAttribute("style") ?? ""};cursor:pointer;text-decoration:underline`);
  }
  return new XMLSerializer().serializeToString(document);
}
