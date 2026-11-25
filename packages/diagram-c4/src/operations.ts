import type { TextRange } from "@plantuml-studio/language-core";
import {
  C4_MACROS,
  c4Macro,
  type C4CallSite,
  type C4Document,
  type C4Element,
  type C4Macro,
  type C4Relationship,
  type C4Scope,
} from "./model";
import { parseC4 } from "./parser";
import { c4Argument, validateC4Alias } from "./symbols";

/**
 * Source edits for C4 diagrams: pure functions from the source and the parameters of one edit to the edited
 * source and the range to select, or to a refusal with a message for the user. Every edit changes only the lines
 * it must; macros it does not know, preprocessor lines and comments are left as they are.
 */

export type C4EditResult = { ok: true; source: string; selection: TextRange } | { ok: false; message: string };

const MAX_SOURCE_LENGTH = 100_000;

const NAMES = (category: (macro: C4Macro) => boolean) => C4_MACROS.filter(category).map((macro) => macro.name);
/** The element macros a form can add and change: people, systems, containers and components, with their variants. */
export const C4_ELEMENT_MACROS: readonly string[] = NAMES((macro) =>
  ["person", "system", "container", "component"].includes(macro.category),
);
/** The boundaries and deployment nodes a form can add. */
export const C4_BOUNDARY_MACROS: readonly string[] = NAMES(
  (macro) => macro.category === "boundary" || macro.category === "node",
);
/** The relationship macros a form can edit. `RelIndex` (dynamic diagrams) can only be edited in the source. */
export const C4_RELATIONSHIP_MACROS: readonly string[] = NAMES(
  (macro) => macro.category === "relationship" && macro.name !== "RelIndex",
);

export interface C4ElementInput {
  macro: string;
  alias: string;
  label: string;
  technology?: string;
  description?: string;
  tags?: string;
  link?: string;
  sprite?: string;
  /** The alias of the boundary or node to add it to. Without it the element goes at the top level. */
  parent?: string;
}

/** A boundary or deployment node. `technology` is the node's or boundary's `$type`. */
export type C4BoundaryInput = C4ElementInput;

export interface C4RelationshipInput {
  /** `Rel` when missing. */
  macro?: string;
  from: string;
  to: string;
  label: string;
  technology?: string;
  description?: string;
  tags?: string;
  link?: string;
  sprite?: string;
}

/** What an argument edit targets: an element or boundary by alias, a relationship by its index in source order. */
export type C4Target = { kind: "element"; alias: string } | { kind: "relationship"; index: number };

export type C4Layout = "top-down" | "left-right" | "landscape";
export type C4Legend = "none" | "show" | "with-legend";
export interface C4SettingsInput {
  /** `null` removes the layout macro. */
  layout?: C4Layout | null;
  /** `show` is `SHOW_LEGEND()` before `@enduml`, `with-legend` is `LAYOUT_WITH_LEGEND()` after the includes. */
  legend?: C4Legend;
}

export type C4Direction = "auto" | "up" | "down" | "left" | "right" | "back" | "neighbor" | "back-neighbor";
export const C4_DIRECTIONS: readonly C4Direction[] = [
  "auto",
  "up",
  "down",
  "left",
  "right",
  "back",
  "neighbor",
  "back-neighbor",
];

// -- Plumbing ---------------------------------------------------------------------------------------

class Refusal extends Error {}

interface Edit {
  from: number;
  to: number;
  text: string;
}

interface Ctx {
  source: string;
  doc: C4Document;
  eol: string;
}

function context(source: string): Ctx {
  if (source.length > MAX_SOURCE_LENGTH) throw new RangeError("C4 source exceeds the 100,000 character limit");
  return { source, doc: parseC4(source), eol: source.includes("\r\n") ? "\r\n" : "\n" };
}

function attempt(body: () => C4EditResult): C4EditResult {
  try {
    return body();
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, message: error.message };
    throw error;
  }
}

function applyEdits(source: string, edits: readonly Edit[]): string {
  const ordered = [...edits].sort((a, b) => a.from - b.from || a.to - b.to);
  for (let index = 1; index < ordered.length; index += 1)
    if (ordered[index - 1]!.to > ordered[index]!.from) throw new Error("C4 edits overlap");
  return ordered.reduceRight(
    (current, edit) => `${current.slice(0, edit.from)}${edit.text}${current.slice(edit.to)}`,
    source,
  );
}

const statementRange = (site: C4CallSite): TextRange => ({ from: site.nameRange.from, to: site.range.to });

function finish(
  ctx: Ctx,
  edits: readonly Edit[],
  locate: (document: C4Document) => TextRange | undefined,
): C4EditResult {
  const source = edits.length ? applyEdits(ctx.source, edits) : ctx.source;
  const selection = locate(edits.length ? parseC4(source) : ctx.doc) ?? { from: 0, to: 0 };
  return { ok: true, source, selection };
}

const locateElement = (alias: string) => (document: C4Document) => {
  const element = document.elements.find((item) => item.id === alias);
  return element ? statementRange(element) : undefined;
};

const SCOPE_TEXT: Record<C4Scope, string> = {
  if: "an !if block",
  procedure: "a !procedure",
  function: "a !function",
  loop: "a loop",
};

function editable(site: C4CallSite, what = "it") {
  if (site.scope)
    throw new Refusal(
      `Line ${site.line} is inside ${SCOPE_TEXT[site.scope]}, so ${what} can't be edited here. Change the source instead.`,
    );
}

function declared(ctx: Ctx, alias: string): C4Element {
  const matches = ctx.doc.elements.filter((item) => item.id === alias);
  if (!matches.length)
    throw new Refusal(`“${alias}” isn't declared in this source. If it comes from an included file, edit it there.`);
  if (matches.length > 1) throw new Refusal(`“${alias}” is declared more than once, so it can't be edited here.`);
  return matches[0]!;
}

function macroOf(site: C4CallSite): C4Macro {
  return c4Macro(site.macro)!;
}

function relationshipAt(ctx: Ctx, index: number): C4Relationship {
  const relationship = ctx.doc.relationships[index];
  if (!relationship) throw new Refusal(`There is no relationship number ${index + 1} in this source.`);
  if (relationship.macro === "RelIndex")
    throw new Refusal("Numbered relationships (RelIndex) can't be edited here. Change the source instead.");
  editable(relationship, "this relationship");
  return relationship;
}

/** A boundary or node that can take contents: its `{` is on its line, and it is closed. */
function container(ctx: Ctx, alias: string): C4Element & { closeRange: TextRange } {
  const element = declared(ctx, alias);
  editable(element);
  if (!macroOf(element).block) throw new Refusal(`“${alias}” is not a boundary or deployment node.`);
  if (!element.blockOpen)
    throw new Refusal(`“${alias}” doesn't open its block with { on its own line, so nothing can be added to it.`);
  if (!element.closeRange) throw new Refusal(`“${alias}” is never closed with }. Close it first.`);
  return element as C4Element & { closeRange: TextRange };
}

/** An element or boundary that a relationship can connect. */
function endpoint(ctx: Ctx, alias: string, role: string): string {
  const value = alias.trim();
  const matches = ctx.doc.elements.filter((item) => item.id === value);
  if (!matches.length)
    throw new Refusal(`The ${role} “${value}” isn't declared in this source. Add it first, or edit the source.`);
  if (matches.some((item) => item.category === "boundary" || item.category === "node"))
    throw new Refusal(`The ${role} “${value}” is a boundary or node. Connect the elements inside it instead.`);
  return value;
}

const descendants = (document: C4Document, alias: string): Set<string> => {
  const result = new Set([alias]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const element of document.elements)
      if (element.parent && result.has(element.parent) && !result.has(element.id)) {
        result.add(element.id);
        grew = true;
      }
  }
  return result;
};

// -- Text -------------------------------------------------------------------------------------------

const FIELD: Record<string, string> = {
  alias: "The alias",
  label: "The label",
  techn: "The technology",
  type: "The type",
  descr: "The description",
  sprite: "The sprite",
  tags: "The tags",
  link: "The link",
  from: "The source",
  to: "The target",
};
const BARE_PARAMETERS = new Set(["alias", "from", "to"]);
const NAMED_PARAMETERS = new Set(["sprite", "tags", "link"]);
const BARE_VALUE = /^[\w.$-]+$/;

/**
 * The text of a quoted C4 argument. The C4 library cannot draw a label with an escaped quote (`\"`): the whole
 * picture turns into an error (spike C0), so a double quote is refused. A line break is written as `\n`.
 */
function quotedText(value: string, field: string): string {
  if (value.includes('"'))
    throw new Refusal(
      `${field} can't contain a double quote ("). The C4 library can't draw it; use a single quote (') instead.`,
    );
  const text = value.replace(/\r\n|\r|\n/g, "\\n");
  if (text.endsWith("\\")) throw new Refusal(`${field} can't end with a backslash.`);
  return text;
}

function formatValue(parameter: string, value: string): string {
  return BARE_PARAMETERS.has(parameter) ? value : `"${quotedText(value, FIELD[parameter] ?? "The value")}"`;
}

/** Parameters before the first sprite, tags or link are written by position, the rest by name. */
function positionalLimit(macro: C4Macro): number {
  const index = macro.params.findIndex((item) => NAMED_PARAMETERS.has(item.name));
  return index < 0 ? macro.params.length : index;
}

function callArguments(macro: C4Macro, fields: Record<string, string | undefined>): string[] {
  const limit = positionalLimit(macro);
  const provided = (name: string) => fields[name] !== undefined && fields[name] !== "";
  let last = -1;
  macro.params.forEach((item, index) => {
    if (index < limit && (provided(item.name) || !item.optional)) last = index;
  });
  const result: string[] = [];
  for (let index = 0; index <= last; index += 1) {
    const name = macro.params[index]!.name;
    result.push(provided(name) ? formatValue(name, fields[name]!) : '""');
  }
  macro.params.forEach((item, index) => {
    if (index >= limit && provided(item.name))
      result.push(`$${item.name}=${formatValue(item.name, fields[item.name]!)}`);
  });
  return result;
}

function statement(macro: C4Macro, fields: Record<string, string | undefined>, indent: string): string {
  return `${indent}${macro.name}(${callArguments(macro, fields).join(", ")})${macro.block ? " {" : ""}`;
}

const trimmed = (value: string | undefined) => (value === undefined ? undefined : value.trim());

// -- Where lines go ---------------------------------------------------------------------------------

function nextLineStart(source: string, end: number): number {
  let index = end;
  if (source[index] === "\r") index += 1;
  if (source[index] === "\n") index += 1;
  return index;
}

function previousLineStart(source: string, lineStart: number): number | undefined {
  if (lineStart <= 0) return undefined;
  const newline = lineStart - 1;
  return newline > 0 ? source.lastIndexOf("\n", newline - 1) + 1 : 0;
}

const lineRange = (ctx: Ctx, site: { range: TextRange }): TextRange => ({
  from: site.range.from,
  to: nextLineStart(ctx.source, site.range.to),
});

const indentOf = (ctx: Ctx, site: C4CallSite) => ctx.source.slice(site.range.from, site.nameRange.from);

/** The indentation step of the source: tabs, or the spaces a boundary's contents are indented by. */
function indentUnit(ctx: Ctx): string {
  for (const element of ctx.doc.elements) {
    const parent = element.parent ? ctx.doc.elements.find((item) => item.id === element.parent) : undefined;
    if (!parent) continue;
    const inner = indentOf(ctx, element);
    const outer = indentOf(ctx, parent);
    if (inner.length > outer.length && inner.startsWith(outer)) return inner.slice(outer.length);
  }
  const indented = ctx.source.split("\n").find((line) => /^[ \t]+\S/.test(line));
  if (indented?.startsWith("\t")) return "\t";
  return indented ? /^ +/.exec(indented)![0] : "  ";
}

function contentIndent(ctx: Ctx, parent: C4Element): string {
  const child = ctx.doc.elements.find((item) => item.parent === parent.id);
  return child ? indentOf(ctx, child) : `${indentOf(ctx, parent)}${indentUnit(ctx)}`;
}

/** The start of the `@enduml` line, or the end of the source. */
function endOffset(ctx: Ctx): number {
  const match = /^[ \t]*@enduml\b/im.exec(ctx.source);
  return match ? match.index : ctx.source.length;
}

/** Before the closing lines: `@enduml`, and a `SHOW_LEGEND()` that has to stay last. */
function endAnchor(ctx: Ctx): number {
  let probe = endOffset(ctx);
  let result = probe;
  for (;;) {
    const start = previousLineStart(ctx.source, probe);
    if (start === undefined) return result;
    const text = ctx.source.slice(start, probe).trim();
    if (/^SHOW_LEGEND\s*\(\s*\)/i.test(text)) result = start;
    else if (text) return result;
    probe = start;
  }
}

/** After the last top-level declaration; else before the first relationship; else at the end. */
function declarationAnchor(ctx: Ctx): number {
  const top = ctx.doc.elements.filter((item) => item.depth === 0 && !item.scope);
  let end = -1;
  for (const item of top) end = Math.max(end, item.closeRange?.to ?? item.range.to);
  if (end >= 0) return nextLineStart(ctx.source, end);
  const relationship = ctx.doc.relationships.find((item) => item.depth === 0 && !item.scope);
  return relationship ? relationship.range.from : endAnchor(ctx);
}

/** After the last top-level relationship; else with the closing lines. */
function relationshipAnchor(ctx: Ctx): number {
  const top = ctx.doc.relationships.filter((item) => item.depth === 0 && !item.scope);
  const last = top.at(-1);
  return last ? nextLineStart(ctx.source, last.range.to) : endAnchor(ctx);
}

function insertLines(ctx: Ctx, at: number, lines: readonly string[]): Edit {
  const { source, eol } = ctx;
  const lead = at === source.length && at > 0 && source[at - 1] !== "\n";
  return { from: at, to: at, text: lead ? `${eol}${lines.join(eol)}` : lines.map((line) => `${line}${eol}`).join("") };
}

/** Where a new element or boundary goes, and how far it is indented. */
function placement(ctx: Ctx, parent: string | undefined): { at: number; indent: string } {
  if (parent === undefined || parent === "") return { at: declarationAnchor(ctx), indent: "" };
  const owner = container(ctx, parent);
  return { at: owner.closeRange.from, indent: contentIndent(ctx, owner) };
}

// -- Adding -----------------------------------------------------------------------------------------

function addDeclaration(source: string, input: C4ElementInput, kind: "element" | "boundary"): C4EditResult {
  return attempt(() => {
    const ctx = context(source);
    const macro = c4Macro(input.macro);
    const allowed = kind === "element" ? C4_ELEMENT_MACROS : C4_BOUNDARY_MACROS;
    if (!macro || !allowed.includes(macro.name))
      throw new Refusal(
        kind === "element"
          ? `“${input.macro}” is not an element macro. Use Person, System, Container, Component or one of their variants.`
          : `“${input.macro}” is not a boundary or deployment node macro.`,
      );
    const alias = input.alias.trim();
    const problem = validateC4Alias(alias, { identities: ctx.doc.elements.map((item) => item.id) });
    if (problem) throw new Refusal(problem);
    const label = input.label.trim();
    if (!label) throw new Refusal("The label is required.");
    const technology = trimmed(input.technology);
    if (technology && !macro.params.some((item) => item.name === "techn" || item.name === "type"))
      throw new Refusal(`${macro.name} has no technology.`);
    const target = placement(ctx, input.parent);
    const text = statement(
      macro,
      {
        alias,
        label,
        techn: technology,
        type: technology,
        descr: trimmed(input.description),
        sprite: trimmed(input.sprite),
        tags: trimmed(input.tags),
        link: trimmed(input.link),
      },
      target.indent,
    );
    const lines = macro.block ? [text, `${target.indent}}`] : [text];
    return finish(ctx, [insertLines(ctx, target.at, lines)], locateElement(alias));
  });
}

/** Adds a person, system, container or component, at the top level or inside a boundary. */
export function addC4Element(source: string, input: C4ElementInput): C4EditResult {
  return addDeclaration(source, input, "element");
}

/** Adds a boundary or deployment node (with its closing `}`), at the top level or inside another one. */
export function addC4Boundary(source: string, input: C4BoundaryInput): C4EditResult {
  return addDeclaration(source, input, "boundary");
}

export function addC4Relationship(source: string, input: C4RelationshipInput): C4EditResult {
  return attempt(() => {
    const ctx = context(source);
    const macro = c4Macro(input.macro ?? "Rel");
    if (!macro || !C4_RELATIONSHIP_MACROS.includes(macro.name))
      throw new Refusal(`“${input.macro}” is not a relationship macro that can be added here.`);
    const from = endpoint(ctx, input.from, "source");
    const to = endpoint(ctx, input.to, "target");
    const technology = trimmed(input.technology);
    const at = relationshipAnchor(ctx);
    const text = statement(
      macro,
      {
        from,
        to,
        label: input.label.trim(),
        techn: technology,
        descr: trimmed(input.description),
        sprite: trimmed(input.sprite),
        tags: trimmed(input.tags),
        link: trimmed(input.link),
      },
      "",
    );
    const index = ctx.doc.relationships.filter((item) => item.range.from < at).length;
    return finish(ctx, [insertLines(ctx, at, [text])], (document) => {
      const added = document.relationships[index];
      return added ? statementRange(added) : undefined;
    });
  });
}

// -- Changing arguments -----------------------------------------------------------------------------

function separator(ctx: Ctx, site: C4CallSite): string {
  const [first, second] = site.arguments;
  const between = first && second ? ctx.source.slice(first.range.to, second.range.from) : "";
  return /^\s*,\s*$/.test(between) ? between : ", ";
}

function removeArgument(site: C4CallSite, index: number): Edit {
  const argument = site.arguments[index]!;
  const previous = site.arguments[index - 1];
  const next = site.arguments[index + 1];
  if (previous) return { from: previous.range.to, to: argument.range.to, text: "" };
  if (next) return { from: argument.range.from, to: next.range.from, text: "" };
  return { ...argument.range, text: "" };
}

/** The edits that set (or remove, with an empty value) one parameter of a call, keeping every other argument. */
function argumentEdits(
  ctx: Ctx,
  site: C4CallSite,
  macro: C4Macro,
  parameter: string,
  value: string | undefined,
): Edit[] {
  const position = macro.params.findIndex((item) => item.name === parameter);
  const declaredParameter = macro.params[position];
  if (!declaredParameter) throw new Refusal(`${macro.name} has no “${parameter}” argument.`);
  const existing = c4Argument(site, parameter);
  const field = FIELD[parameter] ?? "The value";
  if (existing?.form === "expression")
    throw new Refusal(
      `${field} on line ${site.line} is an expression (${existing.raw}), so it can't be edited in a form. Change the source instead.`,
    );
  const empty = value === undefined || value === "";
  if (empty && !declaredParameter.optional && parameter !== "label") throw new Refusal(`${field} is required.`);
  if (empty && declaredParameter.optional) {
    if (!existing) return [];
    const index = site.arguments.indexOf(existing);
    if (existing.name || index === site.arguments.length - 1) return [removeArgument(site, index)];
    return existing.value === "" ? [] : [{ ...existing.range, text: '""' }];
  }
  const text = value ?? "";
  if (existing) {
    if (existing.form === "bare" && (BARE_VALUE.test(text) || BARE_PARAMETERS.has(parameter)))
      return existing.value === text ? [] : [{ ...existing.valueRange, text }];
    if (existing.form === "bare") return [{ ...existing.valueRange, text: `"${quotedText(text, field)}"` }];
    const inner = BARE_PARAMETERS.has(parameter) ? text : quotedText(text, field);
    return existing.value === inner ? [] : [{ ...existing.valueRange, text: inner }];
  }
  const written = formatValue(parameter, text);
  const glue = separator(ctx, site);
  const positional = site.arguments.filter((item) => !item.name);
  const last = site.arguments.at(-1);
  if (position < positionalLimit(macro)) {
    const items = [...Array<string>(position - positional.length).fill('""'), written];
    const lastPositional = positional.at(-1);
    if (lastPositional)
      return [{ from: lastPositional.range.to, to: lastPositional.range.to, text: `${glue}${items.join(glue)}` }];
    const first = site.arguments[0];
    if (first) return [{ from: first.range.from, to: first.range.from, text: `${items.join(glue)}${glue}` }];
    return [{ from: site.argumentsRange.from, to: site.argumentsRange.from, text: items.join(glue) }];
  }
  const named = `$${parameter}=${written}`;
  if (last) return [{ from: last.range.to, to: last.range.to, text: `${glue}${named}` }];
  return [{ from: site.argumentsRange.from, to: site.argumentsRange.from, text: named }];
}

function resolveTarget(ctx: Ctx, target: C4Target): C4Element | C4Relationship {
  if (target.kind === "relationship") return relationshipAt(ctx, target.index);
  const element = declared(ctx, target.alias);
  editable(element);
  return element;
}

const locateTarget = (target: C4Target, site: C4CallSite) => (document: C4Document) => {
  if (target.kind === "element") return locateElement(target.alias)(document);
  const found = document.relationships[(site as C4Relationship).index];
  return found ? statementRange(found) : undefined;
};

/**
 * Sets one argument of an element, boundary or relationship, keeping the others and their quoting byte for byte.
 * An empty value removes an optional argument (a named one is removed, a positional one in the middle becomes
 * `""`). `parameter` is a library parameter name (`label`, `techn`, `type`, `descr`, `sprite`, `tags`, `link`,
 * `from`, `to`); `technology` and `description` mean whichever of those the macro has. The alias is changed by
 * `renameC4Alias`, so that every reference follows.
 */
export function updateC4Argument(
  source: string,
  target: C4Target,
  parameter: string,
  value: string | undefined,
): C4EditResult {
  return attempt(() => {
    const ctx = context(source);
    const site = resolveTarget(ctx, target);
    const macro = macroOf(site);
    const name =
      parameter === "technology"
        ? (macro.params.find((item) => item.name === "techn" || item.name === "type")?.name ?? "techn")
        : parameter === "description"
          ? "descr"
          : parameter;
    if (name === "alias")
      throw new Refusal("Rename the alias with the rename command, so that every reference follows.");
    const next =
      (name === "from" || name === "to") && macro.params.some((item) => item.name === name)
        ? endpoint(ctx, value ?? "", name === "from" ? "source" : "target")
        : value;
    return finish(ctx, argumentEdits(ctx, site, macro, name, next), locateTarget(target, site));
  });
}

// -- Changing macros --------------------------------------------------------------------------------

/**
 * Changes the macro of an element or boundary and keeps its arguments, for example `Container` to `ContainerDb`
 * or `System` to `System_Ext`. Refused when an argument would mean something else for the new macro.
 */
export function changeC4ElementMacro(source: string, alias: string, macroName: string): C4EditResult {
  return attempt(() => {
    const ctx = context(source);
    const element = declared(ctx, alias);
    editable(element);
    const next = c4Macro(macroName);
    const current = macroOf(element);
    const allowed = [...C4_ELEMENT_MACROS, ...C4_BOUNDARY_MACROS];
    if (!next || !allowed.includes(next.name) || !allowed.includes(current.name))
      throw new Refusal(`“${macroName}” is not a macro an element can be changed to.`);
    if (Boolean(next.block) !== Boolean(current.block))
      throw new Refusal(`A ${current.name} can't become a ${next.name}: one has contents and the other doesn't.`);
    const positional = element.arguments.filter((item) => !item.name);
    const mismatch = positional.find((_, index) => current.params[index]?.name !== next.params[index]?.name);
    const unknown = element.arguments.find(
      (item) => item.name && !next.params.some((param) => param.name === item.name),
    );
    if (mismatch || unknown)
      throw new Refusal(
        `${next.name} reads its arguments differently from ${current.name}, so “${alias}” can't be changed to it without changing the arguments.`,
      );
    const edits =
      element.macro === next.name && ctx.source.slice(element.nameRange.from, element.nameRange.to) === next.name
        ? []
        : [{ ...element.nameRange, text: next.name }];
    return finish(ctx, edits, locateElement(alias));
  });
}

/** Changes the macro of a relationship, for example `Rel` to `BiRel` or `Rel_R`. */
export function setC4RelationshipMacro(source: string, index: number, macroName: string): C4EditResult {
  return attempt(() => {
    const ctx = context(source);
    const relationship = relationshipAt(ctx, index);
    const next = c4Macro(macroName);
    if (!next || !C4_RELATIONSHIP_MACROS.includes(next.name))
      throw new Refusal(`“${macroName}” is not a relationship macro.`);
    const edits =
      ctx.source.slice(relationship.nameRange.from, relationship.nameRange.to) === next.name
        ? []
        : [{ ...relationship.nameRange, text: next.name }];
    return finish(ctx, edits, locateTarget({ kind: "relationship", index }, relationship));
  });
}

const DIRECTION_SUFFIX: Record<Exclude<C4Direction, "auto">, [string, string]> = {
  up: ["U", "Up"],
  down: ["D", "Down"],
  left: ["L", "Left"],
  right: ["R", "Right"],
  back: ["Back", "Back"],
  neighbor: ["Neighbor", "Neighbor"],
  "back-neighbor": ["Back_Neighbor", "Back_Neighbor"],
};

/** The macro that draws a relationship in a direction: `Rel_R` for `Rel` and right, `BiRel_Up` for `BiRel_U` and up. */
export function c4DirectionMacro(macroName: string, direction: C4Direction): string | undefined {
  const parts = /^(BiRel|Rel)(?:_(.+))?$/.exec(macroName);
  if (!parts) return undefined;
  if (direction === "auto") return parts[1];
  const long = ["Up", "Down", "Left", "Right"].includes(parts[2] ?? "");
  const suffix = DIRECTION_SUFFIX[direction][long ? 1 : 0];
  const name = `${parts[1]}_${suffix}`;
  return c4Macro(name) ? name : undefined;
}

/** The direction a relationship macro is written in. */
export function c4MacroDirection(macroName: string): C4Direction | undefined {
  const suffix = /^(?:BiRel|Rel)(?:_(.+))?$/.exec(macroName)?.[1];
  if (suffix === undefined) return macroName === "Rel" || macroName === "BiRel" ? "auto" : undefined;
  for (const [direction, names] of Object.entries(DIRECTION_SUFFIX))
    if (names.includes(suffix)) return direction as C4Direction;
  return undefined;
}

/**
 * Changes a relationship's direction macro (`Rel` to `Rel_R`), keeping `Rel` or `BiRel` and the arguments. This
 * is the macro in the source: the engine stores `Rel_U` and `Rel_L` the other way round, but the source is what is
 * edited here, never the drawn order.
 */
export function setC4RelationshipDirection(source: string, index: number, direction: C4Direction): C4EditResult {
  const parsed = parseC4(source).relationships[index];
  if (!parsed) return { ok: false, message: `There is no relationship number ${index + 1} in this source.` };
  const macro = c4DirectionMacro(parsed.macro, direction);
  if (!macro) return { ok: false, message: `${parsed.macro} has no ${direction} direction.` };
  return setC4RelationshipMacro(source, index, macro);
}

/** Swaps the two ends of a relationship in the source (`Rel(a, b)` becomes `Rel(b, a)`), keeping the macro. */
export function reverseC4Relationship(source: string, index: number): C4EditResult {
  return attempt(() => {
    const ctx = context(source);
    const relationship = relationshipAt(ctx, index);
    const from = c4Argument(relationship, "from");
    const to = c4Argument(relationship, "to");
    if (!from || !to) throw new Refusal("This relationship doesn't have both ends written, so it can't be reversed.");
    if (from.form === "expression" || to.form === "expression")
      throw new Refusal(
        "An end of this relationship is an expression, so it can't be reversed here. Change the source instead.",
      );
    const edits =
      from.value === to.value
        ? []
        : [
            { ...from.valueRange, text: to.value },
            { ...to.valueRange, text: from.value },
          ];
    return finish(ctx, edits, locateTarget({ kind: "relationship", index }, relationship));
  });
}

// -- Removing ---------------------------------------------------------------------------------------

function mergeRanges(ranges: readonly TextRange[]): TextRange[] {
  const result: TextRange[] = [];
  for (const range of [...ranges].sort((a, b) => a.from - b.from)) {
    const last = result.at(-1);
    if (last && range.from <= last.to) last.to = Math.max(last.to, range.to);
    else result.push({ ...range });
  }
  return result;
}

function removal(ctx: Ctx, ranges: readonly TextRange[]): C4EditResult {
  const merged = mergeRanges(ranges);
  const at = merged[0]?.from ?? 0;
  return finish(
    ctx,
    merged.map((range) => ({ ...range, text: "" })),
    () => ({ from: at, to: at }),
  );
}

/** The lines of an element, or of a boundary with everything in it. */
function blockRange(ctx: Ctx, element: C4Element): TextRange {
  if (!macroOf(element).block) return lineRange(ctx, element);
  if (!element.blockOpen || !element.closeRange)
    throw new Refusal(
      `“${element.id}” is not closed with } on a line of its own, so it can't be moved or removed as a block.`,
    );
  return { from: element.range.from, to: nextLineStart(ctx.source, element.closeRange.to) };
}

export interface C4RemoveOptions {
  /** What happens to the relationships and layout hints of the removed element. Default: `remove`. */
  relationships?: "remove" | "keep";
  /** For a boundary or node: `keep` removes its two lines only, `remove` also its contents. Default: `keep`. */
  contents?: "keep" | "remove";
}

/**
 * Removes an element, boundary or node. Its relationships go with it unless `relationships` is `keep`; layout
 * hints (`Lay_*`) that name it always go, since they would only draw a stray element.
 */
export function removeC4Element(source: string, alias: string, options: C4RemoveOptions = {}): C4EditResult {
  return attempt(() => {
    const ctx = context(source);
    const element = declared(ctx, alias);
    editable(element);
    const block = macroOf(element).block;
    const withContents = block && options.contents === "remove";
    const gone = withContents ? descendants(ctx.doc, alias) : new Set([alias]);
    const ranges: TextRange[] = [];
    if (block) {
      const whole = blockRange(ctx, element);
      if (withContents) ranges.push(whole);
      else ranges.push(lineRange(ctx, element), lineRange(ctx, { range: element.closeRange! }));
    } else ranges.push(lineRange(ctx, element));
    const references: C4CallSite[] = [
      ...(options.relationships === "keep"
        ? []
        : ctx.doc.relationships.filter((item) => gone.has(item.from) || gone.has(item.to))),
      ...ctx.doc.settings.hints.filter((item) => gone.has(item.from) || gone.has(item.to)),
    ];
    for (const reference of references) {
      editable(reference, `the line that mentions “${alias}”`);
      ranges.push(lineRange(ctx, reference));
    }
    return removal(ctx, ranges);
  });
}

export function removeC4Relationship(source: string, index: number): C4EditResult {
  return attempt(() => {
    const ctx = context(source);
    return removal(ctx, [lineRange(ctx, relationshipAt(ctx, index))]);
  });
}

// -- Moving -----------------------------------------------------------------------------------------

/** Writes lines again with another indentation, keeping what is indented further. */
function reindent(text: string, from: string, to: string): string {
  return text
    .split(/(?<=\n)/)
    .map((line) => {
      if (!line.trim()) return line;
      if (line.startsWith(from)) return `${to}${line.slice(from.length)}`;
      return line;
    })
    .join("");
}

/**
 * Moves an element (with its contents, for a boundary) into a boundary or node, or out to the top level when
 * `parent` is missing. A relationship or layout hint of the moved aliases that sits above the new place moves with
 * it, so that an alias is not used before it is declared.
 */
export function moveC4Element(source: string, alias: string, parent: string | undefined): C4EditResult {
  return attempt(() => {
    const ctx = context(source);
    const element = declared(ctx, alias);
    editable(element);
    if ((element.parent ?? undefined) === (parent || undefined)) return finish(ctx, [], locateElement(alias));
    const block = blockRange(ctx, element);
    const moved = descendants(ctx.doc, alias);
    if (parent && moved.has(parent))
      throw new Refusal(`“${alias}” can't be moved into itself or into something inside it.`);
    const target = placement(ctx, parent || undefined);
    if (target.at > block.from && target.at < block.to) throw new Refusal(`“${alias}” can't be moved into itself.`);
    const references = [...ctx.doc.relationships, ...ctx.doc.settings.hints].filter(
      (item) =>
        item.depth === 0 &&
        !item.scope &&
        (moved.has(item.from) || moved.has(item.to)) &&
        item.range.from < target.at &&
        !(item.range.from >= block.from && item.range.from < block.to),
    );
    const own = indentOf(ctx, element);
    const text = [
      reindent(ctx.source.slice(block.from, block.to), own, target.indent),
      ...references
        .sort((a, b) => a.range.from - b.range.from)
        .map((item) =>
          reindent(
            ctx.source.slice(item.range.from, nextLineStart(ctx.source, item.range.to)),
            indentOf(ctx, item),
            target.indent,
          ),
        ),
    ].join("");
    const lines = text.endsWith("\n") ? text : `${text}${ctx.eol}`;
    const edits: Edit[] = [
      { ...block, text: "" },
      ...references.map((item) => ({ ...lineRange(ctx, item), text: "" })),
      {
        from: target.at,
        to: target.at,
        text:
          target.at === ctx.source.length && !ctx.source.endsWith("\n")
            ? `${ctx.eol}${lines.replace(/\r?\n$/, "")}`
            : lines,
      },
    ];
    return finish(ctx, edits, locateElement(alias));
  });
}

/** Moves an element (with its contents) before or after another one that has the same parent. */
export function reorderC4Element(
  source: string,
  alias: string,
  targetAlias: string,
  position: "before" | "after",
): C4EditResult {
  return attempt(() => {
    const ctx = context(source);
    const element = declared(ctx, alias);
    const sibling = declared(ctx, targetAlias);
    editable(element);
    editable(sibling);
    if (alias === targetAlias) return finish(ctx, [], locateElement(alias));
    if (element.parent !== sibling.parent)
      throw new Refusal(
        `“${alias}” and “${targetAlias}” are not in the same boundary, so one can't be put next to the other. Move it first.`,
      );
    const block = blockRange(ctx, element);
    const other = blockRange(ctx, sibling);
    const at = position === "before" ? other.from : other.to;
    if (at === block.from || at === block.to) return finish(ctx, [], locateElement(alias));
    const text = ctx.source.slice(block.from, block.to);
    const lines = text.endsWith("\n") ? text : `${text}${ctx.eol}`;
    const trailing = at === ctx.source.length && !ctx.source.endsWith("\n");
    return finish(
      ctx,
      [
        { ...block, text: "" },
        { from: at, to: at, text: trailing ? `${ctx.eol}${lines.replace(/\r?\n$/, "")}` : lines },
      ],
      locateElement(alias),
    );
  });
}

// -- Renaming ---------------------------------------------------------------------------------------

/**
 * Renames an alias in its declaration and in every relationship and layout hint that names it. Refused when the
 * new alias is not valid or already used (see `validateC4Alias`), or when the declaration is not in this source.
 */
export function renameC4Alias(source: string, alias: string, next: string): C4EditResult {
  return attempt(() => {
    const ctx = context(source);
    const element = declared(ctx, alias);
    editable(element);
    const name = next.trim();
    const problem = validateC4Alias(name, {
      identities: ctx.doc.elements.map((item) => item.id),
      currentIdentity: alias,
    });
    if (problem) throw new Refusal(problem);
    if (name === alias) return finish(ctx, [], locateElement(alias));
    const edits: Edit[] = [];
    const rename = (site: C4CallSite, parameter: string) => {
      const argument = c4Argument(site, parameter);
      if (argument?.value !== alias) return;
      if (argument.form === "expression")
        throw new Refusal(
          `Line ${site.line} uses “${alias}” inside an expression, so it can't be renamed here. Change the source instead.`,
        );
      edits.push({ ...argument.valueRange, text: name });
    };
    rename(element, "alias");
    for (const relationship of ctx.doc.relationships) {
      rename(relationship, "from");
      rename(relationship, "to");
    }
    for (const hint of ctx.doc.settings.hints) {
      rename(hint, "from");
      rename(hint, "to");
    }
    return finish(ctx, edits, locateElement(name));
  });
}

// -- Settings ---------------------------------------------------------------------------------------

const LAYOUT_MACROS: Record<C4Layout, string> = {
  "top-down": "LAYOUT_TOP_DOWN",
  "left-right": "LAYOUT_LEFT_RIGHT",
  landscape: "LAYOUT_LANDSCAPE",
};

/** After the last `!include` or `!theme` that comes before the first element; else after `@startuml`; else the top. */
function headerAnchor(ctx: Ctx): number {
  const firstCall = Math.min(
    ...[...ctx.doc.elements, ...ctx.doc.relationships, ...ctx.doc.settings.hints].map((item) => item.range.from),
    ctx.source.length,
  );
  let depth = 0;
  let anchor: number | undefined;
  let offset = 0;
  for (const line of ctx.source.split("\n")) {
    const start = offset;
    offset += line.length + 1;
    if (start >= firstCall) break;
    const text = line.trim();
    if (/^!\s*(?:if|ifdef|ifndef|procedure|function|unquoted|while|foreach|definelong|startsub)\b/i.test(text))
      depth += 1;
    else if (/^!\s*end/i.test(text)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && /^!\s*(?:include\w*|theme)\b/i.test(text)) anchor = Math.min(offset, ctx.source.length);
  }
  if (anchor !== undefined) return anchor;
  const start = /^[ \t]*@startuml\b.*$/m.exec(ctx.source);
  return start
    ? Math.min(nextLineStart(ctx.source, start.index + start[0].replace(/\r$/, "").length), ctx.source.length)
    : 0;
}

/** Sets the layout macro (`LAYOUT_LEFT_RIGHT()` and so on) and the legend (`SHOW_LEGEND()`, `LAYOUT_WITH_LEGEND()`). */
export function setC4Settings(source: string, input: C4SettingsInput): C4EditResult {
  return attempt(() => {
    const ctx = context(source);
    const { layout, legend } = ctx.doc.settings;
    const edits: Edit[] = [];
    const header: string[] = [];
    const tail: string[] = [];
    const drop = (site: C4CallSite) => {
      editable(site, "this setting");
      edits.push({ ...lineRange(ctx, site), text: "" });
    };
    if (input.layout === null) layout.forEach(drop);
    else if (input.layout !== undefined) {
      const macro = LAYOUT_MACROS[input.layout];
      const [first, ...others] = layout;
      if (!first) header.push(`${macro}()`);
      else {
        if (first.macro !== macro) {
          editable(first, "this setting");
          edits.push({ ...first.nameRange, text: macro });
        }
        others.forEach(drop);
      }
    }
    if (input.legend !== undefined) {
      const together = legend.filter((item) => item.macro === "LAYOUT_WITH_LEGEND");
      const shown = legend.filter((item) => item.macro === "SHOW_LEGEND");
      if (input.legend === "none") legend.forEach(drop);
      else if (input.legend === "show") {
        together.forEach(drop);
        if (!shown.length) tail.push("SHOW_LEGEND()");
      } else {
        shown.forEach(drop);
        if (!together.length) header.push("LAYOUT_WITH_LEGEND()");
      }
    }
    const headerAt = headerAnchor(ctx);
    const tailAt = endOffset(ctx);
    if (header.length && tail.length && headerAt === tailAt)
      edits.push(insertLines(ctx, headerAt, [...header, ...tail]));
    else {
      if (header.length) edits.push(insertLines(ctx, headerAt, header));
      if (tail.length) edits.push(insertLines(ctx, tailAt, tail));
    }
    return finish(ctx, edits, (document) => {
      const changed = input.layout !== undefined ? document.settings.layout[0] : document.settings.legend[0];
      return changed ? statementRange(changed) : undefined;
    });
  });
}
