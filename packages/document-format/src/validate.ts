import {
  DOCUMENT_LIMITS,
  DocumentFormatError,
  type ContentRecord,
  type PortableDiagramKind,
  type PortableDocument,
  type PortableVersion,
  type PortableVersionReason,
} from "./types";

const UTF8 = new TextEncoder();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const DIAGRAM_KINDS = new Set<PortableDiagramKind>(["gantt", "sequence", "usecase", "class", "activity", "wbs"]);
const VERSION_REASONS = new Set<PortableVersionReason>([
  "opened",
  "saved",
  "manual",
  "before-restore",
  "restored",
  "collaboration",
]);

function invalid(message: string): never {
  throw new DocumentFormatError("invalid-file", message);
}

function limit(message: string): never {
  throw new DocumentFormatError("limit-exceeded", message);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) invalid(`${name} contains unsupported field ${extras[0]}`);
}

function string(value: unknown, name: string, maxCharacters?: number): string {
  if (typeof value !== "string") invalid(`${name} must be a string`);
  if (maxCharacters !== undefined && value.length > maxCharacters) limit(`${name} is too long`);
  return value;
}

function integer(value: unknown, name: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum)
    invalid(`${name} must be a whole number from ${minimum} to ${maximum}`);
  return value as number;
}

function identifier(value: unknown, name: string): string {
  const result = string(value, name, DOCUMENT_LIMITS.maxIdentifierCharacters);
  if (!result || !UUID.test(result)) invalid(`${name} must be a UUID`);
  return result;
}

function hash(value: unknown, name: string): string {
  const result = string(value, name, 64);
  if (!SHA256.test(result)) invalid(`${name} must be a lowercase SHA-256 hash`);
  return result;
}

function timestamp(value: unknown, name: string): string {
  const result = string(value, name, 32);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(result) || !Number.isFinite(Date.parse(result)))
    invalid(`${name} must be a UTC ISO timestamp`);
  return result;
}

function diagramKind(value: unknown, name: string): PortableDiagramKind {
  if (typeof value !== "string" || !DIAGRAM_KINDS.has(value as PortableDiagramKind))
    invalid(`${name} is not a supported diagram kind`);
  return value as PortableDiagramKind;
}

function base64(value: unknown, name: string): string {
  const result = string(value, name);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(result))
    invalid(`${name} must be canonical base64`);
  return result;
}

function validateContent(value: unknown, index: number, preceding: Set<string>): ContentRecord {
  const item = record(value, `contents[${index}]`);
  const id = hash(item.id, `contents[${index}].id`);
  if (preceding.has(id)) invalid(`contents contains duplicate ID ${id}`);
  const byteLength = integer(item.byteLength, `contents[${index}].byteLength`, 0, DOCUMENT_LIMITS.maxSourceBytes);
  if (item.kind === "full") {
    exactKeys(item, ["id", "kind", "source", "byteLength"], `contents[${index}]`);
    const source = string(item.source, `contents[${index}].source`);
    if (UTF8.encode(source).byteLength !== byteLength) invalid(`contents[${index}].byteLength does not match source`);
  } else if (item.kind === "splice") {
    exactKeys(
      item,
      ["id", "kind", "baseContentId", "prefixBytes", "deleteBytes", "insertBase64", "byteLength"],
      `contents[${index}]`,
    );
    const baseContentId = hash(item.baseContentId, `contents[${index}].baseContentId`);
    if (!preceding.has(baseContentId)) invalid(`contents[${index}] must reference an earlier base content`);
    integer(item.prefixBytes, `contents[${index}].prefixBytes`, 0, DOCUMENT_LIMITS.maxSourceBytes);
    integer(item.deleteBytes, `contents[${index}].deleteBytes`, 0, DOCUMENT_LIMITS.maxSourceBytes);
    base64(item.insertBase64, `contents[${index}].insertBase64`);
  } else invalid(`contents[${index}].kind is not supported`);
  preceding.add(id);
  return item as unknown as ContentRecord;
}

function validateVersion(value: unknown, index: number, preceding: Set<string>): PortableVersion {
  const item = record(value, `versions[${index}]`);
  exactKeys(
    item,
    [
      "id",
      "parentVersionId",
      "contentId",
      "createdAt",
      "sequence",
      "reason",
      "label",
      "author",
      "pinned",
      "diagramKind",
      "ancestryTruncated",
    ],
    `versions[${index}]`,
  );
  const id = identifier(item.id, `versions[${index}].id`);
  if (preceding.has(id)) invalid(`versions contains duplicate ID ${id}`);
  if (item.parentVersionId !== undefined) {
    const parent = identifier(item.parentVersionId, `versions[${index}].parentVersionId`);
    if (!preceding.has(parent)) invalid(`versions[${index}] must reference an earlier parent version`);
  }
  hash(item.contentId, `versions[${index}].contentId`);
  timestamp(item.createdAt, `versions[${index}].createdAt`);
  integer(item.sequence, `versions[${index}].sequence`, 0, Number.MAX_SAFE_INTEGER);
  if (typeof item.reason !== "string" || !VERSION_REASONS.has(item.reason as PortableVersionReason))
    invalid(`versions[${index}].reason is not supported`);
  if (item.label !== undefined) string(item.label, `versions[${index}].label`, DOCUMENT_LIMITS.maxLabelCharacters);
  if (typeof item.pinned !== "boolean") invalid(`versions[${index}].pinned must be boolean`);
  diagramKind(item.diagramKind, `versions[${index}].diagramKind`);
  if (item.ancestryTruncated !== undefined && item.ancestryTruncated !== true)
    invalid(`versions[${index}].ancestryTruncated must be true when present`);
  if (item.author !== undefined) {
    const author = record(item.author, `versions[${index}].author`);
    exactKeys(author, ["id", "name", "color"], `versions[${index}].author`);
    string(author.id, `versions[${index}].author.id`, DOCUMENT_LIMITS.maxIdentifierCharacters);
    string(author.name, `versions[${index}].author.name`, DOCUMENT_LIMITS.maxAuthorNameCharacters);
    string(author.color, `versions[${index}].author.color`, DOCUMENT_LIMITS.maxIdentifierCharacters);
  }
  preceding.add(id);
  return item as unknown as PortableVersion;
}

export function validateDocument(value: unknown): PortableDocument {
  const document = record(value, "document");
  exactKeys(
    document,
    ["schemaVersion", "documentId", "savedAt", "current", "settings", "historyPolicy", "versions", "contents"],
    "document",
  );
  if (document.schemaVersion !== 1) {
    if (Number.isSafeInteger(document.schemaVersion))
      throw new DocumentFormatError(
        "unsupported-version",
        `Unsupported document schema version ${document.schemaVersion}`,
      );
    invalid("schemaVersion must be 1");
  }
  identifier(document.documentId, "documentId");
  timestamp(document.savedAt, "savedAt");

  const current = record(document.current, "current");
  exactKeys(current, ["source", "sourceHash", "diagramKind", "baselineVersionId"], "current");
  const currentSource = string(current.source, "current.source");
  if (UTF8.encode(currentSource).byteLength > DOCUMENT_LIMITS.maxSourceBytes) limit("current.source exceeds 5 MiB");
  hash(current.sourceHash, "current.sourceHash");
  diagramKind(current.diagramKind, "current.diagramKind");
  const baselineVersionId =
    current.baselineVersionId === undefined
      ? undefined
      : identifier(current.baselineVersionId, "current.baselineVersionId");

  const settings = record(document.settings, "settings");
  exactKeys(settings, ["resourceCapacities"], "settings");
  const capacities = record(settings.resourceCapacities, "settings.resourceCapacities");
  for (const [name, capacity] of Object.entries(capacities)) {
    if (!name || name.length > DOCUMENT_LIMITS.maxAuthorNameCharacters) limit("Resource capacity name is too long");
    integer(capacity, `settings.resourceCapacities.${name}`, 1, 500);
  }

  const historyPolicy = record(document.historyPolicy, "historyPolicy");
  exactKeys(historyPolicy, ["maxVersions", "maxLogicalBytes"], "historyPolicy");
  integer(historyPolicy.maxVersions, "historyPolicy.maxVersions", 10, 500);
  integer(historyPolicy.maxLogicalBytes, "historyPolicy.maxLogicalBytes", 1024 * 1024, 64 * 1024 * 1024);

  if (!Array.isArray(document.contents)) invalid("contents must be an array");
  if (document.contents.length > DOCUMENT_LIMITS.maxContents) limit("contents exceeds 500 records");
  const contentIds = new Set<string>();
  const contents = document.contents.map((item, index) => validateContent(item, index, contentIds));

  if (!Array.isArray(document.versions)) invalid("versions must be an array");
  if (document.versions.length > DOCUMENT_LIMITS.maxVersions) limit("versions exceeds 500 records");
  const versionIds = new Set<string>();
  let previous: PortableVersion | undefined;
  const versions = document.versions.map((item, index) => {
    const version = validateVersion(item, index, versionIds);
    if (!contentIds.has(version.contentId)) invalid(`versions[${index}] references missing content`);
    if (
      previous &&
      (version.sequence < previous.sequence ||
        (version.sequence === previous.sequence && version.id.localeCompare(previous.id) < 0))
    )
      invalid("versions must be ordered by sequence and ID");
    previous = version;
    return version;
  });
  const expandedBytes = contents.reduce((total, item) => total + item.byteLength, 0);
  if (expandedBytes > DOCUMENT_LIMITS.maxExpandedHistoryBytes) limit("Expanded unique history exceeds 64 MiB");
  if (baselineVersionId && !versionIds.has(baselineVersionId))
    invalid("current baseline must reference a retained version");
  return { ...document, contents, versions } as unknown as PortableDocument;
}
