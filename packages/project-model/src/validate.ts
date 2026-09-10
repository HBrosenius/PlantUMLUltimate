import {
  PROJECT_FORMAT,
  PROJECT_LIMITS,
  PROJECT_SCHEMA_VERSION,
  type ProjectElement,
  type ProjectLink,
  type ProjectManifest,
} from "./types";
import { portablePathKey, validateProjectPath } from "./paths";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = /^[0-9a-f]{64}$/i;
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

export class ProjectFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectFormatError";
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ProjectFormatError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !own(value, key)) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new ProjectFormatError(`${label} has unsupported or missing fields`);
}

function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !uuid.test(value)) throw new ProjectFormatError(`${label} must be a UUID`);
  return value;
}

function optionalHash(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !hash.test(value)) throw new ProjectFormatError(`${label} must be a SHA-256 hash`);
  return value;
}

function element(value: unknown): ProjectElement {
  const item = record(value, "Element");
  exactKeys(item, ["id", "documentId", "kind", "locator"], "Element");
  if (item.kind !== "sequence-participant" && item.kind !== "class-entity" && item.kind !== "gantt-task")
    throw new ProjectFormatError("Element kind is unsupported");
  const locator = record(item.locator, "Element locator");
  exactKeys(locator, ["symbolKey", "keyType", "declarationHash", "sourceHash", "from", "to"], "Element locator");
  if (
    typeof locator.symbolKey !== "string" ||
    !locator.symbolKey ||
    locator.symbolKey.length > PROJECT_LIMITS.maxSymbolKeyCharacters
  )
    throw new ProjectFormatError("Element locator symbol key is invalid");
  if (locator.keyType !== "alias" && locator.keyType !== "semantic-key")
    throw new ProjectFormatError("Element locator key type is invalid");
  if (!hash.test(String(locator.declarationHash)) || !hash.test(String(locator.sourceHash)))
    throw new ProjectFormatError("Element locator hashes are invalid");
  if (
    !Number.isSafeInteger(locator.from) ||
    !Number.isSafeInteger(locator.to) ||
    (locator.from as number) < 0 ||
    (locator.to as number) <= (locator.from as number)
  )
    throw new ProjectFormatError("Element locator range is invalid");
  return {
    id: id(item.id, "Element id"),
    documentId: id(item.documentId, "Element document id"),
    kind: item.kind,
    locator: locator as unknown as ProjectElement["locator"],
  };
}

function validEndpoints(link: ProjectLink, elements: Map<string, ProjectElement>): boolean {
  const from = elements.get(link.from);
  const to = elements.get(link.to);
  return link.kind === "represents"
    ? from?.kind === "sequence-participant" && to?.kind === "class-entity"
    : from?.kind === "gantt-task" && (to?.kind === "sequence-participant" || to?.kind === "class-entity");
}

export function parseProjectManifest(value: unknown): ProjectManifest {
  const root = record(value, "Project manifest");
  exactKeys(
    root,
    ["format", "schemaVersion", "projectId", "revisionId", "name", "documents", "elements", "links"],
    "Project manifest",
  );
  if (root.format !== PROJECT_FORMAT || root.schemaVersion !== PROJECT_SCHEMA_VERSION)
    throw new ProjectFormatError("Unsupported project format version");
  if (typeof root.name !== "string" || !root.name.trim() || root.name.length > PROJECT_LIMITS.maxNameCharacters)
    throw new ProjectFormatError("Project name is invalid");
  if (!Array.isArray(root.documents) || !Array.isArray(root.elements) || !Array.isArray(root.links))
    throw new ProjectFormatError("Project collections must be arrays");
  if (
    root.documents.length > PROJECT_LIMITS.maxDocuments ||
    root.elements.length > PROJECT_LIMITS.maxElements ||
    root.links.length > PROJECT_LIMITS.maxLinks
  )
    throw new ProjectFormatError("Project exceeds configured limits");
  const documents = root.documents.map((value): ProjectManifest["documents"][number] => {
    const item = record(value, "Document");
    const allowed = ["id", "path", "format", "observedSourceHash", "observedFileHash", "expectedNativeDocumentId"];
    if (
      Object.keys(item).some((key) => !allowed.includes(key)) ||
      ["id", "path", "format"].some((key) => !own(item, key))
    )
      throw new ProjectFormatError("Document has unsupported or missing fields");
    const pathError = validateProjectPath(item.path);
    if (pathError) throw new ProjectFormatError(pathError);
    if (item.format !== "plantuml" && item.format !== "pumlu")
      throw new ProjectFormatError("Document format is invalid");
    const format = item.format;
    const expectedNativeDocumentId =
      item.expectedNativeDocumentId === undefined
        ? undefined
        : id(item.expectedNativeDocumentId, "Expected native document id");
    if (item.format === "plantuml" && expectedNativeDocumentId)
      throw new ProjectFormatError("Only native documents may have a native document id");
    const observedSourceHash = optionalHash(item.observedSourceHash, "Observed source hash");
    const observedFileHash = optionalHash(item.observedFileHash, "Observed file hash");
    return {
      id: id(item.id, "Document id"),
      path: item.path as string,
      format,
      ...(observedSourceHash ? { observedSourceHash } : {}),
      ...(observedFileHash ? { observedFileHash } : {}),
      ...(expectedNativeDocumentId ? { expectedNativeDocumentId } : {}),
    };
  });
  const unique = (values: readonly string[], label: string) => {
    if (new Set(values).size !== values.length) throw new ProjectFormatError(`Duplicate ${label}`);
  };
  unique(
    documents.map((item) => item.id),
    "document id",
  );
  unique(
    documents.map((item) => item.path),
    "document path",
  );
  unique(
    documents.map((item) => portablePathKey(item.path)),
    "case-folded document path",
  );
  const elements = root.elements.map(element);
  unique(
    elements.map((item) => item.id),
    "element id",
  );
  const documentIds = new Set(documents.map((item) => item.id));
  if (elements.some((item) => !documentIds.has(item.documentId)))
    throw new ProjectFormatError("Element references a missing document");
  const links = root.links.map((value) => {
    const item = record(value, "Link");
    exactKeys(item, ["id", "kind", "from", "to"], "Link");
    if (item.kind !== "represents" && item.kind !== "implements") throw new ProjectFormatError("Link kind is invalid");
    return {
      id: id(item.id, "Link id"),
      kind: item.kind,
      from: id(item.from, "Link source"),
      to: id(item.to, "Link target"),
    } as ProjectLink;
  });
  unique(
    links.map((item) => item.id),
    "link id",
  );
  const elementMap = new Map(elements.map((item) => [item.id, item]));
  if (links.some((link) => !validEndpoints(link, elementMap)))
    throw new ProjectFormatError("Link endpoints are invalid");
  unique(
    links.map((item) => `${item.kind}:${item.from}:${item.to}`),
    "link",
  );
  return {
    format: PROJECT_FORMAT,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId: id(root.projectId, "Project id"),
    revisionId: id(root.revisionId, "Project revision id"),
    name: root.name as string,
    documents,
    elements,
    links,
  };
}

export function parseProjectManifestJson(json: string): ProjectManifest {
  if (new TextEncoder().encode(json).byteLength > PROJECT_LIMITS.maxManifestBytes)
    throw new ProjectFormatError("Manifest exceeds configured limit");
  try {
    return parseProjectManifest(JSON.parse(json));
  } catch (error) {
    if (error instanceof ProjectFormatError) throw error;
    throw new ProjectFormatError("Manifest is not valid JSON");
  }
}

export function serializeProjectManifest(manifest: ProjectManifest): string {
  const valid = parseProjectManifest(manifest);
  return (
    JSON.stringify(
      {
        ...valid,
        documents: [...valid.documents].sort((a, b) => a.id.localeCompare(b.id)),
        elements: [...valid.elements].sort((a, b) => a.id.localeCompare(b.id)),
        links: [...valid.links].sort((a, b) => a.id.localeCompare(b.id)),
      },
      null,
      2,
    ) + "\n"
  );
}
