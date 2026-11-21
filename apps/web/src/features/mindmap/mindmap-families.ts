import { parseMindmap } from "@plantuml-studio/diagram-mindmap";
import { isMirroredDirection } from "./mindmap-render-order";

/**
 * In `right to left` and `bottom to top` documents the engine only draws a branch correctly when a
 * node and its children are written with the same kind of marker: a `+` parent with a `*` child, or the
 * other way round, comes out as a garbled picture (about twice as many labels, and no error message).
 * In `left to right` the same mix is fine. The move operations re-mark a moved node to suit its new
 * neighbour but leave the children it brings along, so a branch dragged under a `+` node can end up
 * with `*` children.
 *
 * This walks the result of such an edit and gives every node the marker family of its parent when
 * exactly one of the two is `+`. Only marker characters change (`**` and `++` have the same length).
 * A node whose line starts a multi-line label keeps its markers, because `++:` is not valid, and `-`
 * nodes are left to the move operations, which already keep `-` branches pure. Other documents are
 * returned unchanged.
 */
export function settleMirroredMarkerFamilies(source: string): string {
  const document = parseMindmap(source);
  if (!isMirroredDirection(document)) return source;
  const family = new Map<string, string>();
  const edits: Array<{ at: number; length: number; marker: string }> = [];
  for (const node of document.nodes) {
    const current = node.marker[0] ?? "*";
    const parent = node.parentId ? document.nodes.find((item) => item.id === node.parentId) : undefined;
    const parentFamily = parent ? (family.get(parent.id) ?? parent.marker[0] ?? "*") : current;
    const multiline = source.slice(node.sourceRange.from, node.sourceRange.to).includes("\n");
    const mixes = (current === "+") !== (parentFamily === "+") && current !== "-" && parentFamily !== "-";
    const line = /^([ \t]*)([*+-]+)/.exec(source.slice(node.sourceRange.from, node.sourceRange.from + 64));
    // A root is always `*`, so the first level is free to use either family.
    if (!parent || node.depth < 3 || !mixes || node.markdown || multiline || !line) {
      family.set(node.id, current);
      continue;
    }
    family.set(node.id, parentFamily);
    edits.push({
      at: node.sourceRange.from + line[1]!.length,
      length: line[2]!.length,
      marker: parentFamily.repeat(node.depth),
    });
  }
  let result = source;
  for (const edit of edits.reverse())
    result = `${result.slice(0, edit.at)}${edit.marker}${result.slice(edit.at + edit.length)}`;
  return result;
}
