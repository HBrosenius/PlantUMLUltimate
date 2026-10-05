import type { Diagnostic } from "@codemirror/lint";

export function errorLocations(diagnostics: readonly Diagnostic[]) {
  const positions = new Map<number, Diagnostic>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === "error" && !positions.has(diagnostic.from)) positions.set(diagnostic.from, diagnostic);
  }
  return [...positions.values()].sort((a, b) => a.from - b.from);
}

export function nextErrorIndex(errors: readonly Diagnostic[], position: number, direction: 1 | -1): number {
  if (!errors.length) return -1;
  if (direction === 1) {
    const index = errors.findIndex((error) => error.from > position);
    return index < 0 ? 0 : index;
  }
  for (let index = errors.length - 1; index >= 0; index--) {
    if (errors[index]!.from < position) return index;
  }
  return errors.length - 1;
}
