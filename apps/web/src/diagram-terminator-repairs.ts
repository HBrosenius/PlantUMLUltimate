import { isOuterStatement, opensNoteBlock } from "./block-repair-safety";
import type { DiagramKind } from "./model";
import type { DiagramQuickFix } from "./diagram-diagnostics";

function distance(a: string, b: string): number {
  if (a.length === b.length) {
    const different = [...a].flatMap((char, index) => (char === b[index] ? [] : [index]));
    if (
      different.length === 2 &&
      different[1] === different[0]! + 1 &&
      a[different[0]!] === b[different[1]!] &&
      a[different[1]!] === b[different[0]!]
    )
      return 1;
  }
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
  const stack: Array<{
    end: string;
    indent: string;
    from: number;
    to: number;
    uncertain?: boolean;
    indented?: boolean;
    childClosed?: boolean;
  }> = [];
  const canonical = new Set([
    "end",
    "end note",
    "endhnote",
    "endrnote",
    "end ref",
    "end box",
    "endif",
    "endwhile",
    "endswitch",
    "end fork",
    "endfork",
    "end merge",
    "end split",
    "repeat while",
  ]);
  const normalizeToken = (token: string | undefined) =>
    kind === "activity" && token
      ? ({ endfork: "end fork", "end merge": "end fork", repeatwhile: "repeat while" }[token] ?? token)
      : token;
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  let offset = 0;
  let block = false;
  let insertion = source.length;
  let ambiguous = false;
  let previous = "";
  let textBlock: string | undefined;
  let opaque = 0;
  let style = false;
  let action = false;
  let pendingOpaque = false;
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
      const freeText = ["end note", "endhnote", "endrnote", "end ref"].includes(expected?.end ?? "");
      if (!freeText) {
        if (textBlock) {
          if (text.toLowerCase() === (textBlock === "title" ? "endtitle" : `end ${textBlock}`)) textBlock = undefined;
          offset += raw.length + 1;
          continue;
        }
        if (/^(?:title|legend|header|footer)\s*$/i.test(text)) {
          textBlock = text.toLowerCase();
          offset += raw.length + 1;
          continue;
        }
        if (style || /<style>/i.test(text)) {
          style = !/<\/style>/i.test(text);
          offset += raw.length + 1;
          continue;
        }
        if (action) {
          if (/[;|<>}]\s*(?:'.*)?$/.test(text)) action = false;
          offset += raw.length + 1;
          continue;
        }
        if (kind === "activity" && /^:/.test(text) && !/[;|<>}]\s*(?:'.*)?$/.test(text)) {
          action = true;
          offset += raw.length + 1;
          continue;
        }
        const syntax = text.replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/\s+'.*$/, "");
        const braces = (syntax.match(/\{/g)?.length ?? 0) - (syntax.match(/\}/g)?.length ?? 0);
        if (pendingOpaque && text) {
          pendingOpaque = false;
          if (text.startsWith("{")) {
            opaque = Math.max(0, braces);
            offset += raw.length + 1;
            continue;
          }
        }
        if (
          opaque ||
          /^(?:skinparam|json|map|(?:abstract\s+)?class|interface|enum|annotation|entity|object)\b.*\{/i.test(syntax)
        ) {
          opaque = Math.max(0, opaque + braces);
          offset += raw.length + 1;
          continue;
        }
        if (
          /^(?:skinparam|json|map|(?:abstract\s+)?class|interface|enum|annotation|entity|object)\b/i.test(syntax) &&
          !syntax.includes("{")
        )
          pendingOpaque = true;
      }
      const command = line.match(
        kind === "activity"
          ? /^(\s*)([a-z]+(?:\s+[a-z]+)?)(\s*(?:\([^\n]*\)|\{[^}]*\})?\s*(?:'.*)?)$/i
          : /^(\s*)([a-z]+(?:\s+[a-z]+)?)(\s*(?:'.*)?)$/i,
      );
      const token = normalizeToken(command?.[2]?.toLowerCase().replace(/\s+/g, " "));
      const close = () => {
        const closed = stack.pop();
        const parent = stack.at(-1);
        if (parent && closed && !["end note", "endhnote", "endrnote", "end ref"].includes(closed.end))
          parent.childClosed = true;
      };
      if (
        expected &&
        (token === expected.end ||
          (["endhnote", "endrnote"].includes(expected.end) && token === "end note") ||
          (kind === "activity" && expected.end === "end fork" && ["end merge", "endfork"].includes(token ?? "")))
      )
        close();
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
        close();
      } else if (["end note", "endhnote", "endrnote", "end ref"].includes(expected?.end ?? "")) {
        // Do not guess a missing note boundary when later statements could be swallowed.
        if (
          expected &&
          (isOuterStatement(text) ||
            (token !== undefined && canonical.has(token)) ||
            (kind === "sequence" && /^(?:alt|opt|loop|par|break|critical|group|box|ref)\b/i.test(text)) ||
            (kind === "activity" && /^(?:start|stop|if|while|switch|fork|split|:.*;)/i.test(text)) ||
            (kind === "gantt" && /^\[/.test(text)))
        )
          expected.uncertain = true;
      } else if (token && canonical.has(token) && !(kind === "activity" && token === "end")) {
        const ancestor = stack.slice(0, -1).some((opening) => opening.end === token);
        if (
          expected &&
          new RegExp(`^\\s*${expected.end}\\b`, "im").test(source.slice(offset + raw.length + 1)) &&
          token ===
            normalizeToken(
              previous
                .replace(/\s+'.*$/, "")
                .replace(/\s*\([^)]*\)$/, "")
                .trim(),
            )
        ) {
          fixes.push({
            from: offset,
            to: offset + raw.length + (source[offset + raw.length] === "\n" ? 1 : 0),
            replacement: "",
            label: "Remove duplicated block terminator",
            message: "Block terminator is duplicated",
          });
        } else if (expected && !ancestor && expected.end !== "repeat while") {
          const from = offset + command![1]!.length;
          fixes.push({
            from,
            to: from + command![2]!.length,
            replacement: expected.end,
            label: `Use ${expected.end}`,
            message: `Mismatched block terminator; expected ${expected.end}`,
          });
          close();
        } else {
          ambiguous = true;
          for (const opening of stack) opening.uncertain = true;
          if (!expected && previous !== text)
            fixes.push({
              from: offset,
              to: offset + line.length,
              message: "Unexpected block terminator; review nesting before removing it",
            });
        }
      } else {
        const indent = line.match(/^\s*/)?.[0] ?? "";
        if (opensNoteBlock(text)) {
          const shaped = /^(?:\/\s*)?([hr])note\b/i.exec(text)?.[1]?.toLowerCase();
          stack.push({ end: shaped ? `end${shaped}note` : "end note", indent, from: offset, to: offset + line.length });
        } else if (kind === "sequence") {
          if (/^(?:alt|opt|loop|par|break|critical|group|partition)\b/i.test(text))
            stack.push({ end: "end", indent, from: offset, to: offset + line.length });
          else if (/^box\b/i.test(text)) stack.push({ end: "end box", indent, from: offset, to: offset + line.length });
          else if (/^ref\b/i.test(text) && !text.includes(":"))
            stack.push({ end: "end ref", indent, from: offset, to: offset + line.length });
        } else if (kind === "activity") {
          const opening = /^(if|while|switch|fork|split|repeat)\b/i.exec(text)?.[1]?.toLowerCase();
          if (opening && !/^(?:fork|split)\s+again\b/i.test(text))
            stack.push({
              end:
                opening === "if"
                  ? "endif"
                  : opening === "while"
                    ? "endwhile"
                    : opening === "switch"
                      ? "endswitch"
                      : opening === "repeat"
                        ? "repeat while"
                        : `end ${opening}`,
              indent,
              from: offset,
              to: offset + line.length,
            });
        }
      }
      if (expected && !freeText && text && token !== expected.end) {
        const indentation = line.match(/^[ \t]*/)?.[0].length ?? 0;
        if (indentation > expected.indent.length) expected.indented = true;
        else if (
          expected.indented &&
          !canonical.has(token ?? "") &&
          !/^(?:else|elseif|case|fork again|split again)\b/i.test(text)
        )
          expected.uncertain = true;
        if (kind === "activity" && /^(?:stop|end)\s*$/i.test(text)) expected.uncertain = true;
      }
    }
    if (text) previous = text;
    offset += raw.length + 1;
  }
  for (const opening of stack) if (opening.childClosed || opening.end === "repeat while") opening.uncertain = true;
  for (const opening of stack.filter((item) => item.uncertain)) {
    fixes.push({
      from: opening.from!,
      to: opening.to!,
      message:
        opening.end === "end note"
          ? "Note is missing end note"
          : opening.end === "end ref"
            ? "Reference is missing end ref"
            : `Block is missing ${opening.end}; review nesting and choose its closing position`,
    });
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
