import type { LanguageDiagnostic, TextRange } from "@plantuml-studio/language-core";

export type ClassEntityKind = "class" | "abstract" | "interface" | "enum" | "annotation";
export interface ClassMember {
  id: string;
  text: string;
  kind: "field" | "method" | "raw";
  name?: string;
  type?: string;
  parameters?: string;
  visibility?: "+" | "-" | "#" | "~";
  isStatic: boolean;
  isAbstract: boolean;
  sourceRange: TextRange;
}
export interface ClassEntity {
  id: string;
  kind: ClassEntityKind;
  label: string;
  alias?: string;
  stereotype?: string;
  color?: string;
  generic?: string;
  members: ClassMember[];
  packageId?: string;
  sourceRange: TextRange;
  openRange: TextRange;
}
export interface ClassPackage {
  id: string;
  kind: "package" | "namespace" | "folder" | "frame" | "node";
  label: string;
  alias?: string;
  color?: string;
  parentId?: string;
  sourceRange: TextRange;
  openRange: TextRange;
  closeRange: TextRange;
}
export type ClassRelationshipKind =
  "inheritance" | "implementation" | "composition" | "aggregation" | "association" | "dependency";
export interface ClassRelationship {
  id: string;
  from: string;
  to: string;
  arrow: string;
  kind: ClassRelationshipKind;
  label?: string;
  fromMultiplicity?: string;
  toMultiplicity?: string;
  color?: string;
  lineStyle?: "solid" | "dashed" | "dotted" | "bold";
  sourceRange: TextRange;
}
export interface ClassNote {
  id: string;
  text: string;
  placement?: "left" | "right" | "top" | "bottom";
  targetId?: string;
  color?: string;
  sourceRange: TextRange;
}
export interface ClassDocument {
  entities: ClassEntity[];
  packages: ClassPackage[];
  relationships: ClassRelationship[];
  notes: ClassNote[];
  stereotypes: string[];
  unknown: Array<{ text: string; range: TextRange }>;
  diagnostics: LanguageDiagnostic[];
}
