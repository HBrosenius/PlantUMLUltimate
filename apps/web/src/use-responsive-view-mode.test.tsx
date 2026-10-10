// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useResponsiveViewMode } from "./use-responsive-view-mode";

afterEach(() => vi.unstubAllGlobals());
it("keeps phone changes temporary and restores the desktop preference", () => {
  const media = new EventTarget() as EventTarget & { matches: boolean };
  media.matches = false;
  vi.stubGlobal("matchMedia", () => media);
  const persist = vi.fn();
  const { result } = renderHook(() => useResponsiveViewMode("split", persist));
  expect(result.current.viewMode).toBe("split");
  act(() => {
    media.matches = true;
    media.dispatchEvent(new Event("change"));
  });
  expect(result.current.viewMode).toBe("diagram");
  act(() => result.current.selectViewMode("split"));
  expect(result.current.viewMode).toBe("code");
  expect(persist).not.toHaveBeenCalled();
  act(() => {
    media.matches = false;
    media.dispatchEvent(new Event("change"));
  });
  expect(result.current.viewMode).toBe("split");
  act(() => result.current.selectViewMode("code"));
  expect(persist).toHaveBeenCalledWith("code");
});
