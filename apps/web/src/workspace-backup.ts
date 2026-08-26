import { normalizeSession, type DocumentVersion, type WorkspaceSession } from "./workspace-storage";

interface WorkspaceBackup {
  kind: "plantuml-studio-workspace";
  version: 1 | 2;
  createdAt: string;
  session: WorkspaceSession;
  versions?: DocumentVersion[];
}

export function serializeWorkspaceBackup(
  session: WorkspaceSession,
  versionsOrCreatedAt: readonly DocumentVersion[] | string = [],
  createdAtOverride?: string,
): string {
  const versions = typeof versionsOrCreatedAt === "string" ? [] : versionsOrCreatedAt;
  const createdAt =
    typeof versionsOrCreatedAt === "string" ? versionsOrCreatedAt : (createdAtOverride ?? new Date().toISOString());
  return JSON.stringify(
    {
      kind: "plantuml-studio-workspace",
      version: 2,
      createdAt,
      session,
      versions: [...versions],
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
  return {
    session,
    versions: backup.version === 2 && Array.isArray(backup.versions) ? backup.versions : [],
  };
}
