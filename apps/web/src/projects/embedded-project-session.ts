import { validateProject, type PortableProject } from "@plantuml-studio/document-format";
import { clearActiveProject, loadActiveProject, saveActiveProject } from "../workspace-storage";

const SESSION_KIND = "plantuml-studio-embedded-project";
const SESSION_VERSION = 1;

type LockedRecovery = { kind: typeof SESSION_KIND; version: typeof SESSION_VERSION; encrypted: true };
type UnlockedRecovery = {
  kind: typeof SESSION_KIND;
  version: typeof SESSION_VERSION;
  encrypted: false;
  project: PortableProject;
};

export type EmbeddedProjectRecovery = { state: "locked" } | { state: "unlocked"; project: PortableProject } | undefined;

/**
 * Produces the only recovery record that may be persisted for a project.
 * Encrypted projects deliberately retain no name, graph, diagram source, or history metadata.
 */
export function embeddedProjectRecoveryRecord(
  project: PortableProject,
  encrypted: boolean,
): LockedRecovery | UnlockedRecovery {
  if (encrypted) return { kind: SESSION_KIND, version: SESSION_VERSION, encrypted: true };
  return { kind: SESSION_KIND, version: SESSION_VERSION, encrypted: false, project: validateProject(project) };
}

export function parseEmbeddedProjectRecovery(value: unknown): EmbeddedProjectRecovery {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record.kind !== SESSION_KIND || record.version !== SESSION_VERSION || typeof record.encrypted !== "boolean")
    return undefined;
  if (record.encrypted) return { state: "locked" };
  if (!("project" in record)) return undefined;
  try {
    return { state: "unlocked", project: validateProject(record.project) };
  } catch {
    return undefined;
  }
}

export async function saveEmbeddedProjectRecovery(project: PortableProject, encrypted: boolean): Promise<void> {
  await saveActiveProject(embeddedProjectRecoveryRecord(project, encrypted));
}

export async function loadEmbeddedProjectRecovery(): Promise<EmbeddedProjectRecovery> {
  return parseEmbeddedProjectRecovery(await loadActiveProject());
}

export const clearEmbeddedProjectRecovery = clearActiveProject;
