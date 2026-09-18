import type { PortableProject } from "@plantuml-studio/document-format";
import type { WritableFileHandle } from "../file-service";
import { projectContentEqual } from "./embedded-project";

export type EmbeddedProjectSnapshot = { projectId: string; revision: number; project: PortableProject };
export type EmbeddedProjectSaveResult = { clean: boolean; message: string };

export type EmbeddedProjectRevisionSource = {
  currentRevision(): number;
  captureSaveSnapshot(): Promise<EmbeddedProjectSnapshot | undefined>;
  markSaved(revision: number): void;
};

/**
 * Marks a written snapshot as saved. The revision counter can advance while the write is in
 * flight for reasons that don't change what gets persisted (e.g. a member tab syncing its state
 * after history finishes loading), so when the counter moved, compare the actual content before
 * deciding: if the live project still matches what was written, the live revision is clean.
 * Returns false only when newer, different content exists.
 */
export async function settleSavedRevision(
  snapshot: EmbeddedProjectSnapshot,
  embedded: EmbeddedProjectRevisionSource,
): Promise<boolean> {
  if (embedded.currentRevision() === snapshot.revision) {
    embedded.markSaved(snapshot.revision);
    return true;
  }
  const latest = await embedded.captureSaveSnapshot();
  if (!latest || !projectContentEqual(latest.project, snapshot.project)) return false;
  embedded.markSaved(latest.revision);
  return true;
}

/** Serializes whole-project writes and never marks a newer project revision clean. */
export class EmbeddedProjectSaveCoordinator {
  private readonly queues = new Map<string, Promise<void>>();

  async save(
    snapshot: EmbeddedProjectSnapshot,
    encode: (project: PortableProject, signal?: AbortSignal) => Promise<Uint8Array>,
    handle: WritableFileHandle,
    currentRevision: () => number,
    signal?: AbortSignal,
  ): Promise<EmbeddedProjectSaveResult> {
    const previous = this.queues.get(snapshot.projectId) ?? Promise.resolve();
    let release!: () => void;
    const turn = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queue = previous.then(() => turn);
    this.queues.set(snapshot.projectId, queue);
    await previous;
    try {
      if (signal?.aborted) throw new DOMException("Project save cancelled", "AbortError");
      const bytes = await encode(snapshot.project, signal);
      if (signal?.aborted) throw new DOMException("Project save cancelled", "AbortError");
      const writable = await handle.createWritable();
      try {
        if (signal?.aborted) throw new DOMException("Project save cancelled", "AbortError");
        await writable.write(bytes);
        await writable.close();
      } catch (error) {
        await writable.abort?.().catch(() => undefined);
        throw error;
      }
      const clean = currentRevision() === snapshot.revision;
      return { clean, message: clean ? "Saved project" : "Saved project snapshot; newer changes remain unsaved" };
    } finally {
      release();
      if (this.queues.get(snapshot.projectId) === queue) this.queues.delete(snapshot.projectId);
    }
  }
}
