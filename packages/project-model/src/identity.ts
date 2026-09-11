import type { ElementResolution, ProjectElement, ProjectElementLocator, ResolvableDeclaration } from "./types";

function sameDeclaration(locator: ProjectElementLocator, candidate: ResolvableDeclaration): boolean {
  return locator.symbolKey === candidate.symbolKey && locator.declarationHash === candidate.declarationHash;
}

export function resolveElement(
  element: ProjectElement,
  sourceHash: string,
  declarations: readonly ResolvableDeclaration[],
): ElementResolution {
  const compatible = declarations.filter((item) => item.kind === element.kind);
  if (sourceHash === element.locator.sourceHash) {
    const candidate = compatible.find((item) => item.from === element.locator.from && item.to === element.locator.to);
    return candidate && sameDeclaration(element.locator, candidate)
      ? { state: "resolved", elementId: element.id, declaration: candidate, locator: element.locator }
      : { state: "invalid-evidence", elementId: element.id };
  }
  const exact = compatible.filter((item) => item.declarationHash === element.locator.declarationHash);
  if (exact.length === 1)
    return {
      state: "resolved",
      elementId: element.id,
      declaration: exact[0]!,
      locator: { ...element.locator, sourceHash, from: exact[0]!.from, to: exact[0]!.to },
    };
  if (exact.length > 1) return { state: "ambiguous", elementId: element.id, candidates: exact };
  const keyMatches = compatible.filter((item) => item.symbolKey === element.locator.symbolKey);
  if (keyMatches.length) return { state: "needs-review", elementId: element.id, candidates: keyMatches };
  return { state: "missing", elementId: element.id };
}

export function applyIdentityMapping(
  element: ProjectElement,
  declaration: ResolvableDeclaration,
  sourceHash: string,
): ProjectElement {
  if (element.kind !== declaration.kind) throw new Error("Identity mapping must preserve element kind");
  return {
    ...element,
    locator: {
      ...element.locator,
      symbolKey: declaration.symbolKey,
      declarationHash: declaration.declarationHash,
      sourceHash,
      from: declaration.from,
      to: declaration.to,
    },
  };
}

export interface IdentityMapping {
  elementId: string;
  declaration: ResolvableDeclaration;
}

/** Applies only explicit, kind-preserving rename mappings; all other endpoints stay untouched. */
export function applyIdentityMappings(
  elements: readonly ProjectElement[],
  mappings: readonly IdentityMapping[],
  sourceHash: string,
): ProjectElement[] {
  const byElementId = new Map(mappings.map((mapping) => [mapping.elementId, mapping.declaration]));
  return elements.map((element) => {
    const declaration = byElementId.get(element.id);
    return declaration ? applyIdentityMapping(element, declaration, sourceHash) : element;
  });
}
