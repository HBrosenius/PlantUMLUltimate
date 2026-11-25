import type { TextRange } from "@plantuml-studio/language-core";
import { c4Macro, type C4CallSite, type C4Document } from "./model";
import { parseC4 } from "./parser";

export interface C4SymbolOccurrence {
  kind: "c4-element";
  /** The alias the occurrence belongs to. */
  key: string;
  value: string;
  range: TextRange;
  role: "declaration" | "reference";
}

/** What an alias may look like: the engine reads a dot as a path separator, so a dot is not allowed. */
export const C4_ALIAS = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The argument of a call that fills a named parameter: `$from=` or the one at the parameter's position. */
export function c4Argument(site: C4CallSite, parameter: string) {
  const named = site.arguments.find((item) => item.name === parameter);
  if (named) return named;
  const position = c4Macro(site.macro)?.params.findIndex((item) => item.name === parameter) ?? -1;
  return position >= 0 ? site.arguments.filter((item) => !item.name)[position] : undefined;
}

/** Where an alias is declared and used, by macro call: declarations, relationship ends and layout hints. */
export function collectC4SymbolOccurrences(
  source: string,
  document: C4Document = parseC4(source),
): C4SymbolOccurrence[] {
  const occurrences: C4SymbolOccurrence[] = [];
  const add = (site: C4CallSite, parameter: string, role: C4SymbolOccurrence["role"]) => {
    const argument = c4Argument(site, parameter);
    if (!argument || !argument.value) return;
    occurrences.push({
      kind: "c4-element",
      key: argument.value,
      value: argument.value,
      range: argument.valueRange,
      role,
    });
  };
  for (const element of document.elements) add(element, "alias", "declaration");
  for (const relationship of document.relationships) {
    add(relationship, "from", "reference");
    add(relationship, "to", "reference");
  }
  for (const hint of document.settings.hints) {
    add(hint, "from", "reference");
    add(hint, "to", "reference");
  }
  return occurrences.sort((left, right) => left.range.from - right.range.from);
}

/** Every occurrence of one alias. */
export function findC4References(source: string, alias: string): C4SymbolOccurrence[] {
  return collectC4SymbolOccurrences(source).filter((item) => item.key === alias);
}

/**
 * Checks a new alias. Returns a message for the user, or nothing when the alias is fine. `identities` are the
 * aliases already in use; `currentIdentity` is the one being renamed, which may keep its own name.
 */
export function validateC4Alias(
  value: string,
  options: { identities?: readonly string[]; currentIdentity?: string } = {},
): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "Alias is required";
  if (trimmed.includes("."))
    return "An alias can't contain a dot: the diagram engine reads a dot as a separator between a boundary and its contents";
  if (!C4_ALIAS.test(trimmed))
    return "An alias can only use letters, digits and underscores, and can't start with a digit";
  if (trimmed !== options.currentIdentity && options.identities?.includes(trimmed))
    return `Alias “${trimmed}” is already used`;
  return undefined;
}

/** Checks renaming `alias` to `next`, against the aliases the source declares. */
export function validateC4Rename(source: string, alias: string, next: string): string | undefined {
  const document = parseC4(source);
  return validateC4Alias(next, {
    identities: document.elements.map((item) => item.id),
    currentIdentity: alias,
  });
}
