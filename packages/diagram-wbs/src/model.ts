import type { LanguageDiagnostic, TextRange } from "@plantuml-studio/language-core";

export type WbsSide = "root" | "left" | "right";

export interface WbsNode {
  id: string;
  label: string;
  depth: number;
  side: WbsSide;
  marker: string;
  alias?: string;
  parentId?: string;
  color?: string;
  textColor?: string;
  stereotype?: string;
  sourceRange: TextRange;
  subtreeRange: TextRange;
}

export interface WbsRelationship {
  id: string;
  from: string;
  to: string;
  arrow: string;
  color?: string;
  sourceRange: TextRange;
}

export interface WbsDocument {
  nodes: WbsNode[];
  roots: WbsNode[];
  relationships: WbsRelationship[];
  unknown: Array<{ text: string; range: TextRange }>;
  diagnostics: LanguageDiagnostic[];
}

export interface WbsNodeInput {
  label: string;
  color?: string;
  textColor?: string;
  stereotype?: string;
  side?: Exclude<WbsSide, "root">;
}
