// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePersistedWorkspace } from "./use-persisted-workspace";
import { saveWorkspaceRecovery } from "./workspace-storage";
vi.mock("./workspace-storage", async (importOriginal) => {
  const original = await importOriginal<typeof import("./workspace-storage")>();
  return {
    ...original,
    loadWorkspace: vi.fn(async () => original.DEFAULT_SESSION),
    saveWorkspace: vi.fn(async () => {}),
    saveWorkspaceRecovery: vi.fn(() => true),
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("writes the final navigation position synchronously before page close", async () => {
  const { result } = renderHook(() => usePersistedWorkspace());
  await waitFor(() => expect(result.current[2]).toBe(true));
  const id = result.current[3].activeId;
  act(() => {
    result.current[3].updateDocumentFormat(id, { diagramScroll: { left: 123, top: 456 } }, true);
    expect(saveWorkspaceRecovery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        documents: expect.arrayContaining([expect.objectContaining({ id, diagramScroll: { left: 123, top: 456 } })]),
      }),
    );
  });
});
