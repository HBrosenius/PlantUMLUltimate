export const PROJECT_FORMAT = "plantuml-ultimate-project";
export const PROJECT_SCHEMA_VERSION = 1;

export const PROJECT_LIMITS = {
  maxDocuments: 200,
  maxElements: 5_000,
  maxLinks: 10_000,
  maxManifestBytes: 2 * 1024 * 1024,
  maxPathCharacters: 512,
  maxNameCharacters: 256,
  maxSymbolKeyCharacters: 512,
} as const;

export type ProjectDocumentFormat = "plantuml" | "pumlu";
export type ProjectElementKind = "sequence-participant" | "class-entity" | "gantt-task";
export type ProjectLinkKind = "represents" | "implements";
export type LocatorKeyType = "alias" | "semantic-key";

export interface ProjectDocument {
  id: string;
  path: string;
  format: ProjectDocumentFormat;
  observedSourceHash?: string;
  observedFileHash?: string;
  expectedNativeDocumentId?: string;
}

export interface ProjectElementLocator {
  symbolKey: string;
  keyType: LocatorKeyType;
  declarationHash: string;
  sourceHash: string;
  from: number;
  to: number;
}

export interface ProjectElement {
  id: string;
  documentId: string;
  kind: ProjectElementKind;
  locator: ProjectElementLocator;
}

export interface ProjectLink {
  id: string;
  kind: ProjectLinkKind;
  from: string;
  to: string;
}

export interface ProjectManifest {
  format: typeof PROJECT_FORMAT;
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  projectId: string;
  revisionId: string;
  name: string;
  documents: ProjectDocument[];
  elements: ProjectElement[];
  links: ProjectLink[];
}

export interface ResolvableDeclaration {
  kind: ProjectElementKind;
  symbolKey: string;
  declarationHash: string;
  from: number;
  to: number;
}

export type ElementResolution =
  | { state: "resolved"; elementId: string; declaration: ResolvableDeclaration; locator: ProjectElementLocator }
  | { state: "needs-review"; elementId: string; candidates: readonly ResolvableDeclaration[] }
  | { state: "missing"; elementId: string }
  | { state: "ambiguous"; elementId: string; candidates: readonly ResolvableDeclaration[] }
  | { state: "invalid-evidence"; elementId: string };

export interface ResolvedElement extends ProjectElement {
  resolution: ElementResolution;
}

export interface ImpactPath {
  elementIds: readonly string[];
  linkIds: readonly string[];
}

export interface ImpactResult {
  paths: readonly ImpactPath[];
  truncated: boolean;
  depth: number;
}
