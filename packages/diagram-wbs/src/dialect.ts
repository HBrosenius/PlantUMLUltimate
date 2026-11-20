import type { TreeDialect } from "@plantuml-studio/diagram-tree";

const CONTROL =
  /^(?:@startwbs|@endwbs|title\b|caption\b|header\b|footer\b|legend\b|endlegend\b|skinparam\b|style\b|<style>|<\/style>)\b/i;

/** The WBS flavour of the shared marker-tree syntax. Internal to this package. */
export const WBS_DIALECT: TreeDialect = {
  idPrefix: "wbs",
  label: "WBS",
  start: "@startwbs",
  end: "@endwbs",
  control: CONTROL,
  allowAliases: true,
  allowArrows: true,
  skipStyleBlocks: true,
};
