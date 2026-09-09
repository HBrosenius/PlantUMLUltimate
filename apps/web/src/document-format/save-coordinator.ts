export interface SaveSnapshot<T> { documentId: string; revision: number; value: T }
export interface SaveResult { clean: boolean; message: string }

/** Serializes writes per portable identity and only marks the captured revision clean. */
export class SaveCoordinator {
  private readonly queues = new Map<string, Promise<void>>();

  async save<T>(
    snapshot: SaveSnapshot<T>,
    encode: (value: T) => Promise<Uint8Array>,
    write: (bytes: Uint8Array) => Promise<void>,
    currentRevision: () => number,
  ): Promise<SaveResult> {
    const previous = this.queues.get(snapshot.documentId) ?? Promise.resolve();
    let release!: () => void;
    const turn = new Promise<void>((resolve) => { release = resolve; });
    const queue = previous.then(() => turn);
    this.queues.set(snapshot.documentId, queue);
    await previous;
    try {
      const bytes = await encode(snapshot.value);
      await write(bytes);
      const clean = currentRevision() === snapshot.revision;
      return {
        clean,
        message: clean ? "Saved portable document" : "Saved snapshot; newer changes remain unsaved",
      };
    } finally {
      release();
      if (this.queues.get(snapshot.documentId) === queue) this.queues.delete(snapshot.documentId);
    }
  }
}
