// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RESOURCE_WARNING_PREFERENCE, useResourceWarningPreference } from "./use-resource-warning-preference";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

it("shows warnings by default and remembers an override across remounts", () => {
  const first = renderHook(useResourceWarningPreference);
  expect(first.result.current.enabled).toBe(true);
  act(() => first.result.current.setEnabled(false));
  first.unmount();
  const second = renderHook(useResourceWarningPreference);
  expect(second.result.current.enabled).toBe(false);
  act(() => second.result.current.setEnabled(true));
  expect(localStorage.getItem(RESOURCE_WARNING_PREFERENCE)).toBe("true");
});

it("keeps the override usable when browser storage is blocked", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Blocked");
  });
  const hook = renderHook(useResourceWarningPreference);
  expect(hook.result.current.enabled).toBe(true);
  act(() => hook.result.current.setEnabled(false));
  expect(hook.result.current.enabled).toBe(false);
});
