// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUnsavedProjectGuard } from "./use-unsaved-project-guard";

afterEach(cleanup);
describe("unsaved project guard", () => {
  it.each(["cancel", "discard", "save"] as const)("honors %s for project-only changes", async (choice) => {
    const save = vi.fn(async () => true);
    const { result } = renderHook(() =>
      useUnsavedProjectGuard({ dirty: true, projectId: "one", projectName: "Plan", save }),
    );
    let leaving!: Promise<boolean>;
    act(() => {
      leaving = result.current.confirmLeave("open another document");
    });
    expect(result.current.request).toEqual({ projectName: "Plan", action: "open another document" });
    await act(async () => {
      result.current.decide(choice);
      expect(await leaving).toBe(choice !== "cancel");
    });
    expect(save).toHaveBeenCalledTimes(choice === "save" ? 1 : 0);
  });

  it("keeps the document when saving fails or is cancelled", async () => {
    const { result } = renderHook(() => useUnsavedProjectGuard({ dirty: true, save: async () => false }));
    let leaving!: Promise<boolean>;
    act(() => {
      leaving = result.current.confirmLeave("close this document");
    });
    await act(async () => {
      result.current.decide("save");
      expect(await leaving).toBe(false);
    });
  });

  it("does not prompt for a clean project", async () => {
    const save = vi.fn(async () => true);
    const { result } = renderHook(() => useUnsavedProjectGuard({ dirty: false, save }));
    expect(await result.current.confirmLeave("close this document")).toBe(true);
    expect(result.current.request).toBeUndefined();
    expect(save).not.toHaveBeenCalled();
  });

  it("blocks page exit for project changes even when there are no open tabs", () => {
    const { rerender, unmount } = renderHook(({ dirty }) => useUnsavedProjectGuard({ dirty, save: async () => true }), {
      initialProps: { dirty: true },
    });
    const attempt = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(attempt()).toBe(true);
    rerender({ dirty: false });
    expect(attempt()).toBe(false);
    rerender({ dirty: true });
    unmount();
    expect(attempt()).toBe(false);
  });

  it("refuses overlapping transitions and cancels pending work on unmount", async () => {
    const { result, unmount } = renderHook(() => useUnsavedProjectGuard({ dirty: true, save: async () => true }));
    let leaving!: Promise<boolean>;
    act(() => {
      leaving = result.current.confirmLeave("close this document");
    });
    expect(await result.current.confirmLeave("create a new document")).toBe(false);
    unmount();
    expect(await leaving).toBe(false);
  });

  it("does not discard a different project that appeared while the dialog was open", async () => {
    const { result, rerender } = renderHook(
      ({ projectId }) => useUnsavedProjectGuard({ projectId, dirty: true, save: async () => true }),
      { initialProps: { projectId: "one" } },
    );
    let leaving!: Promise<boolean>;
    act(() => {
      leaving = result.current.confirmLeave("close this document");
    });
    rerender({ projectId: "two" });
    await act(async () => {
      result.current.decide("discard");
      expect(await leaving).toBe(false);
    });
  });
});
