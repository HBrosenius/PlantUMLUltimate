/**
 * Fetches text with a stall timeout instead of a total-time limit.
 *
 * The local renderer is a multi-megabyte download. A fixed overall timeout aborts it on slow links
 * even though bytes are still arriving, throwing the partial download away. Here the clock restarts
 * with every chunk, so only a connection that has stopped delivering data fails.
 */
export const STALL_TIMEOUT_MS = 15_000;

export interface StallFetchOptions {
  stallMs?: number;
  /** Largest accepted body, in characters. */
  maxChars?: number;
  /** Called with the decoded bytes received so far, and the total when it is known to match. */
  onProgress?: (loadedBytes: number, totalBytes: number | undefined) => void;
  fetchImpl?: typeof fetch;
}

export class DownloadStalledError extends Error {
  constructor(stallMs: number) {
    super(`The download stalled: no data arrived for ${Math.round(stallMs / 1000)} seconds`);
    this.name = "DownloadStalledError";
  }
}

export async function fetchTextWithStallTimeout(url: string, options: StallFetchOptions = {}): Promise<string> {
  const { stallMs = STALL_TIMEOUT_MS, maxChars = Infinity, onProgress, fetchImpl = fetch } = options;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectStall!: (error: Error) => void;
  const stalled = new Promise<never>((_, reject) => (rejectStall = reject));
  // The race below may already have settled; never report this one as unhandled.
  stalled.catch(() => undefined);
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const error = new DownloadStalledError(stallMs);
      controller.abort(error);
      rejectStall(error);
    }, stallMs);
  };
  arm();
  try {
    const response = await Promise.race([fetchImpl(url, { signal: controller.signal }), stalled]);
    if (!response.ok) throw new Error("Could not load the local renderer assets");
    arm();
    const length = Number(response.headers.get("content-length"));
    // Content-Length counts encoded bytes; it only matches the decoded bytes read below when the
    // response is not compressed.
    const total = !response.headers.get("content-encoding") && length > 0 ? length : undefined;
    const reader = response.body?.getReader();
    if (!reader) {
      const text = await Promise.race([response.text(), stalled]);
      if (text.length > maxChars) throw new Error("Renderer asset exceeds the expected size");
      onProgress?.(text.length, total);
      return text;
    }
    const decoder = new TextDecoder();
    let text = "";
    let loaded = 0;
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), stalled]);
      if (done) break;
      arm();
      loaded += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if (text.length > maxChars) {
        void reader.cancel().catch(() => undefined);
        throw new Error("Renderer asset exceeds the expected size");
      }
      onProgress?.(loaded, total);
    }
    return text + decoder.decode();
  } finally {
    clearTimeout(timer);
  }
}
