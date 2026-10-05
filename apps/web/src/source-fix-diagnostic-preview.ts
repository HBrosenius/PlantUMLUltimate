import type { DiagramQuickFix } from "./diagram-diagnostics";

export function sourceFixDiagnosticPreview(source: string, fix: DiagramQuickFix, line: number) {
  const lines = (source.slice(0, fix.from) + fix.replacement + source.slice(fix.to)).split(/\r?\n/);
  return lines.slice(Math.max(0, line - 3), line + 2).map((text, index) => ({
    number: Math.max(0, line - 3) + index + 1,
    text,
    highlighted: Math.max(0, line - 3) + index + 1 === line,
  }));
}
