import { normalizeSession, type WorkspaceSession } from "./workspace-storage";

interface WorkspaceBackup {
  kind: "plantuml-studio-workspace";
  version: 1;
  createdAt: string;
  session: WorkspaceSession;
}

export function serializeWorkspaceBackup(session: WorkspaceSession, createdAt = new Date().toISOString()): string {
  return JSON.stringify(
    { kind: "plantuml-studio-workspace", version: 1, createdAt, session } satisfies WorkspaceBackup,
    null,
    2,
  );
}

export function parseWorkspaceBackup(source: string): WorkspaceSession {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("The selected file is not valid JSON");
  }
  if (!value || typeof value !== "object") throw new Error("The selected file is not a PlantUML Studio backup");
  const backup = value as Partial<WorkspaceBackup>;
  if (backup.kind !== "plantuml-studio-workspace" || backup.version !== 1 || !backup.session)
    throw new Error("The selected file is not a supported PlantUML Studio backup");
  const session = normalizeSession(backup.session);
  if (!session.documents.length) throw new Error("The backup does not contain any documents");
  return session;
}
