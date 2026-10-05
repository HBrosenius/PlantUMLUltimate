import type { parseGantt } from "@plantuml-studio/diagram-gantt";

export function durationUnitRepairs(
  text: string,
  source: string,
  parsed: ReturnType<typeof parseGantt>,
  position: number,
) {
  const missing = text.match(/^(\s*(?:(?:then\s+)?\[[^\]]+]\s+)?(?:lasts|requires)\s+)([1-9]\d*)(\s*)$/i);
  if (!missing) return [];
  const lineStart = source.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  const owner = source
    .slice(lineStart, position + text.length)
    .match(/^\s*(?:then\s+)?\[([^\]]+)]/)?.[1]
    ?.trim()
    .toLowerCase();
  const counts = new Map<string, number>([
    ["day", 0],
    ["week", 0],
    ["month", 0],
  ]);
  for (const task of parsed.document.tasks) {
    if (!task.duration || [task.id, task.label, task.alias?.value].some((name) => name?.trim().toLowerCase() === owner))
      continue;
    const units = new Set<string>([task.duration.unit]);
    if (task.duration.sourceParts?.weeks) units.add("week");
    if (task.duration.sourceParts?.days) units.add("day");
    for (const unit of units) counts.set(unit, counts.get(unit)! + 1);
  }
  return [...counts]
    .sort((left, right) => right[1] - left[1])
    .map(([unit, count]) => {
      const word = missing[2] === "1" ? unit : `${unit}s`;
      return {
        replacement: `${missing[1]}${missing[2]} ${word}${missing[3]}`,
        label: `Add ${word} unit${count ? ` (used by ${count} other task${count === 1 ? "" : "s"})` : ""}`,
      };
    });
}
