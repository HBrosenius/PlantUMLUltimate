import { c4RenderedShapes, c4SourceRelationship, type C4RenderedTarget } from "../../c4-rendered-ids";
import type { C4Document } from "../../c4-source";
import { c4EditBlocker, c4ElementNoun, isC4Container, type C4Selection } from "./c4-forms";

/**
 * What the canvas knows about each drawn shape, worked out once per render (not on every click): which source
 * item it is, and whether forms and drags may change it. The engine's own markup names every alias (see
 * docs/c4-svg-ids-spike.md); this maps those names onto what `parseC4` read from the source.
 */
export interface C4CanvasShape {
  /** The drawn `g.entity`, `g.cluster` or `g.link`. */
  group: Element;
  kind: "element" | "boundary" | "relationship";
  /** `data-c4-object-id`: the alias, or `rel:N` for a relationship, or `link:N` for one the source does not match. */
  key: string;
  selection: C4Selection;
  /** False for shapes the source does not declare, or declares inside a procedure, `!if` or loop. */
  editable: boolean;
  /** The alias of an element or boundary, as drawn. */
  alias?: string;
  /** The label an assistive technology reads. */
  title: string;
  /** For a relationship: the two drawn ends, in the order the engine drew them. */
  ends?: { first: string; second: string };
  /** For a relationship: its position in the source, when the drawn links match the source. */
  index?: number;
}

export interface C4Canvas {
  shapes: C4CanvasShape[];
  byKey: Map<string, C4CanvasShape>;
  /** False when the drawn links and the source's relationships can't be paired one to one. */
  relationshipsMatch: boolean;
}

export function buildC4Canvas(root: ParentNode, document: C4Document): C4Canvas {
  const drawn = c4RenderedShapes(root);
  const links = drawn.filter((item) => item.target.kind === "relationship").length;
  const relationshipsMatch = links === document.relationships.length;
  const byAlias = new Map<string, number>();
  for (const element of document.elements) byAlias.set(element.id, (byAlias.get(element.id) ?? 0) + 1);
  const shapes: C4CanvasShape[] = [];
  for (const { element: group, target } of drawn) {
    if (target.kind === "title" || target.kind === "legend") continue;
    if (target.kind === "relationship") {
      shapes.push(relationshipShape(group, target, document, relationshipsMatch));
      continue;
    }
    const declared =
      byAlias.get(target.alias) === 1 ? document.elements.find((item) => item.id === target.alias) : undefined;
    const editable = Boolean(declared && !c4EditBlocker(declared));
    shapes.push({
      group,
      kind: target.kind,
      key: target.alias,
      selection: declared ? { kind: "element", alias: target.alias } : { kind: "unmanaged", alias: target.alias },
      editable,
      alias: target.alias,
      title: declared
        ? `${c4ElementNoun(declared)} ${declared.label}`
        : `${target.kind === "boundary" ? "boundary" : "element"} ${target.alias}`,
    });
  }
  return { shapes, byKey: new Map(shapes.map((shape) => [shape.key, shape])), relationshipsMatch };
}

function relationshipShape(
  group: Element,
  target: Extract<C4RenderedTarget, { kind: "relationship" }>,
  document: C4Document,
  match: boolean,
): C4CanvasShape {
  const source = match ? c4SourceRelationship(target, document.relationships) : undefined;
  const shape = { group, kind: "relationship" as const, ends: { first: target.from, second: target.to } };
  if (!source) {
    return {
      ...shape,
      key: `link:${target.from}>${target.to}`,
      selection: { kind: "unmanaged", from: target.from, to: target.to },
      editable: false,
      title: `relationship from ${target.from} to ${target.to}`,
    };
  }
  const label = (alias: string) => document.elements.find((item) => item.id === alias)?.label ?? alias;
  return {
    ...shape,
    key: `rel:${source.index}`,
    selection: { kind: "relationship", index: source.index },
    editable: !c4EditBlocker(source),
    index: source.index,
    title: `relationship from ${label(source.from)} to ${label(source.to)}`,
  };
}

/** The element shapes that a relationship may be dragged to: declared, editable and not a boundary or node. */
export function c4ConnectableShapes(canvas: C4Canvas, document: C4Document): C4CanvasShape[] {
  return canvas.shapes.filter((shape) => {
    if (shape.kind !== "element" || !shape.editable) return false;
    const element = document.elements.find((item) => item.id === shape.alias);
    return Boolean(element && !isC4Container(element));
  });
}
