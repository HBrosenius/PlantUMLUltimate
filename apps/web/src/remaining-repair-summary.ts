import type { Diagnostic } from "@codemirror/lint";
import type { DiagramKind } from "./model";
import type { DiagramQuickFix } from "./diagram-diagnostics";
import { relatedDiagnosticFixes } from "./diagram-diagnostic-fixes";

export type RepairCategory = "choice" | "review" | "manual";
export function repairCategory(
  kind: DiagramKind,
  source: string,
  diagnostic: Diagnostic,
  fixes: readonly DiagramQuickFix[],
): RepairCategory | undefined {
  if (diagnostic.severity !== "error") return undefined;
  const unique = new Set(
    relatedDiagnosticFixes(kind, source, diagnostic, fixes).map((fix) => `${fix.from}:${fix.to}:${fix.replacement}`),
  );
  return unique.size > 1 ? "choice" : unique.size === 1 ? "review" : "manual";
}

export function remainingRepairSummary(
  kind: DiagramKind,
  source: string,
  diagnostics: readonly Diagnostic[],
  fixes: readonly DiagramQuickFix[],
) {
  const errors = diagnostics.filter((item) => item.severity === "error");
  if (!errors.length) return "No errors remain.";
  let choices = 0;
  let manual = 0;
  let review = 0;
  for (const error of errors) {
    const category = repairCategory(kind, source, error, fixes);
    if (category === "choice") choices++;
    else if (category === "review") review++;
    else manual++;
  }
  const parts = [
    choices ? `${choices} ${choices === 1 ? "needs" : "need"} a choice` : "",
    review ? `${review} ${review === 1 ? "needs" : "need"} review` : "",
    manual ? `${manual} ${manual === 1 ? "needs" : "need"} manual editing` : "",
  ].filter(Boolean);
  return `${errors.length} ${errors.length === 1 ? "error remains" : "errors remain"}: ${parts.join(", ")}.`;
}
