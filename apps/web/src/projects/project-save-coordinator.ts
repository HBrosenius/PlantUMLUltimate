import { validateProjectPath } from "@plantuml-studio/project-model";

export type ProjectSaveOperation = { path: string; bytes: Uint8Array };

export interface ProjectSaveStore {
  write(path: string, bytes: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  read?(path: string): Promise<Uint8Array | undefined>;
}

type JournalOperation = { path: string; bytes: number[] };
type Journal = { version: 1; members: JournalOperation[]; manifest: JournalOperation };

function operation(value: unknown, label: string): JournalOperation {
  if (!value || typeof value !== "object") throw new Error(`Project save journal has invalid ${label}`);
  const item = value as { path?: unknown; bytes?: unknown };
  if (typeof item.path !== "string" || validateProjectPath(item.path))
    throw new Error(`Project save journal has an unsafe ${label} path`);
  if (!Array.isArray(item.bytes) || item.bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255))
    throw new Error(`Project save journal has invalid ${label} bytes`);
  return { path: item.path, bytes: item.bytes };
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
  if (journal.version !== 1 || !Array.isArray(journal.members))
    throw new Error("Project save journal has an unsupported format");
  const members = journal.members.map((member) => operation(member, "member"));
  if (new Set(members.map((member) => member.path)).size !== members.length)
    throw new Error("Project save journal has duplicate member paths");
  const manifest = operation(journal.manifest, "manifest");
  if (manifest.path !== "project.pumlproject") throw new Error("Project save journal has an unsafe manifest path");
  return { version: 1, members, manifest };
}

/** Serializes project saves and writes the manifest only after every member snapshot succeeds. */
export class ProjectSaveCoordinator {
  private queue = Promise.resolve();

  save(
    store: ProjectSaveStore,
    members: readonly ProjectSaveOperation[],
    manifest: ProjectSaveOperation,
  ): Promise<void> {
    const turn = this.queue.then(async () => {
      const journal = new TextEncoder().encode(
        JSON.stringify({
          version: 1,
          members: members.map((member) => ({ path: member.path, bytes: [...member.bytes] })),
          manifest: { path: manifest.path, bytes: [...manifest.bytes] },
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
    for (const member of journal.members) await store.write(member.path, new Uint8Array(member.bytes));
    await store.write(journal.manifest.path, new Uint8Array(journal.manifest.bytes));
    await store.remove(".plantuml-project-save-journal");
    return true;
  }
}
