import type { Action, Diagnostic } from "@codemirror/lint";
import type { ActiveIncludes, IncludeActions } from "./include-state";

interface LineSource {
  readonly lines: number;
  line(number: number): { from: number; to: number; text: string };
}

/** CodeMirror diagnostics for the open diagram's includes: missing, blocked, outside the repository, loops. */
export function includeEditorDiagnostics(
  doc: LineSource,
  state: ActiveIncludes | undefined,
  actions: IncludeActions | undefined,
): Diagnostic[] {
  if (!state) return [];
  const seen = new Set<string>();
  const result: Diagnostic[] = [];
  for (const item of state.diagnostics) {
    if (item.mainLine < 1 || item.mainLine > doc.lines) continue;
    const key = `${item.mainLine}:${item.kind}:${item.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const line = doc.line(item.mainLine);
    const diagnosticActions: Action[] = [];
    const name = item.missingDocument;
    if (item.kind === "missing" && name && actions?.canAddDiagram)
      diagnosticActions.push({
        name: "Add as a new diagram",
        apply: () => actions.addDiagram(name),
      });
    result.push({
      from: line.from,
      to: line.to,
      severity: item.kind === "blocked" ? "warning" : "error",
      source: "includes",
      message: item.message,
      actions: diagnosticActions,
    });
  }
  return result;
}

const INCLUDE_LINE = /^\s*!\s*include\w*\s+(.+?)\s*$/i;

/** The include on a line of the open diagram, and what it came from, for Ctrl/Cmd-click. */
export function includeAtLine(
  state: ActiveIncludes | undefined,
  lineNumber: number,
  lineText: string,
): { target: string; origin: string; label: string; status: string } | undefined {
  if (!INCLUDE_LINE.test(lineText)) return undefined;
  const entry = state?.includes.find((item) => item.mainLine === lineNumber && !item.nested);
  return entry ? { target: entry.target, origin: entry.origin, label: entry.label, status: entry.status } : undefined;
}
