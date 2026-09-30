import { sha256 } from "@plantuml-studio/document-format";
import { validateProjectPath } from "@plantuml-studio/project-model";

export type ProjectSaveOperation = { path: string; bytes: Uint8Array };

export interface ProjectSaveStore {
  write(path: string, bytes: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  read?(path: string): Promise<Uint8Array | undefined>;
}

/** `previousHash` is the digest of the file before the save, or null when it did not exist (version 2). */
type JournalOperation = { path: string; bytes: number[]; previousHash?: string | null };
type Journal = { version: 1 | 2; members: JournalOperation[]; manifest: JournalOperation };

/** Raised when an interrupted save cannot be completed without overwriting a file changed elsewhere. */
export class ProjectRecoveryConflictError extends Error {
  constructor(readonly paths: readonly string[]) {
    super(
      `An interrupted project save was not completed because ${paths.join(", ")} changed after it started. The files were left as they are.`,
    );
  }
}

function operation(value: unknown, label: string): JournalOperation {
  if (!value || typeof value !== "object") throw new Error(`Project save journal has invalid ${label}`);
  const item = value as { path?: unknown; bytes?: unknown };
  if (typeof item.path !== "string" || validateProjectPath(item.path))
    throw new Error(`Project save journal has an unsafe ${label} path`);
  if (!Array.isArray(item.bytes) || item.bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255))
    throw new Error(`Project save journal has invalid ${label} bytes`);
  const previousHash = (value as { previousHash?: unknown }).previousHash;
  if (previousHash !== undefined && previousHash !== null && typeof previousHash !== "string")
    throw new Error(`Project save journal has an invalid ${label} hash`);
  return { path: item.path, bytes: item.bytes, ...(previousHash !== undefined ? { previousHash } : {}) };
}

function parseJournal(bytes: Uint8Array): Journal {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("Project save journal is invalid JSON");
  }
  if (!value || typeof value !== "object") throw new Error("Project save journal is invalid");
  const journal = value as { version?: unknown; members?: unknown; manifest?: unknown };
  if ((journal.version !== 1 && journal.version !== 2) || !Array.isArray(journal.members))
    throw new Error("Project save journal has an unsupported format");
  const members = journal.members.map((member) => operation(member, "member"));
  if (new Set(members.map((member) => member.path)).size !== members.length)
    throw new Error("Project save journal has duplicate member paths");
  const manifest = operation(journal.manifest, "manifest");
  if (manifest.path !== "project.pumlproject") throw new Error("Project save journal has an unsafe manifest path");
  return { version: journal.version, members, manifest };
}

const digest = async (bytes: Uint8Array | undefined) => (bytes ? sha256(bytes) : null);

/** Serializes project saves and writes the manifest only after every member snapshot succeeds. */
export class ProjectSaveCoordinator {
  private queue = Promise.resolve();

  save(
    store: ProjectSaveStore,
    members: readonly ProjectSaveOperation[],
    manifest: ProjectSaveOperation,
  ): Promise<void> {
    const turn = this.queue.then(async () => {
      // Record what each file held before this save, so recovery can tell interrupted writes from later edits.
      const previous = async (path: string) => (store.read ? digest(await store.read(path)) : undefined);
      const entry = async (item: ProjectSaveOperation) => {
        const previousHash = await previous(item.path);
        return { path: item.path, bytes: [...item.bytes], ...(previousHash !== undefined ? { previousHash } : {}) };
      };
      const journal = new TextEncoder().encode(
        JSON.stringify({
          version: 2,
          members: await Promise.all(members.map(entry)),
          manifest: await entry(manifest),
        }),
      );
      await store.write(".plantuml-project-save-journal", journal);
      for (const member of members) await store.write(member.path, member.bytes);
      await store.write(manifest.path, manifest.bytes);
      await store.remove(".plantuml-project-save-journal");
    });
    this.queue = turn.catch(() => undefined);
    return turn;
  }

  async recover(store: ProjectSaveStore): Promise<boolean> {
    const bytes = await store.read?.(".plantuml-project-save-journal");
    if (!bytes) return false;
    const journal = parseJournal(bytes);
    const operations = [...journal.members, journal.manifest];
    const pending: JournalOperation[] = [];
    const conflicts: string[] = [];
    for (const item of operations) {
      if (item.previousHash === undefined) {
        // Version 1 journals carry no prior state; replay them as before.
        pending.push(item);
        continue;
      }
      const current = await digest(await store.read?.(item.path));
      if (current === (await sha256(new Uint8Array(item.bytes)))) continue;
      if (current === item.previousHash) pending.push(item);
      else conflicts.push(item.path);
    }
    // Nothing is written when any file changed elsewhere; the journal stays for another attempt.
    if (conflicts.length) throw new ProjectRecoveryConflictError(conflicts);
    for (const item of pending) await store.write(item.path, new Uint8Array(item.bytes));
    await store.remove(".plantuml-project-save-journal");
    return true;
  }
}
