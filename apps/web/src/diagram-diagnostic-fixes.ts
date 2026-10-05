import type { Diagnostic } from "@codemirror/lint";
import type { DiagramKind } from "./model";
import { diagnosticsForDiagram, type DiagramQuickFix } from "./diagram-diagnostics";

export function relatedDiagnosticFixes(
  kind: DiagramKind,
  source: string,
  diagnostic: Diagnostic,
  fixes: readonly DiagramQuickFix[],
) {
  return fixes.filter(
    (fix) =>
      (fix.from <= diagnostic.to && fix.to >= diagnostic.from) ||
      (/missing\s+\}|unclosed|unterminated/i.test(diagnostic.message) &&
        /close|insert end/i.test(fix.message) &&
        !diagnosticsForDiagram(kind, source.slice(0, fix.from) + fix.replacement + source.slice(fix.to)).some(
          (item) =>
            item.message === diagnostic.message &&
            item.from ===
              diagnostic.from + (fix.to <= diagnostic.from ? fix.replacement.length - (fix.to - fix.from) : 0),
        )),
  );
}
