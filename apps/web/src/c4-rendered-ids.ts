import type { C4Relationship } from "./c4-source";

/**
 * What a drawn shape of a rendered C4 diagram stands for in the source (spike C0, see docs/c4-svg-ids-spike.md).
 *
 * The engine writes, for every entity and cluster, `<g id="ent0003" data-qualified-name="shop.web" class="entity">`.
 * The C4 library passes the macro's alias straight through, so the last segment of `data-qualified-name` is the
 * alias and the earlier segments are the aliases of the enclosing boundaries or nodes, outermost first. A link is
 * `<g id="lnk7" data-entity-1="ent0001" data-entity-2="ent0003" class="link">`: both endpoints, by entity id.
 */
export type C4RenderedTarget =
  | { kind: "element"; alias: string; path: readonly string[] }
  | { kind: "boundary"; alias: string; path: readonly string[] }
  | {
      kind: "relationship";
      /** Aliases of the first and second endpoint as drawn. For `Rel_U`, `Rel_L` and their variants the engine
       * stores them in the opposite order to the macro call, so match with `c4SourceRelationship`. */
      from: string;
      to: string;
      /** Position among all drawn relationships, in source order (the engine numbers links as it reads them). */
      index: number;
      /** Position among the drawn relationships with the same two endpoints (either way round). */
      pairIndex: number;
    }
  | { kind: "title" }
  | { kind: "legend" };

const SHAPE = "g.entity, g.cluster, g.link, g.legend, g.title";

function aliasPath(group: Element): string[] | undefined {
  const name = group.getAttribute("data-qualified-name");
  return name ? name.split(".") : undefined;
}

/** The alias of the entity or cluster with this rendered id (`ent0003`). */
function aliasOfEntity(svg: Element, id: string | null): string | undefined {
  if (!id) return undefined;
  for (const group of svg.querySelectorAll("g.entity[id], g.cluster[id]")) {
    if (group.id === id) return aliasPath(group)?.at(-1);
  }
  return undefined;
}

const linkNumber = (group: Element) => Number(/^lnk(\d+)$/.exec(group.id)?.[1] ?? Number.NaN);

/** Identifies the C4 shape that `node` is part of, or undefined when it is outside every shape. */
export function c4RenderedTarget(node: Element | null): C4RenderedTarget | undefined {
  const group = node?.closest(SHAPE);
  if (!group) return undefined;
  if (group.classList.contains("legend")) return { kind: "legend" };
  if (group.classList.contains("title")) return { kind: "title" };
  if (group.classList.contains("link")) return linkTarget(group);
  const path = aliasPath(group);
  if (!path) return undefined;
  const alias = path[path.length - 1]!;
  return { kind: group.classList.contains("cluster") ? "boundary" : "element", alias, path: path.slice(0, -1) };
}

function linkTarget(group: Element): C4RenderedTarget | undefined {
  const svg = group.closest("svg");
  if (!svg) return undefined;
  const from = aliasOfEntity(svg, group.getAttribute("data-entity-1"));
  const to = aliasOfEntity(svg, group.getAttribute("data-entity-2"));
  if (!from || !to) return undefined;
  // The document order of links is not the source order (Dynamic diagrams reorder them), but the id is.
  const links = [...svg.querySelectorAll("g.link")].sort((a, b) => linkNumber(a) - linkNumber(b));
  const index = links.indexOf(group);
  const pair = (link: Element) =>
    [link.getAttribute("data-entity-1"), link.getAttribute("data-entity-2")].sort().join("|");
  const pairIndex = links.slice(0, index).filter((link) => pair(link) === pair(group)).length;
  return { kind: "relationship", from, to, index, pairIndex };
}

/** Every shape of a rendered C4 diagram with its target, in document order. */
export function c4RenderedShapes(svg: ParentNode): Array<{ element: Element; target: C4RenderedTarget }> {
  const result: Array<{ element: Element; target: C4RenderedTarget }> = [];
  for (const element of svg.querySelectorAll(SHAPE)) {
    const target = c4RenderedTarget(element);
    if (target) result.push({ element, target });
  }
  return result;
}

/**
 * The relationship of the source a drawn link belongs to: the one with the same two endpoints (either way round,
 * since `Rel_U` and `Rel_L` are stored reversed) that is the `pairIndex`-th of them in source order.
 */
export function c4SourceRelationship(
  target: Extract<C4RenderedTarget, { kind: "relationship" }>,
  relationships: readonly C4Relationship[],
): C4Relationship | undefined {
  const same = relationships.filter(
    (item) =>
      (item.from === target.from && item.to === target.to) || (item.from === target.to && item.to === target.from),
  );
  return same[target.pairIndex];
}
