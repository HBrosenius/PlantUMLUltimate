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
it("coalesces cursor recovery without rewriting source and journals content within one frame", async () => {
  const { result } = renderHook(() => usePersistedWorkspace());
  await waitFor(() => expect(result.current[2]).toBe(true));
  vi.mocked(saveWorkspaceRecovery).mockClear();
  vi.mocked(saveWorkspaceNavigation).mockClear();
  for (let column = 2; column <= 21; column++)
    act(() => result.current[1]((current) => ({ ...current, cursor: { line: 1, column } })));
  expect(saveWorkspaceRecovery).not.toHaveBeenCalled();
  await waitFor(() => expect(saveWorkspaceNavigation).toHaveBeenCalledTimes(1));
  act(() => result.current[1]((current) => ({ ...current, source: current.source + "\n' saved edit" })));
  await waitFor(() => expect(saveWorkspaceRecovery).toHaveBeenCalledTimes(1));
});
it("writes a burst of edits once, with the newest session, and flushes it when the page is hidden", async () => {
  const { result } = renderHook(() => usePersistedWorkspace());
  await waitFor(() => expect(result.current[2]).toBe(true));
  vi.mocked(saveWorkspaceRecovery).mockClear();
  for (const edit of ["a", "b", "c", "d", "e"])
    act(() => result.current[1]((current) => ({ ...current, source: current.source + edit })));
  // Nothing has been serialized yet: the writes are waiting for the next frame.
  expect(saveWorkspaceRecovery).not.toHaveBeenCalled();
  act(() => window.dispatchEvent(new Event("pagehide")));
  expect(saveWorkspaceRecovery).toHaveBeenCalledTimes(1);
  expect(vi.mocked(saveWorkspaceRecovery).mock.calls[0]![0].documents[0]!.source).toMatch(/abcde$/);
  // The flush consumed the pending write; the frame that follows has nothing left to do.
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(saveWorkspaceRecovery).toHaveBeenCalledTimes(1);
});
it("writes pending recovery when the workspace unmounts", async () => {
  const { result, unmount } = renderHook(() => usePersistedWorkspace());
  await waitFor(() => expect(result.current[2]).toBe(true));
  vi.mocked(saveWorkspaceRecovery).mockClear();
  act(() => result.current[1]((current) => ({ ...current, source: current.source + "!" })));
  expect(saveWorkspaceRecovery).not.toHaveBeenCalled();
  unmount();
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
it("keeps inactive documents referentially stable while the active document is edited", async () => {
  const { result } = renderHook(() => usePersistedWorkspace());
  await waitFor(() => expect(result.current[2]).toBe(true));
  const firstId = result.current[3].activeId;
  act(() => {
    result.current[3].addDocument({ source: "@startgantt\n[Second] lasts 1 day\n@endgantt" });
  });
  expect(result.current[3].activeId).not.toBe(firstId);
  const inactive = result.current[3].documents.find((item) => item.id === firstId)!;
  for (const edit of ["a", "b", "c"]) {
    act(() => result.current[1]((current) => ({ ...current, source: current.source + edit })));
    act(() => result.current[1]((current) => ({ ...current, cursor: { line: 1, column: current.source.length } })));
  }
  expect(result.current[3].documents.find((item) => item.id === firstId)).toBe(inactive);
  expect(result.current[3].documents.find((item) => item.id === result.current[3].activeId)?.source).toMatch(/abc$/);
});
