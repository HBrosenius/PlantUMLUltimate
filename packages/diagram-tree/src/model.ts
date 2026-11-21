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

export interface TreeDocument<TNode extends TreeNode = TreeNode> {
  nodes: TNode[];
  roots: TNode[];
  /** Always empty for dialects that do not allow arrows. */
  relationships: TreeRelationship[];
  unknown: Array<{ text: string; range: TextRange }>;
  diagnostics: LanguageDiagnostic[];
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
}
