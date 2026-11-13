// @vitest-environment jsdom
import { memo } from "react";
import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useStableHandlers, useStableList } from "./use-stable-handlers";

afterEach(cleanup);

it("keeps each handler's identity across renders but calls the latest one", () => {
  const first = vi.fn(() => "first");
  const second = vi.fn(() => "second");
  const { result, rerender } = renderHook(({ handler }) => useStableHandlers({ onRun: handler }), {
    initialProps: { handler: first as () => string },
  });
  const initial = result.current.onRun;
  expect(initial()).toBe("first");
  rerender({ handler: second });
  expect(result.current.onRun).toBe(initial);
  expect(initial()).toBe("second");
  expect(first).toHaveBeenCalledTimes(1);
});

it("passes arguments through and lets a command appear and disappear", () => {
  const run = vi.fn((value: number) => value * 2);
  const { result, rerender } = renderHook(({ on }) => useStableHandlers({ onRun: on ? run : undefined }), {
    initialProps: { on: false },
  });
  expect(result.current.onRun).toBeUndefined();
  rerender({ on: true });
  expect(result.current.onRun?.(21)).toBe(42);
  const wrapper = result.current.onRun;
  rerender({ on: false });
  expect(result.current.onRun).toBeUndefined();
  rerender({ on: true });
  expect(result.current.onRun).toBe(wrapper);
});

it("lets a memoised component skip renders even though the parent recreates its handlers", () => {
  let renders = 0;
  const Child = memo(function Child({ label, onClick }: { label: string; onClick(): void }) {
    renders += 1;
    return <button onClick={onClick}>{label}</button>;
  });
  const clicks: number[] = [];
  function Parent({ tick, label }: { tick: number; label: string }) {
    const handlers = useStableHandlers({ onClick: () => clicks.push(tick) });
    return <Child label={label} onClick={handlers.onClick} />;
  }
  const { rerender, getByRole } = render(<Parent tick={1} label="Go" />);
  rerender(<Parent tick={2} label="Go" />);
  rerender(<Parent tick={3} label="Go" />);
  expect(renders).toBe(1);
  getByRole("button").click();
  // The skipped child still runs the newest handler.
  expect(clicks).toEqual([3]);
  rerender(<Parent tick={4} label="Changed" />);
  expect(renders).toBe(2);
});

it("keeps a list's identity while its items are unchanged", () => {
  const { result, rerender } = renderHook(({ items }) => useStableList(items), {
    initialProps: { items: ["a", "b"] as readonly string[] },
  });
  const first = result.current;
  rerender({ items: ["a", "b"] });
  expect(result.current).toBe(first);
  rerender({ items: ["a", "c"] });
  expect(result.current).not.toBe(first);
  expect(result.current).toEqual(["a", "c"]);
});
