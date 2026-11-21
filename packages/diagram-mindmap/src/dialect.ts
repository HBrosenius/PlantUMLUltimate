import type { TreeDialect } from "@plantuml-studio/diagram-tree";

/** Written as `left to right direction`. The engine also accepts `bottom to top direction`. */
export const MINDMAP_DIRECTION_KEYWORDS = [
  "left to right direction",
  "top to bottom direction",
  "right to left direction",
  "bottom to top direction",
] as const;

// Title, caption, header, footer and legend are collected by the shared parser (`furniture`), the
// direction and `left side` lines through their own options. What is left here is recognised and
// skipped: the tags, skinparam, style lines and preprocessor lines such as `!theme`.
const CONTROL = /^(?:@startmindmap|@endmindmap|skinparam\b|style\b|<style>|<\/style>|![a-z]+)/i;

/** The mindmap flavour of the shared marker-tree syntax. Internal to this package. */
export const MINDMAP_DIALECT: TreeDialect = {
  idPrefix: "mindmap",
  label: "Mindmap",
  start: "@startmindmap",
  end: "@endmindmap",
  control: CONTROL,
  allowAliases: false,
  allowArrows: false,
  skipStyleBlocks: true,
  markers: { hash: true, indentedList: true },
  sideKeyword: "side",
  directionKeywords: MINDMAP_DIRECTION_KEYWORDS,
  boxlessFollowsColor: true,
  furniture: true,
};
