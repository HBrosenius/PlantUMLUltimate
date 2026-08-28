interface Task {
  id: string;
  label: string;
  duration: number;
  durationUnit: "day" | "week";
  row: number;
  start?: string;
}

import { normalizeTaskId } from "@plantuml-studio/diagram-gantt";

const escapeXml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function renderLocalGantt(source: string): string {
  if (!source.includes("@startgantt")) throw new Error("Expected @startgantt");
  if (!source.includes("@endgantt")) throw new Error("Expected @endgantt");

  const tasks = new Map<string, Task>();
  const dependencies: Array<{
    predecessor: string;
    successor: string;
    successorEdge: "start" | "end";
    predecessorEdge: "start" | "end";
  }> = [];
  const projectStart = source.match(/^\s*Project\s+starts\s+(\d{4}-\d{2}-\d{2})\s*$/im)?.[1];
  for (const line of source.split(/\r?\n/)) {
    const dependencyMatch = line.match(/^\s*\[([^\]]+)]\s+(starts|ends)\s+at\s+\[([^\]]+)]'s\s+(start|end)\s*$/i);
    if (dependencyMatch?.[1] && dependencyMatch[2] && dependencyMatch[3] && dependencyMatch[4]) {
      const successor = dependencyMatch[1];
      dependencies.push({
        successor,
        successorEdge: dependencyMatch[2].toLowerCase() === "ends" ? "end" : "start",
        predecessor: dependencyMatch[3],
        predecessorEdge: dependencyMatch[4].toLowerCase() === "start" ? "start" : "end",
      });
      if (!tasks.has(successor))
        tasks.set(successor, {
          id: normalizeTaskId(successor),
          label: successor,
          duration: 1,
          durationUnit: "day",
          row: tasks.size,
        });
    }
    const match = line.match(/^\s*\[([^\]]+)]\s+lasts\s+(\d+)\s+(days?|weeks?)\b/i);
    if (match?.[1] && match[2] && match[3]) {
      const label = match[1];
      const existing = tasks.get(label);
      const durationUnit = match[3].toLowerCase().startsWith("week") ? "week" : "day";
      const duration = Number(match[2]) * (durationUnit === "week" ? 7 : 1);
      tasks.set(label, {
        id: normalizeTaskId(label),
        label,
        duration,
        durationUnit,
        row: existing?.row ?? tasks.size,
        ...(existing?.start ? { start: existing.start } : {}),
      });
      continue;
    }
    const startMatch = line.match(/^\s*\[([^\]]+)]\s+starts\s+(\d{4}-\d{2}-\d{2})\s*$/i);
    if (startMatch?.[1] && startMatch[2]) {
      const label = startMatch[1];
      const existing = tasks.get(label);
      tasks.set(label, {
        id: normalizeTaskId(label),
        label,
        duration: existing?.duration ?? 1,
        durationUnit: existing?.durationUnit ?? "day",
        row: existing?.row ?? tasks.size,
        start: startMatch[2],
      });
    }
  }

  const items = [...tasks.values()];
  const width = 760;
  const height = Math.max(220, 82 + items.length * 42);
  const bars = items
    .map((task) => {
      const y = 62 + task.row * 42;
      const barWidth = Math.max(22, task.duration * 22);
      const offset =
        task.start && projectStart
          ? Math.round((Date.parse(`${task.start}T00:00:00Z`) - Date.parse(`${projectStart}T00:00:00Z`)) / 86_400_000)
          : 0;
      const barX = 210 + Math.max(0, offset) * 22;
      return `<g class="task" data-task-id="${escapeXml(task.id)}" data-draggable="${task.start ? "true" : "false"}" data-duration-unit="${task.durationUnit}" tabindex="0" role="button" aria-label="Select ${escapeXml(task.label)}"><text x="18" y="${y + 16}" class="label">${escapeXml(task.label)}</text><rect x="${barX}" y="${y}" width="${barWidth}" height="24" rx="2" class="bar"/><text x="${barX + 8}" y="${y + 16}" class="duration">${task.duration}d</text><rect data-resize-handle="end" x="${barX + barWidth - 5}" y="${y}" width="10" height="24" class="resize-handle"/><circle data-dependency-handle="start" data-dependency-target-handle="start" cx="${barX - 8}" cy="${y + 12}" r="6" class="dependency-handle dependency-handle-start"/><circle data-dependency-handle="end" data-dependency-target-handle="end" cx="${barX + barWidth + 8}" cy="${y + 12}" r="6" class="dependency-handle dependency-handle-end"/></g>`;
    })
    .join("");
  const arrows = dependencies
    .map((dependency, index) => {
      const predecessor = tasks.get(dependency.predecessor);
      const successor = tasks.get(dependency.successor);
      if (!predecessor || !successor) return "";
      const x1 = dependency.predecessorEdge === "start" ? 210 : 210 + predecessor.duration * 22;
      const y1 = 74 + predecessor.row * 42;
      const x2 = dependency.successorEdge === "end" ? 210 + successor.duration * 22 + 4 : 206;
      const y2 = 74 + successor.row * 42;
      return `<path data-dependency-index="${index}" d="M ${x1} ${y1} C ${x1 + 24} ${y1}, ${x2 - 24} ${y2}, ${x2} ${y2}" class="dependency" marker-end="url(#arrow)"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gantt diagram"><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b"/></marker></defs><style>.bg{fill:#fff}.title,.label{fill:#252931;font-family:ui-sans-serif,system-ui;font-size:14px}.title{font-weight:600}.duration{fill:#fff;font-family:ui-monospace,monospace;font-size:12px}.bar{fill:#3b82f6}.grid{stroke:#e3e6eb;stroke-width:1}.dependency{fill:none;stroke:#64748b;stroke-width:1.5}</style><rect class="bg" width="100%" height="100%"/><text x="18" y="30" class="title">Gantt preview</text><line x1="210" y1="44" x2="210" y2="${height - 20}" class="grid"/>${arrows}${bars || '<text x="18" y="72" class="label">No supported tasks yet</text>'}</svg>`;
}
