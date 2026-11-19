// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentSnapshot } from "../workspace-storage";
import { loadActiveProject, saveActiveProject } from "../workspace-storage";
import type { ProjectDirectoryHandle, ProjectFileHandle } from "./folder-project";
import { createZipProject, createZipProjectSnapshot } from "./zip-project";
import { useFolderProject } from "./use-folder-project";

vi.mock("../workspace-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../workspace-storage")>()),
  loadActiveProject: vi.fn(async () => undefined),
  saveActiveProject: vi.fn(async () => undefined),
}));

type Tree = { [name: string]: string | Tree };

/** An in-memory folder that supports the reads, creates and writes the project code performs. */
function memoryFolder(initial: Tree = {}, name = "my-folder"): { root: ProjectDirectoryHandle; tree: Tree } {
  const tree = initial;
  const directoryFor = (node: Tree, directoryName: string): ProjectDirectoryHandle => ({
    name: directoryName,
    async getFileHandle(fileName, options) {
      if (typeof node[fileName] !== "string") {
        if (!options?.create) throw new DOMException("Missing", "NotFoundError");
        node[fileName] = "";
      }
      const file: ProjectFileHandle = {
        name: fileName,
        getFile: async () => new File([node[fileName] as string], fileName),
        createWritable: async () => ({
          async write(data) {
            node[fileName] = typeof data === "string" ? data : new TextDecoder().decode(data);
          },
          async close() {},
        }),
      };
      return file;
    },
    async getDirectoryHandle(directoryName2, options) {
      const existing = node[directoryName2];
      if (existing === undefined || typeof existing === "string") {
        if (!options?.create) throw new DOMException("Missing", "NotFoundError");
        node[directoryName2] = {};
      }
      return directoryFor(node[directoryName2] as Tree, directoryName2);
    },
    async removeEntry(entry) {
      delete node[entry];
    },
  });
  return { root: directoryFor(tree, name), tree };
}

/**
 * A browser stores a folder handle by structured clone and gives back a working handle. The plain
 * in-memory handles used here cannot be cloned, so this stand-in for IndexedDB keeps values by
 * reference, which is all the remember/restore/forget code relies on.
 */
function referenceIndexedDb() {
  const values = new Map<unknown, unknown>();
  const request = <T,>(compute: () => T) => {
    const value: { result?: T; onsuccess?: () => void } = {};
    queueMicrotask(() => {
      value.result = compute();
      value.onsuccess?.();
    });
    return value;
  };
  const database = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => undefined,
    close: () => undefined,
    transaction() {
      const transaction: { oncomplete?: (() => void) | undefined } = {};
      const done = () => queueMicrotask(() => transaction.oncomplete?.());
      return {
        get oncomplete() {
          return transaction.oncomplete;
        },
        set oncomplete(callback) {
          transaction.oncomplete = callback;
        },
        objectStore: () => ({
          put(value: unknown, key: unknown) {
            values.set(key, value);
            done();
          },
          delete(key: unknown) {
            values.delete(key);
            done();
          },
          get: (key: unknown) => request(() => values.get(key)),
        }),
      };
    },
  };
  return { open: () => request(() => database) };
}

const documentId = "00000000-0000-4000-8000-000000000003";
const projectId = "00000000-0000-4000-8000-000000000001";
const sequence = "@startuml\nparticipant Checkout\n@enduml\n";
const manifest = JSON.stringify({
  format: "plantuml-ultimate-project",
  schemaVersion: 1,
  projectId,
  revisionId: "00000000-0000-4000-8000-000000000002",
  name: "Demo",
  documents: [{ id: documentId, path: "diagrams/checkout.puml", format: "plantuml" }],
  elements: [],
  links: [],
});
const demoFolder = () =>
  memoryFolder({ "project.pumlproject": manifest, diagrams: { "checkout.puml": sequence } }, "demo-folder");

function snapshot(patch: Partial<DocumentSnapshot> & { id: string }): DocumentSnapshot {
  return { source: "", diagramKind: "sequence", fileName: "x.puml", dirty: false, ...patch } as DocumentSnapshot;
}

function setup(documents: DocumentSnapshot[] = []) {
  let counter = 0;
  const tabs = {
    addDocument: vi.fn(() => `tab-${++counter}`),
    activateDocument: vi.fn(),
    getDocument: vi.fn((id: string) => documents.find((item) => item.id === id)),
    updateDocumentFormat: vi.fn(),
    documents,
  };
  const callbacks = { resetSelection: vi.fn(), setInteractionMessage: vi.fn(), reportError: vi.fn() };
  const hook = renderHook(({ tabsValue }) => useFolderProject({ tabs: tabsValue, ...callbacks }), {
    initialProps: { tabsValue: tabs },
  });
  return { tabs, callbacks, ...hook };
}

const messages = (callbacks: { setInteractionMessage: ReturnType<typeof vi.fn> }) =>
  callbacks.setInteractionMessage.mock.calls.map(([value]) => value);

beforeEach(() => {
  vi.stubGlobal("indexedDB", referenceIndexedDb());
  vi.mocked(loadActiveProject).mockResolvedValue(undefined);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker;
});

describe("opening a folder document", () => {
  it("explains when the browser has no folder access", async () => {
    const { result, callbacks } = setup();
    await act(() => result.current.openProject());
    expect(messages(callbacks)).toContain("Opening a folder document requires a browser with folder access support");
    await act(() => result.current.newProject());
    expect(messages(callbacks)).toContain("Creating a folder document requires a browser with folder access support");
  });

  it("opens every diagram in a tab, remembers the folder and restores it on the next start", async () => {
    const { root } = demoFolder();
    (window as { showDirectoryPicker?: unknown }).showDirectoryPicker = vi.fn(async () => root);
    const { result, tabs, callbacks, unmount } = setup();
    await act(() => result.current.openProject());
    expect(result.current.project?.manifest.name).toBe("Demo");
    expect(tabs.addDocument).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: "diagrams/checkout.puml", diagramKind: "sequence", dirty: false }),
    );
    expect(callbacks.resetSelection).toHaveBeenCalled();
    expect(messages(callbacks)).toContain("Opened document Demo with 1 diagrams");
    expect(result.current.isProjectMemberTab("tab-1")).toBe(true);
    expect(result.current.isProjectMemberTab("other")).toBe(false);
    unmount();

    const restored = setup();
    await waitFor(() => expect(restored.result.current.project?.manifest.name).toBe("Demo"));
    expect(messages(restored.callbacks)).toContain("Restored document Demo");
  });

  it("forgets a remembered folder that can no longer be read", async () => {
    const { root, tree } = demoFolder();
    (window as { showDirectoryPicker?: unknown }).showDirectoryPicker = vi.fn(async () => root);
    const first = setup();
    await act(() => first.result.current.openProject());
    first.unmount();
    delete tree["project.pumlproject"];

    const second = setup();
    await waitFor(() => expect(second.result.current.project).toBeUndefined());
    await new Promise((resolve) => setTimeout(resolve, 20));
    const third = setup();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(third.result.current.project).toBeUndefined();
    expect(messages(third.callbacks)).not.toContain("Restored document Demo");
  });

  it("ignores a cancelled picker and reports other failures", async () => {
    const picker = vi.fn().mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"));
    (window as { showDirectoryPicker?: unknown }).showDirectoryPicker = picker;
    const { result, callbacks } = setup();
    await act(() => result.current.openProject());
    expect(callbacks.reportError).not.toHaveBeenCalled();

    const failure = new Error("denied");
    picker.mockRejectedValueOnce(failure);
    await act(() => result.current.openProject());
    expect(callbacks.reportError).toHaveBeenCalledWith(failure);
  });
});

describe("creating documents", () => {
  it("creates a folder document with a starter diagram", async () => {
    const { root, tree } = memoryFolder({}, "fresh");
    (window as { showDirectoryPicker?: unknown }).showDirectoryPicker = vi.fn(async () => root);
    vi.spyOn(window, "prompt").mockReturnValue("  Plan  ");
    const { result, tabs, callbacks } = setup();
    await act(() => result.current.newProject());
    expect(result.current.project?.manifest.name).toBe("Plan");
    expect(tree["project.pumlproject"]).toContain("Plan");
    expect(tabs.addDocument).toHaveBeenCalledTimes(1);
    expect(messages(callbacks)).toContain("Created document Plan");
  });

  it("does nothing when naming is cancelled and reports a failed creation", async () => {
    const { root } = memoryFolder({}, "fresh");
    (window as { showDirectoryPicker?: unknown }).showDirectoryPicker = vi.fn(async () => root);
    const prompt = vi.spyOn(window, "prompt").mockReturnValue(null);
    const { result, tabs, callbacks } = setup();
    await act(() => result.current.newProject());
    expect(result.current.project).toBeUndefined();
    expect(tabs.addDocument).not.toHaveBeenCalled();

    prompt.mockReturnValue("Plan");
    const readOnly = { ...root, getDirectoryHandle: vi.fn().mockRejectedValue(new Error("read only")) };
    (window as { showDirectoryPicker?: unknown }).showDirectoryPicker = vi.fn(async () => readOnly);
    await act(() => result.current.newProject());
    expect(callbacks.reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "read only" }));
  });

  it("creates a ZIP document and downloads it", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("Archive");
    const { result, tabs, callbacks } = setup();
    await act(() => result.current.newZipProject());
    expect(result.current.project?.manifest.name).toBe("Archive");
    expect(tabs.addDocument).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(messages(callbacks)).toContain("Created and downloaded Archive");
  });

  it("does not create a ZIP document when naming is cancelled", async () => {
    vi.spyOn(window, "prompt").mockReturnValue(null);
    const { result } = setup();
    await act(() => result.current.newZipProject());
    expect(result.current.project).toBeUndefined();
  });
});

describe("opening a ZIP document", () => {
  it("opens the file chosen in the file picker", async () => {
    const zip = await createZipProject("Packed");
    const bytes = await createZipProjectSnapshot(zip);
    (window as { showOpenFilePicker?: unknown }).showOpenFilePicker = vi.fn(async () => [
      { getFile: async () => new File([Uint8Array.from(bytes)], "packed.zip") },
    ]);
    const { result, callbacks } = setup();
    await act(() => result.current.openZipProject());
    expect(result.current.project?.manifest.name).toBe("Packed");
    expect(messages(callbacks)).toContain("Opened ZIP document Packed with 1 diagrams");
  });

  it("stays quiet when the picker is cancelled and reports an unreadable archive", async () => {
    const picker = vi.fn().mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"));
    (window as { showOpenFilePicker?: unknown }).showOpenFilePicker = picker;
    const { result, callbacks } = setup();
    await act(() => result.current.openZipProject());
    expect(callbacks.reportError).not.toHaveBeenCalled();

    picker.mockResolvedValueOnce([{ getFile: async () => new File(["not a zip"], "broken.zip") }]);
    await act(() => result.current.openZipProject());
    expect(callbacks.reportError).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the picker returns no file", async () => {
    (window as { showOpenFilePicker?: unknown }).showOpenFilePicker = vi.fn(async () => []);
    const { result, callbacks } = setup();
    await act(() => result.current.openZipProject());
    expect(result.current.project).toBeUndefined();
    expect(callbacks.reportError).not.toHaveBeenCalled();
  });
});

describe("working in an open folder document", () => {
  async function openDemo(documents: DocumentSnapshot[] = []) {
    const folder = demoFolder();
    (window as { showDirectoryPicker?: unknown }).showDirectoryPicker = vi.fn(async () => folder.root);
    const value = setup(documents);
    await act(() => value.result.current.openProject());
    return { ...value, ...folder };
  }

  it("activates an already open diagram and opens a closed one in a new tab", async () => {
    const { result, tabs, callbacks } = await openDemo();
    act(() => result.current.openMember(documentId));
    expect(tabs.activateDocument).toHaveBeenCalledWith("tab-1");

    tabs.addDocument.mockClear();
    act(() => result.current.closeProject());
    await waitFor(() => expect(result.current.project).toBeUndefined());
    act(() => result.current.openMember(documentId));
    expect(tabs.addDocument).not.toHaveBeenCalled();
    expect(messages(callbacks)).not.toContain("Opened diagrams/checkout.puml from Demo");
  });

  it("opens a member that has no tab yet", async () => {
    const folder = demoFolder();
    (window as { showDirectoryPicker?: unknown }).showDirectoryPicker = vi.fn(async () => folder.root);
    const { result, tabs, callbacks } = setup();
    await act(() => result.current.openProject());
    // Forget the tab so the member is opened again.
    const added = tabs.addDocument.mock.calls.length;
    const rerender = setup();
    await waitFor(() => expect(rerender.result.current.project).toBeDefined());
    act(() => rerender.result.current.openMember(documentId));
    expect(rerender.tabs.addDocument).toHaveBeenCalledTimes(1);
    expect(messages(rerender.callbacks)).toContain("Opened diagrams/checkout.puml from Demo");
    expect(added).toBe(1);
    expect(callbacks.reportError).not.toHaveBeenCalled();
  });

  it("adds a new diagram with a normalized path and rejects unsafe or duplicate paths", async () => {
    const { result, tabs, callbacks } = await openDemo();
    let accepted = false;
    await act(async () => {
      accepted = await result.current.addProjectDiagram("sequence", " diagrams/flow ");
    });
    expect(accepted).toBe(true);
    expect(result.current.project?.manifest.documents.map((item) => item.path)).toContain("diagrams/flow.puml");
    expect(tabs.addDocument).toHaveBeenLastCalledWith(
      expect.objectContaining({ fileName: "diagrams/flow.puml", dirty: true }),
    );
    expect(messages(callbacks)).toContain("Added diagrams/flow.puml; save the document to keep it");

    for (const path of ["diagrams/flow.puml", "../escape.puml", "/absolute.puml"]) {
      await act(async () => {
        accepted = await result.current.addProjectDiagram("sequence", path);
      });
      expect(accepted).toBe(false);
    }
    expect(messages(callbacks)).toContain("Choose a unique, safe .puml document-relative path");
  });

  it("does nothing without an open document", async () => {
    const { result } = setup();
    let accepted = true;
    await act(async () => {
      accepted = await result.current.addProjectDiagram("sequence", "a.puml");
    });
    expect(accepted).toBe(false);
    act(() => result.current.openMember(documentId));
    await act(() => result.current.saveFolderProject());
    await act(() => result.current.saveZipProject());
    expect(result.current.fileSaveState).toBeUndefined();
  });

  it("saves edited diagrams back to the folder and clears the tab's unsaved mark", async () => {
    const edited = "@startuml\nparticipant Billing\n@enduml\n";
    const documents = [snapshot({ id: "tab-1", source: edited, dirty: true, fileName: "diagrams/checkout.puml" })];
    const { result, tabs, callbacks, tree } = await openDemo(documents);
    await act(() => result.current.saveFolderProject());
    await waitFor(() => expect(result.current.fileSaveState?.status).toBe("saved"));
    expect((tree.diagrams as Tree)["checkout.puml"]).toBe(edited);
    expect(tabs.updateDocumentFormat).toHaveBeenCalledWith("tab-1", { dirty: false });
    expect(messages(callbacks)).toContain("Saved 1 changed diagram");
  });

  it("saves only metadata when no diagram changed", async () => {
    const { result, callbacks } = await openDemo();
    await act(() => result.current.saveFolderProject());
    expect(messages(callbacks)).toContain("Saved document metadata");
  });

  it("reports a folder that cannot be written", async () => {
    const edited = "@startuml\nparticipant Billing\n@enduml\n";
    const documents = [snapshot({ id: "tab-1", source: edited, dirty: true, fileName: "diagrams/checkout.puml" })];
    const { result, callbacks, root } = await openDemo(documents);
    vi.spyOn(root, "getFileHandle").mockRejectedValue(new Error("permission denied"));
    await act(() => result.current.saveFolderProject());
    expect(result.current.fileSaveState?.status).toBe("error");
    expect(callbacks.reportError).toHaveBeenCalled();
  });

  it("keeps links and elements, applies rename mappings and converts the document", async () => {
    const { result } = await openDemo();
    const before = result.current.project;
    act(() => result.current.updateLinks([]));
    await waitFor(() => expect(result.current.project).not.toBe(before));
    const afterLinks = result.current.project;
    act(() => result.current.updateElements([]));
    await waitFor(() => expect(result.current.project).not.toBe(afterLinks));
    await act(() => result.current.applyRenameMappings(documentId, [], "source"));
    const unchanged = result.current.project;
    await act(() =>
      result.current.applyRenameMappings(documentId, [{ elementId: "none", declaration: {} as never }], "source"),
    );
    expect(result.current.project?.manifest.elements).toEqual(unchanged?.manifest.elements);
    await expect(result.current.convertCurrentProject()).resolves.toBeDefined();
  });

  it("closing the document forgets it", async () => {
    const first = await openDemo();
    act(() => first.result.current.closeProject());
    await waitFor(() => expect(first.result.current.project).toBeUndefined());
    first.unmount();
    const second = setup();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(second.result.current.project).toBeUndefined();
  });
});

describe("working in an open ZIP document", () => {
  it("saves the open ZIP document as a download", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("Archive");
    const documents: DocumentSnapshot[] = [];
    const { result, tabs, callbacks, rerender } = setup(documents);
    await act(() => result.current.newZipProject());
    const edited = "@startgantt\nProject starts 2026-01-01\n[Edited] lasts 2 days\n@endgantt\n";
    documents.push(snapshot({ id: "tab-1", source: edited, dirty: true, diagramKind: "gantt" }));
    rerender({ tabsValue: { ...tabs, documents: [...documents] } });
    await act(() => result.current.saveZipProject());
    expect(result.current.fileSaveState?.status).toBe("downloaded");
    expect(messages(callbacks).some((value) => String(value).startsWith("Downloaded document snapshot"))).toBe(true);
  });

  it("reports a snapshot that cannot be downloaded", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("Archive");
    const { result, callbacks } = setup();
    await act(() => result.current.newZipProject());
    vi.mocked(URL.createObjectURL).mockImplementation(() => {
      throw new Error("blocked");
    });
    await act(() => result.current.saveZipProject());
    expect(result.current.fileSaveState?.status).toBe("error");
    expect(callbacks.reportError).toHaveBeenCalled();
  });
});

describe("restoring the previous session", () => {
  it("restores an unsaved document from browser storage", async () => {
    vi.mocked(loadActiveProject).mockResolvedValue({
      manifest: JSON.parse(manifest),
      sources: { "diagrams/checkout.puml": sequence },
    });
    const { result } = setup();
    await waitFor(() => expect(result.current.project?.manifest.name).toBe("Demo"));
    await waitFor(() => expect(saveActiveProject).toHaveBeenCalled());
    expect(result.current.project?.members[0]?.source).toBe(sequence);
  });

  it("ignores stored data that is not a document", async () => {
    vi.mocked(loadActiveProject).mockResolvedValue({ manifest: {}, sources: { a: "b" } });
    const { result } = setup();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(result.current.project).toBeUndefined();
    vi.mocked(loadActiveProject).mockResolvedValue({ manifest: JSON.parse(manifest) });
    const second = setup();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(second.result.current.project).toBeUndefined();
  });

  it("re-indexes the document after a tab's source changes", async () => {
    vi.mocked(loadActiveProject).mockResolvedValue({
      manifest: JSON.parse(manifest),
      sources: { "diagrams/checkout.puml": sequence },
    });
    const documents: DocumentSnapshot[] = [];
    const { result, tabs, rerender } = setup(documents);
    await waitFor(() => expect(result.current.project).toBeDefined());
    const edited = "@startuml\nparticipant Billing\n@enduml\n";
    const next = [
      snapshot({
        id: "tab-9",
        source: edited,
        historyId: `project-history-${projectId}-${documentId}`,
        diagramKind: "sequence",
      }),
    ];
    rerender({ tabsValue: { ...tabs, documents: next } });
    await waitFor(() => expect(result.current.project?.members[0]?.source).toBe(edited), { timeout: 2000 });
    expect(result.current.isProjectMemberTab("tab-9")).toBe(true);
  });
});
