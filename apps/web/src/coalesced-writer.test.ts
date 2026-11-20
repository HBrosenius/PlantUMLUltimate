// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { COALESCED_WRITE_FALLBACK_MS, createCoalescedWriter } from "./coalesced-writer";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("writes a burst once per frame with the newest value", async () => {
  const write = vi.fn();
  const writer = createCoalescedWriter<string>(write);
  for (const value of ["a", "b", "c"]) writer.schedule(value);
  expect(write).not.toHaveBeenCalled();
  expect(writer.pending).toBe(true);
  await vi.advanceTimersByTimeAsync(16);
  expect(write).toHaveBeenCalledExactlyOnceWith("c");
  expect(writer.pending).toBe(false);
  writer.schedule("d");
  await vi.advanceTimersByTimeAsync(16);
  expect(write.mock.calls).toEqual([["c"], ["d"]]);
});

it("falls back to a timer when animation frames do not run, as in a background tab", async () => {
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  const write = vi.fn();
  const writer = createCoalescedWriter<string>(write);
  writer.schedule("value");
  await vi.advanceTimersByTimeAsync(COALESCED_WRITE_FALLBACK_MS - 1);
  expect(write).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(write).toHaveBeenCalledExactlyOnceWith("value");
  vi.unstubAllGlobals();
});

it("flushes synchronously and does not write again afterwards", async () => {
  const write = vi.fn();
  const writer = createCoalescedWriter<string>(write);
  writer.flush();
  expect(write).not.toHaveBeenCalled();
  writer.schedule("pending");
  writer.flush();
  expect(write).toHaveBeenCalledExactlyOnceWith("pending");
  await vi.advanceTimersByTimeAsync(1000);
  expect(write).toHaveBeenCalledTimes(1);
});

it("writeNow supersedes an older pending value", async () => {
  const write = vi.fn();
  const writer = createCoalescedWriter<string>(write);
  writer.schedule("old");
  writer.writeNow("new");
  await vi.advanceTimersByTimeAsync(1000);
  expect(write).toHaveBeenCalledExactlyOnceWith("new");
});
