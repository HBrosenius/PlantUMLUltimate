// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePersistedWorkspace } from "./use-persisted-workspace";
import { saveWorkspaceNavigation, saveWorkspaceRecovery } from "./workspace-storage";
vi.mock("./workspace-storage", async (importOriginal) => {
  const original = await importOriginal<typeof import("./workspace-storage")>();
  return {
    ...original,
    loadWorkspace: vi.fn(async () => original.DEFAULT_SESSION),
    saveWorkspace: vi.fn(async () => {}),
    saveWorkspaceRecovery: vi.fn(() => true),
    saveWorkspaceNavigation: vi.fn(),
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("coalesces cursor recovery without rewriting source and still journals content immediately", async () => {
  const { result } = renderHook(() => usePersistedWorkspace());
  await waitFor(() => expect(result.current[2]).toBe(true));
  vi.mocked(saveWorkspaceRecovery).mockClear();
  vi.mocked(saveWorkspaceNavigation).mockClear();
  for (let column = 2; column <= 21; column++)
    act(() => result.current[1]((current) => ({ ...current, cursor: { line: 1, column } })));
  expect(saveWorkspaceRecovery).not.toHaveBeenCalled();
  await waitFor(() => expect(saveWorkspaceNavigation).toHaveBeenCalledTimes(1));
  act(() => result.current[1]((current) => ({ ...current, source: current.source + "\n' saved edit" })));
  expect(saveWorkspaceRecovery).toHaveBeenCalledTimes(1);
});
it("writes the final navigation position synchronously before page close", async () => {
  const { result } = renderHook(() => usePersistedWorkspace());
  await waitFor(() => expect(result.current[2]).toBe(true));
  const id = result.current[3].activeId;
  act(() => {
    result.current[3].updateDocumentFormat(id, { diagramScroll: { left: 123, top: 456 } }, true);
    expect(saveWorkspaceNavigation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        documents: expect.arrayContaining([expect.objectContaining({ id, diagramScroll: { left: 123, top: 456 } })]),
      }),
    );
  });
});
