import {
  c4Argument,
  c4Macro,
  c4MacroDirection,
  parseC4,
  type C4Document,
  type C4Element,
  type C4Relationship,
} from "@plantuml-studio/diagram-c4";

/**
 * Semantic review of two C4 sources. The two documents are compared by alias, not by line: an element is the
 * same element when its alias is the same (or when it was renamed, see `detectRenames`), and a relationship is
 * matched by its two ends and label, never by its position in the source. Every difference becomes a
 * `C4Change` that knows which lines it touches, and `describeC4Hunk` then describes one contiguous source change
 * (a hunk of the line diff) from the changes that touch it.
 */

export type C4ReviewTarget =
  | { kind: "c4-element"; id: string; label: string; alias: string }
  | { kind: "c4-relationship"; from: string; to: string; label?: string };

export interface C4HunkDescription {
  title: string;
  detail: string;
  confidence: "confirmed" | "probable" | "unclassified";
  leftTargets: C4ReviewTarget[];
  rightTargets: C4ReviewTarget[];
}

type Noun = string;

interface C4Change {
  verb: "added" | "removed" | "changed";
  noun: Noun;
  title: string;
  detail: string;
  /** 0-based lines, in the left and in the right source. */
  leftLines: Set<number>;
  rightLines: Set<number>;
  /** The change sits inside an `!if`, a procedure or a loop. */
  scoped: boolean;
  leftTargets: C4ReviewTarget[];
  rightTargets: C4ReviewTarget[];
}

export interface C4ReviewModel {
  changes: C4Change[];
  /** Lines that are C4 declarations (calls, closing braces, includes) in each source. */
  leftRecognized: Set<number>;
  rightRecognized: Set<number>;
  leftLines: string[];
  rightLines: string[];
  /** How many hunks of a change that spans several have been described so far. */
  parts: Map<C4Change, number>;
}

/** Larger documents get the line review: the matching below is quadratic in the worst case. */
const MAX_ITEMS = 4000;
const MAX_LISTED = 8;
const C4_INCLUDE_LINE = /^\s*!\s*include\w*\s+<C4\/([\w.]+)>\s*$/i;

const CATEGORY_NOUN: Record<C4Element["category"], string> = {
  person: "person",
  system: "system",
  container: "container",
  component: "component",
  boundary: "boundary",
  node: "deployment node",
};

const code = (value: string) => `\`${value}\``;
const quote = (value: string) => `"${value}"`;
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : noun.endsWith("s") ? "" : "s"}`;

function field(site: C4Element | C4Relationship, parameter: string): string | undefined {
  const value = c4Argument(site, parameter)?.value;
  return value === undefined || value === "" ? undefined : value;
}

function describeValue(name: string, before: string | undefined, after: string | undefined): string | undefined {
  if (before === after) return undefined;
  if (before === undefined) return `${name} set to ${quote(after!)}`;
  if (after === undefined) return `${name} removed (was ${quote(before)})`;
  return `${name} ${quote(before)} → ${quote(after)}`;
}

function describeEnd(element: C4Element): string {
  const noun = CATEGORY_NOUN[element.category];
  return `${noun[0]!.toUpperCase()}${noun.slice(1)} ${code(element.id)}`;
}

/** The 0-based lines of a call. `block` adds the closing `}` of a boundary or node that is added or removed whole. */
function lineSet(site: { line: number; closeLine?: number } | undefined, block = false): Set<number> {
  const lines = new Set<number>();
  if (!site) return lines;
  lines.add(site.line - 1);
  if (block && site.closeLine) lines.add(site.closeLine - 1);
  return lines;
}

const elementTarget = (element: C4Element): C4ReviewTarget => ({
  kind: "c4-element",
  id: element.id,
  label: element.label,
  alias: element.id,
});
const relationshipTarget = (relationship: C4Relationship): C4ReviewTarget => ({
  kind: "c4-relationship",
  from: relationship.from,
  to: relationship.to,
  ...(relationship.label ? { label: relationship.label } : {}),
});

// -- Elements ------------------------------------------------------------------------------------------------------

/** Keys the items of one source by alias. A repeated alias (inside `!if` branches, say) gets a numbered key. */
function keyElements(elements: readonly C4Element[]) {
  const seen = new Map<string, number>();
  const keyed = new Map<string, C4Element>();
  const duplicated = new Set<string>();
  for (const element of elements) {
    const count = seen.get(element.id) ?? 0;
    seen.set(element.id, count + 1);
    if (count) duplicated.add(element.id);
    keyed.set(count ? `${element.id}#${count + 1}` : element.id, element);
  }
  return { keyed, duplicated };
}

function relationshipsOf(document: C4Document, alias: string) {
  return document.relationships.filter((item) => item.from === alias || item.to === alias);
}

function relationshipSignature(relationship: C4Relationship, from: string, to: string) {
  return `${from}\u0000${to}\u0000${relationship.label}`;
}

/**
 * Renamed aliases, old alias to new. An alias that disappeared and an alias that appeared are the same element
 * only when the pairing is unique and either the macro and label are unchanged and no relationship contradicts
 * it, or every relationship of the old alias reappears, unchanged, on the new one. Anything else stays a removal
 * plus an addition.
 */
function detectRenames(
  removed: readonly C4Element[],
  added: readonly C4Element[],
  left: C4Document,
  right: C4Document,
): Map<string, string> {
  const renames = new Map<string, string>();
  const takenAdded = new Set<string>();
  const sameLabel = (before: C4Element, after: C4Element) =>
    before.macro === after.macro && before.label === after.label && before.category === after.category;
  const candidates = new Map<string, C4Element>();
  for (const before of removed) {
    const matches = added.filter((after) => sameLabel(before, after));
    const reciprocal = matches.length === 1 && removed.filter((other) => sameLabel(other, matches[0]!)).length === 1;
    if (reciprocal) candidates.set(before.id, matches[0]!);
  }
  // Does every relationship of the old alias reappear on the new one, once all other candidates are renamed?
  const follows = (before: C4Element, after: C4Element, map: ReadonlyMap<string, string>, strict: boolean) => {
    const mapEnd = (alias: string) => (alias === before.id ? after.id : (map.get(alias) ?? alias));
    const oldOnes = relationshipsOf(left, before.id);
    const newOnes = relationshipsOf(right, after.id);
    if (!oldOnes.length && !newOnes.length) return !strict;
    const wanted = new Map<string, number>();
    for (const item of oldOnes) {
      const signature = relationshipSignature(item, mapEnd(item.from), mapEnd(item.to));
      wanted.set(signature, (wanted.get(signature) ?? 0) + 1);
    }
    const have = new Map<string, number>();
    for (const item of newOnes) {
      const signature = relationshipSignature(item, item.from, item.to);
      have.set(signature, (have.get(signature) ?? 0) + 1);
    }
    if (strict) {
      if (wanted.size !== have.size) return false;
      return [...wanted].every(([signature, count]) => have.get(signature) === count);
    }
    // A label match only needs the relationships not to contradict it: some of them follow, or there are none.
    return !oldOnes.length || [...wanted.keys()].some((signature) => have.has(signature));
  };
  const tentative = new Map([...candidates].map(([from, element]) => [from, element.id]));
  for (const [from, after] of candidates) {
    const before = removed.find((item) => item.id === from)!;
    if (follows(before, after, tentative, false)) {
      renames.set(from, after.id);
      takenAdded.add(after.id);
    }
  }
  for (const before of removed) {
    if (renames.has(before.id) || !relationshipsOf(left, before.id).length) continue;
    const matches = added.filter(
      (after) =>
        !takenAdded.has(after.id) && after.category === before.category && follows(before, after, renames, true),
    );
    if (matches.length !== 1) continue;
    const rivals = removed.filter(
      (other) =>
        !renames.has(other.id) &&
        relationshipsOf(left, other.id).length &&
        other.category === matches[0]!.category &&
        follows(other, matches[0]!, renames, true),
    );
    if (rivals.length !== 1) continue;
    renames.set(before.id, matches[0]!.id);
    takenAdded.add(matches[0]!.id);
  }
  return renames;
}

function elementFieldChanges(before: C4Element, after: C4Element, mapAlias: (alias: string) => string): string[] {
  const changes: string[] = [];
  if (before.macro !== after.macro) changes.push(`macro ${before.macro} → ${after.macro}`);
  const labelChange = describeValue("label", before.label, after.label);
  if (labelChange) changes.push(labelChange);
  const techName = c4Macro(after.macro)?.params.some((item) => item.name === "techn") ? "technology" : "type";
  for (const [name, left, right] of [
    [techName, before.technology, after.technology],
    ["description", before.description, after.description],
    ["tags", field(before, "tags"), field(after, "tags")],
    ["link", field(before, "link"), field(after, "link")],
    ["sprite", field(before, "sprite"), field(after, "sprite")],
  ] as const) {
    const change = describeValue(name, left, right);
    if (change) changes.push(change);
  }
  const beforeParent = before.parent === undefined ? undefined : mapAlias(before.parent);
  if (beforeParent !== after.parent) {
    if (beforeParent && after.parent) changes.push(`moved from ${code(beforeParent)} into ${code(after.parent)}`);
    else if (after.parent) changes.push(`moved into ${code(after.parent)}`);
    else changes.push(`moved out of ${code(beforeParent!)}`);
  }
  return changes;
}

// -- Relationships -------------------------------------------------------------------------------------------------

interface MappedRelationship {
  item: C4Relationship;
  from: string;
  to: string;
}

type Match =
  { left: MappedRelationship; right: MappedRelationship; how: "same" | "reversed" | "repointed" } | undefined;

function matchRelationships(left: MappedRelationship[], right: MappedRelationship[]) {
  const matches: NonNullable<Match>[] = [];
  const takenLeft = new Set<MappedRelationship>();
  const takenRight = new Set<MappedRelationship>();
  const take = (a: MappedRelationship, b: MappedRelationship, how: NonNullable<Match>["how"]) => {
    takenLeft.add(a);
    takenRight.add(b);
    matches.push({ left: a, right: b, how });
  };
  const open = (items: MappedRelationship[], taken: Set<MappedRelationship>) =>
    items.filter((item) => !taken.has(item));
  // Same two ends: identical first, then the same label, then by order among what is left of the pair.
  const samePair = (a: MappedRelationship, b: MappedRelationship) => a.from === b.from && a.to === b.to;
  for (const accept of [
    (a: MappedRelationship, b: MappedRelationship) =>
      a.item.label === b.item.label &&
      a.item.macro === b.item.macro &&
      a.item.technology === b.item.technology &&
      field(a.item, "descr") === field(b.item, "descr"),
    (a: MappedRelationship, b: MappedRelationship) => a.item.label === b.item.label,
    () => true,
  ]) {
    for (const a of open(left, takenLeft)) {
      const b = open(right, takenRight).find((candidate) => samePair(a, candidate) && accept(a, candidate));
      if (b) take(a, b, "same");
    }
  }
  const unique = (how: "reversed" | "repointed", fit: (a: MappedRelationship, b: MappedRelationship) => boolean) => {
    const leftOpen = open(left, takenLeft);
    const rightOpen = open(right, takenRight);
    const fits = leftOpen.map((a) => rightOpen.filter((b) => fit(a, b)));
    leftOpen.forEach((a, index) => {
      const candidates = fits[index]!;
      if (candidates.length !== 1) return;
      const b = candidates[0]!;
      if (leftOpen.filter((other) => fit(other, b)).length === 1) take(a, b, how);
    });
  };
  unique("reversed", (a, b) => a.from !== a.to && a.from === b.to && a.to === b.from && a.item.label === b.item.label);
  unique(
    "repointed",
    (a, b) => a.item.label === b.item.label && Number(a.from === b.from) + Number(a.to === b.to) === 1,
  );
  return { matches, removed: open(left, takenLeft), added: open(right, takenRight) };
}

function relationshipFieldChanges(before: C4Relationship, after: C4Relationship): string[] {
  const changes: string[] = [];
  if (before.macro !== after.macro) {
    const baseOf = (macro: string) => (macro.startsWith("BiRel") ? "BiRel" : macro.startsWith("Rel") ? "Rel" : macro);
    const directionBefore = c4MacroDirection(before.macro);
    const directionAfter = c4MacroDirection(after.macro);
    if (baseOf(before.macro) === baseOf(after.macro) && directionBefore && directionAfter)
      changes.push(`direction ${before.macro} → ${after.macro}`);
    else changes.push(`macro ${before.macro} → ${after.macro}`);
  }
  for (const [name, left, right] of [
    ["label", before.label || undefined, after.label || undefined],
    ["technology", before.technology, after.technology],
    ["description", field(before, "descr"), field(after, "descr")],
    ["tags", field(before, "tags"), field(after, "tags")],
    ["link", field(before, "link"), field(after, "link")],
    ["sprite", field(before, "sprite"), field(after, "sprite")],
  ] as const) {
    const change = describeValue(name, left, right);
    if (change) changes.push(change);
  }
  return changes;
}

const arrow = (from: string, to: string) => code(`${from} → ${to}`);
const withLabel = (text: string, label: string) => (label ? `${text} “${label}”` : text);

// -- The whole document --------------------------------------------------------------------------------------------

function includesOf(lines: readonly string[]) {
  const found: { name: string; line: number }[] = [];
  lines.forEach((text, line) => {
    const name = C4_INCLUDE_LINE.exec(text)?.[1];
    if (name) found.push({ name, line });
  });
  return found;
}

/** The change set between two C4 sources, or `undefined` when either side holds nothing a C4 review can use. */
export function buildC4Review(leftSource: string, rightSource: string): C4ReviewModel | undefined {
  let left: C4Document;
  let right: C4Document;
  try {
    left = parseC4(leftSource);
    right = parseC4(rightSource);
  } catch {
    return undefined;
  }
  const usable = (document: C4Document) => document.elements.length + document.relationships.length > 0;
  if (!usable(left) || !usable(right)) return undefined;
  if (
    left.elements.length + left.relationships.length > MAX_ITEMS ||
    right.elements.length + right.relationships.length > MAX_ITEMS
  )
    return undefined;
  const leftLines = leftSource.split("\n");
  const rightLines = rightSource.split("\n");
  const changes: C4Change[] = [];
  const leftRecognized = new Set<number>();
  const rightRecognized = new Set<number>();
  const recognize = (document: C4Document, into: Set<number>, lines: readonly string[]) => {
    for (const item of [
      ...document.elements,
      ...document.relationships,
      ...document.settings.layout,
      ...document.settings.legend,
      ...document.settings.hints,
      ...document.settings.tags,
    ]) {
      into.add(item.line - 1);
      if ("closeLine" in item && item.closeLine) into.add(item.closeLine - 1);
    }
    for (const include of includesOf(lines)) into.add(include.line);
  };
  recognize(left, leftRecognized, leftLines);
  recognize(right, rightRecognized, rightLines);

  const leftKeyed = keyElements(left.elements);
  const rightKeyed = keyElements(right.elements);
  const removed = [...leftKeyed.keyed].filter(([key]) => !rightKeyed.keyed.has(key)).map(([, item]) => item);
  const added = [...rightKeyed.keyed].filter(([key]) => !leftKeyed.keyed.has(key)).map(([, item]) => item);
  const renames = detectRenames(
    removed.filter((item) => !leftKeyed.duplicated.has(item.id)),
    added.filter((item) => !rightKeyed.duplicated.has(item.id)),
    left,
    right,
  );
  const mapAlias = (alias: string) => renames.get(alias) ?? alias;
  const renamedNew = new Set(renames.values());
  const scoped = (...items: ({ scope?: string } | undefined)[]) => items.some((item) => Boolean(item?.scope));
  const renameLines = new Map<string, { left: Set<number>; right: Set<number> }>();
  const renameFields = new Map<string, string[]>();
  for (const from of renames.keys()) renameLines.set(from, { left: new Set(), right: new Set() });

  // Elements, boundaries and nodes.
  for (const [key, before] of leftKeyed.keyed) {
    const renamedTo = renames.get(before.id);
    const after = renamedTo ? rightKeyed.keyed.get(renamedTo) : rightKeyed.keyed.get(key);
    if (!after) continue;
    const fields = elementFieldChanges(before, after, mapAlias);
    const noun = CATEGORY_NOUN[after.category];
    if (renamedTo) {
      const lines = renameLines.get(before.id)!;
      lineSet(before).forEach((line) => lines.left.add(line));
      lineSet(after).forEach((line) => lines.right.add(line));
      renameFields.set(before.id, fields);
      continue;
    }
    if (!fields.length) continue;
    const only = fields.length === 1 ? fields[0]! : undefined;
    const title = only?.startsWith("moved")
      ? `Move ${code(after.id)} ${only.replace(/^moved /, "")}`
      : only?.startsWith("macro")
        ? `Change ${code(after.id)} from ${before.macro} to ${after.macro}`
        : `Change ${noun} ${code(after.id)}: ${fields.map((item) => item.split(" ")[0]).join(", ")}`;
    changes.push({
      verb: "changed",
      noun,
      title,
      detail: `${fields.join("; ")}.`,
      leftLines: lineSet(before),
      rightLines: lineSet(after),
      scoped: scoped(before, after),
      leftTargets: [elementTarget(before)],
      rightTargets: [elementTarget(after)],
    });
  }
  for (const before of removed) {
    if (renames.has(before.id)) continue;
    const noun = CATEGORY_NOUN[before.category];
    changes.push({
      verb: "removed",
      noun,
      title: `Remove ${noun} ${code(before.id)}`,
      detail: `${describeEnd(before)} “${before.label}” (${before.macro}) is no longer declared.`,
      leftLines: lineSet(before, true),
      rightLines: new Set(),
      scoped: scoped(before),
      leftTargets: [elementTarget(before)],
      rightTargets: [],
    });
  }
  for (const after of added) {
    if (renamedNew.has(after.id)) continue;
    const noun = CATEGORY_NOUN[after.category];
    changes.push({
      verb: "added",
      noun,
      title: `Add ${noun} ${code(after.id)}`,
      detail: `${describeEnd(after)} “${after.label}” (${after.macro})${after.parent ? ` inside ${code(after.parent)}` : ""} is declared.`,
      leftLines: new Set(),
      rightLines: lineSet(after, true),
      scoped: scoped(after),
      leftTargets: [],
      rightTargets: [elementTarget(after)],
    });
  }

  // Relationships, with the ends of the left side read through the renames.
  const mapped = (document: C4Document, through: (alias: string) => string): MappedRelationship[] =>
    document.relationships.map((item) => ({ item, from: through(item.from), to: through(item.to) }));
  const matching = matchRelationships(
    mapped(left, mapAlias),
    mapped(right, (alias) => alias),
  );
  for (const { left: a, right: b, how } of matching.matches) {
    const before = a.item;
    const after = b.item;
    const followedRename = how === "same" && (before.from !== after.from || before.to !== after.to);
    if (followedRename) {
      for (const alias of [before.from, before.to]) {
        const lines = renameLines.get(alias);
        if (!lines) continue;
        lines.left.add(before.line - 1);
        lines.right.add(after.line - 1);
      }
    }
    const fields = relationshipFieldChanges(before, after);
    const unchanged = !fields.length && how === "same";
    if (unchanged) continue;
    const title =
      how === "reversed"
        ? `Reverse relationship ${arrow(before.from, before.to)}`
        : how === "repointed"
          ? `Re-point ${arrow(before.from, before.to)} to ${arrow(after.from, after.to)}`
          : `Change relationship ${arrow(after.from, after.to)}: ${fields.map((item) => item.split(" ")[0]).join(", ")}`;
    const moved =
      how === "reversed"
        ? [`${arrow(before.from, before.to)} is now ${arrow(after.from, after.to)}`]
        : how === "repointed"
          ? [`${arrow(before.from, before.to)} now ${arrow(after.from, after.to)}`]
          : [];
    changes.push({
      verb: "changed",
      noun: "relationship",
      title,
      detail: `${[...moved, ...fields].join("; ")}.`,
      leftLines: lineSet(before),
      rightLines: lineSet(after),
      scoped: scoped(before, after),
      leftTargets: [relationshipTarget(before)],
      rightTargets: [relationshipTarget(after)],
    });
  }
  for (const gone of matching.removed) {
    const before = gone.item;
    changes.push({
      verb: "removed",
      noun: "relationship",
      title: `Remove relationship ${arrow(before.from, before.to)}`,
      detail: `${withLabel(`${before.macro} ${arrow(before.from, before.to)}`, before.label)} is no longer declared.`,
      leftLines: lineSet(before),
      rightLines: new Set(),
      scoped: scoped(before),
      leftTargets: [relationshipTarget(before)],
      rightTargets: [],
    });
  }
  for (const fresh of matching.added) {
    const after = fresh.item;
    changes.push({
      verb: "added",
      noun: "relationship",
      title: `Add relationship ${arrow(after.from, after.to)}`,
      detail: `${withLabel(`${after.macro} ${arrow(after.from, after.to)}`, after.label)} is declared.`,
      leftLines: new Set(),
      rightLines: lineSet(after),
      scoped: scoped(after),
      leftTargets: [],
      rightTargets: [relationshipTarget(after)],
    });
  }

  // Layout hints (Lay_R and the others) follow renames; any other difference is an addition or a removal.
  const hintKey = (item: { macro: string; from: string; to: string }, through: (alias: string) => string) =>
    `${item.macro}(${through(item.from)}, ${through(item.to)})`;
  const rightHints = right.settings.hints.map((item) => ({ item, key: hintKey(item, (alias) => alias), used: false }));
  for (const before of left.settings.hints) {
    const key = hintKey(before, mapAlias);
    const match = rightHints.find((item) => !item.used && item.key === key);
    if (!match) {
      changes.push({
        verb: "removed",
        noun: "layout hint",
        title: `Remove layout hint ${before.macro}`,
        detail: `${before.macro}(${before.from}, ${before.to}) is no longer declared.`,
        leftLines: lineSet(before),
        rightLines: new Set(),
        scoped: scoped(before),
        leftTargets: [],
        rightTargets: [],
      });
      continue;
    }
    match.used = true;
    if (match.item.from !== before.from || match.item.to !== before.to)
      for (const alias of [before.from, before.to]) {
        const lines = renameLines.get(alias);
        if (!lines) continue;
        lines.left.add(before.line - 1);
        lines.right.add(match.item.line - 1);
      }
  }
  for (const fresh of rightHints.filter((item) => !item.used))
    changes.push({
      verb: "added",
      noun: "layout hint",
      title: `Add layout hint ${fresh.item.macro}`,
      detail: `${fresh.item.macro}(${fresh.item.from}, ${fresh.item.to}) is declared.`,
      leftLines: new Set(),
      rightLines: lineSet(fresh.item),
      scoped: scoped(fresh.item),
      leftTargets: [],
      rightTargets: [],
    });

  // Renames, with every line they touched.
  for (const [from, to] of renames) {
    const lines = renameLines.get(from)!;
    const before = leftKeyed.keyed.get(from)!;
    const after = rightKeyed.keyed.get(to)!;
    const followers = lines.left.size - 1;
    const fields = renameFields.get(from) ?? [];
    const noun = CATEGORY_NOUN[after.category];
    changes.push({
      verb: "changed",
      noun: "rename",
      title: `Rename ${code(from)} → ${code(to)}${fields.length ? ` and change ${fields.map((item) => item.split(" ")[0]).join(", ")}` : ""}`,
      detail: `${noun[0]!.toUpperCase()}${noun.slice(1)} “${after.label}”: alias ${from} → ${to}${
        followers > 0
          ? `; ${plural(followers, "line")} referring to it ${followers === 1 ? "was" : "were"} updated`
          : ""
      }${fields.length ? `; ${fields.join("; ")}` : ""}.`,
      leftLines: lines.left,
      rightLines: lines.right,
      scoped: scoped(before, after),
      leftTargets: [elementTarget(before)],
      rightTargets: [elementTarget(after)],
    });
  }

  // Layout and legend.
  for (const kind of ["layout", "legend"] as const) {
    const before = left.settings[kind];
    const after = right.settings[kind];
    const names = (items: typeof before) => items.map((item) => item.macro).join(", ");
    if (names(before) === names(after)) continue;
    const label = kind === "layout" ? "layout" : "legend";
    const title = !before.length
      ? `Set ${label} ${names(after)}`
      : !after.length
        ? `Remove ${label} ${names(before)}`
        : `Change ${label} ${names(before)} → ${names(after)}`;
    changes.push({
      verb: !before.length ? "added" : !after.length ? "removed" : "changed",
      noun: "setting",
      title,
      detail: !before.length
        ? `The ${label} setting ${names(after)} is added.`
        : !after.length
          ? `The ${label} setting ${names(before)} is removed.`
          : `The ${label} setting changes from ${names(before)} to ${names(after)}.`,
      leftLines: new Set(before.map((item) => item.line - 1)),
      rightLines: new Set(after.map((item) => item.line - 1)),
      scoped: scoped(...before, ...after),
      leftTargets: [],
      rightTargets: [],
    });
  }

  // Tag styles (AddElementTag and the others), by kind and tag name.
  const tagKey = (item: { kind: string; tag: string }) => `${item.kind}:${item.tag}`;
  const rightTags = new Map(right.settings.tags.map((item) => [tagKey(item), item]));
  const leftTags = new Map(left.settings.tags.map((item) => [tagKey(item), item]));
  for (const [key, before] of leftTags) {
    const after = rightTags.get(key);
    const text = (item: typeof before) => item.arguments.map((argument) => argument.raw).join(", ");
    if (!after)
      changes.push({
        verb: "removed",
        noun: "tag style",
        title: `Remove ${before.kind} tag style ${code(before.tag)}`,
        detail: `The style for tag ${before.tag} is no longer declared.`,
        leftLines: lineSet(before),
        rightLines: new Set(),
        scoped: scoped(before),
        leftTargets: [],
        rightTargets: [],
      });
    else if (text(before) !== text(after))
      changes.push({
        verb: "changed",
        noun: "tag style",
        title: `Change ${before.kind} tag style ${code(before.tag)}`,
        detail: `The style arguments of tag ${before.tag} changed.`,
        leftLines: lineSet(before),
        rightLines: lineSet(after),
        scoped: scoped(before, after),
        leftTargets: [],
        rightTargets: [],
      });
  }
  for (const [key, after] of rightTags)
    if (!leftTags.has(key))
      changes.push({
        verb: "added",
        noun: "tag style",
        title: `Add ${after.kind} tag style ${code(after.tag)}`,
        detail: `A style for tag ${after.tag} is declared.`,
        leftLines: new Set(),
        rightLines: lineSet(after),
        scoped: scoped(after),
        leftTargets: [],
        rightTargets: [],
      });

  // C4 includes.
  const leftIncludes = includesOf(leftLines);
  const rightIncludes = includesOf(rightLines);
  for (const include of leftIncludes)
    if (!rightIncludes.some((item) => item.name === include.name))
      changes.push({
        verb: "removed",
        noun: "include",
        title: `Remove include ${code(include.name)}`,
        detail: `The C4 library file ${include.name} is no longer included.`,
        leftLines: new Set([include.line]),
        rightLines: new Set(),
        scoped: false,
        leftTargets: [],
        rightTargets: [],
      });
  for (const include of rightIncludes)
    if (!leftIncludes.some((item) => item.name === include.name))
      changes.push({
        verb: "added",
        noun: "include",
        title: `Add include ${code(include.name)}`,
        detail: `The C4 library file ${include.name} is included.`,
        leftLines: new Set(),
        rightLines: new Set([include.line]),
        scoped: false,
        leftTargets: [],
        rightTargets: [],
      });

  return { changes, leftRecognized, rightRecognized, leftLines, rightLines, parts: new Map() };
}

const isBlankOrComment = (line: string) => !line.trim() || line.trim().startsWith("'");

function summarize(changes: readonly C4Change[]): string {
  const verbWord = { added: "add", removed: "remove", changed: "change" } as const;
  const byVerb = new Map<C4Change["verb"], Map<string, number>>();
  for (const item of changes) {
    const nouns = byVerb.get(item.verb) ?? new Map<string, number>();
    nouns.set(item.noun, (nouns.get(item.noun) ?? 0) + 1);
    byVerb.set(item.verb, nouns);
  }
  if (byVerb.size > 2) return `Change ${plural(changes.length, "C4 item")}`;
  const sentence = [...byVerb].map(
    ([verb, nouns]) =>
      `${verbWord[verb]} ${
        nouns.size > 2
          ? plural(
              [...nouns.values()].reduce((sum, count) => sum + count, 0),
              "C4 item",
            )
          : [...nouns].map(([noun, count]) => plural(count, noun)).join(" and ")
      }`,
  );
  const text = sentence.join(", ");
  return `${text[0]!.toUpperCase()}${text.slice(1)}`;
}

/** The title, detail, confidence and targets for one contiguous source change, `undefined` when unusable. */
export function describeC4Hunk(
  model: C4ReviewModel,
  startLeft: number,
  deleteCount: number,
  startRight: number,
  addCount: number,
): C4HunkDescription | undefined {
  const inLeft = (line: number) => line >= startLeft && line < startLeft + deleteCount;
  const inRight = (line: number) => line >= startRight && line < startRight + addCount;
  const touching = model.changes.filter(
    (change) => [...change.leftLines].some(inLeft) || [...change.rightLines].some(inRight),
  );
  const range = (start: number, count: number) => Array.from({ length: count }, (_, offset) => start + offset);
  const unrecognized = [
    ...range(startLeft, deleteCount).filter(
      (line) => !model.leftRecognized.has(line) && !isBlankOrComment(model.leftLines[line] ?? ""),
    ),
    ...range(startRight, addCount).filter(
      (line) => !model.rightRecognized.has(line) && !isBlankOrComment(model.rightLines[line] ?? ""),
    ),
  ];
  if (unrecognized.length)
    return {
      title: "Unclassified source change",
      detail:
        "This change includes lines that are not C4 elements, relationships, settings or includes. Review every changed line in Source.",
      confidence: "unclassified",
      leftTargets: [],
      rightTargets: [],
    };
  if (!touching.length) {
    const onlyBlankOrComment =
      range(startLeft, deleteCount).every((line) => isBlankOrComment(model.leftLines[line] ?? "")) &&
      range(startRight, addCount).every((line) => isBlankOrComment(model.rightLines[line] ?? ""));
    if (onlyBlankOrComment)
      return {
        title: "Edit comments or blank lines",
        detail: "No C4 element, relationship or setting changes meaning.",
        confidence: "confirmed",
        leftTargets: [],
        rightTargets: [],
      };
    return {
      title: "Reorder or reformat C4 declarations",
      detail:
        "The declarations keep their meaning; they are moved or rewritten. Where the other side of a move is in another change, apply them together.",
      confidence: deleteCount > 0 && addCount > 0 ? "confirmed" : "probable",
      leftTargets: [],
      rightTargets: [],
    };
  }
  const whole = (change: C4Change) => [...change.leftLines].every(inLeft) && [...change.rightLines].every(inRight);
  const split = touching.some((change) => !whole(change));
  const scoped = touching.some((change) => change.scoped);
  const listed = touching.slice(0, MAX_LISTED).map((change) => change.title);
  const extra = touching.length > MAX_LISTED ? `; and ${touching.length - MAX_LISTED} more` : "";
  const notes = [
    ...(split
      ? ["This change also touches other source regions, so partial acceptance is disabled; apply them together."]
      : []),
    ...(scoped
      ? ["Part of it sits inside an !if, a procedure or a loop, so whether it is drawn depends on the preprocessor."]
      : []),
  ];
  const part = touching.length === 1 && split ? (model.parts.get(touching[0]!) ?? 0) + 1 : 0;
  if (part) model.parts.set(touching[0]!, part);
  return {
    title: touching.length === 1 ? `${touching[0]!.title}${part ? ` (part ${part})` : ""}` : summarize(touching),
    detail: [touching.length === 1 ? touching[0]!.detail : `${listed.join("; ")}${extra}.`, ...notes].join(" "),
    confidence: split || scoped ? "probable" : "confirmed",
    leftTargets: touching.flatMap((change) => change.leftTargets),
    rightTargets: touching.flatMap((change) => change.rightTargets),
  };
}
