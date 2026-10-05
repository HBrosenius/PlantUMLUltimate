import type { DiagramQuickFix } from "./diagram-diagnostics";

export function sourceFixPreview(source: string, fix: DiagramQuickFix) {
  const start = fix.from === 0 ? 0 : source.lastIndexOf("\n", fix.from - 1) + 1;
  const next = source.indexOf("\n", fix.to);
  const end = next < 0 ? source.length : next;
  const before = source.slice(start, end);
  const after = source.slice(start, fix.from) + fix.replacement + source.slice(fix.to, end);
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  let prefix = 0;
  let suffix = 0;
  while (prefix < Math.min(oldLines.length, newLines.length) && oldLines[prefix] === newLines[prefix]) prefix++;
  while (
    suffix < Math.min(oldLines.length, newLines.length) - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  )
    suffix++;
  const compact = (lines: string[]) => {
    const from = Math.max(0, prefix - 2);
    const to = Math.min(lines.length, lines.length - suffix + 2);
    let excerpt = lines.slice(from, to);
    if (excerpt.length > 12)
      excerpt = [...excerpt.slice(0, 6), `… ${excerpt.length - 12} lines omitted …`, ...excerpt.slice(-6)];
    if (from > 0) excerpt.unshift(`… ${from} unchanged lines …`);
    if (to < lines.length) excerpt.push(`… ${lines.length - to} unchanged lines …`);
    return excerpt.map((line) => (line.length > 240 ? line.slice(0, 120) + " … " + line.slice(-120) : line)).join("\n");
  };
  const expandable =
    oldLines.length > 12 ||
    newLines.length > 12 ||
    Math.max(...oldLines.map((line) => line.length), ...newLines.map((line) => line.length)) > 240;
  return {
    before,
    after,
    expandable,
    compactBefore: expandable ? compact(oldLines) : before,
    compactAfter: expandable ? compact(newLines) : after,
    line: source.slice(0, start).split("\n").length + prefix,
  };
}
