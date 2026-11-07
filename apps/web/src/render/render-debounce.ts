/**
 * How long to wait after an edit before asking the renderer for a new preview.
 *
 * A fixed 150 ms wait made every keystroke pay the full delay even when the engine needs only
 * 10-30 ms. The wait is now one short frame after an edit that follows a pause. While the author keeps
 * typing, or a render is still running, it follows the measured render cost so cheap diagrams stay
 * responsive and expensive ones are not restarted on every character.
 *
 * It is never below 60 ms. A trial with 0-30 ms showed a preview update landing in the middle of the
 * interaction that caused it (focus moving between inspector fields) and coinciding with the next
 * field's first input event, which the browser test then failed on 6 runs in 10. With 45 ms and above
 * the same test passed every run. The race itself was not root-caused (it needs an instant,
 * automated fill); the floor keeps updates clear of it while still halving the old 150 ms wait.
 */
export const DEBOUNCE_MIN_MS = 75;
export const DEBOUNCE_MAX_MS = 150;
/** Edits closer together than this count as continuous typing. */
export const TYPING_WINDOW_MS = 400;
/** Assumed render cost before the first measured render. */
const UNKNOWN_RENDER_MS = 100;

export interface DebounceInput {
  /** A render request is currently running in the renderer. */
  busy: boolean;
  /** Engine time of the most recent completed render, if any. */
  lastRenderMs?: number | undefined;
  /** Time since the previous source change, if any. */
  sinceLastEditMs?: number | undefined;
}

export function renderDebounceMs({ busy, lastRenderMs, sinceLastEditMs }: DebounceInput): number {
  const typing = sinceLastEditMs !== undefined && sinceLastEditMs < TYPING_WINDOW_MS;
  if (!busy && !typing) return DEBOUNCE_MIN_MS;
  const cost = lastRenderMs !== undefined && Number.isFinite(lastRenderMs) ? lastRenderMs : UNKNOWN_RENDER_MS;
  return Math.min(DEBOUNCE_MAX_MS, Math.max(DEBOUNCE_MIN_MS, Math.round(cost * 0.5)));
}
