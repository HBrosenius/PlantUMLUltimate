import { describe, expect, it, vi } from "vitest";
import type { PortableProject } from "@plantuml-studio/document-format";
import { EmbeddedProjectSaveCoordinator } from "./embedded-project-save";

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
