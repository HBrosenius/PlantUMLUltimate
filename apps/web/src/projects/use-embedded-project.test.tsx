// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PortableProject } from "@plantuml-studio/document-format";
import type { DocumentSnapshot } from "../workspace-storage";
import { useEmbeddedProject } from "./use-embedded-project";
import { EmbeddedProjectSaveCoordinator } from "./embedded-project-save";
import { projectContentEqual } from "./embedded-project";

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

describe("useEmbeddedProject lifecycle", () => {
  beforeEach(() => vi.clearAllMocks());

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
