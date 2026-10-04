import type { DiagramKind } from "./model";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import type { DiagramQuickFix } from "./diagram-diagnostics";

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(next[j - 1]! + 1, row[j]! + 1, row[j - 1]! + Number(a[i - 1] !== b[j - 1]));
    }
    row = next;
  }
  return row[b.length]!;
}

export function syntaxRepairs(kind: DiagramKind, source: string): DiagramQuickFix[] {
  const suffix = kind === "gantt" ? "gantt" : kind === "wbs" ? "wbs" : "uml";
  const tags = [`@start${suffix}`, `@end${suffix}`];
  const canonical = new Set(["@startgantt", "@endgantt", "@startwbs", "@endwbs", "@startuml", "@enduml"]);
  const fixes: DiagramQuickFix[] = [];
  const parsed = kind === "gantt" ? parseGantt(source) : undefined;
  const originalErrors = parsed?.diagnostics.filter((item) => item.severity === "error").length ?? 0;
  const knownTasks =
    kind === "gantt"
      ? new Set(
          parsed!.document.tasks
            .flatMap((task) => [task.label, ...(task.alias ? [task.alias.value] : [])])
            .map((label) => label.trim().toLowerCase()),
        )
      : new Set<string>();
  let offset = 0;
  let blockComment = false;
  let note = false;
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (blockComment) {
      if (trimmed.includes("'/")) blockComment = false;
    } else if (trimmed.startsWith("/'")) {
      blockComment = !trimmed.includes("'/", 2);
    } else if (note) {
      if (/^end\s+note\b/i.test(trimmed)) note = false;
    } else if (/^note\b/i.test(trimmed) && !trimmed.includes(":")) {
      note = true;
    } else if (!trimmed.startsWith("'")) {
      const directive = line.match(/^(\s*)(@[a-z]+)\b/i);
      if (directive) {
        const token = directive[2]!;
        const normalized = token.toLowerCase();
        if (!canonical.has(normalized) && token.length >= 6) {
          const candidates = tags
            .map((tag) => ({ tag, score: distance(normalized, tag) }))
            .sort((a, b) => a.score - b.score);
          const best = candidates[0]!;
          if (best.score <= 2 && best.score < candidates[1]!.score) {
            const from = offset + directive[1]!.length;
            fixes.push({
              from,
              to: from + token.length,
              replacement: best.tag,
              label: `Use ${best.tag}`,
              message: `Misspelled diagram tag; expected ${best.tag}`,
            });
          }
        }
      }
      if (kind === "gantt" && /^\s*(?:then\s+)?\[/i.test(line)) {
        let repaired = line;
        for (let index = 0; index < repaired.length; index++) {
          if (repaired[index] !== "[") continue;
          const close = repaired.indexOf("]", index + 1);
          const next = repaired.indexOf("[", index + 1);
          if (close >= 0 && (next < 0 || close < next)) {
            index = close;
            continue;
          }
          const rest = repaired.slice(index + 1, next < 0 ? undefined : next);
          const boundary =
            /\s+(?:starts|ends|lasts|requires|happens|is|on|pauses|links|displays|as)\b|['’]s\s+(?:start|end)\b/i.exec(
              rest,
            );
          const position =
            boundary?.index ?? (knownTasks.has(rest.trim().toLowerCase()) ? rest.trimEnd().length : undefined);
          if (position === undefined || !rest.slice(0, position).trim()) continue;
          const at = index + 1 + position;
          repaired = repaired.slice(0, at) + "]" + repaired.slice(at);
          index = at;
        }
        if (repaired !== line) {
          const candidate = source.slice(0, offset) + repaired + source.slice(offset + line.length);
          const before = originalErrors;
          const after = parseGantt(candidate).diagnostics.filter((item) => item.severity === "error").length;
          if (before > 0 && after <= before)
            fixes.push({
              from: offset,
              to: offset + line.length,
              replacement: repaired,
              label: "Add missing closing bracket",
              message: "Task reference is missing a closing bracket",
            });
        }
      }
    }
    offset += line.length + 1;
  }
  return fixes;
}
