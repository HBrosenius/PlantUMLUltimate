import type { LanguageDiagnostic, TextRange } from "@plantuml-studio/language-core";

export type UseCaseElementKind = "actor" | "usecase";

export interface UseCaseElement {
  id: string;
  kind: UseCaseElementKind;
  label: string;
  alias?: string;
  business: boolean;
  stereotype?: string;
  color?: string;
  style?: string;
  packageId?: string;
  sourceRange: TextRange;
}

export interface UseCasePackage {
  id: string;
  kind: "package" | "rectangle";
  label: string;
  alias?: string;
  color?: string;
  stereotype?: string;
  parentId?: string;
  sourceRange: TextRange;
  openRange: TextRange;
  closeRange: TextRange;
}

export type UseCaseRelationshipKind = "association" | "include" | "extend" | "generalization";

export interface UseCaseRelationship {
  id: string;
  from: string;
  to: string;
  arrow: string;
  kind: UseCaseRelationshipKind;
  label?: string;
  color?: string;
  lineStyle?: "solid" | "dashed" | "dotted" | "bold";
  direction?: "left" | "right" | "up" | "down";
  sourceRange: TextRange;
}

export interface UseCaseNote {
  id: string;
  text: string;
  placement?: "left" | "right" | "top" | "bottom";
  targetIds: string[];
  alias?: string;
  color?: string;
  sourceRange: TextRange;
}

export interface UseCaseDocument {
  elements: UseCaseElement[];
  actors: UseCaseElement[];
  useCases: UseCaseElement[];
  packages: UseCasePackage[];
  relationships: UseCaseRelationship[];
  notes: UseCaseNote[];
  stereotypes: string[];
  unknown: Array<{ text: string; range: TextRange }>;
  diagnostics: LanguageDiagnostic[];
}
