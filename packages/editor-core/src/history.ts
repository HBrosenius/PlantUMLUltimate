export interface HistoryEntry {
  sourceBefore: string;
  sourceAfter: string;
  description: string;
  contextBefore?: unknown;
  contextAfter?: unknown;
}

export class SourceHistory {
  readonly #undo: HistoryEntry[] = [];
  readonly #redo: HistoryEntry[] = [];
  readonly #limit: number;

  constructor(limit = 500) {
    this.#limit = limit;
  }
  get canUndo(): boolean {
    return this.#undo.length > 0;
  }
  get canRedo(): boolean {
    return this.#redo.length > 0;
  }

  record(
    sourceBefore: string,
    sourceAfter: string,
    description: string,
    context?: { before: unknown; after: unknown },
  ): void {
    if (sourceBefore === sourceAfter) return;
    this.#undo.push({
      sourceBefore,
      sourceAfter,
      description,
      ...(context ? { contextBefore: context.before, contextAfter: context.after } : {}),
    });
    if (this.#undo.length > this.#limit) this.#undo.shift();
    this.#redo.length = 0;
  }

  undo(currentSource: string): string | undefined {
    return this.undoEntry(currentSource)?.sourceBefore;
  }

  undoEntry(currentSource: string): HistoryEntry | undefined {
    const entry = this.#undo.at(-1);
    if (!entry || entry.sourceAfter !== currentSource) return undefined;
    this.#undo.pop();
    this.#redo.push(entry);
    return entry;
  }

  redo(currentSource: string): string | undefined {
    return this.redoEntry(currentSource)?.sourceAfter;
  }

  redoEntry(currentSource: string): HistoryEntry | undefined {
    const entry = this.#redo.at(-1);
    if (!entry || entry.sourceBefore !== currentSource) return undefined;
    this.#redo.pop();
    this.#undo.push(entry);
    return entry;
  }

  clear(): void {
    this.#undo.length = 0;
    this.#redo.length = 0;
  }
}
