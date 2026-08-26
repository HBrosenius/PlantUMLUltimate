import type { LanguageDiagnostic, TextRange } from "@plantuml-studio/language-core";

export type ActivityNodeKind = "start" | "action" | "stop" | "end" | "detach" | "kill";

export interface ActivityNode {
  id: string;
  kind: ActivityNodeKind;
  label: string;
  color?: string;
  stereotype?: string;
  partitionId?: string;
  sourceRange: TextRange;
}

export type ActivityControlKind =
  | "if"
  | "elseif"
  | "else"
  | "endif"
  | "switch"
  | "case"
  | "endswitch"
  | "fork"
  | "fork-again"
  | "end-fork"
  | "split"
  | "split-again"
  | "end-split"
  | "repeat"
  | "repeat-while"
  | "while"
  | "endwhile"
  | "break";

export interface ActivityControl {
  id: string;
  kind: ActivityControlKind;
  condition?: string;
  label?: string;
  sourceRange: TextRange;
}

export interface ActivityPartition {
  id: string;
  label: string;
  color?: string;
  parentId?: string;
  sourceRange: TextRange;
  openRange: TextRange;
  closeRange: TextRange;
}

export interface ActivityNote {
  id: string;
  text: string;
  placement: "left" | "right" | "top" | "bottom";
  color?: string;
  targetId?: string;
  sourceRange: TextRange;
}

export interface ActivityArrow {
  id: string;
  label?: string;
  color?: string;
  lineStyle?: "dashed" | "dotted" | "bold";
  sourceRange: TextRange;
}

export interface ActivityDocument {
  nodes: ActivityNode[];
  controls: ActivityControl[];
  partitions: ActivityPartition[];
  notes: ActivityNote[];
  arrows: ActivityArrow[];
  unknown: Array<{ text: string; range: TextRange }>;
  diagnostics: LanguageDiagnostic[];
}
