import type { Diagnostic } from "@codemirror/lint";
import type { DiagramQuickFix } from "./diagram-diagnostics";

/** Match diagnostics one-to-one, accounting for positions shifted by the edit. */
export function sourceFixOutcome(
  source: string,
  fix: DiagramQuickFix,
  before: readonly Diagnostic[],
  after: readonly Diagnostic[],
) {
  const candidate = source.slice(0, fix.from) + fix.replacement + source.slice(fix.to);
  const shift = fix.replacement.length - (fix.to - fix.from);
  const unmatched = new Set(after.map((_, index) => index));
  const resolved: Diagnostic[] = [];
  for (const diagnostic of before) {
    const from = diagnostic.from >= fix.to ? diagnostic.from + shift : Math.min(diagnostic.from, fix.from);
    // A point uses the same affinity at both ends. Otherwise an insertion at
    // that point shifts its start but leaves its end behind, inverting the range.
    const to =
      diagnostic.from === diagnostic.to
        ? from
        : diagnostic.to <= fix.from
          ? diagnostic.to
          : diagnostic.to >= fix.to
            ? diagnostic.to + shift
            : fix.from + fix.replacement.length;
    const index = after.findIndex(
      (item, index) =>
        unmatched.has(index) &&
        item.message === diagnostic.message &&
        item.severity === diagnostic.severity &&
        ((item.from === from && item.to === to) ||
          (diagnostic.from < fix.to &&
            diagnostic.to > fix.from &&
            source.slice(diagnostic.from, diagnostic.to).length > 0 &&
            source.slice(diagnostic.from, diagnostic.to) === candidate.slice(item.from, item.to))),
    );
    if (index < 0) resolved.push(diagnostic);
    else unmatched.delete(index);
  }
  const introduced = [...unmatched].map((index) => after[index]!);
  const resolvedErrors = resolved.filter((item) => item.severity === "error").length;
  const resolvedWarnings = resolved.filter((item) => item.severity === "warning").length;
  const newErrors = introduced.filter((item) => item.severity === "error").length;
  const newWarnings = introduced.filter((item) => item.severity === "warning").length;
  const remainingErrors = after.filter((item) => item.severity === "error").length;
  const parts: string[] = [];
  if (resolvedErrors) parts.push(`Resolves ${resolvedErrors} ${resolvedErrors === 1 ? "error" : "errors"}.`);
  if (resolvedWarnings) parts.push(`Resolves ${resolvedWarnings} ${resolvedWarnings === 1 ? "warning" : "warnings"}.`);
  if (newErrors)
    parts.push(`Introduces ${newErrors} new ${newErrors === 1 ? "error" : "errors"}—review before applying.`);
  if (newWarnings)
    parts.push(`Introduces ${newWarnings} new ${newWarnings === 1 ? "warning" : "warnings"}—review before applying.`);
  if (!parts.length) parts.push("No diagnostic changes detected.");
  parts.push(
    remainingErrors
      ? `${remainingErrors} ${remainingErrors === 1 ? "error remains" : "errors remain"}.`
      : "No errors remain.",
  );
  return {
    resolved,
    introduced,
    remainingErrors,
    needsReview: newErrors > 0 || newWarnings > 0,
    message: parts.join(" "),
  };
}
