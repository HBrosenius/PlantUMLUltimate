import { describe, expect, it, vi } from "vitest";
import type { PortableProject } from "@plantuml-studio/document-format";
import { EmbeddedProjectSaveCoordinator, settleSavedRevision } from "./embedded-project-save";

const project = { projectId: "project", schemaVersion: 2 } as PortableProject;

describe("embedded project saves", () => {
  it("keeps a newer revision dirty after writing an earlier snapshot", async () => {
    let revision = 1;
    const writes: Uint8Array[] = [];
    const result = await new EmbeddedProjectSaveCoordinator().save(
      { projectId: "project", revision, project },
      async () => {
        revision = 2;
        return new Uint8Array([1]);
      },
      {
        name: "project.pumlu",
        async getFile() {
          return new File([], "project.pumlu");
        },
        async createWritable() {
          return {
            async write(bytes: Uint8Array) {
              writes.push(bytes);
            },
            async close() {},
          };
        },
      },
      () => revision,
    );
    expect(result.clean).toBe(false);
    expect(writes).toEqual([new Uint8Array([1])]);
  });

  it("aborts an interrupted write and lets the next queued save continue", async () => {
    const events: string[] = [];
    let attempt = 0;
    const handle = {
      name: "project.pumlu",
      async getFile() {
        return new File([], "project.pumlu");
      },
      async createWritable() {
        attempt += 1;
        const current = attempt;
        return {
          async write() {
            events.push(`write-${current}`);
            if (current === 1) throw new Error("disk disconnected");
          },
          async close() {
            events.push(`close-${current}`);
          },
          async abort() {
            events.push(`abort-${current}`);
          },
        };
      },
    };
    const coordinator = new EmbeddedProjectSaveCoordinator();
    const first = coordinator.save(
      { projectId: "project", revision: 1, project },
      async () => new Uint8Array([1]),
      handle,
      () => 2,
    );
    const second = coordinator.save(
      { projectId: "project", revision: 2, project },
      async () => new Uint8Array([2]),
      handle,
      () => 2,
    );

    await expect(first).rejects.toThrow("disk disconnected");
    await expect(second).resolves.toMatchObject({ clean: true });
    expect(events).toEqual(["write-1", "abort-1", "write-2", "close-2"]);
  });

  it("serializes writes for the same project", async () => {
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let created = 0;
    const handle = {
      name: "project.pumlu",
      async getFile() {
        return new File([], "project.pumlu");
      },
      async createWritable() {
        created += 1;
        const current = created;
        events.push(`open-${current}`);
        return {
          async write() {
            events.push(`write-${current}`);
            if (current === 1) await firstWrite;
          },
          async close() {
            events.push(`close-${current}`);
          },
        };
      },
    };
    const coordinator = new EmbeddedProjectSaveCoordinator();
    const first = coordinator.save(
      { projectId: "project", revision: 1, project },
      async () => new Uint8Array([1]),
      handle,
      () => 2,
    );
    const second = coordinator.save(
      { projectId: "project", revision: 2, project },
      async () => new Uint8Array([2]),
      handle,
      () => 2,
    );
    await Promise.resolve();
    expect(events).not.toContain("open-2");
    releaseFirst();

    await Promise.all([first, second]);
    expect(events).toEqual(["open-1", "write-1", "close-1", "open-2", "write-2", "close-2"]);
  });

  it("cancels encoding before opening a writable file", async () => {
    const controller = new AbortController();
    const createWritable = vi.fn();
    const saving = new EmbeddedProjectSaveCoordinator().save(
      { projectId: "project", revision: 1, project },
      async (_project, signal) => {
        controller.abort();
        signal?.throwIfAborted();
        return new Uint8Array([1]);
      },
      { name: "project.pumlu", getFile: async () => new File([], "project.pumlu"), createWritable },
      () => 1,
      controller.signal,
    );
    await expect(saving).rejects.toMatchObject({ name: "AbortError" });
    expect(createWritable).not.toHaveBeenCalled();
  });
});

describe("settling the saved revision after a write", () => {
  const fullProject = (): PortableProject => ({
    schemaVersion: 2,
    projectId: "project",
    revisionId: "22222222-2222-4222-8222-222222222222",
    name: "Review project",
    savedAt: "2026-09-18T10:00:00.000Z",
    diagrams: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Delivery",
        document: {
          schemaVersion: 1,
          documentId: "44444444-4444-4444-8444-444444444444",
          savedAt: "2026-09-18T10:00:00.000Z",
          current: { source: "@startgantt\n@endgantt\n", sourceHash: "a".repeat(64), diagramKind: "gantt" },
          settings: { resourceCapacities: {} },
          historyPolicy: { maxVersions: 10, maxLogicalBytes: 1024 * 1024 },
          versions: [],
          contents: [],
        },
      },
    ],
    elements: [],
    links: [],
  });

  it("marks the written revision saved when nothing changed during the write", async () => {
    const markSaved = vi.fn();
    const snapshot = { projectId: "project", revision: 3, project: fullProject() };
    const settled = await settleSavedRevision(snapshot, {
      currentRevision: () => 3,
      captureSaveSnapshot: vi.fn(),
      markSaved,
    });
    expect(settled).toBe(true);
    expect(markSaved).toHaveBeenCalledWith(3);
  });

  it("marks the live revision saved when the counter moved but the content is unchanged", async () => {
    // Regression: the first save of a new project (Save As) left the navigator on "Unsaved changes"
    // when a member tab synced metadata while the file was being written.
    const markSaved = vi.fn();
    const snapshot = { projectId: "project", revision: 3, project: fullProject() };
    const settled = await settleSavedRevision(snapshot, {
      currentRevision: () => 4,
      captureSaveSnapshot: async () => ({
        projectId: "project",
        revision: 4,
        project: { ...fullProject(), savedAt: "2026-09-18T10:00:05.000Z" },
      }),
      markSaved,
    });
    expect(settled).toBe(true);
    expect(markSaved).toHaveBeenCalledWith(4);
  });

  it("keeps the project dirty when newer content differs from what was written", async () => {
    const markSaved = vi.fn();
    const snapshot = { projectId: "project", revision: 3, project: fullProject() };
    const changed = fullProject();
    changed.diagrams[0]!.document.current = {
      ...changed.diagrams[0]!.document.current,
      source: "@startgantt\n[A] lasts 1 day\n@endgantt\n",
    };
    const settled = await settleSavedRevision(snapshot, {
      currentRevision: () => 4,
      captureSaveSnapshot: async () => ({ projectId: "project", revision: 4, project: changed }),
      markSaved,
    });
    expect(settled).toBe(false);
    expect(markSaved).not.toHaveBeenCalled();
  });
});
