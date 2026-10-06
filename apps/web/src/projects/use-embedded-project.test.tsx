// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeProject, encodeProject, hashSource, type PortableProject } from "@plantuml-studio/document-format";
import { loadDocumentVersions, type DocumentSnapshot } from "../workspace-storage";
import { useEmbeddedProject } from "./use-embedded-project";
import { EmbeddedProjectSaveCoordinator } from "./embedded-project-save";
import { projectContentEqual } from "./embedded-project";
import { loadEmbeddedProjectRecovery, saveEmbeddedProjectRecovery } from "./embedded-project-session";

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

function project(): PortableProject {
  return {
    schemaVersion: 2,
    projectId: "11111111-1111-4111-8111-111111111111",
    revisionId: "22222222-2222-4222-8222-222222222222",
    name: "Lifecycle project",
    savedAt: "2026-09-13T08:00:00.000Z",
    diagrams: [],
    elements: [],
    links: [],
  };
}

function projectWithDiagram(): PortableProject {
  const value = project();
  return {
    ...value,
    diagrams: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Plan",
        document: {
          schemaVersion: 1,
          documentId: "44444444-4444-4444-8444-444444444444",
          savedAt: value.savedAt,
          current: { source: "@startgantt\n@endgantt\n", sourceHash: "a".repeat(64), diagramKind: "gantt" },
          settings: { resourceCapacities: {} },
          historyPolicy: { maxVersions: 10, maxLogicalBytes: 1024 * 1024 },
          versions: [],
          contents: [],
        },
      },
    ],
  };
}

const emptyDocuments: DocumentSnapshot[] = [];

describe("useEmbeddedProject lifecycle", () => {
  afterEach(cleanup);

  it.each([true, false])(
    "keeps a member's latest content after its tab closes (saved first: %s)",
    async (savedFirst) => {
      const value = projectWithDiagram();
      const member = value.diagrams[0]!;
      const original: DocumentSnapshot = {
        id: "plan-tab",
        historyId: `project-history-${value.projectId}-${member.id}`,
        source: member.document.current.source,
        diagramKind: "gantt",
        fileName: "Plan",
        dirty: false,
        zoom: 1,
        cursor: { line: 1, column: 1 },
      };
      const controls = { addDocument: vi.fn(() => "reopened"), activateDocument: vi.fn() };
      const { result, rerender } = renderHook(
        ({ documents }: { documents: DocumentSnapshot[] }) => useEmbeddedProject({ ...controls, documents }),
        { initialProps: { documents: [original] } },
      );
      act(() => result.current.openProject(value));
      const edited = {
        ...original,
        source: "@startgantt\n[Edited] lasts 4 days\n@endgantt",
        dirty: true,
        resourceCapacities: { Alice: 80 },
        historyMaxVersions: 25,
        portableDocumentId: member.document.documentId,
        baselineVersionId: "local-baseline",
        progressForecast: { enabled: true, asOf: "2026-10-06", remainingDays: { Edited: 3 } },
      };
      vi.mocked(loadDocumentVersions).mockResolvedValue([
        {
          id: "local-baseline",
          portableId: "55555555-5555-4555-8555-555555555555",
          historyId: original.historyId,
          source: edited.source,
          sourceHash: await hashSource(edited.source),
          fileName: "Plan",
          diagramKind: "gantt",
          createdAt: "2026-10-06T08:00:00Z",
          reason: "manual",
          pinned: true,
        },
      ]);
      rerender({ documents: [edited] });
      const saved = await result.current.captureSaveSnapshot();
      if (savedFirst) act(() => result.current.markSaved(saved!.revision));
      rerender({ documents: [] });
      const closed = await result.current.captureSaveSnapshot();
      expect(closed!.project.diagrams[0]!.document.current.source).toBe(edited.source);
      const reopened = (await decodeProject((await encodeProject(closed!.project, { compression: "none" })).bytes))
        .project;
      expect(reopened.diagrams[0]!.document.current.source).toBe(edited.source);
      expect(reopened.diagrams[0]!.document.settings.resourceCapacities).toEqual(edited.resourceCapacities);
      expect(reopened.diagrams[0]!.document.settings.progressForecast).toEqual(edited.progressForecast);
      expect(reopened.diagrams[0]!.document.historyPolicy.maxVersions).toBe(25);
      expect(reopened.diagrams[0]!.document.versions).toHaveLength(1);
      expect(reopened.diagrams[0]!.document.current.baselineVersionId).toBe("55555555-5555-4555-8555-555555555555");
      await act(async () => {
        await result.current.openMember(member.id);
      });
      expect(controls.addDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          source: edited.source,
          resourceCapacities: edited.resourceCapacities,
          progressForecast: edited.progressForecast,
        }),
      );
      const remote = structuredClone(value);
      remote.diagrams[0]!.document.current.source = "@startgantt\n[Remote] lasts 2 days\n@endgantt";
      act(() => {
        result.current.receiveProject(remote);
      });
      expect((await result.current.captureSaveSnapshot())!.project.diagrams[0]!.document.current.source).toContain(
        "[Remote]",
      );
      act(() => result.current.openProject(value));
      expect((await result.current.captureSaveSnapshot())!.project.diagrams[0]!.document.current.source).toBe(
        member.document.current.source,
      );
    },
  );
  beforeEach(() => vi.resetAllMocks());

  it("restores local recovery as unsaved until a file save is confirmed", async () => {
    const recovered = projectWithDiagram();
    vi.mocked(loadEmbeddedProjectRecovery).mockResolvedValueOnce({ state: "unlocked", project: recovered });
    const { result } = renderHook(() =>
      useEmbeddedProject({
        documents: emptyDocuments,
        addDocument: vi.fn(() => "tab-1"),
        activateDocument: vi.fn(),
      }),
    );
    await act(async () => {
      await result.current.restoreProject();
    });
    expect(result.current.project).toEqual(recovered);
    expect(result.current.dirty).toBe(true);
    await waitFor(() => expect(result.current.recoveryStatus).toBe("current"));
    expect(result.current.dirty).toBe(true);
    act(() => result.current.markSaved(result.current.currentRevision()));
    expect(result.current.dirty).toBe(false);
  });

  it("keeps the project and unsaved changes when local recovery storage fails", async () => {
    vi.mocked(saveEmbeddedProjectRecovery).mockRejectedValueOnce(new Error("Quota exceeded"));
    const { result } = renderHook(() =>
      useEmbeddedProject({
        documents: emptyDocuments,
        addDocument: vi.fn(() => "tab-1"),
        activateDocument: vi.fn(),
      }),
    );
    act(() => result.current.openProject(projectWithDiagram(), { unsaved: true }));
    await waitFor(() => expect(result.current.recoveryStatus).toBe("error"));
    expect(result.current.project?.diagrams).toEqual(projectWithDiagram().diagrams);
    expect(result.current.dirty).toBe(true);
    act(() => result.current.updateProject((current) => ({ ...current, name: "Edited" })));
    await waitFor(() => expect(result.current.recoveryStatus).toBe("current"));
    expect(result.current.dirty).toBe(true);
  });

  it("does not replace a newly opened project with a delayed recovery read", async () => {
    let finish!: (value: Awaited<ReturnType<typeof loadEmbeddedProjectRecovery>>) => void;
    vi.mocked(loadEmbeddedProjectRecovery).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() =>
      useEmbeddedProject({
        documents: emptyDocuments,
        addDocument: vi.fn(() => "tab-1"),
        activateDocument: vi.fn(),
      }),
    );
    const pending = result.current.restoreProject();
    act(() => result.current.openProject({ ...project(), name: "Chosen file" }));
    await act(async () => {
      finish({ state: "unlocked", project: projectWithDiagram() });
      await pending;
    });
    expect(result.current.project?.name).toBe("Chosen file");
    expect(result.current.dirty).toBe(false);
  });

  it("does not promise recovery of encrypted document contents", async () => {
    const { result } = renderHook(() =>
      useEmbeddedProject({
        documents: emptyDocuments,
        addDocument: vi.fn(() => "tab-1"),
        activateDocument: vi.fn(),
      }),
    );
    act(() => result.current.openProject(project(), { encrypted: true }));
    await waitFor(() => expect(saveEmbeddedProjectRecovery).toHaveBeenCalled());
    expect(result.current.recoveryStatus).toBe("disabled");
  });

  it("reports the live revision when project metadata changes during a save", async () => {
    const documents: DocumentSnapshot[] = [];
    const tabs = {
      documents,
      addDocument: vi.fn(() => "tab-1"),
      activateDocument: vi.fn(),
      closeDocument: vi.fn(),
    };
    const { result } = renderHook(() => useEmbeddedProject(tabs));

    act(() => result.current.openProject(project()));
    await waitFor(() => expect(result.current.project).toBeDefined());
    const snapshot = await result.current.captureSaveSnapshot();
    expect(snapshot?.revision).toBe(0);

    act(() => {
      result.current.updateProject((current) => ({ ...current, name: "Changed while saving" }));
    });

    expect(result.current.currentRevision()).toBe(1);
    expect(result.current.currentRevision()).not.toBe(snapshot?.revision);
    expect(result.current.dirty).toBe(true);
  });

  it("keeps a saved project clean when derived elements are registered after the save", async () => {
    const tabs = {
      documents: [] as DocumentSnapshot[],
      addDocument: vi.fn(() => "tab-1"),
      activateDocument: vi.fn(),
      closeDocument: vi.fn(),
    };
    const { result } = renderHook(() => useEmbeddedProject(tabs));

    act(() => result.current.openProject(projectWithDiagram()));
    await waitFor(() => expect(result.current.project).toBeDefined());
    act(() => result.current.updateProject((current) => ({ ...current, name: "Edited" })));
    const snapshot = await result.current.captureSaveSnapshot();
    act(() => result.current.markSaved(snapshot!.revision));
    expect(result.current.dirty).toBe(false);

    // The link index resolves after the save finished and records the diagram's declarations.
    const element = {
      id: "55555555-5555-4555-8555-555555555555",
      documentId: projectWithDiagram().diagrams[0]!.id,
      kind: "gantt-task" as const,
      locator: {
        symbolKey: "Plan task",
        keyType: "semantic-key" as const,
        declarationHash: "c".repeat(64),
        sourceHash: "d".repeat(64),
        from: 12,
        to: 30,
      },
    };
    act(() => result.current.updateDerivedProject((current) => ({ ...current, elements: [element] })));

    expect(result.current.project?.elements).toEqual([element]);
    expect(result.current.currentRevision()).toBe(snapshot!.revision);
    expect(result.current.dirty).toBe(false);
    expect((await result.current.captureSaveSnapshot())?.project.elements).toEqual([element]);
  });

  it("marks project metadata changes in an open member dirty", async () => {
    const value = projectWithDiagram();
    const historyId = `project-history-${value.projectId}-${value.diagrams[0]!.id}`;
    const baseDocument = {
      id: "tab-1",
      historyId,
      source: value.diagrams[0]!.document.current.source,
      diagramKind: "gantt" as const,
      fileName: "Plan",
      dirty: false,
      zoom: 1,
      cursor: { line: 1, column: 1 },
      historyMaxVersions: 10,
      historyMaxLogicalBytes: 1024 * 1024,
      resourceCapacities: {},
    };
    const controls = {
      addDocument: vi.fn(() => "tab-1"),
      activateDocument: vi.fn(),
      closeDocument: vi.fn(),
    };
    const { result, rerender } = renderHook(
      ({ documents }: { documents: DocumentSnapshot[] }) => useEmbeddedProject({ ...controls, documents }),
      { initialProps: { documents: [baseDocument] } },
    );

    act(() => result.current.openProject(value));
    await waitFor(() => expect(result.current.project).toBeDefined());
    expect(result.current.dirty).toBe(false);

    rerender({ documents: [{ ...baseDocument, resourceCapacities: { Alice: 80 } }] });
    await waitFor(() => expect(result.current.dirty).toBe(true));
    expect(result.current.currentRevision()).toBe(1);
  });

  it("lets a revision bump that settles back to the saved content be recognized as unchanged", async () => {
    const value = projectWithDiagram();
    const historyId = `project-history-${value.projectId}-${value.diagrams[0]!.id}`;
    const baseDocument = {
      id: "tab-1",
      historyId,
      source: value.diagrams[0]!.document.current.source,
      diagramKind: "gantt" as const,
      fileName: "Plan",
      dirty: false,
      zoom: 1,
      cursor: { line: 1, column: 1 },
      historyMaxVersions: 10,
      historyMaxLogicalBytes: 1024 * 1024,
      resourceCapacities: {},
    };
    const controls = {
      addDocument: vi.fn(() => "tab-1"),
      activateDocument: vi.fn(),
      closeDocument: vi.fn(),
    };
    const { result, rerender } = renderHook(
      ({ documents }: { documents: DocumentSnapshot[] }) => useEmbeddedProject({ ...controls, documents }),
      { initialProps: { documents: [baseDocument] } },
    );

    act(() => result.current.openProject(value));
    await waitFor(() => expect(result.current.project).toBeDefined());
    const snapshot = await result.current.captureSaveSnapshot();
    expect(snapshot?.revision).toBe(0);

    let releaseEncode!: () => void;
    const encodeGate = new Promise<void>((resolve) => {
      releaseEncode = resolve;
    });
    const coordinator = new EmbeddedProjectSaveCoordinator();
    const handle = {
      name: "project.pumlu",
      getFile: async () => new File([], "project.pumlu"),
      createWritable: async () => ({
        write: async () => undefined,
        close: async () => undefined,
      }),
    };
    const saving = coordinator.save(
      snapshot!,
      async () => {
        await encodeGate;
        return new Uint8Array([1]);
      },
      handle,
      result.current.currentRevision,
    );

    // An in-flight auto-correction bumps the revision mid-write, then settles back to the
    // exact content that was already captured in the snapshot before the write finishes.
    rerender({ documents: [{ ...baseDocument, resourceCapacities: { Alice: 80 } }] });
    await waitFor(() => expect(result.current.currentRevision()).toBe(1));
    rerender({ documents: [baseDocument] });
    await waitFor(() => expect(result.current.currentRevision()).toBe(2));

    releaseEncode();
    const written = await saving;
    expect(written.clean).toBe(false);

    const latest = await result.current.captureSaveSnapshot();
    expect(projectContentEqual(latest!.project, snapshot!.project)).toBe(true);
  });

  it("opens members against the replacement project identity", async () => {
    const created: Array<Partial<Omit<DocumentSnapshot, "id">>> = [];
    const tabs = {
      documents: [] as DocumentSnapshot[],
      addDocument(input?: Partial<Omit<DocumentSnapshot, "id">>) {
        created.push(input ?? {});
        return "replacement-tab";
      },
      activateDocument: vi.fn(),
      closeDocument: vi.fn(),
    };
    const first = projectWithDiagram();
    const replacement = {
      ...projectWithDiagram(),
      projectId: "99999999-9999-4999-8999-999999999999",
      name: "Replacement",
    };
    const { result } = renderHook(() => useEmbeddedProject(tabs));

    act(() => result.current.openProject(first));
    act(() => result.current.openProject(replacement));
    await act(async () => {
      await result.current.openMember(replacement.diagrams[0]!.id);
    });

    expect(created).toHaveLength(1);
    expect(created[0]?.historyId).toBe(`project-history-${replacement.projectId}-${replacement.diagrams[0]!.id}`);
    expect(result.current.project?.name).toBe("Replacement");
  });
});
