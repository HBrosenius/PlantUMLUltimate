import type { LanguageDiagnostic } from "@plantuml-studio/language-core";
import type { WbsDocument, WbsNode, WbsSide } from "./model";

const NODE = /^(\s*)([*+-]+)\s*(.*?)\s*$/;
const RELATIONSHIP = /^\s*([A-Za-z_][\w-]*)\s+(-+>|\.+>)\s+([A-Za-z_][\w-]*)(?:\s+(#[\w-]+))?\s*$/;
const CONTROL =
  /^(?:@startwbs|@endwbs|title\b|caption\b|header\b|footer\b|legend\b|endlegend\b|skinparam\b|style\b|<style>|<\/style>)\b/i;

function nodeDetails(value: string) {
  const alias = value.match(/^\s*\(([A-Za-z_][\w-]*)\)\s*/)?.[1];
  const withoutAlias = alias ? value.replace(/^\s*\([A-Za-z_][\w-]*\)\s*/, "") : value;
  const leadingColor = withoutAlias.match(/^\s*\[(#[\w-]+)\]\s*/)?.[1];
  const withoutLeadingColor = leadingColor ? withoutAlias.replace(/^\s*\[#[\w-]+\]\s*/, "") : withoutAlias;
  const stereotype = withoutLeadingColor.match(/\s+<<\s*(.*?)\s*>>\s*$/)?.[1];
  const withoutStereotype = stereotype ? withoutLeadingColor.replace(/\s+<<\s*.*?\s*>>\s*$/, "") : withoutLeadingColor;
  const trailingColor = withoutStereotype.match(/\s+(#[\w-]+)\s*$/)?.[1];
  const color = leadingColor ?? trailingColor;
  const rawLabel = (
    trailingColor ? withoutStereotype.slice(0, withoutStereotype.lastIndexOf(trailingColor)) : withoutStereotype
  ).trim();
  const textColorMatch = rawLabel.match(/^<color:([^>]+)>([\s\S]*)<\/color>$/i);
  const textColor = textColorMatch?.[1];
  const label = (textColorMatch?.[2] ?? rawLabel)
    .trim()
    .replace(/^:/, "")
    .replace(/;$/, "")
    .replace(/^\[\[([^\s\]]+)\s+/, "")
    .replace(/\]\]$/, "")
    .trim();
  return {
    label,
    ...(alias ? { alias } : {}),
    ...(color ? { color } : {}),
    ...(textColor ? { textColor } : {}),
    ...(stereotype ? { stereotype } : {}),
  };
}

export function parseWbs(source: string): WbsDocument {
  const nodes: WbsNode[] = [];
  const relationships: WbsDocument["relationships"] = [];
  const unknown: WbsDocument["unknown"] = [];
  const diagnostics: LanguageDiagnostic[] = [];
  const stack = new Map<string, WbsNode>();
  let offset = 0;
  let sawStart = false;
  let sawEnd = false;
  for (const text of source.split("\n")) {
    const range = { from: offset, to: offset + text.length };
    offset += text.length + 1;
    const trimmed = text.trim();
    if (/^@startwbs\b/i.test(trimmed)) sawStart = true;
    if (/^@endwbs\b/i.test(trimmed)) sawEnd = true;
    if (!trimmed || trimmed.startsWith("'") || CONTROL.test(trimmed)) continue;
    const relationship = text.match(RELATIONSHIP);
    if (relationship?.[1] && relationship[2] && relationship[3]) {
      relationships.push({
        id: `wbs-relationship-${relationships.length}`,
        from: relationship[1],
        arrow: relationship[2],
        to: relationship[3],
        ...(relationship[4] ? { color: relationship[4] } : {}),
        sourceRange: range,
      });
      continue;
    }
    const match = text.match(NODE);
    if (!match?.[2]) {
      unknown.push({ text, range });
      continue;
    }
    const marker = match[2];
    if (!/^([*]+|[+]+|[-]+)$/.test(marker)) {
      diagnostics.push({
        severity: "error",
        message: "WBS hierarchy markers cannot be mixed",
        range,
        code: "mixed-marker",
      });
      continue;
    }
    const depth = marker.length;
    const side: WbsSide = marker[0] === "+" ? "right" : marker[0] === "-" ? "left" : depth === 1 ? "root" : "right";
    const details = nodeDetails(match[3] ?? "");
    if (!details.label)
      diagnostics.push({ severity: "error", message: "WBS node needs a label", range, code: "empty-node" });
    const parent = depth > 1 ? (stack.get(`${side}:${depth - 1}`) ?? stack.get(`root:${depth - 1}`)) : undefined;
    if (depth > 1 && !parent)
      diagnostics.push({
        severity: "error",
        message: `WBS node at level ${depth} has no parent`,
        range,
        code: "missing-parent",
      });
    const node: WbsNode = {
      id: `wbs-${nodes.length}`,
      ...details,
      depth,
      side,
      marker,
      ...(parent ? { parentId: parent.id } : {}),
      sourceRange: range,
      subtreeRange: { ...range },
    };
    nodes.push(node);
    stack.set(`${side}:${depth}`, node);
    if (side === "root") stack.set(`root:${depth}`, node);
    for (const key of [...stack.keys()]) {
      const keyDepth = Number(key.split(":")[1]);
      if (keyDepth > depth) stack.delete(key);
    }
  }
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    let end = node.sourceRange.to;
    for (let child = index + 1; child < nodes.length; child += 1) {
      const candidate = nodes[child]!;
      if (candidate.depth <= node.depth) break;
      end = candidate.sourceRange.to;
    }
    node.subtreeRange = { from: node.sourceRange.from, to: end };
  }
  if (!sawStart)
    diagnostics.push({
      severity: "error",
      message: "WBS diagram is missing @startwbs",
      range: { from: 0, to: 0 },
      code: "missing-start",
    });
  if (!sawEnd)
    diagnostics.push({
      severity: "error",
      message: "WBS diagram is missing @endwbs",
      range: { from: source.length, to: source.length },
      code: "missing-end",
    });
  return { nodes, roots: nodes.filter((node) => node.depth === 1), relationships, unknown, diagnostics };
}

export function findWbsNodeAt(document: WbsDocument, position: number): WbsNode | undefined {
  return document.nodes.find((node) => position >= node.sourceRange.from && position <= node.sourceRange.to);
}
