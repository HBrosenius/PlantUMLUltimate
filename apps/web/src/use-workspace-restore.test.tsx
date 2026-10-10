// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceDocuments } from "./use-workspace-documents";
import { downloadText, openWorkspaceBackupFile } from "./file-service";
import { DEFAULT_SESSION, importDocumentVersions, loadDocumentVersions } from "./workspace-storage";
import { parseWorkspaceBackupBundle, serializeWorkspaceBackup } from "./workspace-backup";

vi.mock("./file-service", () => ({ downloadText: vi.fn(), openWorkspaceBackupFile: vi.fn() }));
vi.mock("./workspace-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./workspace-storage")>()),
  importDocumentVersions: vi.fn(async () => undefined),
  loadDocumentVersions: vi.fn(async () => []),
}));

function options(): Parameters<typeof useWorkspaceDocuments>[0] {
  const session = { ...DEFAULT_SESSION, documents: [{ ...DEFAULT_SESSION.documents[0]!, dirty: true }] };
  return {
    tabs: {
      activeId: session.activeDocumentId,
      documents: session.documents,
      session,
      addDocument: vi.fn(() => "new"),
      closeDocument: vi.fn(),
      restoreSession: vi.fn(),
    },
    replaceActiveDocumentOnCreate: false,
    defaultDiagramTheme: "",
    openNewDocumentDialog: vi.fn(),
    closeNewDocumentDialog: vi.fn(),
    fileHandles: { current: new Map([["welcome", {} as never]]) },
    fileSnapshots: { current: new Map([["welcome", {} as never]]) },
    externalCheckSnoozedUntil: { current: new Map([["welcome", 123]]) },
    removeHistory: vi.fn(),
    retainHistories: vi.fn(),
    refreshHistoryControls: vi.fn(),
    resetSelection: vi.fn(),
    openProjectInspector: vi.fn(),
    reportError: vi.fn(),
    setInteractionMessage: vi.fn(),
  };
}

describe("safe workspace restoration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(loadDocumentVersions).mockResolvedValue([]);
    vi.mocked(importDocumentVersions).mockResolvedValue(undefined);
    vi.mocked(openWorkspaceBackupFile).mockResolvedValue(serializeWorkspaceBackup(DEFAULT_SESSION));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("rejects a malformed backup before touching tabs, handles, or history", async () => {
    vi.mocked(openWorkspaceBackupFile).mockResolvedValue(
      '{"kind":"plantuml-studio-workspace","version":2,"session":{},"versions":[]}',
    );
    const input = options();
    const { result } = renderHook(() => useWorkspaceDocuments(input));
    await act(async () => {
      await result.current.restoreWorkspace();
    });
    expect(input.tabs.restoreSession).not.toHaveBeenCalled();
    expect(importDocumentVersions).not.toHaveBeenCalled();
    expect(downloadText).not.toHaveBeenCalled();
    expect(input.fileHandles.current.size).toBe(1);
    expect(input.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("Your open documents were kept") }),
    );
  });

  it.each(["checkpoint", "import"])("preserves the workspace when %s fails", async (stage) => {
    if (stage === "checkpoint") vi.mocked(loadDocumentVersions).mockRejectedValue(new Error("Storage denied"));
    else vi.mocked(importDocumentVersions).mockRejectedValue(new Error("Quota exceeded"));
    const input = options();
    const { result } = renderHook(() => useWorkspaceDocuments(input));
    await act(async () => {
      await result.current.restoreWorkspace();
    });
    expect(input.tabs.restoreSession).not.toHaveBeenCalled();
    expect(input.fileHandles.current.size).toBe(1);
    expect(input.fileSnapshots.current.size).toBe(1);
    expect(input.externalCheckSnoozedUntil.current.size).toBe(1);
    expect(input.retainHistories).not.toHaveBeenCalled();
    expect(input.reportError).toHaveBeenCalled();
  });

  it("downloads a restorable checkpoint and imports history before replacing tabs", async () => {
    const input = options();
    const { result } = renderHook(() => useWorkspaceDocuments(input));
    await act(async () => {
      await result.current.restoreWorkspace();
    });
    const [contents, name] = vi.mocked(downloadText).mock.calls[0]!;
    expect(name).toBe("plantuml-studio-before-restore.json");
    expect(parseWorkspaceBackupBundle(contents).session).toEqual(input.tabs.session);
    expect(vi.mocked(downloadText).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(importDocumentVersions).mock.invocationCallOrder[0]!,
    );
    expect(vi.mocked(importDocumentVersions).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(input.tabs.restoreSession).mock.invocationCallOrder[0]!,
    );
    expect(input.fileHandles.current.size).toBe(0);
    expect(input.reportError).not.toHaveBeenCalled();
  });

  it("keeps edits made while history import is pending", async () => {
    let finish!: () => void;
    vi.mocked(importDocumentVersions).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const input = options();
    const { result, rerender } = renderHook((props) => useWorkspaceDocuments(props), { initialProps: input });
    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current.restoreWorkspace();
      await vi.waitFor(() => expect(importDocumentVersions).toHaveBeenCalled());
    });
    rerender({
      ...input,
      tabs: {
        ...input.tabs,
        session: { ...input.tabs.session, documents: [{ ...input.tabs.documents[0]!, source: "New edit" }] },
      },
    });
    await act(async () => {
      finish();
      await pending;
    });
    expect(input.tabs.restoreSession).not.toHaveBeenCalled();
    expect(input.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("workspace changed") }),
    );
  });

  it("does nothing when replacement is cancelled", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const input = options();
    const { result } = renderHook(() => useWorkspaceDocuments(input));
    await act(async () => {
      await result.current.restoreWorkspace();
    });
    expect(downloadText).not.toHaveBeenCalled();
    expect(importDocumentVersions).not.toHaveBeenCalled();
    expect(input.tabs.restoreSession).not.toHaveBeenCalled();
  });
  it("preserves personal starter styling instead of applying the new-diagram default", () => {
    const input = options();
    input.defaultDiagramTheme = "minty";
    const { result } = renderHook(() => useWorkspaceDocuments(input));
    const source = "@startuml\n!theme cerulean\nAlice -> Bob: Hello\n@enduml";
    act(() => result.current.createDocument("sequence", { title: "My sequence", source, personal: true }));
    expect(input.tabs.addDocument).toHaveBeenCalledWith(
      expect.objectContaining({ source, displayName: "My sequence" }),
    );
    expect(input.tabs.closeDocument).not.toHaveBeenCalled();
    expect(input.fileHandles.current.size).toBe(1);
  });
});
