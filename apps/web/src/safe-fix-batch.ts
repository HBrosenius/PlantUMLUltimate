import { diagnosticsForDiagram, type DiagramQuickFix } from "./diagram-diagnostics";
import type { DiagramKind } from "./model";
import { sourceFixOutcome } from "./source-fix-outcome";

export function safeFixBatch(kind: DiagramKind, source: string, fixes: readonly DiagramQuickFix[]) {
  const unique = [...new Map(fixes.map((fix) => [`${fix.from}:${fix.to}:${fix.replacement}`, fix])).values()];
  const groups = new Map<string, DiagramQuickFix[]>();
  for (const fix of unique) {
    const key = fix.choiceGroup ?? `${fix.from}:${fix.to}:${fix.message}`;
    groups.set(key, [...(groups.get(key) ?? []), fix]);
  }
  const candidates = [...groups.values()]
    .filter((group) => group.length === 1)
    .map((group) => group[0]!)
    .filter(
      (fix) =>
        fix.from >= 0 &&
        fix.to >= fix.from &&
        fix.to <= source.length &&
        !unique.some((other) => other !== fix && fix.from <= other.to && fix.to >= other.from),
    )
    .sort((a, b) => b.from - a.from);
  let proposed = source;
  const selected: DiagramQuickFix[] = [];
  let before = diagnosticsForDiagram(kind, source);
  for (const fix of candidates) {
    const afterSource = proposed.slice(0, fix.from) + fix.replacement + proposed.slice(fix.to);
    const after = diagnosticsForDiagram(kind, afterSource);
    const outcome = sourceFixOutcome(proposed, fix, before, after);
    if (outcome.needsReview || !outcome.resolved.some((item) => item.severity === "error")) continue;
    selected.push(fix);
    proposed = afterSource;
    before = after;
  }
  return { fixes: selected.reverse(), source: proposed };
}
