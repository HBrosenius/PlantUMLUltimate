import type { LanguageDiagnostic, TextRange } from "@plantuml-studio/language-core";
import type { TreeControl, TreeNode, TreeNodeInput, TreeSide } from "@plantuml-studio/diagram-tree";

export type MindmapSide = TreeSide;

/** A mindmap node. Markdown-form nodes (`markdown` is set) can only be edited as text. */
export type MindmapNode = TreeNode;

export type MindmapNodeInput = TreeNodeInput;

/**
 * `bottom to top` is accepted by the engine and drawn exactly like `right to left`. It is parsed and
 * kept, but the app should not offer it: see `MINDMAP_OFFERED_DIRECTIONS`.
 */
export type MindmapDirection = "left-to-right" | "top-to-bottom" | "right-to-left" | "bottom-to-top";

/** The directions a settings UI should offer. `bottom-to-top` would only duplicate `right-to-left`. */
export const MINDMAP_OFFERED_DIRECTIONS: readonly MindmapDirection[] = [
  "left-to-right",
  "top-to-bottom",
  "right-to-left",
];

/** A `title`, `caption`, `header`, `footer` or `legend` statement and where it is written. */
export type MindmapControl = TreeControl;

/**
 * A `left side` or `right side` line. The switch is document-wide: it applies to every depth-2 `*`
 * node after it, in every root, until the next switch. A `+` node is always on the right and a `-`
 * node always on the left, whatever the switch says.
 */
export interface MindmapSideSwitch {
  side: "left" | "right";
  range: TextRange;
}

export interface MindmapDocument {
  nodes: MindmapNode[];
  roots: MindmapNode[];
  unknown: Array<{ text: string; range: TextRange }>;
  diagnostics: LanguageDiagnostic[];
  /** The first direction line. Undefined means the engine default, `left-to-right`. */
  direction?: { value: MindmapDirection; range: TextRange };
  title?: MindmapControl;
  caption?: MindmapControl;
  header?: MindmapControl;
  footer?: MindmapControl;
  legend?: MindmapControl;
  /** `left side` and `right side` lines in document order. */
  sideSwitches: MindmapSideSwitch[];
}
