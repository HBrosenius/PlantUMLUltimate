import type { Diagnostic } from "@codemirror/lint";
import type { DiagramKind } from "./model";
import { diagnosticsForDiagram, type DiagramQuickFix } from "./diagram-diagnostics";
import { sourceFixOutcome } from "./source-fix-outcome";

/** Only group diagnostics when a local repair demonstrates their connection. */
export function groupDiagnostics(
  kind: DiagramKind,
  source: string,
  diagnostics: readonly Diagnostic[],
  fixes: readonly DiagramQuickFix[],
) {
  const available = new Set(diagnostics);
  const groups: { root: Diagnostic; related: Diagnostic[] }[] = [];
  for (const fix of fixes) {
    // Whole-document scheduling repairs do not identify a local root error.
    if (source.slice(fix.from, fix.to).includes("\n")) continue;
    const root = diagnostics.find(
      (item) => available.has(item) && item.severity === "error" && item.from <= fix.to && item.to >= fix.from,
    );
    if (!root) continue;
    const candidate = source.slice(0, fix.from) + fix.replacement + source.slice(fix.to);
    const outcome = sourceFixOutcome(source, fix, diagnostics, diagnosticsForDiagram(kind, candidate));
    if (outcome.introduced.length || !outcome.resolved.includes(root)) continue;
    const related = outcome.resolved.filter((item) => item !== root && available.has(item));
    if (!related.length) continue;
    groups.push({ root, related });
    available.delete(root);
    for (const item of related) available.delete(item);
  }
  for (const root of diagnostics) if (available.has(root)) groups.push({ root, related: [] });
  return groups;
}
