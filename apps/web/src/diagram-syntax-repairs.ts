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
  const seenTags = new Set<string>();
  let foreignBoundary = false;
  let hasContent = false;
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
      if (trimmed) hasContent = true;
      const directive = line.match(/^(\s*)(@+[a-z]+|(?:start|end)(?:gantt|wbs|uml))\b/i);
      if (directive) {
        const token = directive[2]!;
        const normalized = token.toLowerCase();
        if (tags.includes(normalized)) seenTags.add(normalized);
        if (/^@(?:start|end)/i.test(token) && canonical.has(normalized) && !tags.includes(normalized))
          foreignBoundary = true;
        if (
          /^@(?:start|end)/i.test(token) &&
          !canonical.has(normalized) &&
          !tags.some((tag) => distance(normalized, tag) <= 2)
        )
          foreignBoundary = true;
        if (
          !canonical.has(normalized) &&
          token.length >= 6 &&
          (token.startsWith("@") || tags.includes("@" + normalized))
        ) {
          const candidates = tags
            .map((tag) => ({ tag, score: distance(normalized, tag) }))
            .sort((a, b) => a.score - b.score);
          const best = candidates[0]!;
          if (best.score <= 2 && best.score < candidates[1]!.score) {
            seenTags.add(best.tag);
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
        const repaired = line.replace(
          /(\b(?:at|after|before)\s+\[[^\]\n]+])(?:\s*([’‘']s|s|[’‘']))?\s+(start|end)\b/gi,
          (match, reference: string, marker: string | undefined, anchor: string, index: number) =>
            marker === "'s" || marker === "’s" || line.slice(0, index).includes('"')
              ? match
              : `${reference}'s ${anchor}`,
        );
        if (repaired !== line) {
          const candidate = source.slice(0, offset) + repaired + source.slice(offset + line.length);
          const errors = parseGantt(candidate).diagnostics.filter((item) => item.severity === "error").length;
          if (errors < originalErrors)
            fixes.push({
              from: offset,
              to: offset + line.length,
              replacement: repaired,
              label: /[’‘]/.test(line) ? "Use straight apostrophe in dependency" : "Add missing possessive marker",
              message: "Dependency anchor requires the possessive marker 's",
            });
        }
      }
      if (kind === "gantt") {
        let repaired = line;
        const declaration = repaired.match(
          /^(\s*(?:then\s+)?)([^[\]"']+)](?=\s+(?:starts|ends|lasts|requires|happens|is|on|pauses|links|displays|as)\b)/i,
        );
        if (declaration && declaration[2]!.trim()) {
          repaired = repaired.slice(0, declaration[1]!.length) + "[" + repaired.slice(declaration[1]!.length);
        }
        // Dependency and alias boundaries identify where a missing opening bracket belongs.
        repaired = repaired.replace(
          /(\b(?:at|after|before|as|with|in)\s+)([^[\]"\n]+)]/gi,
          (match, prefix: string, name: string) => {
            return knownTasks.has(name.trim().toLowerCase()) || /\bas\s+$/i.test(prefix) ? `${prefix}[${name}]` : match;
          },
        );
        if (/^\s*(?:then\s+)?\[/i.test(repaired) || /^\s*]+\s*$/.test(repaired)) {
          let depth = 0;
          let quoted = false;
          let cleaned = "";
          for (let index = 0; index < repaired.length; index++) {
            const char = repaired[index]!;
            if (char === '"' && repaired[index - 1] !== "\\") quoted = !quoted;
            if (!quoted && depth === 0 && char === "'" && /\s/.test(repaired[index - 1] ?? "")) {
              cleaned += repaired.slice(index);
              break;
            }
            if (!quoted && char === "[") depth++;
            if (!quoted && char === "]") {
              if (depth === 0) continue;
              depth--;
            }
            cleaned += char;
          }
          repaired = cleaned;
        }
        if (repaired !== line) {
          const candidate = source.slice(0, offset) + repaired + source.slice(offset + line.length);
          const result = parseGantt(candidate);
          const errors = result.diagnostics.filter((item) => item.severity === "error").length;
          const recognizesMore =
            result.document.tasks.length > parsed!.document.tasks.length ||
            result.document.tasks.reduce((count, task) => count + task.declarations.length, 0) >
              parsed!.document.tasks.reduce((count, task) => count + task.declarations.length, 0) ||
            result.document.dependencies.length > parsed!.document.dependencies.length;
          if (errors <= originalErrors && (errors < originalErrors || recognizesMore || /^\s*]+\s*$/.test(line))) {
            fixes.push({
              from: offset,
              to: offset + line.length,
              replacement: repaired,
              label:
                repaired.includes("[") && repaired.length >= line.length
                  ? "Add missing opening bracket"
                  : "Remove stray closing bracket",
              message: "Task brackets are unbalanced",
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
  if (hasContent && !foreignBoundary) {
    const newline = source.includes("\r\n") ? "\r\n" : "\n";
    if (!seenTags.has(tags[0]!))
      fixes.push({
        from: 0,
        to: 0,
        replacement: tags[0]! + newline,
        label: `Insert ${tags[0]}`,
        message: `Diagram is missing ${tags[0]}`,
      });
    if (!seenTags.has(tags[1]!))
      fixes.push({
        from: source.length,
        to: source.length,
        replacement: (source.endsWith("\n") ? "" : newline) + tags[1]!,
        label: `Insert ${tags[1]}`,
        message: `Diagram is missing ${tags[1]}`,
      });
  }
  return fixes;
}
