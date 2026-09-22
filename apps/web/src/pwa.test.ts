// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { isInstalledDisplayMode, watchForServiceWorkerUpdates } from "./pwa";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("isInstalledDisplayMode", () => {
  it("recognizes a standalone desktop PWA window", () => {
    expect(isInstalledDisplayMode(true, false)).toBe(true);
  });

  it("recognizes the iOS standalone navigator flag", () => {
    expect(isInstalledDisplayMode(false, true)).toBe(true);
  });

  it("does not treat a regular browser tab as installed display mode", () => {
    expect(isInstalledDisplayMode(false, false)).toBe(false);
  });
});

describe("watchForServiceWorkerUpdates", () => {
  it("checks immediately, on focus and reconnect, and at the requested interval", async () => {
    vi.useFakeTimers();
    const update = vi.fn().mockResolvedValue(undefined);
    const stop = watchForServiceWorkerUpdates({ update }, 1_000);

    await Promise.resolve();
    await Promise.resolve();
    expect(update).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
    await Promise.resolve();
    window.dispatchEvent(new Event("online"));
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(update).toHaveBeenCalledTimes(4);

    stop();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(update).toHaveBeenCalledTimes(4);
  });

  it("waits until a hidden page becomes visible", async () => {
    vi.useFakeTimers();
    let visibilityState: DocumentVisibilityState = "hidden";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibilityState);
    const update = vi.fn().mockResolvedValue(undefined);
    const stop = watchForServiceWorkerUpdates({ update }, 1_000);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(update).not.toHaveBeenCalled();
    visibilityState = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    expect(update).toHaveBeenCalledOnce();
    stop();
  });
});
