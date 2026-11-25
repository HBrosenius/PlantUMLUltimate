import { parseC4 } from "./c4-source";
import type { DiagramOutlineEntry } from "./diagram-outline";

const TYPE_LABELS = {
  person: "Person",
  system: "System",
  container: "Container",
  component: "Component",
  boundary: "Boundary",
  node: "Deployment node",
} as const;

/**
 * The outline of a C4 diagram: people, systems, containers, components, boundaries and deployment nodes
 * (grouped under the boundary they sit in), and relationships. Selecting an entry highlights its source line.
 */
export function c4OutlineEntries(source: string): DiagramOutlineEntry[] {
  const document = parseC4(source);
  const byId = new Map(document.elements.map((element) => [element.id, element]));
  const ancestors = (parent: string | undefined) => {
    const names: string[] = [];
    const seen = new Set<string>();
    for (let id = parent; id && !seen.has(id); id = byId.get(id)?.parent) {
      seen.add(id);
      const element = byId.get(id);
      if (!element) break;
      names.unshift(element.label);
    }
    return names;
  };
  const label = (id: string) => byId.get(id)?.label ?? id;
  const elements = document.elements.map((element): DiagramOutlineEntry => {
    const group = ancestors(element.parent);
    return {
      id: `c4:${element.id}`,
      kind: `c4-${element.category}`,
      typeLabel: element.external
        ? `External ${TYPE_LABELS[element.category].toLowerCase()}`
        : TYPE_LABELS[element.category],
      label: element.label,
      line: element.line,
      range: element.range,
      target: { type: "c4-element", id: element.id },
      ...(group.length ? { group: group.join(" / "), depth: group.length } : {}),
    };
  });
  const relationships = document.relationships.map((relationship, index): DiagramOutlineEntry => ({
    id: `c4-rel:${index}`,
    kind: "c4-relationship",
    typeLabel: "Relationship",
    label: relationship.label || `${label(relationship.from)} → ${label(relationship.to)}`,
    line: relationship.line,
    range: relationship.range,
    target: { type: "c4-element", id: `rel:${index}` },
    group: `${label(relationship.from)} → ${label(relationship.to)}`,
  }));
  return [...elements, ...relationships];
}
