// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  describeStorageHealth,
  reportStorageWrite,
  resetStorageHealth,
  storageNearlyFull,
  useStorageHealth,
} from "./storage-health";

afterEach(() => resetStorageHealth());

describe("storage health", () => {
  it("tracks failing writes until they succeed again", () => {
    const { result } = renderHook(() => useStorageHealth());
    act(() => reportStorageWrite("workspace", false));
    expect(result.current.failing).toEqual(["workspace"]);
    expect(describeStorageHealth(result.current)).toContain("could not save workspace data");
    act(() => reportStorageWrite("workspace", true));
    expect(result.current.failing).toEqual([]);
  });

  it("warns when usage approaches the quota", () => {
    expect(storageNearlyFull({ failing: [], usage: { used: 95, quota: 100 } })).toBe(true);
    expect(storageNearlyFull({ failing: [], usage: { used: 50, quota: 100 } })).toBe(false);
    expect(describeStorageHealth({ failing: [], usage: { used: 9_500_000, quota: 10_000_000 } })).toBe(
      "Browser storage is nearly full (9.5 MB of 10.0 MB used). Save your files and close unused documents.",
    );
  });
});
