export interface HistoryEntry {
  sourceBefore: string;
  sourceAfter: string;
  description: string;
  contextBefore?: unknown;
  contextAfter?: unknown;
}

export interface RecordOptions {
  /**
   * Merges this change into the previous entry when both have the same description and follow each
   * other within the coalescing window, so continuous typing becomes one undo step.
   */
  coalesce?: boolean;
  /** Timestamp in milliseconds; defaults to `Date.now()`. */
  now?: number;
}

/** Idle time after which consecutive typing starts a new undo step. */
export const HISTORY_COALESCE_WINDOW_MS = 1000;

export class SourceHistory {
  readonly #undo: HistoryEntry[] = [];
  readonly #redo: HistoryEntry[] = [];
  readonly #limit: number;
  #lastRecordedAt = Number.NEGATIVE_INFINITY;
  #lastCoalescible = false;

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
    options: RecordOptions = {},
  ): void {
    if (sourceBefore === sourceAfter) return;
    const now = options.now ?? Date.now();
    const previous = this.#undo.at(-1);
    // Only keystroke-sized changes merge; pastes and replacements stay separate undo steps.
    const typing = Boolean(options.coalesce) && Math.abs(sourceAfter.length - sourceBefore.length) <= 2;
    const coalesce =
      typing &&
      !context &&
      this.#lastCoalescible &&
      this.#redo.length === 0 &&
      previous?.description === description &&
      previous.sourceAfter === sourceBefore &&
      previous.contextBefore === undefined &&
      now - this.#lastRecordedAt <= HISTORY_COALESCE_WINDOW_MS;
    this.#lastRecordedAt = now;
    this.#lastCoalescible = typing;
    if (coalesce) {
      previous.sourceAfter = sourceAfter;
      // Typing that returns to the original text leaves nothing to undo.
      if (previous.sourceBefore === previous.sourceAfter) this.#undo.pop();
      return;
    }
    this.#undo.push({
      sourceBefore,
      sourceAfter,
      description,
      ...(context ? { contextBefore: context.before, contextAfter: context.after } : {}),
    });
    if (this.#undo.length > this.#limit) this.#undo.shift();
    this.#redo.length = 0;
  }

  /**
   * Folds a follow-up change (such as regenerating derived source) into the edit that produced the
   * current source, so it is undone together with that edit. Returns false, changing nothing, when the
   * current source did not come from the latest recorded edit or when redo entries would be invalidated.
   */
  amendLast(currentSource: string, nextSource: string): boolean {
    const entry = this.#undo.at(-1);
    if (!entry || entry.sourceAfter !== currentSource || this.#redo.length > 0) return false;
    entry.sourceAfter = nextSource;
    return true;
  }

  undo(currentSource: string): string | undefined {
    return this.undoEntry(currentSource)?.sourceBefore;
  }

  undoEntry(currentSource: string): HistoryEntry | undefined {
    this.#lastCoalescible = false;
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
    this.#lastCoalescible = false;
    const entry = this.#redo.at(-1);
    if (!entry || entry.sourceBefore !== currentSource) return undefined;
    this.#redo.pop();
    this.#undo.push(entry);
    return entry;
  }

  clear(): void {
    this.#lastCoalescible = false;
    this.#undo.length = 0;
    this.#redo.length = 0;
  }
}
