import {
  C4_ELEMENT_MACROS,
  c4IncludeLine,
  c4Macro,
  type C4Category,
  type C4Direction,
  type C4Document,
  type C4Element,
  type C4Macro,
  type C4Relationship,
  type C4Scope,
} from "../../c4-source";
import type { TextRange } from "@plantuml-studio/language-core";

/** What the Add dialogs and inspectors know about the macros, in the words of the forms. */

export type C4FormElementKind = "person" | "system" | "container" | "component";
export type C4Store = "standard" | "database" | "queue";

export const C4_FORM_ELEMENT_KINDS: readonly C4FormElementKind[] = ["person", "system", "container", "component"];

export const C4_KIND_LABELS: Record<C4FormElementKind, string> = {
  person: "Person",
  system: "Software system",
  container: "Container",
  component: "Component",
};

/** The macro that draws an element of one kind, store and side: `ContainerDb_Ext`, `Person`, `SystemQueue`. */
export function c4ElementMacroName(kind: C4FormElementKind, store: C4Store, external: boolean): string {
  const base = { person: "Person", system: "System", container: "Container", component: "Component" }[kind];
  const storage = kind === "person" ? "" : store === "database" ? "Db" : store === "queue" ? "Queue" : "";
  return `${base}${storage}${external ? "_Ext" : ""}`;
}

/** The kind, store and side a macro name stands for, or undefined when it is not an element macro. */
export function c4ElementVariant(
  macroName: string,
): { kind: C4FormElementKind; store: C4Store; external: boolean } | undefined {
  const macro = c4Macro(macroName);
  if (!macro || !(C4_ELEMENT_MACROS as readonly string[]).includes(macro.name)) return undefined;
  const kind = macro.category as C4FormElementKind;
  const store: C4Store = /Db(_Ext)?$/.test(macro.name)
    ? "database"
    : /Queue(_Ext)?$/.test(macro.name)
      ? "queue"
      : "standard";
  return { kind, store, external: Boolean(macro.external) };
}

export type C4BoundaryChoice =
  "System_Boundary" | "Container_Boundary" | "Enterprise_Boundary" | "Boundary" | "Deployment_Node";

export const C4_BOUNDARY_CHOICES: ReadonlyArray<{ macro: C4BoundaryChoice; label: string }> = [
  { macro: "System_Boundary", label: "System boundary" },
  { macro: "Container_Boundary", label: "Container boundary" },
  { macro: "Enterprise_Boundary", label: "Enterprise boundary" },
  { macro: "Boundary", label: "Generic boundary" },
  { macro: "Deployment_Node", label: "Deployment node" },
];

/** A readable name for a macro: "Container", "Database container", "External person". */
export function c4MacroTitle(macroName: string): string {
  const macro = c4Macro(macroName);
  if (!macro) return macroName;
  const detail = macro.detail.replace(/^An? /, "");
  return detail.charAt(0).toUpperCase() + detail.slice(1);
}

const CATEGORY_NOUN: Record<Exclude<C4Category, "relationship">, string> = {
  person: "person",
  system: "system",
  container: "container",
  component: "component",
  boundary: "boundary",
  node: "deployment node",
};

/** "container", "external system", "boundary": the noun an assistive label uses for an element. */
export function c4ElementNoun(element: Pick<C4Element, "category" | "external">): string {
  return `${element.external ? "external " : ""}${CATEGORY_NOUN[element.category]}`;
}

/** Whether an element is a boundary or deployment node, which hold others and can't be connected. */
export const isC4Container = (element: Pick<C4Element, "category">) =>
  element.category === "boundary" || element.category === "node";

// -- Aliases ---------------------------------------------------------------------------------------

/** A source identifier for a label: `Order service` becomes `orderService`, and is made unique among `taken`. */
export function suggestC4Alias(label: string, taken: Iterable<string>): string {
  const words = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let base = words
    .map((word, index) => (index === 0 ? word.toLowerCase() : word[0]!.toUpperCase() + word.slice(1)))
    .join("");
  if (!base) return "";
  if (/^[0-9]/.test(base)) base = `_${base}`;
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let number = 2; ; number += 1) if (!used.has(`${base}${number}`)) return `${base}${number}`;
}

// -- Includes --------------------------------------------------------------------------------------

type Library = C4Macro["library"];

/** The library each library includes itself (from the bundled files). */
const LIBRARY_PARENT: Record<string, Library | undefined> = {
  C4_Context: undefined,
  C4_Container: "C4_Context",
  C4_Component: "C4_Container",
  C4_Dynamic: "C4_Component",
  C4_Sequence: "C4_Component",
  C4_Deployment: "C4_Container",
};

/** The C4 libraries the source makes available: those it includes, and the ones they include in turn. */
export function c4IncludedLibraries(source: string): Set<string> {
  const result = new Set<string>();
  for (const line of source.split(/\r?\n/)) {
    const include = /^\s*!\s*include\w*\s+(.+?)\s*$/i.exec(line);
    const name = include
      ? /\b(C4_(?:Context|Container|Component|Dynamic|Sequence|Deployment))\b/.exec(include[1]!)?.[1]
      : undefined;
    for (let current: string | undefined = name; current && !result.has(current); current = LIBRARY_PARENT[current])
      result.add(current);
  }
  return result;
}

/** The library a macro needs that the source does not include yet, or undefined when the macro is available. */
export function c4MissingLibrary(source: string, macroName: string): Library | undefined {
  const macro = c4Macro(macroName);
  if (!macro) return undefined;
  return c4IncludedLibraries(source).has(macro.library) ? undefined : macro.library;
}

/** Adds the include line for a library: after the last C4 include, or right after `@startuml`. */
export function addC4Include(source: string, library: Library): string {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/(?<=\n)/);
  let offset = 0;
  let after = -1;
  let start = -1;
  for (const line of lines) {
    const end = offset + line.length;
    const text = line.replace(/\r?\n$/, "");
    if (/^\s*!\s*include\w*\s+.*C4/i.test(text)) after = end;
    else if (start < 0 && /^\s*@startuml\b/i.test(text)) start = end;
    offset = end;
  }
  const at = after >= 0 ? after : start >= 0 ? start : 0;
  const text = `${c4IncludeLine(library)}${eol}`;
  const needsBreak = at > 0 && !source.slice(0, at).endsWith("\n");
  return `${source.slice(0, at)}${needsBreak ? eol : ""}${text}${source.slice(at)}`;
}

// -- Selection -------------------------------------------------------------------------------------

export type C4Selection =
  | { kind: "element"; alias: string }
  | { kind: "relationship"; index: number }
  /** A drawn shape that the source does not declare (a procedure, an included file): shown, never edited. */
  | { kind: "unmanaged"; alias?: string; from?: string; to?: string; line?: TextRange };

/** The key a selection has on the canvas (`data-c4-object-id`), in the outline and in the Stage dock. */
export function c4SelectionKey(selection: C4Selection | undefined): string | undefined {
  if (!selection) return undefined;
  if (selection.kind === "element") return selection.alias;
  if (selection.kind === "relationship") return `rel:${selection.index}`;
  return selection.alias ?? `link:${selection.from ?? ""}>${selection.to ?? ""}`;
}

/** The selection that a source range (as the C1 operations report it) stands for. */
export function c4SelectionAt(document: C4Document, range: TextRange): C4Selection | undefined {
  const element = document.elements.find((item) => item.nameRange.from === range.from);
  if (element) return { kind: "element", alias: element.id };
  const relationship = document.relationships.find((item) => item.nameRange.from === range.from);
  return relationship ? { kind: "relationship", index: relationship.index } : undefined;
}

/** The element or relationship whose call the position is on, for following the editor's cursor. */
export function c4SelectionAtPosition(document: C4Document, position: number): C4Selection | undefined {
  const inside = (item: { range: TextRange }) => position >= item.range.from && position <= item.range.to;
  const element = document.elements.find(inside);
  if (element) return { kind: "element", alias: element.id };
  const relationship = document.relationships.find(inside);
  return relationship ? { kind: "relationship", index: relationship.index } : undefined;
}

/** The key the outline gives an entry (`alias` or `rel:N`) as a selection. */
/**
 * The source lines an AI edit of a selected C4 object should focus on: an element's line, a boundary's whole
 * block (so the AI sees what is inside it), or a relationship's line. Undefined when the key matches nothing.
 */
export function c4AiEditRange(document: C4Document, key: string | undefined): TextRange | undefined {
  if (!key) return undefined;
  const selection = c4SelectionFromKey(key);
  if (selection.kind === "relationship") return document.relationships[selection.index]?.range;
  const element = document.elements.find((item) => item.id === selection.alias);
  if (!element) return undefined;
  return element.blockOpen && element.closeRange
    ? { from: element.range.from, to: element.closeRange.to }
    : element.range;
}

export function c4SelectionFromKey(key: string): C4Selection {
  const relationship = /^rel:(\d+)$/.exec(key);
  return relationship ? { kind: "relationship", index: Number(relationship[1]) } : { kind: "element", alias: key };
}

/** The range of the first line that uses an alias as the first argument of a call: where a procedure declares it. */
export function findC4AliasLine(source: string, alias: string): TextRange | undefined {
  const call = new RegExp(`^\\s*[A-Za-z_]\\w*\\s*\\(\\s*${alias.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&")}\\s*[,)]`);
  let offset = 0;
  for (const line of source.split("\n")) {
    const text = line.replace(/\r$/, "");
    if (call.test(text) && !/^\s*!/.test(text)) return { from: offset, to: offset + text.length };
    offset += line.length + 1;
  }
  return undefined;
}

// -- What can be edited ----------------------------------------------------------------------------

const SCOPE_NOUN: Record<C4Scope, string> = {
  if: "an !if block",
  procedure: "a !procedure",
  function: "a !function",
  loop: "a loop",
};

/** Why an element or relationship can't be edited in forms, or undefined when it can. */
export function c4EditBlocker(site: C4Element | C4Relationship): string | undefined {
  if (site.scope) return `This is on line ${site.line}, inside ${SCOPE_NOUN[site.scope]}. Change the source instead.`;
  if ("macro" in site && site.macro === "RelIndex")
    return "Numbered relationships (RelIndex) can only be edited in the source.";
  return undefined;
}

/** The elements a relationship can connect, in source order: everything except boundaries and nodes. */
export function c4Connectable(document: C4Document): C4Element[] {
  return document.elements.filter((item) => !isC4Container(item));
}

/** The boundaries and nodes an element can be placed in, in source order. */
export function c4Containers(document: C4Document): C4Element[] {
  return document.elements.filter((item) => isC4Container(item) && item.blockOpen && item.closeRange && !item.scope);
}

export const C4_DIRECTION_LABELS: Record<C4Direction, string> = {
  auto: "Automatic",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  back: "Back",
  neighbor: "Neighbor",
  "back-neighbor": "Back neighbor",
};
