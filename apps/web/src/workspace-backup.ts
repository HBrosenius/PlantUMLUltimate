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
const DIAGRAM_KINDS = new Set(["gantt", "sequence", "usecase", "class", "component", "activity", "wbs"]);

function validVersion(value: unknown, historyIds: ReadonlySet<string>): value is DocumentVersion {
  if (!value || typeof value !== "object") return false;
  const version = value as Partial<DocumentVersion>;
  return Boolean(
    typeof version.id === "string" &&
    version.id &&
    (version.portableId === undefined || typeof version.portableId === "string") &&
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
      (version.author !== null &&
        typeof version.author === "object" &&
        typeof version.author.id === "string" &&
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
  const encryptedHistoryIds = new Set(
    session.documents.filter((document) => document.encrypted).map((document) => document.historyId),
  );
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
  const candidate = backup.session as Partial<WorkspaceSession>;
  if (
    (candidate.version !== undefined &&
      (!Number.isInteger(candidate.version) || candidate.version < 1 || candidate.version > 7)) ||
    (candidate.viewMode !== undefined && !["code", "split", "diagram"].includes(candidate.viewMode)) ||
    (candidate.theme !== undefined && !["system", "light", "dark"].includes(candidate.theme)) ||
    [candidate.advancedMode, candidate.onboarded].some((value) => value !== undefined && typeof value !== "boolean") ||
    (candidate.splitPercent !== undefined &&
      (typeof candidate.splitPercent !== "number" || !Number.isFinite(candidate.splitPercent))) ||
    (candidate.defaultDiagramTheme !== undefined && typeof candidate.defaultDiagramTheme !== "string")
  )
    throw new Error("The backup contains invalid workspace settings");
  if (!Array.isArray(candidate.documents) || !candidate.documents.length)
    throw new Error("The backup does not contain any documents");
  const ids = new Set<string>();
  for (const document of candidate.documents) {
    if (
      !document ||
      typeof document.id !== "string" ||
      !document.id ||
      ids.has(document.id) ||
      typeof document.source !== "string" ||
      (document.diagramKind !== undefined && !DIAGRAM_KINDS.has(document.diagramKind)) ||
      (document.historyId !== undefined && (typeof document.historyId !== "string" || !document.historyId)) ||
      (document.fileName !== undefined && typeof document.fileName !== "string") ||
      (document.encrypted !== undefined && document.encrypted !== false)
    )
      throw new Error("The backup contains invalid documents");
    ids.add(document.id);
    if (
      document.cursor !== undefined &&
      (!document.cursor ||
        !Number.isSafeInteger(document.cursor.line) ||
        document.cursor.line < 1 ||
        !Number.isSafeInteger(document.cursor.column) ||
        document.cursor.column < 1)
    )
      throw new Error("The backup contains invalid cursor settings");
    if (
      [document.dirty, document.native].some((value) => value !== undefined && typeof value !== "boolean") ||
      [document.zoom, document.revision, document.historyMaxVersions, document.historyMaxLogicalBytes].some(
        (value) => value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0),
      ) ||
      [document.baselineVersionId, document.portableDocumentId].some(
        (value) => value !== undefined && typeof value !== "string",
      )
    )
      throw new Error("The backup contains invalid document settings");
    if (
      document.resourceCapacities !== undefined &&
      (!document.resourceCapacities ||
        typeof document.resourceCapacities !== "object" ||
        Array.isArray(document.resourceCapacities) ||
        Object.values(document.resourceCapacities).some(
          (value) => typeof value !== "number" || !Number.isFinite(value) || value < 0,
        ))
    )
      throw new Error("The backup contains invalid resource capacities");
    for (const field of ["wbsGanttLinks", "wbsGanttDependencies"] as const) {
      const entries = document[field];
      const keys = field === "wbsGanttLinks" ? ["wbsAlias", "ganttAlias"] : ["from", "to"];
      if (
        entries !== undefined &&
        (!Array.isArray(entries) ||
          !entries.every(
            (entry) =>
              entry &&
              typeof entry === "object" &&
              keys.every((key) => typeof (entry as unknown as Record<string, unknown>)[key] === "string"),
          ))
      )
        throw new Error("The backup contains invalid diagram links");
    }
  }
  if (candidate.activeDocumentId !== undefined && !ids.has(candidate.activeDocumentId))
    throw new Error("The backup references an invalid active document");
  for (const document of candidate.documents) {
    if (
      document.linkedWbsDocumentId !== undefined &&
      (!ids.has(document.linkedWbsDocumentId) ||
        !candidate.documents.some(
          (target) => target.id === document.linkedWbsDocumentId && target.diagramKind === "wbs",
        ))
    )
      throw new Error("The backup contains invalid diagram links");
  }
  const session = normalizeSession(backup.session);
  for (let index = 0; index < candidate.documents.length; index++) {
    const forecast = candidate.documents[index]!.progressForecast;
    const normalized = session.documents[index]!.progressForecast;
    if (
      forecast !== undefined &&
      (!forecast ||
        !normalized ||
        forecast.enabled !== normalized.enabled ||
        forecast.asOf !== normalized.asOf ||
        forecast.timeZone !== normalized.timeZone ||
        Object.keys(forecast.remainingDays).length !== Object.keys(normalized.remainingDays).length ||
        Object.entries(normalized.remainingDays).some(([key, value]) => forecast.remainingDays[key] !== value))
    )
      throw new Error("The backup contains invalid forecast settings");
  }
  if (!session.documents.length) throw new Error("The backup does not contain any documents");
  if (backup.version === 2 && !Array.isArray(backup.versions))
    throw new Error("The backup contains invalid document history");
  const versions = backup.version === 2 ? backup.versions! : [];
  const historyIds = new Set(session.documents.map((document) => document.historyId));
  if (
    !versions.every((version) => validVersion(version, historyIds)) ||
    new Set(versions.map((version) => version.id)).size !== versions.length
  )
    throw new Error("The backup contains invalid document history");
  return {
    session,
    versions,
  };
}

/** Isolate imported histories from versions belonging to the current workspace. */
export function prepareWorkspaceRestore(bundle: ReturnType<typeof parseWorkspaceBackupBundle>) {
  const ids = new Map(bundle.session.documents.map((document) => [document.id, crypto.randomUUID()]));
  const historyIds = new Map(bundle.session.documents.map((document) => [document.historyId, crypto.randomUUID()]));
  const versionIds = new Map(bundle.versions.map((version) => [version.id, crypto.randomUUID()]));
  const mapVersion = (id: string) => versionIds.get(id) ?? id;
  return {
    session: {
      ...bundle.session,
      activeDocumentId: ids.get(bundle.session.activeDocumentId)!,
      documents: bundle.session.documents.map((document) => ({
        ...document,
        id: ids.get(document.id)!,
        historyId: historyIds.get(document.historyId)!,
        dirty: true,
        ...(document.baselineVersionId ? { baselineVersionId: mapVersion(document.baselineVersionId) } : {}),
        ...(document.linkedWbsDocumentId ? { linkedWbsDocumentId: ids.get(document.linkedWbsDocumentId)! } : {}),
      })),
    },
    versions: bundle.versions.map((version) => ({
      ...version,
      id: versionIds.get(version.id)!,
      historyId: historyIds.get(version.historyId)!,
      ...(version.parentVersionId ? { parentVersionId: mapVersion(version.parentVersionId) } : {}),
    })),
  };
}
