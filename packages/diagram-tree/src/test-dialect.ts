import type { TreeDialect } from "./model";

/** A dialect that differs from WBS in every option, so the tests prove the parameterisation. */
export const TEST_DIALECT: TreeDialect = {
  idPrefix: "tree",
  label: "Tree",
  start: "@starttree",
  end: "@endtree",
  control: /^(?:@starttree|@endtree|title\b|<style>|<\/style>)/i,
  allowAliases: false,
  allowArrows: false,
  skipStyleBlocks: true,
};

export const WBS_LIKE_DIALECT: TreeDialect = {
  ...TEST_DIALECT,
  idPrefix: "wbs",
  label: "WBS",
  start: "@startwbs",
  end: "@endwbs",
  control: /^(?:@startwbs|@endwbs|title\b|<style>|<\/style>)/i,
  allowAliases: true,
  allowArrows: true,
};
