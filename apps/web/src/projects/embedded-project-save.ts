import type { PortableProject } from "@plantuml-studio/document-format";
import type { WritableFileHandle } from "../file-service";

export type EmbeddedProjectSnapshot = { projectId: string; revision: number; project: PortableProject };
export type EmbeddedProjectSaveResult = { clean: boolean; message: string };

/** Serializes whole-project writes and never marks a newer project revision clean. */
export class EmbeddedProjectSaveCoordinator {
  private readonly queues = new Map<string, Promise<void>>();

  async save(
    snapshot: EmbeddedProjectSnapshot,
    encode: (project: PortableProject) => Promise<Uint8Array>,
    handle: WritableFileHandle,
    currentRevision: () => number,
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
      const bytes = await encode(snapshot.project);
      const writable = await handle.createWritable();
      try {
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
