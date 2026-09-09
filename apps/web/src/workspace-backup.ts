import { normalizeSession, type DocumentVersion, type WorkspaceSession } from "./workspace-storage";

interface WorkspaceBackup {
  kind: "plantuml-studio-workspace";
  version: 1 | 2;
  createdAt: string;
  session: WorkspaceSession;
  versions?: DocumentVersion[];
  omittedEncryptedDocuments?: number;
}

const VERSION_REASONS = new Set(["opened", "saved", "manual", "before-restore", "restored", "collaboration"]);
const DIAGRAM_KINDS = new Set(["gantt", "sequence", "usecase", "class", "activity", "wbs"]);

function validVersion(value: unknown, historyIds: ReadonlySet<string>): value is DocumentVersion {
  if (!value || typeof value !== "object") return false;
  const version = value as Partial<DocumentVersion>;
  return Boolean(
    typeof version.id === "string" &&
    version.id &&
    typeof version.historyId === "string" &&
    historyIds.has(version.historyId) &&
    typeof version.source === "string" &&
    typeof version.sourceHash === "string" &&
    typeof version.fileName === "string" &&
    DIAGRAM_KINDS.has(version.diagramKind ?? "") &&
    typeof version.createdAt === "string" &&
    Number.isFinite(Date.parse(version.createdAt)) &&
    VERSION_REASONS.has(version.reason ?? "") &&
    typeof version.pinned === "boolean" &&
    (version.parentVersionId === undefined || typeof version.parentVersionId === "string") &&
    (version.label === undefined || typeof version.label === "string") &&
    (version.author === undefined ||
      (typeof version.author.id === "string" &&
        typeof version.author.name === "string" &&
        typeof version.author.color === "string" &&
        /^#[0-9a-f]{6}$/i.test(version.author.color))),
  );
}

export function serializeWorkspaceBackup(
  session: WorkspaceSession,
  versionsOrCreatedAt: readonly DocumentVersion[] | string = [],
  createdAtOverride?: string,
): string {
  const versions = typeof versionsOrCreatedAt === "string" ? [] : versionsOrCreatedAt;
  const createdAt =
    typeof versionsOrCreatedAt === "string" ? versionsOrCreatedAt : (createdAtOverride ?? new Date().toISOString());
  const encryptedHistoryIds = new Set(session.documents.filter((document) => document.encrypted).map((document) => document.historyId));
  const safeSession = {
    ...session,
    documents: session.documents.filter((document) => !document.encrypted),
    activeDocumentId: session.documents.some(
      (document) => document.id === session.activeDocumentId && !document.encrypted,
    )
      ? session.activeDocumentId
      : (session.documents.find((document) => !document.encrypted)?.id ?? ""),
  };
  return JSON.stringify(
    {
      kind: "plantuml-studio-workspace",
      version: 2,
      createdAt,
      session: safeSession,
      versions: versions.filter((version) => !encryptedHistoryIds.has(version.historyId)),
      omittedEncryptedDocuments: encryptedHistoryIds.size,
    } satisfies WorkspaceBackup,
    null,
    2,
  );
}

export function parseWorkspaceBackup(source: string): WorkspaceSession {
  return parseWorkspaceBackupBundle(source).session;
}

export function parseWorkspaceBackupBundle(source: string): { session: WorkspaceSession; versions: DocumentVersion[] } {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("The selected file is not valid JSON");
  }
  if (!value || typeof value !== "object") throw new Error("The selected file is not a PlantUML Ultimate backup");
  const backup = value as Partial<WorkspaceBackup>;
  if (backup.kind !== "plantuml-studio-workspace" || (backup.version !== 1 && backup.version !== 2) || !backup.session)
    throw new Error("The selected file is not a supported PlantUML Ultimate backup");
  const session = normalizeSession(backup.session);
  if (!session.documents.length) throw new Error("The backup does not contain any documents");
  const versions = backup.version === 2 && Array.isArray(backup.versions) ? backup.versions : [];
  const historyIds = new Set(session.documents.map((document) => document.historyId));
  if (!versions.every((version) => validVersion(version, historyIds)))
    throw new Error("The backup contains invalid document history");
  return {
    session,
    versions,
  };
}
