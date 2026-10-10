// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DiagramKind } from "./model";
import { useSidePanelState } from "./use-side-panel-state";

const setters = ["setProjectInspectorOpen", "setResourcePanelOpen", "setProblemsOpen", "setUnsupportedOpen"] as const;
const flags = ["projectInspectorOpen", "resourcePanelOpen", "problemsOpen", "unsupportedOpen"] as const;

describe("useSidePanelState", () => {
  it("allows exactly one utility panel and ignores closing an inactive panel", () => {
    const onOpen = vi.fn(() => true);
    const { result } = renderHook(() => useSidePanelState("gantt", undefined, onOpen));
    for (const [index, setter] of setters.entries()) {
      act(() => result.current[setter](true));
      expect(flags.map((flag) => result.current[flag])).toEqual(flags.map((_, i) => i === index));
      act(() => result.current[setter](true));
      act(() => result.current[setters[(index + 1) % setters.length]!](false));
      expect(result.current[flags[index]!]).toBe(true);
    }
    expect(onOpen).toHaveBeenCalledTimes(4);
  });

  it("retains the current owner when draft review rejects a transition", () => {
    const onOpen = vi.fn(() => true);
    const { result } = renderHook(() => useSidePanelState("gantt", undefined, onOpen));
    act(() => result.current.setProjectInspectorOpen(true));
    onOpen.mockReturnValue(false);
    act(() => result.current.setResourcePanelOpen(true));
    expect(result.current.projectInspectorOpen).toBe(true);
    expect(result.current.resourcePanelOpen).toBe(false);
  });

  it("yields to property selection and resets Gantt-only panels when changing type", () => {
    const { result, rerender } = renderHook(
      ({ kind, selection }: { kind: DiagramKind; selection: string | undefined }) =>
        useSidePanelState(kind, selection, () => true),
      { initialProps: { kind: "gantt" as DiagramKind, selection: undefined as string | undefined } },
    );
    act(() => result.current.setProblemsOpen(true));
    rerender({ kind: "gantt", selection: "task-build" });
    expect(result.current.problemsOpen).toBe(false);
    act(() => result.current.setResourcePanelOpen(true));
    rerender({ kind: "sequence", selection: undefined });
    expect(result.current.resourcePanelOpen).toBe(false);
    act(() => result.current.setProblemsOpen((open) => !open));
    expect(result.current.problemsOpen).toBe(true);
    act(() => result.current.setProblemsOpen((open) => !open));
    expect(result.current.problemsOpen).toBe(false);
    act(() => {
      result.current.setProblemsOpen((open) => !open);
      result.current.setProblemsOpen((open) => !open);
    });
    expect(result.current.problemsOpen).toBe(false);
  });
});
