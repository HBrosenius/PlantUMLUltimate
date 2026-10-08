import type { ElementResolution, ProjectElement, ProjectElementKind } from "@plantuml-studio/project-model";

/** Prefer the current resolved declaration over stale locators at the same offset. */
export function projectElementForEdit(
  elements: readonly ProjectElement[],
  resolutions: ReadonlyMap<string, ElementResolution>,
  documentId: string,
  kind: ProjectElementKind,
  from: number,
  previousSymbolKey?: string,
): ProjectElement | undefined {
  const candidates = elements.filter((element) => element.documentId === documentId && element.kind === kind);
  const resolved = candidates.filter((element) => {
    const resolution = resolutions.get(element.id);
    return (
      resolution?.state === "resolved" &&
      resolution.declaration.from === from &&
      (previousSymbolKey === undefined || resolution.declaration.symbolKey === previousSymbolKey)
    );
  });
  if (resolved.length) return resolved.length === 1 ? resolved[0] : undefined;
  const fallback = candidates.filter(
    (element) =>
      element.locator.from === from &&
      (previousSymbolKey === undefined || element.locator.symbolKey === previousSymbolKey),
  );
  return fallback.length === 1 ? fallback[0] : undefined;
}
