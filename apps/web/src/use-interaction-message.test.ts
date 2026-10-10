// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useInteractionMessage } from "./use-interaction-message";

afterEach(() => vi.useRealTimers());

it("expires routine success, clears it on edits, and never revives it after undo", () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(({ source }) => useInteractionMessage("one", source), {
    initialProps: { source: "A" },
  });
  act(() => result.current.notifySuccess("Created diagram"));
  expect(result.current.message).toBe("Created diagram");
  act(() => vi.advanceTimersByTime(5000));
  expect(result.current.message).toBeUndefined();
  act(() => result.current.notifySuccess("Copied source"));
  rerender({ source: "B" });
  expect(result.current.message).toBeUndefined();
  rerender({ source: "A" });
  expect(result.current.message).toBeUndefined();
});

it("keeps failures and required actions through edits and old success timers", () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(({ source }) => useInteractionMessage("one", source), {
    initialProps: { source: "A" },
  });
  act(() => result.current.notifySuccess("Copied source"));
  act(() => vi.advanceTimersByTime(4000));
  act(() => result.current.setMessage("Save failed; retry Save"));
  rerender({ source: "B" });
  act(() => vi.advanceTimersByTime(10000));
  expect(result.current.message).toBe("Save failed; retry Save");
});

it("binds creation success to the newly created document and clears it on tab changes", () => {
  const { result, rerender } = renderHook(({ id }) => useInteractionMessage(id, "A"), { initialProps: { id: "one" } });
  act(() => {
    result.current.notifySuccess("Created diagram", { documentId: "two", source: "A" });
    rerender({ id: "two" });
  });
  expect(result.current.message).toBe("Created diagram");
  rerender({ id: "one" });
  expect(result.current.message).toBeUndefined();
});
