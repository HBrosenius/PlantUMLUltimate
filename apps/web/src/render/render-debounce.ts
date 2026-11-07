/**
 * How long to wait after an edit before asking the renderer for a new preview.
 *
 * A fixed wait made every keystroke pay the full delay even when the engine needs only 10-30 ms.
 * The first edit after a pause is sent right away (leading edge). While the author keeps typing, or
 * a render is still running, the wait follows the measured render cost so cheap diagrams stay
 * responsive and expensive ones are not restarted on every character.
 */
export const DEBOUNCE_MIN_MS = 30;
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
  if (!busy && !typing) return 0;
  const cost = lastRenderMs !== undefined && Number.isFinite(lastRenderMs) ? lastRenderMs : UNKNOWN_RENDER_MS;
  return Math.min(DEBOUNCE_MAX_MS, Math.max(DEBOUNCE_MIN_MS, Math.round(cost * 0.5)));
}
