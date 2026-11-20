// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeDocument, encodeProject, projectFromPlantUml } from "@plantuml-studio/document-format";
import type { DocumentSnapshot } from "../workspace-storage";
import type { OpenedFileBytes, WritableFileHandle } from "../file-service";
import { openDocumentFile, savePortableDocumentAs, downloadText } from "../file-service";
import { useSingleFileProject } from "./use-single-file-project";

vi.mock("../workspace-storage", () => ({
  enableMemoryOnlyHistory: vi.fn(async () => undefined),
  importDocumentVersions: vi.fn(async () => undefined),
  loadDocumentVersions: vi.fn(async () => []),
}));
vi.mock("./embedded-project-session", () => ({
  clearEmbeddedProjectRecovery: vi.fn(async () => undefined),
  loadEmbeddedProjectRecovery: vi.fn(async () => undefined),
  saveEmbeddedProjectRecovery: vi.fn(async () => undefined),
}));
vi.mock("../recent-files", () => ({ rememberRecentFile: vi.fn(async () => undefined) }));
vi.mock("../file-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../file-service")>()),
  openDocumentFile: vi.fn(),
  savePortableDocumentAs: vi.fn(),
  downloadText: vi.fn(),
}));

const sequence = "@startuml\nparticipant Checkout\n@enduml\n";

/** A writable file that keeps what was last written, so a save can be read back. */
function fileHandle(initial: Uint8Array, name = "plan.pumlu") {
  const state = { bytes: initial, writes: 0, failWrites: false };
  const handle: WritableFileHandle = {
    name,
    getFile: async () => new File([Uint8Array.from(state.bytes)], name),
    createWritable: async () => {
      let pending: Uint8Array = new Uint8Array();
      return {
        async write(data) {
          if (state.failWrites) throw new Error("disk full");
          pending = typeof data === "string" ? new TextEncoder().encode(data) : (data as Uint8Array);
        },
        async close() {
          state.bytes = pending;
          state.writes += 1;
        },
      };
    },
  };
  return { handle, state };
}

async function savedProject(name = "Plan") {
  const staged = await projectFromPlantUml(sequence, "sequence", "Checkout");
  const project = { ...staged, name };
  const bytes = (await encodeProject(project, { compression: "none" })).bytes;
  return { project, bytes };
}

async function openedFile(
  name = "plan.pumlu",
): Promise<OpenedFileBytes & { state: ReturnType<typeof fileHandle>["state"] }> {
  const { bytes } = await savedProject();
  const { handle, state } = fileHandle(bytes, name);
  return { kind: "native", bytes, fileName: name, handle, lastModified: 0, size: bytes.length, state };
}

function setup(documents: DocumentSnapshot[] = []) {
  let counter = 0;
  const tabs = {
    addDocument: vi.fn(() => `tab-${++counter}`),
    activateDocument: vi.fn(),
    closeDocument: vi.fn(),
    updateDocumentSource: vi.fn(),
    updateDocumentFormat: vi.fn(),
    documents,
  };
  const callbacks = {
    resetSelection: vi.fn(),
    onOpened: vi.fn(),
    setInteractionMessage: vi.fn(),
    reportError: vi.fn(),
  };
  const hook = renderHook(() => useSingleFileProject({ tabs, ...callbacks }));
  return { tabs, callbacks, ...hook };
}

const messages = (callbacks: { setInteractionMessage: ReturnType<typeof vi.fn> }) =>
  callbacks.setInteractionMessage.mock.calls.map(([value]) => String(value));

/** Makes the next hidden file input "choose" the given file. */
function chooseFile(file: File | undefined) {
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
    Object.defineProperty(this, "files", { value: file ? [file] : [], configurable: true });
    this.onchange?.(new Event("change"));
  });
}

beforeEach(() => {
  // jsdom's Blob has no stream(), which the document encoder uses to compress.
  if (!Blob.prototype.stream)
    Object.defineProperty(Blob.prototype, "stream", {
      configurable: true,
      value(this: Blob) {
        return new ReadableStream<Uint8Array>({
          start: async (controller) => {
            controller.enqueue(new Uint8Array(await this.arrayBuffer()));
            controller.close();
          },
        });
      },
    });
  vi.mocked(openDocumentFile).mockReset();
  vi.mocked(savePortableDocumentAs).mockReset();
  vi.mocked(downloadText).mockReset();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:t"), revokeObjectURL: vi.fn() }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openNative(value = setup()) {
  const opened = await openedFile();
  vi.mocked(openDocumentFile).mockResolvedValue(opened);
  await act(async () => {
    await value.result.current.openProject();
  });
  await waitFor(() => expect(value.result.current.portableProject).toBeDefined());
  return { ...value, opened };
}

describe("creating and opening documents", () => {
  it("ignores a blank name and creates a document from a real one", async () => {
    const { result, callbacks } = setup();
    await act(() => result.current.newProject("   "));
    expect(result.current.portableProject).toBeUndefined();
    await act(() => result.current.newProject("  Roadmap  "));
    await waitFor(() => expect(result.current.portableProject?.name).toBe("Roadmap"));
    expect(result.current.dirty).toBeDefined();
    expect(callbacks.resetSelection).toHaveBeenCalled();
    expect(messages(callbacks)).toContain("Created Roadmap. Add a diagram to begin.");
    await waitFor(() => expect(result.current.indexStatus.state).toBe("ready"), { timeout: 3000 });
  });

  it("opens a saved document file and remembers its handle", async () => {
    const { result, callbacks } = await openNative();
    expect(result.current.portableProject?.name).toBe("Plan");
    expect(result.current.hasReviewBaseline).toBe(true);
    expect(callbacks.onOpened).toHaveBeenCalled();
    expect(messages(callbacks)[0]).toMatch(/^Opened Plan with 1 diagram\./);
  });

  it("opens a plain PlantUML file as an unsaved document", async () => {
    const { result } = setup();
    vi.mocked(openDocumentFile).mockResolvedValue({
      kind: "legacy",
      bytes: new TextEncoder().encode(sequence),
      source: sequence,
      fileName: "checkout.puml",
      lastModified: 0,
      size: 10,
      importedSource: true,
    });
    await act(async () => {
      await result.current.openProject();
    });
    await waitFor(() => expect(result.current.portableProject?.name).toBe("checkout"));
    expect(result.current.hasReviewBaseline).toBe(false);
  });

  it("returns false when nothing was chosen and reports files that cannot be read", async () => {
    const { result, callbacks } = setup();
    vi.mocked(openDocumentFile).mockResolvedValue(undefined);
    let opened = true;
    await act(async () => {
      opened = await result.current.openProject();
    });
    expect(opened).toBe(false);

    await act(async () => {
      opened = await result.current.openOpenedProject({
        kind: "legacy",
        bytes: new Uint8Array(),
        fileName: "broken.puml",
        lastModified: 0,
        size: 0,
      });
    });
    expect(opened).toBe(false);
    expect(callbacks.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("Could not read") }),
    );
  });

  it("imports a portable project as an unsaved document", async () => {
    const { result, callbacks } = setup();
    const { project } = await savedProject("Imported");
    await act(() => result.current.openPortableProject(project));
    await waitFor(() => expect(result.current.portableProject?.name).toBe("Imported"));
    expect(messages(callbacks)).toContain("Imported Imported; save to create its one-file document.");
  });
});

describe("adding and importing diagrams", () => {
  it("adds a starter diagram to the open document and reports when none is open", async () => {
    const empty = setup();
    let added = true;
    await act(async () => {
      added = await empty.result.current.addProjectDiagram("gantt", "Schedule");
    });
    expect(added).toBe(false);
    expect(empty.callbacks.reportError).toHaveBeenCalled();

    const { result, callbacks } = await openNative();
    await act(async () => {
      added = await result.current.addProjectDiagram("gantt", "Schedule.puml");
    });
    expect(added).toBe(true);
    expect(result.current.portableProject?.diagrams.map((item) => item.name)).toContain("Schedule");
    expect(messages(callbacks)).toContain("Added Schedule. Save the document to keep it.");
  });

  it("imports a PlantUML text file as a new diagram", async () => {
    const { result } = await openNative();
    chooseFile(new File([sequence], "flow.puml"));
    await act(() => result.current.importDiagram());
    expect(result.current.portableProject?.diagrams.map((item) => item.name)).toContain("flow");
  });

  it("imports another saved document's diagram", async () => {
    const { result } = await openNative();
    const { project } = await savedProject("Other");
    const { bytes } = await encodeDocument(project.diagrams[0]!.document, { compression: "none" });
    chooseFile(new File([Uint8Array.from(bytes)], "other.pumlu"));
    await act(() => result.current.importDiagram());
    expect(result.current.portableProject?.diagrams.length).toBe(2);
  });

  it("does nothing when no file is chosen and rejects text that is not a diagram", async () => {
    const { result, callbacks } = await openNative();
    chooseFile(undefined);
    await act(() => result.current.importDiagram());
    expect(callbacks.reportError).not.toHaveBeenCalled();

    chooseFile(new File(["just some notes"], "notes.puml"));
    await act(() => result.current.importDiagram());
    expect(messages(callbacks)).toContain("Choose a supported PlantUML diagram");

    chooseFile(new File([new Uint8Array([0xff, 0xfe, 0xfd])], "binary.puml"));
    await act(() => result.current.importDiagram());
    expect(callbacks.reportError).toHaveBeenCalled();
  });
});

describe("editing a document", () => {
  it("renames and deletes diagrams, confirming before a delete", async () => {
    const { result, callbacks } = await openNative();
    const member = result.current.portableProject!.diagrams[0]!;
    act(() => result.current.renameDiagram(member.id, "  Renamed  "));
    expect(messages(callbacks)).toContain("Renamed diagram to Renamed");

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    act(() => result.current.deleteDiagram(member.id));
    expect(result.current.portableProject?.diagrams).toHaveLength(1);
    expect(confirm).toHaveBeenCalledWith("Delete Renamed? This also removes 0 incident connections.");

    confirm.mockReturnValue(true);
    act(() => result.current.deleteDiagram(member.id));
    expect(result.current.portableProject?.diagrams).toHaveLength(0);
    expect(messages(callbacks)).toContain("Deleted Renamed");
    act(() => result.current.deleteDiagram("missing"));
  });

  it("updates links and elements and applies rename mappings", async () => {
    const { result } = await openNative();
    const before = result.current.portableProject!.revisionId;
    act(() => result.current.updateLinks([]));
    expect(result.current.portableProject!.revisionId).not.toBe(before);
    act(() => result.current.updateElements([]));
    const afterElements = result.current.portableProject!.revisionId;
    act(() => result.current.registerElements([]));
    expect(result.current.portableProject!.revisionId).toBe(afterElements);
    await act(() => result.current.applyRenameMappings("id", [], "source"));
    expect(result.current.portableProject!.revisionId).toBe(afterElements);
    await act(() =>
      result.current.applyRenameMappings("id", [{ elementId: "none", declaration: {} as never }], "source"),
    );
  });

  it("shares the open document and adopts a shared one", async () => {
    const { result } = await openNative();
    const shared = result.current.sharedDocument!;
    expect(shared).toBeDefined();
    act(() => result.current.receiveSharedDocument(shared));
    expect(result.current.portableProject?.projectId).toBe(shared.id);

    const other = setup();
    act(() => other.result.current.receiveSharedDocument(shared));
    await waitFor(() => expect(other.result.current.portableProject?.projectId).toBe(shared.id));
  });
});

describe("linked WBS and Gantt documents", () => {
  const converted = {
    wbsSource: "@startwbs\n* Plan\n@endwbs\n",
    ganttSource: "@startgantt\nProject starts 2026-01-01\n[Plan] lasts 2 days\n@endgantt\n",
    links: [],
    dependencies: [],
    warnings: [],
  };

  it("creates a document holding both diagrams and closes the source tab", async () => {
    const { result, tabs, callbacks } = setup();
    await act(() => result.current.createWbsGanttProject("Delivery", converted, "source-tab"));
    await waitFor(() => expect(result.current.portableProject?.diagrams).toHaveLength(2));
    expect(tabs.addDocument).toHaveBeenCalledTimes(2);
    expect(tabs.closeDocument).toHaveBeenCalledWith("source-tab");
    expect(messages(callbacks)[0]).toMatch(/^Created Delivery with linked WBS and Gantt diagrams/);
  });

  it("adds a linked Gantt chart to a WBS diagram and refuses a second one", async () => {
    const { result, tabs, callbacks } = setup();
    await act(() => result.current.createWbsGanttProject("Delivery", converted, "source-tab"));
    await waitFor(() => expect(result.current.portableProject?.diagrams).toHaveLength(2));
    const wbs = result.current.portableProject!.diagrams[0]!;
    await expect(result.current.addGanttFromWbs(wbs.id, converted, "tab-1")).rejects.toThrow(
      "This WBS diagram already has a linked Gantt chart",
    );
    await expect(result.current.addGanttFromWbs("missing", converted, "tab-1")).rejects.toThrow(
      "The WBS diagram is no longer in this document",
    );
    expect(tabs.updateDocumentFormat).not.toHaveBeenCalled();
    expect(callbacks.reportError).not.toHaveBeenCalled();
  });

  it("creates a linked Gantt chart for a WBS diagram that has none", async () => {
    const { result, tabs, callbacks } = await openNative();
    const wbs = await projectFromPlantUml(converted.wbsSource, "wbs", "Plan WBS");
    await act(async () => {
      await result.current.addProjectDiagram("wbs", "Plan WBS", converted.wbsSource);
    });
    const added = result.current.portableProject!.diagrams.find((item) => item.name === "Plan WBS")!;
    expect(wbs.diagrams).toHaveLength(1);
    await act(() =>
      result.current.addGanttFromWbs(added.id, { ...converted, wbsSource: "@startwbs\n* Changed\n@endwbs\n" }, "tab-1"),
    );
    expect(tabs.updateDocumentSource).toHaveBeenCalledWith("tab-1", "@startwbs\n* Changed\n@endwbs\n", "wbs");
    expect(result.current.portableProject!.diagrams.map((item) => item.name)).toContain("Plan WBS schedule");
    expect(messages(callbacks).some((value) => value.startsWith("Added Plan WBS schedule to Plan"))).toBe(true);
  });
});

describe("saving", () => {
  it("does nothing when no file is attached", async () => {
    const { result } = setup();
    await expect(result.current.saveProject()).resolves.toBeUndefined();
  });

  it("writes the document back to its file", async () => {
    const { result, callbacks, opened } = await openNative();
    act(() => result.current.renameDiagram(result.current.portableProject!.diagrams[0]!.id, "Edited"));
    let saved: { clean: boolean; message: string } | undefined;
    await act(async () => {
      saved = await result.current.saveProject();
    });
    expect(saved).toMatchObject({ clean: true });
    expect(opened.state.writes).toBe(1);
    expect(result.current.fileSaveState?.status).toBe("saved");
    expect(messages(callbacks)).toContain("Saved document");
  });

  it("refuses to overwrite a file that changed on disk", async () => {
    const { result, opened } = await openNative();
    const { bytes } = await savedProject("Someone else's edit");
    opened.state.bytes = bytes;
    let saved: { clean: boolean; message: string } | undefined;
    await act(async () => {
      saved = await result.current.saveProject();
    });
    expect(saved?.clean).toBe(false);
    expect(saved?.message).toMatch(/changed on disk/);
    expect(result.current.fileSaveState?.status).toBe("error");
    expect(opened.state.writes).toBe(0);
  });

  it("reports a write failure", async () => {
    const { result, callbacks, opened } = await openNative();
    opened.state.failWrites = true;
    let saved: { clean: boolean; message: string } | undefined;
    await act(async () => {
      saved = await result.current.saveProject();
    });
    expect(saved?.message).toMatch(/^Document save failed: disk full/);
    expect(result.current.fileSaveState?.status).toBe("error");
    expect(callbacks.reportError).toHaveBeenCalled();
  });

  it("can cancel a save that is in flight", async () => {
    const { result } = await openNative();
    act(() => result.current.cancelSave());
    expect(result.current.saving).toBe(false);
  });

  it("saves as a new file and keeps writing to it", async () => {
    const { result, callbacks } = await openNative();
    const target = fileHandle(new Uint8Array(), "copy.pumlu");
    vi.mocked(savePortableDocumentAs).mockImplementation(async (bytes) => {
      target.state.bytes = bytes;
      return { fileName: "copy.pumlu", handle: target.handle, downloaded: false };
    });
    let outcome: { clean: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.saveProjectAs();
    });
    expect(outcome).toEqual({ clean: true });
    expect(messages(callbacks)).toContain("Saved copy.pumlu");
    expect(result.current.fileSaveState?.status).toBe("saved");
    await act(async () => {
      await result.current.saveProject();
    });
    expect(target.state.writes).toBe(1);
  });

  it("reports a download, a cancelled picker and a failed Save As", async () => {
    const { result, callbacks } = await openNative();
    vi.mocked(savePortableDocumentAs).mockResolvedValueOnce({ fileName: "plan.pumlu", downloaded: true });
    await act(async () => {
      await result.current.saveProjectAs();
    });
    expect(result.current.fileSaveState?.status).toBe("downloaded");
    expect(messages(callbacks)).toContain("Downloaded document snapshot");

    vi.mocked(savePortableDocumentAs).mockResolvedValueOnce(undefined);
    await act(async () => {
      await result.current.saveProjectAs();
    });
    expect(result.current.fileSaveState?.status).toBe("cancelled");

    vi.mocked(savePortableDocumentAs).mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"));
    await act(async () => {
      await result.current.saveProjectAs();
    });
    expect(result.current.fileSaveState?.status).toBe("cancelled");

    vi.mocked(savePortableDocumentAs).mockRejectedValueOnce(new Error("no space"));
    await act(async () => {
      await result.current.saveProjectAs();
    });
    expect(result.current.fileSaveState?.status).toBe("error");
    expect(callbacks.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("no space") }),
    );
  });
});

describe("reviewing and closing", () => {
  it("reviews changes against the last saved copy and exports a report", async () => {
    const { result, callbacks } = await openNative();
    await expect(result.current.reviewChanges()).resolves.toBeDefined();
    act(() => result.current.renameDiagram(result.current.portableProject!.diagrams[0]!.id, "Edited"));
    await act(async () => {
      await result.current.exportReviewReport();
    });
    expect(downloadText).toHaveBeenCalledWith(expect.any(String), "Plan-review.html", "text/html;charset=utf-8");
    expect(messages(callbacks)).toContain("Exported Plan-review.html");
  });

  it("has nothing to review before a saved copy exists", async () => {
    const { result } = setup();
    await expect(result.current.reviewChanges()).resolves.toBeUndefined();
    await act(async () => {
      await result.current.exportReviewReport();
    });
    expect(downloadText).not.toHaveBeenCalled();
  });

  it("closes the document once any unsaved changes are settled", async () => {
    const { result } = await openNative();
    await act(async () => {
      await result.current.closeProject();
    });
    await waitFor(() => expect(result.current.portableProject).toBeUndefined());
    expect(result.current.project).toBeUndefined();
    expect(result.current.hasReviewBaseline).toBe(false);
  });

  it("asks before closing a document with unsaved changes", async () => {
    const { result } = await openNative();
    act(() => result.current.renameDiagram(result.current.portableProject!.diagrams[0]!.id, "Edited"));
    let closing!: Promise<void>;
    act(() => {
      closing = result.current.closeProject();
    });
    await waitFor(() => expect(result.current.leaveRequest).toBeDefined());
    act(() => result.current.decideLeave("discard"));
    await act(async () => {
      await closing;
    });
    await waitFor(() => expect(result.current.portableProject).toBeUndefined());
  });
});

describe("unlocking", () => {
  it("lets a pending unlock be cancelled and replaced", async () => {
    const { result } = setup();
    act(() => result.current.cancelUnlock());
    expect(result.current.unlockRequest).toBeUndefined();
    act(() => result.current.unlock("secret"));
    expect(result.current.unlockRequest).toBeUndefined();
  });
});
