import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DownloadStalledError, fetchTextWithStallTimeout } from "./stall-fetch";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const encoder = new TextEncoder();

/** A response whose chunks arrive on demand; `gap` ms apart, or never after `stopAfter` chunks. */
function slowResponse(chunks: string[], gap: number, stopAfter = Infinity, headers: HeadersInit = {}) {
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index >= stopAfter) return new Promise<void>(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, gap));
      if (index >= chunks.length) controller.close();
      else controller.enqueue(encoder.encode(chunks[index++]));
    },
  });
  return new Response(stream, { headers });
}

it("lets a slow download finish when bytes keep arriving, however long it takes overall", async () => {
  const progress: Array<[number, number | undefined]> = [];
  const fetchImpl = vi.fn(async () =>
    slowResponse(["aaaa", "bbbb", "cccc", "dddd"], 6_000, Infinity, { "content-length": "16" }),
  );
  const promise = fetchTextWithStallTimeout("/engine.js", {
    stallMs: 10_000,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    onProgress: (loaded, total) => progress.push([loaded, total]),
  });
  // 30 s in total, three times the stall limit, but never 10 s without data.
  await vi.advanceTimersByTimeAsync(30_000);
  await expect(promise).resolves.toBe("aaaabbbbccccdddd");
  expect(progress).toEqual([
    [4, 16],
    [8, 16],
    [12, 16],
    [16, 16],
  ]);
});

it("does not report a total for compressed responses, whose length is not the decoded size", async () => {
  const progress: Array<number | undefined> = [];
  const fetchImpl = async () =>
    slowResponse(["abc"], 1, Infinity, { "content-length": "2", "content-encoding": "gzip" });
  const promise = fetchTextWithStallTimeout("/x", {
    fetchImpl: fetchImpl as unknown as typeof fetch,
    onProgress: (_loaded, total) => progress.push(total),
  });
  await vi.advanceTimersByTimeAsync(5);
  await promise;
  expect(progress).toEqual([undefined]);
});

it("fails once no bytes arrive for the stall period and aborts the request", async () => {
  let signal: AbortSignal | undefined;
  const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
    signal = init?.signal ?? undefined;
    return slowResponse(["first", "second"], 1_000, 1);
  });
  const promise = fetchTextWithStallTimeout("/engine.js", {
    stallMs: 10_000,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  const outcome = promise.then(
    () => undefined,
    (error: unknown) => error,
  );
  await vi.advanceTimersByTimeAsync(9_000);
  expect(signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(2_000);
  const error = await outcome;
  expect(error).toBeInstanceOf(DownloadStalledError);
  expect((error as Error).message).toMatch(/stalled/);
  expect(signal?.aborted).toBe(true);
});

it("fails when the server never answers", async () => {
  const fetchImpl = vi.fn(() => new Promise<Response>(() => undefined));
  const outcome = fetchTextWithStallTimeout("/engine.js", {
    stallMs: 5_000,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  }).then(
    () => undefined,
    (error: unknown) => error,
  );
  await vi.advanceTimersByTimeAsync(5_001);
  expect(await outcome).toBeInstanceOf(DownloadStalledError);
});

it("rejects error responses and oversized bodies", async () => {
  await expect(
    fetchTextWithStallTimeout("/x", { fetchImpl: (async () => new Response("", { status: 503 })) as typeof fetch }),
  ).rejects.toThrow("Could not load");
  await expect(
    fetchTextWithStallTimeout("/x", { maxChars: 3, fetchImpl: (async () => new Response("too long")) as typeof fetch }),
  ).rejects.toThrow("exceeds");
});
