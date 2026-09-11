export const DOCUMENT_MAGIC = "PUMLUDOC";
export const ENVELOPE_VERSION = 1;
export const SCHEMA_VERSION = 1;

export const DOCUMENT_LIMITS = {
  maxFileBytes: 80 * 1024 * 1024,
  maxHeaderBytes: 4096,
  maxDecompressedBytes: 80 * 1024 * 1024,
  maxSourceBytes: 5 * 1024 * 1024,
  maxExpandedHistoryBytes: 64 * 1024 * 1024,
  maxVersions: 500,
  maxContents: 500,
  maxDeltaDepth: 9,
  maxIdentifierCharacters: 128,
  maxLabelCharacters: 512,
  maxAuthorNameCharacters: 256,
  maxProjectDiagrams: 200,
  maxProjectElements: 5_000,
  maxProjectLinks: 10_000,
  maxProjectNameCharacters: 256,
  maxProjectExpandedBytes: 128 * 1024 * 1024,
  maxProjectSymbolKeyCharacters: 512,
} as const;

export const DEFAULT_HISTORY_POLICY = {
  maxVersions: 100,
  maxLogicalBytes: 16 * 1024 * 1024,
} as const;

export type DocumentFormatErrorCode =
  | "unsupported-version"
  | "invalid-file"
  | "limit-exceeded"
  | "password-required"
  | "unlock-failed"
  | "protected-history-overflow";

export class DocumentFormatError extends Error {
  constructor(
    readonly code: DocumentFormatErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DocumentFormatError";
  }
}

export type PortableDiagramKind = "gantt" | "sequence" | "usecase" | "class" | "activity" | "wbs";
export type PortableVersionReason = "opened" | "saved" | "manual" | "before-restore" | "restored" | "collaboration";

export interface UnencryptedEnvelopeHeader {
  compression: "gzip" | "none";
  encryption: "none";
}

export interface EncryptedEnvelopeHeader {
  compression: "gzip" | "none";
  encryption: "aes-256-gcm";
  kdf: "pbkdf2-sha256";
  iterations: number;
  salt: string;
  iv: string;
  tagBits: 128;
}

export type EnvelopeHeader = UnencryptedEnvelopeHeader | EncryptedEnvelopeHeader;

export interface PortableCurrentDocument {
  source: string;
  sourceHash: string;
  diagramKind: PortableDiagramKind;
  baselineVersionId?: string;
}

export interface PortableDocumentSettings {
  resourceCapacities: Record<string, number>;
}

export interface PortableHistoryPolicy {
  maxVersions: number;
  maxLogicalBytes: number;
}

export interface PortableVersionAuthor {
  id: string;
  name: string;
  color: string;
}

export interface PortableVersion {
  id: string;
  parentVersionId?: string;
  contentId: string;
  createdAt: string;
  sequence: number;
  reason: PortableVersionReason;
  label?: string;
  author?: PortableVersionAuthor;
  pinned: boolean;
  diagramKind: PortableDiagramKind;
  ancestryTruncated?: true;
}

export interface FullContentRecord {
  id: string;
  kind: "full";
  source: string;
  byteLength: number;
}

export interface SpliceContentRecord {
  id: string;
  kind: "splice";
  baseContentId: string;
  prefixBytes: number;
  deleteBytes: number;
  insertBase64: string;
  byteLength: number;
}

export type ContentRecord = FullContentRecord | SpliceContentRecord;

export interface PortableDocument {
  schemaVersion: 1;
  documentId: string;
  savedAt: string;
  current: PortableCurrentDocument;
  settings: PortableDocumentSettings;
  historyPolicy: PortableHistoryPolicy;
  versions: PortableVersion[];
  contents: ContentRecord[];
}

export type PortableProjectElementKind = "sequence-participant" | "class-entity" | "gantt-task";
export type PortableProjectLinkKind = "represents" | "implements";

export interface PortableProjectElement {
  id: string;
  documentId: string;
  kind: PortableProjectElementKind;
  locator: {
    symbolKey: string;
    keyType: "alias" | "semantic-key";
    declarationHash: string;
    sourceHash: string;
    from: number;
    to: number;
  };
}

export interface PortableProjectLink {
  id: string;
  kind: PortableProjectLinkKind;
  from: string;
  to: string;
}

export interface PortableProjectDiagram {
  id: string;
  name: string;
  document: PortableDocument;
}

/** Logical v2 payload, before the common envelope is compressed and optionally encrypted. */
export interface PortableProject {
  schemaVersion: 2;
  projectId: string;
  revisionId: string;
  name: string;
  savedAt: string;
  diagrams: PortableProjectDiagram[];
  elements: PortableProjectElement[];
  links: PortableProjectLink[];
}

export interface DecodedEnvelope {
  header: EnvelopeHeader;
  headerBytes: Uint8Array;
  payload: Uint8Array;
  authenticatedData: Uint8Array;
}
