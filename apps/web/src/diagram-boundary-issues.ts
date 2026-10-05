import type { DiagramKind } from "./model";

interface Boundary {
  from: number;
  to: number;
  lineFrom: number;
  lineTo: number;
  text: string;
  line: number;
  phase: string;
  suffix: string;
}
interface BoundaryIssue {
  from: number;
  to: number;
  message: string;
  replacement?: string;
  label?: string;
}

export function boundaryIssues(kind: DiagramKind, source: string): BoundaryIssue[] {
  const suffix = kind === "gantt" ? "gantt" : kind === "wbs" ? "wbs" : "uml";
  const boundaries: Boundary[] = [];
  let offset = 0;
  let block = false;
  let note = false;
  for (const [index, raw] of source.split("\n").entries()) {
    const text = raw.replace(/\r$/, "");
    const trimmed = text.trim();
    if (block) {
      if (trimmed.includes("'/")) block = false;
    } else if (trimmed.startsWith("/'")) {
      block = !trimmed.includes("'/", 2);
    } else if (note) {
      if (/^end\s+note\b/i.test(trimmed)) note = false;
    } else if (/^note\b/i.test(trimmed) && !trimmed.includes(":")) {
      note = true;
    } else if (!trimmed.startsWith("'")) {
      const match = text.match(/^(\s*)(@(start|end)(gantt|wbs|uml))\b/i);
      if (match)
        boundaries.push({
          from: offset + match[1]!.length,
          to: offset + match[1]!.length + match[2]!.length,
          lineFrom: offset,
          lineTo: Math.min(source.length, offset + raw.length + 1),
          text,
          line: index,
          phase: match[3]!.toLowerCase(),
          suffix: match[4]!.toLowerCase(),
        });
    }
    offset += raw.length + 1;
  }
  const [first, second] = boundaries;
  if (
    boundaries.length === 2 &&
    first!.phase === "end" &&
    second!.phase === "start" &&
    first!.suffix === suffix &&
    second!.suffix === suffix
  ) {
    const middle = source.slice(first!.lineFrom + first!.text.length, second!.lineFrom);
    return [
      {
        from: first!.lineFrom,
        to: second!.lineFrom + second!.text.length,
        replacement: second!.text + middle + first!.text,
        label: "Move opening tag before closing tag",
        message: "Diagram closing tag appears before its opening tag",
      },
    ];
  }
  const issues: BoundaryIssue[] = [];
  let open: Boundary | undefined;
  let ambiguous = false;
  let previous: Boundary | undefined;
  for (const boundary of boundaries) {
    if (boundary.phase === "start") {
      if (open) {
        const duplicate =
          previous?.phase === "start" && previous.line + 1 === boundary.line && previous.text === boundary.text;
        if (!duplicate) ambiguous = true;
        issues.push({
          from: duplicate ? boundary.lineFrom : boundary.from,
          to: duplicate ? boundary.lineTo : boundary.to,
          message: "Diagram has another opening tag before its closing tag",
          ...(duplicate ? { replacement: "", label: "Remove duplicated opening tag" } : {}),
        });
      } else open = boundary;
    } else if (open) {
      if (open.suffix !== boundary.suffix) {
        if (!ambiguous && open.suffix === suffix)
          issues.push({
            from: boundary.from,
            to: boundary.to,
            replacement: `@end${suffix}`,
            label: `Use @end${suffix}`,
            message: "Diagram opening and closing tags do not match",
          });
        else if (!ambiguous && boundary.suffix === suffix)
          issues.push({
            from: open.from,
            to: open.to,
            replacement: `@start${suffix}`,
            label: `Use @start${suffix}`,
            message: "Diagram opening and closing tags do not match",
          });
        else
          issues.push({
            from: boundary.from,
            to: boundary.to,
            message: "Diagram opening and closing tags do not match",
          });
      }
      open = undefined;
      ambiguous = false;
    } else {
      const duplicate =
        previous?.phase === "end" && previous.line + 1 === boundary.line && previous.text === boundary.text;
      issues.push({
        from: duplicate ? boundary.lineFrom : boundary.from,
        to: duplicate ? boundary.lineTo : boundary.to,
        message: "Diagram closing tag has no matching opening tag",
        ...(duplicate ? { replacement: "", label: "Remove duplicated closing tag" } : {}),
      });
    }
    previous = boundary;
  }
  return issues;
}
