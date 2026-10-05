import type { Diagnostic } from "@codemirror/lint";

/** Continue near the edited statement, prioritizing errors over warnings. */
export function nextRepairDiagnostic(diagnostics: readonly Diagnostic[], position: number) {
  const errors = diagnostics.filter((item) => item.severity === "error");
  const candidates = (errors.length ? errors : diagnostics.filter((item) => item.severity === "warning"))
    .slice()
    .sort((left, right) => left.from - right.from || left.to - right.to);
  return candidates.find((item) => item.from >= position) ?? candidates[0];
}
