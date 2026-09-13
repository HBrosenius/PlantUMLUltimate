// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PortableProject } from "@plantuml-studio/document-format";
import type { DocumentSnapshot } from "../workspace-storage";
import { useEmbeddedProject } from "./use-embedded-project";

vi.mock("../workspace-storage", () => ({
  enableMemoryOnlyHistory: vi.fn(async () => undefined),
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
});
