import type { LanguageDiagnostic, TextRange } from "@plantuml-studio/language-core";

export type TreeSide = "root" | "left" | "right";

export interface TreeNode {
  id: string;
  label: string;
  depth: number;
  side: TreeSide;
  marker: string;
  /** Written as `**_ Label`: the node is drawn without a box. */
  boxless?: boolean;
  parentId?: string;
  color?: string;
  textColor?: string;
  stereotype?: string;
  link?: string;
  icon?: string;
  /**
   * Set for nodes written in Markdown form (`## Child` headers or indented `*` list items). Their
   * line is not a plain marker line, so the marker-based operations must not rewrite it.
   */
  markdown?: "header" | "list";
  sourceRange: TextRange;
  subtreeRange: TextRange;
}

export interface TreeRelationship {
  id: string;
  from: string;
  to: string;
  arrow: string;
  color?: string;
  sourceRange: TextRange;
}

/** A `title`, `caption`, `header`, `footer` or `legend` statement. */
export interface TreeControl {
  /** The whole statement, from its first line to the end of its last line (without its line ending). */
  range: TextRange;
  /** The statement's text. A block's lines are joined with line feeds and carry no carriage returns. */
  text: string;
  /** Written as a block (`header` ... `endheader`) and not on one line. */
  block: boolean;
  /** Alignment or position words: `center` in `center footer`, `right top` in `legend right top`. */
  placement?: string;
}

/** Lines that are neither nodes nor unknown text, collected for dialects that opt in. */
export interface TreeControls {
  title?: TreeControl;
  caption?: TreeControl;
  header?: TreeControl;
  footer?: TreeControl;
  legend?: TreeControl;
  /** The first direction line; `value` is the lower-cased keyword, such as `top to bottom direction`. */
  direction?: { value: string; range: TextRange };
  /**
   * `left side` and `right side` lines in document order. The switch is document-wide: it applies to
   * every depth-2 `*` node after it, in every root, until the next switch.
   */
  sideSwitches: Array<{ side: "left" | "right"; range: TextRange }>;
}

export interface TreeDocument<TNode extends TreeNode = TreeNode> {
  nodes: TNode[];
  roots: TNode[];
  /** Always empty for dialects that do not allow arrows. */
  relationships: TreeRelationship[];
  unknown: Array<{ text: string; range: TextRange }>;
  diagnostics: LanguageDiagnostic[];
  /** Always present; empty unless the dialect enables the matching options. */
  controls: TreeControls;
}

export interface TreeNodeInput {
  label: string;
  color?: string;
  textColor?: string;
  stereotype?: string;
  link?: string;
  icon?: string;
  side?: Exclude<TreeSide, "root">;
}

/** What differs between the diagram kinds that share the marker-tree syntax. */
export interface TreeDialect {
  /** Prefix of generated ids: `wbs` gives `wbs-0` and `wbs-relationship-0`. */
  idPrefix: string;
  /** Short name used in diagnostic messages, such as `WBS`. */
  label: string;
  /** Opening tag including the `@`, such as `@startwbs`. */
  start: string;
  /** Closing tag including the `@`, such as `@endwbs`. */
  end: string;
  /** Lines that are recognised but are neither nodes nor unknown text. */
  control: RegExp;
  /** `**(id) Label` aliases. */
  allowAliases: boolean;
  /** `a -> b` relationship lines. */
  allowArrows: boolean;
  /**
   * Lines between `<style>` and `</style>` never become nodes or relationships, even when
   * they start with `*`, `+` or `-`. Non-blank body lines are kept in `unknown`.
   */
  skipStyleBlocks: boolean;
  /**
   * Markdown forms of the markers. `hash` reads `# Root` / `## Child` headers, `indentedList` reads
   * indented `*` bullets whose depth comes from a stack of indentations. Such nodes carry
   * `markdown` and get diagnostics for the combinations the engine rejects.
   */
  markers?: { hash?: boolean; indentedList?: boolean };
  /**
   * The word after `left` / `right` that switches sides, such as `side` for `left side`. Setting it
   * also changes the side rules: a depth-1 node is always the root, a `+` node is always on the
   * right, a `-` node on the left, a `*` node at depth 2 follows the last switch, and deeper nodes
   * follow their parent.
   */
  sideKeyword?: string;
  /** Full, lower-case direction lines such as `left to right direction`, recorded in `controls`. */
  directionKeywords?: readonly string[];
  /** A boxless node with a colour is written `**[#color]_ Label`, with the `_` after the colour. */
  boxlessFollowsColor?: boolean;
  /**
   * Recognise `title`, `caption`, `header`, `footer` and `legend` (with their blocks) and record
   * them in `controls`. Block bodies are never parsed as nodes.
   */
  furniture?: boolean;
}
