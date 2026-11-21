import type { LanguageDiagnostic } from "@plantuml-studio/language-core";
import type { TreeControl, TreeControls, TreeDialect, TreeDocument, TreeNode, TreeSide } from "./model";

const NODE = /^(\s*)([*+-]+)\s*(.*?)\s*$/;
const HASH_NODE = /^(\s*)(#+)\s+(.*?)\s*$/;
const RELATIONSHIP = /^\s*([A-Za-z_][\w-]*)\s+(-+>|\.+>)\s+([A-Za-z_][\w-]*)(?:\s+(#[\w-]+))?\s*$/;
const TITLE = /^title\b\s*(.*)$/i;
const CAPTION = /^caption\b\s*(.*)$/i;
const HEADER_FOOTER = /^(?:(left|right|center)\s+)?(header|footer)\b\s*(.*)$/i;
const LEGEND = /^legend\b\s*(.*)$/i;
export const MAX_TREE_SOURCE_LENGTH = 100_000;

// A node's `:`-opened label may close on a later source line (e.g. `*: Line one\nLine two;`);
// this recognizes a closing `;`, optionally trailed by a stereotype and/or a background color.
const MULTILINE_CLOSE = /;\s*(?:<<\s*[^>]*>>\s*)?(?:#[\w-]+\s*)?$/;

type ControlName = "title" | "caption" | "header" | "footer" | "legend";

interface OpenBlock {
  name: ControlName;
  end: RegExp;
  from: number;
  lines: string[];
  placement?: string;
}

function stripNodePrefixes(value: string): string {
  const withoutAlias = value.replace(/^\s*\([A-Za-z_][\w-]*\)\s*/, "");
  return withoutAlias.replace(/^\s*\[#[\w-]+\]\s*/, "");
}

// True when `content` (the text following a node's marker) opens a `:` ... `;` multiline label
// that isn't already closed on the same line.
function opensMultilineLabel(content: string): boolean {
  return stripNodePrefixes(content).trimStart().startsWith(":") && !MULTILINE_CLOSE.test(content.trim());
}

function nodeDetails(value: string, isAlias: (name: string) => boolean) {
  const aliasMatch = value.match(/^\s*\(([A-Za-z_][\w-]*)\)\s*/);
  const alias = aliasMatch && isAlias(aliasMatch[1]!) ? aliasMatch[1] : undefined;
  const withoutAlias = alias ? value.slice(aliasMatch![0].length) : value;
  const leadingColor = withoutAlias.match(/^\s*\[(#[\w-]+)\]\s*/)?.[1];
  const withoutLeadingColor = leadingColor ? withoutAlias.replace(/^\s*\[#[\w-]+\]\s*/, "") : withoutAlias;
  const stereotype = withoutLeadingColor.match(/\s+<<\s*(.*?)\s*>>\s*$/)?.[1];
  const withoutStereotype = stereotype ? withoutLeadingColor.replace(/\s+<<\s*.*?\s*>>\s*$/, "") : withoutLeadingColor;
  // PlantUML colors a node with the leading `[#color]`; a trailing `#color` only follows a `:` ... `;`
  // label, so `** Fix issue #123` keeps `#123` as label text.
  const trailingColor = withoutStereotype.match(/;\s*(#[\w-]+)\s*$/)?.[1];
  const color = leadingColor ?? trailingColor;
  const rawLabel = (
    trailingColor ? withoutStereotype.slice(0, withoutStereotype.lastIndexOf(trailingColor)) : withoutStereotype
  ).trim();
  // Strip a `:` ... `;` multiline wrapper (whether closed on this line or joined from several)
  // before looking for a link, icon, or inline text color, so all three are recognized inside
  // it too — a link's `[[...]]` must be at the very start of the string to match.
  let inner = rawLabel;
  if (inner.startsWith(":")) inner = inner.slice(1);
  if (/;\s*$/.test(inner)) inner = inner.replace(/;\s*$/, "");
  inner = inner.trim();
  const linkMatch = inner.match(/^\[\[(\S+)(?:\s+([\s\S]*))?\]\]$/);
  const link = linkMatch?.[1];
  const labelSource = (linkMatch ? (linkMatch[2] ?? linkMatch[1]!) : inner).trim();
  const iconMatch = labelSource.match(/^<([$&][\w-]+)>\s*/);
  const icon = iconMatch?.[1];
  const withoutIcon = icon ? labelSource.slice(iconMatch[0].length) : labelSource;
  const textColorMatch = withoutIcon.match(/^<color:([^>]+)>([\s\S]*)<\/color>$/i);
  const textColor = textColorMatch?.[1];
  const label = (textColorMatch?.[2] ?? withoutIcon).trim();
  return {
    label,
    ...(alias ? { alias } : {}),
    ...(color ? { color } : {}),
    ...(textColor ? { textColor } : {}),
    ...(stereotype ? { stereotype } : {}),
    ...(link ? { link } : {}),
    ...(icon ? { icon } : {}),
  };
}

// The first statement of each kind wins; a repeated title or header is left in the source untouched.
function recordControl(controls: TreeControls, name: ControlName, control: TreeControl) {
  controls[name] ??= control;
}

/**
 * Parses a marker-tree source (`* root`, `** child`, `-- left`) as described by `dialect`.
 * Nodes carry an `alias` property only when the dialect allows aliases, so callers that enable
 * them narrow the result with their own node type.
 */
export function parseTree<TNode extends TreeNode = TreeNode>(
  source: string,
  dialect: TreeDialect,
): TreeDocument<TNode> {
  if (source.length > MAX_TREE_SOURCE_LENGTH)
    throw new RangeError(`${dialect.label} source exceeds the 100,000 character limit`);
  const nodes: TreeNode[] = [];
  const relationships: TreeDocument["relationships"] = [];
  const unknown: TreeDocument["unknown"] = [];
  const diagnostics: LanguageDiagnostic[] = [];
  const stack = new Map<number, TreeNode>();
  const startTag = new RegExp(`^${dialect.start}\\b`, "i");
  const endTag = new RegExp(`^${dialect.end}\\b`, "i");
  const controls: TreeControls = { sideSwitches: [] };
  const sideSwitch = dialect.sideKeyword ? new RegExp(`^(left|right)\\s+${dialect.sideKeyword}\\s*$`, "i") : undefined;
  const directions = new Set(dialect.directionKeywords ?? []);
  // The side of depth-2 `*` nodes: one switch for the whole document, in document order.
  let switchedSide: "left" | "right" = "right";
  let block: OpenBlock | undefined;
  // Indented `*` bullets nest by a stack of indentations that starts at the last column-0 node.
  let listStack: Array<{ indent: number; depth: number }> = [];
  let listBase: { depth: number; header: boolean } | undefined;
  let firstMarkdown: TreeNode | undefined;
  let offset = 0;
  let sawStart = false;
  let sawEnd = false;
  let inStyle = false;
  const lines = source.split("\n");
  const arrowNames = new Set(
    dialect.allowArrows
      ? lines.flatMap((line) => {
          const match = line.match(RELATIONSHIP);
          return match ? [match[1]!, match[3]!] : [];
        })
      : [],
  );
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const text = lines[lineIndex]!;
    const range = { from: offset, to: offset + text.length };
    offset += text.length + 1;
    const trimmed = text.trim();
    if (startTag.test(trimmed)) sawStart = true;
    if (endTag.test(trimmed)) sawEnd = true;
    if (dialect.skipStyleBlocks && !block) {
      // An unclosed block ends at the closing tag so it cannot swallow the rest of the diagram.
      if (/^<\/style>/i.test(trimmed) || endTag.test(trimmed)) inStyle = false;
      else if (/^<style>/i.test(trimmed) && !/<\/style>/i.test(trimmed)) inStyle = true;
      else if (inStyle && trimmed && !trimmed.startsWith("'") && !dialect.control.test(trimmed)) {
        // A style body line such as `* { ... }` or `- { ... }` looks like a node marker but is not one.
        unknown.push({ text, range });
        continue;
      }
    }
    // The end of the statement without its `\r`, so edits can keep the document's own line ending.
    const contentEnd = range.to - (text.endsWith("\r") ? 1 : 0);
    if (block) {
      if (block.end.test(trimmed)) {
        recordControl(controls, block.name, {
          range: { from: block.from, to: contentEnd },
          text: block.lines.join("\n"),
          block: true,
          ...(block.placement ? { placement: block.placement } : {}),
        });
        block = undefined;
        continue;
      }
      if (!endTag.test(trimmed)) {
        block.lines.push(text.replace(/\r$/, ""));
        continue;
      }
      diagnostics.push({
        severity: "error",
        message: `${dialect.label} ${block.name} block is not closed`,
        range: { from: block.from, to: range.from },
        code: "unclosed-block",
      });
      block = undefined;
    }
    if (trimmed && !trimmed.startsWith("'")) {
      const switchMatch = sideSwitch ? trimmed.match(sideSwitch) : null;
      if (switchMatch) {
        const side = switchMatch[1]!.toLowerCase() as "left" | "right";
        switchedSide = side;
        controls.sideSwitches.push({ side, range: { from: range.from, to: contentEnd } });
        continue;
      }
      const direction = trimmed.toLowerCase().replace(/\s+/g, " ");
      if (directions.has(direction)) {
        controls.direction ??= { value: direction, range: { from: range.from, to: contentEnd } };
        continue;
      }
      if (dialect.furniture) {
        const statement = (name: ControlName, value: string, placement?: string) =>
          recordControl(controls, name, {
            range: { from: range.from, to: contentEnd },
            text: value,
            block: false,
            ...(placement ? { placement } : {}),
          });
        const caption = trimmed.match(CAPTION);
        const title = trimmed.match(TITLE);
        const headerFooter = trimmed.match(HEADER_FOOTER);
        const legend = trimmed.match(LEGEND);
        if (caption) {
          statement("caption", caption[1]!.trim());
          continue;
        }
        if (title) {
          if (title[1]!.trim()) statement("title", title[1]!.trim());
          else block = { name: "title", end: /^end\s*title\b/i, from: range.from, lines: [] };
          continue;
        }
        if (headerFooter) {
          const name = headerFooter[2]!.toLowerCase() as "header" | "footer";
          const placement = headerFooter[1]?.toLowerCase();
          if (headerFooter[3]!.trim()) statement(name, headerFooter[3]!.trim(), placement);
          else
            block = {
              name,
              end: new RegExp(`^end\\s*${name}\\b`, "i"),
              from: range.from,
              lines: [],
              ...(placement ? { placement } : {}),
            };
          continue;
        }
        if (legend) {
          const placement = legend[1]!.trim().toLowerCase().replace(/\s+/g, " ");
          block = {
            name: "legend",
            end: /^end\s*legend\b/i,
            from: range.from,
            lines: [],
            ...(placement ? { placement } : {}),
          };
          continue;
        }
      }
    }
    if (!trimmed || trimmed.startsWith("'") || dialect.control.test(trimmed)) continue;
    const relationship = dialect.allowArrows ? text.match(RELATIONSHIP) : null;
    if (relationship?.[1] && relationship[2] && relationship[3]) {
      relationships.push({
        id: `${dialect.idPrefix}-relationship-${relationships.length}`,
        from: relationship[1],
        arrow: relationship[2],
        to: relationship[3],
        ...(relationship[4] ? { color: relationship[4] } : {}),
        sourceRange: range,
      });
      continue;
    }
    const hash = dialect.markers?.hash ? text.match(HASH_NODE) : null;
    const match = hash ? null : text.match(NODE);
    if (!hash && !match?.[2]) {
      unknown.push({ text, range });
      continue;
    }
    const marker = hash ? hash[2]! : match![2]!;
    if (!/^([*]+|[+]+|[-]+|#+)$/.test(marker)) {
      diagnostics.push({
        severity: "error",
        message: `${dialect.label} hierarchy markers cannot be mixed`,
        range,
        code: "mixed-marker",
      });
      continue;
    }
    const indent = hash ? 0 : match![1]!.length;
    if (dialect.markers?.indentedList && indent > 0 && marker === "-") {
      diagnostics.push({
        severity: "error",
        message: `${dialect.label} lists use * bullets, a - list item is not supported`,
        range,
        code: "dash-list",
      });
      unknown.push({ text, range });
      continue;
    }
    // `**_ Label` draws the node without a box; the `_` belongs to the marker, not the label.
    // The engine reads `**[#color]_ Label` as boxless and colored, but `**_[#color] Label` as a
    // boxless node whose label starts with the text `[#color]`. Dialects that know this opt in.
    const colorFirst = dialect.boxlessFollowsColor ? /^\s*[*+-]+\[#[\w-]+\]_/.test(text) : false;
    const boxless = !hash && (colorFirst || /^\s*[*+-]+_/.test(text));
    // An indented single `*` is a Markdown bullet. Its depth comes from the indentation stack.
    const listItem = Boolean(dialect.markers?.indentedList && indent > 0 && marker === "*" && !boxless);
    let depth = marker.length;
    if (listItem) {
      const base = listBase ?? { depth: 0, header: false };
      if (listStack.length === 0) listStack = [{ indent: 0, depth: base.depth }];
      let top = listStack[listStack.length - 1]!;
      if (indent > top.indent) {
        depth = top.depth + 1;
        listStack.push({ indent, depth });
      } else {
        // A dedent has to return to an indentation that is already in use.
        while (listStack.length > 1 && listStack[listStack.length - 1]!.indent > indent) listStack.pop();
        top = listStack[listStack.length - 1]!;
        if (top.indent !== indent) {
          diagnostics.push({
            severity: "error",
            message: `Bad indentation: a ${dialect.label} list item must return to an indentation that is already in use`,
            range,
            code: "bad-indentation",
          });
          unknown.push({ text, range });
          continue;
        }
        depth = top.depth;
      }
      if (base.header)
        diagnostics.push({
          severity: "error",
          message: `${dialect.label} cannot mix # headers with an indented * list`,
          range,
          code: "markdown-mixed",
        });
      else if (base.depth >= 2 && listStack.length > 2)
        diagnostics.push({
          severity: "error",
          message: `${dialect.label} list nests too deep below a ${"*".repeat(base.depth)} node`,
          range,
          code: "markdown-list-nesting",
        });
    } else {
      listStack = [];
      listBase = { depth, header: Boolean(hash) };
    }
    const body = hash ? hash[3]! : (match![3] ?? "");
    let content = colorFirst ? body.replace(/^(\s*\[#[\w-]+\])_/, "$1") : boxless ? body.replace(/^_\s*/, "") : body;
    if (opensMultilineLabel(content)) {
      while (lineIndex + 1 < lines.length && !MULTILINE_CLOSE.test(content.trim())) {
        lineIndex += 1;
        const continuation = lines[lineIndex]!;
        content += `\n${continuation}`;
        range.to = offset + continuation.length;
        offset += continuation.length + 1;
      }
    }
    // `**(plan) Plan` always declares an alias; a spaced `** (draft) Plan` only does when an arrow
    // refers to it, and otherwise `(draft)` is part of the label.
    const spaced = hash ? true : /^\s*[*+-]+_?\s/.test(text);
    const details = nodeDetails(content, (name) => dialect.allowAliases && (!spaced || arrowNames.has(name)));
    if (!details.label)
      diagnostics.push({
        severity: "error",
        message: `${dialect.label} node needs a label`,
        range,
        code: "empty-node",
      });
    // A node's parent is simply the nearest preceding node one level shallower — PlantUML nests
    // by indentation depth alone. A marker's +/- family only steers left/right placement for a
    // root's direct child (depth 2); deeper markers don't need to match their ancestor's family.
    const parent = depth > 1 ? stack.get(depth - 1) : undefined;
    if (depth > 1 && !parent)
      diagnostics.push({
        severity: "error",
        message: `${dialect.label} node at level ${depth} has no parent`,
        range,
        code: "missing-parent",
      });
    let side: TreeSide;
    if (dialect.sideKeyword === undefined)
      side = marker[0] === "+" ? "right" : marker[0] === "-" ? "left" : depth === 1 ? "root" : "right";
    else if (depth === 1) side = "root";
    else if (depth > 2) side = parent && parent.side !== "root" ? parent.side : "right";
    else side = marker[0] === "+" ? "right" : marker[0] === "-" ? "left" : hash ? "right" : switchedSide;
    const markdown = hash ? "header" : listItem ? "list" : undefined;
    const node: TreeNode = {
      id: `${dialect.idPrefix}-${nodes.length}`,
      ...details,
      depth,
      side,
      marker: listItem ? "*" : marker,
      ...(boxless ? { boxless } : {}),
      ...(markdown ? { markdown } : {}),
      ...(parent ? { parentId: parent.id } : {}),
      sourceRange: range,
      subtreeRange: { ...range },
    };
    if (markdown) firstMarkdown ??= node;
    nodes.push(node);
    stack.set(depth, node);
    for (const key of [...stack.keys()]) if (key > depth) stack.delete(key);
  }
  if (firstMarkdown)
    diagnostics.push({
      severity: "info",
      message: `${dialect.label} written with Markdown markers can only be edited as text; convert it to * markers to edit it visually`,
      range: firstMarkdown.sourceRange,
      code: "markdown-form",
    });
  if (block)
    diagnostics.push({
      severity: "error",
      message: `${dialect.label} ${block.name} block is not closed`,
      range: { from: block.from, to: source.length },
      code: "unclosed-block",
    });
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
      message: `${dialect.label} diagram is missing ${dialect.start}`,
      range: { from: 0, to: 0 },
      code: "missing-start",
    });
  if (!sawEnd)
    diagnostics.push({
      severity: "error",
      message: `${dialect.label} diagram is missing ${dialect.end}`,
      range: { from: source.length, to: source.length },
      code: "missing-end",
    });
  return {
    nodes: nodes as TNode[],
    roots: nodes.filter((node) => node.depth === 1) as TNode[],
    relationships,
    unknown,
    diagnostics,
    controls,
  };
}
