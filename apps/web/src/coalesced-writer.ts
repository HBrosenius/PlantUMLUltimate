/**
 * Collapses bursts of writes into one write per animation frame, always of the newest value.
 *
 * Browser recovery serializes the whole multi-document session into one synchronous `localStorage`
 * entry. Doing that for every keystroke and every effect run costs main-thread time that grows with
 * the session, so bursts are written once per frame instead. A timer backs the frame up, because
 * background tabs do not run animation frames, and `flush` writes any pending value synchronously for
 * page hide, unmount and other moments that must not lose the latest edit.
 */
export const COALESCED_WRITE_FALLBACK_MS = 100;

export interface CoalescedWriter<T> {
  /** Records `value` as the newest one and writes it at the next frame. */
  schedule(value: T): void;
  /** Writes the pending value now, if any. */
  flush(): void;
  /** Writes `value` now and drops any older pending value. */
  writeNow(value: T): void;
  /** Whether a value is waiting for the next frame. */
  readonly pending: boolean;
}

export function createCoalescedWriter<T>(
  write: (value: T) => void,
  fallbackMs = COALESCED_WRITE_FALLBACK_MS,
): CoalescedWriter<T> {
  let pendingValue: { value: T } | undefined;
  let frame: number | undefined;
  let timer: number | undefined;
  const clear = () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    window.clearTimeout(timer);
    frame = undefined;
    timer = undefined;
  };
  const flush = () => {
    clear();
    const next = pendingValue;
    pendingValue = undefined;
    if (next) write(next.value);
  };
  return {
    schedule(value) {
      pendingValue = { value };
      if (frame !== undefined) return;
      frame = requestAnimationFrame(flush);
      timer = window.setTimeout(flush, fallbackMs);
    },
    flush,
    writeNow(value) {
      clear();
      pendingValue = undefined;
      write(value);
    },
    get pending() {
      return pendingValue !== undefined;
    },
  };
}
