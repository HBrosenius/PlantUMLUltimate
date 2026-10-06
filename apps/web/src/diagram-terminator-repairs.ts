import { isOuterStatement, opensNoteBlock } from "./block-repair-safety";
import type { DiagramKind } from "./model";
import type { DiagramQuickFix } from "./diagram-diagnostics";

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(next[j - 1]! + 1, row[j]! + 1, row[j - 1]! + Number(a[i - 1] !== b[j - 1]));
    row = next;
  }
  return row[b.length]!;
}

interface TerminatorIssue {
  from: number;
  to: number;
  message: string;
  replacement?: string;
  label?: string;
}

export function terminatorIssues(kind: DiagramKind, source: string): TerminatorIssue[] {
  if (kind === "wbs") return [];
  const fixes: TerminatorIssue[] = [];
  const stack: Array<{ end: string; indent: string; from?: number; to?: number; uncertain?: boolean }> = [];
  const canonical = new Set([
    "end",
    "end note",
    "end ref",
    "end box",
    "endif",
    "endwhile",
    "endswitch",
    "end fork",
    "end split",
  ]);
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  let offset = 0;
  let block = false;
  let insertion = source.length;
  let ambiguous = false;
  for (const raw of source.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const text = line.trim();
    if (block) {
      if (text.includes("'/")) block = false;
    } else if (text.startsWith("/'")) block = !text.includes("'/", 2);
    else if (!text.startsWith("'")) {
      // Diagram boundaries remain boundaries even when a note has lost its closer.
      if (
        new RegExp(`^@end${kind === "gantt" ? "gantt" : "uml"}\\b`, "i").test(text) &&
        !(stack.at(-1)?.end === "end note" && /^\s*end\s+note\s*$/im.test(source.slice(offset + raw.length)))
      ) {
        insertion = offset;
        break;
      }
      const expected = stack.at(-1);
      const command = line.match(
        kind === "activity"
          ? /^(\s*)([a-z]+(?:\s+[a-z]+)?)(\s*(?:\([^\n]*\))?\s*(?:'.*)?)$/i
          : /^(\s*)([a-z]+(?:\s+[a-z]+)?)(\s*(?:'.*)?)$/i,
      );
      const token = command?.[2]?.toLowerCase().replace(/\s+/g, " ");
      if (expected && token === expected.end) stack.pop();
      else if (
        expected &&
        token &&
        !canonical.has(token) &&
        /^[a-z ]+$/.test(token) &&
        distance(token, expected.end) <= (expected.end === "end" ? 1 : 2) &&
        (expected.end !== "end note" || /^e\w*\s+\w+$/i.test(token))
      ) {
        const from = offset + command![1]!.length;
        fixes.push({
          from,
          to: from + command![2]!.length,
          replacement: expected.end,
          label: `Use ${expected.end}`,
          message: `Misspelled block terminator; expected ${expected.end}`,
        });
        stack.pop();
      } else if (["end note", "end ref"].includes(expected?.end ?? "")) {
        // Do not guess a missing note boundary when later statements could be swallowed.
        if (
          expected?.end === "end note" &&
          (isOuterStatement(text) ||
            (token !== undefined && canonical.has(token)) ||
            (kind === "sequence" && /^(?:alt|opt|loop|par|break|critical|group|box|ref)\b/i.test(text)) ||
            (kind === "activity" && /^(?:start|stop|if|while|switch|fork|split|:.*;)/i.test(text)) ||
            (kind === "gantt" && /^\[/.test(text)))
        )
          expected.uncertain = true;
      } else if (token && canonical.has(token)) ambiguous = true;
      else {
        const indent = line.match(/^\s*/)?.[0] ?? "";
        if (opensNoteBlock(text)) stack.push({ end: "end note", indent, from: offset, to: offset + line.length });
        else if (kind === "sequence") {
          if (/^(?:alt|opt|loop|par|break|critical|group)\b/i.test(text)) stack.push({ end: "end", indent });
          else if (/^box\b/i.test(text)) stack.push({ end: "end box", indent });
          else if (/^ref\b/i.test(text) && !text.includes(":")) stack.push({ end: "end ref", indent });
        } else if (kind === "activity") {
          const opening = /^(if|while|switch|fork|split)\b/i.exec(text)?.[1]?.toLowerCase();
          if (opening && !/^(?:fork|split)\s+again\b/i.test(text))
            stack.push({
              end:
                opening === "if"
                  ? "endif"
                  : opening === "while"
                    ? "endwhile"
                    : opening === "switch"
                      ? "endswitch"
                      : `end ${opening}`,
              indent,
            });
        }
      }
    }
    offset += raw.length + 1;
  }
  for (const opening of stack.filter((item) => item.uncertain)) {
    fixes.push({ from: opening.from!, to: opening.to!, message: "Note is missing end note" });
  }
  if (stack.length && !ambiguous && !stack.some((item) => item.uncertain)) {
    if (stack.at(-1)?.end === "end note") {
      // Trailing blank lines belong after the note closer, not inside its rendered text.
      const tail = /\n(?:[ \t]*\r?\n)+$/.exec(source.slice(0, insertion));
      if (tail) insertion = tail.index + 1;
    }
    const prefix = insertion === source.length && source.length > 0 && !source.endsWith("\n") ? newline : "";
    const replacement =
      prefix +
      [...stack]
        .reverse()
        .map((item) => item.indent + item.end + newline)
        .join("");
    fixes.push({
      from: insertion,
      to: insertion,
      replacement,
      label: "Close unclosed blocks",
      message: "Blocks are missing their closing terminators",
    });
  }
  return fixes;
}

export function terminatorRepairs(kind: DiagramKind, source: string): DiagramQuickFix[] {
  return terminatorIssues(kind, source).filter((issue): issue is DiagramQuickFix => issue.replacement !== undefined);
}
