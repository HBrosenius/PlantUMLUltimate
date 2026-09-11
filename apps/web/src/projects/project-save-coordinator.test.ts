import { describe, expect, it } from "vitest";
import { ProjectSaveCoordinator, type ProjectSaveStore } from "./project-save-coordinator";

describe("ProjectSaveCoordinator", () => {
  it("journals, writes members before the manifest, then clears the journal", async () => {
    const writes: string[] = [];
    const store: ProjectSaveStore = {
      write: async (path) => void writes.push(path),
      remove: async (path) => void writes.push(`remove:${path}`),
    };
    await new ProjectSaveCoordinator().save(store, [{ path: "a.puml", bytes: new Uint8Array() }], {
      path: "project.pumlproject",
      bytes: new Uint8Array(),
    });
    expect(writes).toEqual([
      ".plantuml-project-save-journal",
      "a.puml",
      "project.pumlproject",
      "remove:.plantuml-project-save-journal",
    ]);
  });

  it("retains recovery evidence and never writes the manifest after a member failure", async () => {
    const writes: string[] = [];
    const store: ProjectSaveStore = {
      write: async (path) => {
        writes.push(path);
        if (path === "a.puml") throw new Error("disk full");
      },
      remove: async (path) => void writes.push(`remove:${path}`),
    };
    await expect(
      new ProjectSaveCoordinator().save(store, [{ path: "a.puml", bytes: new Uint8Array() }], {
        path: "project.pumlproject",
        bytes: new Uint8Array(),
      }),
    ).rejects.toThrow("disk full");
    expect(writes).toEqual([".plantuml-project-save-journal", "a.puml"]);
  });

  it("replays a retained journal in member-before-manifest order", async () => {
    const writes: string[] = [];
    const journal = new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        members: [{ path: "a.puml", bytes: [1] }],
        manifest: { path: "project.pumlproject", bytes: [2] },
      }),
    );
    const store: ProjectSaveStore = {
      read: async () => journal,
      write: async (path) => void writes.push(path),
      remove: async (path) => void writes.push(`remove:${path}`),
    };
    await expect(new ProjectSaveCoordinator().recover(store)).resolves.toBe(true);
    expect(writes).toEqual(["a.puml", "project.pumlproject", "remove:.plantuml-project-save-journal"]);
  });

  it("rejects a malformed recovery journal before writing any member", async () => {
    const writes: string[] = [];
    const journal = new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        members: [{ path: "../outside.puml", bytes: [1] }],
        manifest: { path: "project.pumlproject", bytes: [2] },
      }),
    );
    const store: ProjectSaveStore = {
      read: async () => journal,
      write: async (path) => void writes.push(path),
      remove: async (path) => void writes.push(`remove:${path}`),
    };
    await expect(new ProjectSaveCoordinator().recover(store)).rejects.toThrow("unsafe member path");
    expect(writes).toEqual([]);
  });

  it.each([1, 2, 3, 4])("keeps a recoverable journal when write %s fails", async (failureAt) => {
    const files = new Map<string, Uint8Array>();
    let writes = 0;
    const store: ProjectSaveStore = {
      write: async (path, bytes) => {
        writes += 1;
        if (writes === failureAt) throw new Error("injected write failure");
        files.set(path, bytes);
      },
      read: async (path) => files.get(path),
      remove: async (path) => void files.delete(path),
    };
    const coordinator = new ProjectSaveCoordinator();
    await expect(
      coordinator.save(
        store,
        [
          { path: "a.puml", bytes: new Uint8Array([1]) },
          { path: "b.puml", bytes: new Uint8Array([2]) },
        ],
        { path: "project.pumlproject", bytes: new Uint8Array([3]) },
      ),
    ).rejects.toThrow("injected write failure");
    if (failureAt === 1) {
      expect(files.has(".plantuml-project-save-journal")).toBe(false);
      return;
    }
    expect(files.has(".plantuml-project-save-journal")).toBe(true);
    await expect(coordinator.recover(store)).resolves.toBe(true);
    await expect(coordinator.recover(store)).resolves.toBe(false);
    expect(files.get("a.puml")).toEqual(new Uint8Array([1]));
    expect(files.get("b.puml")).toEqual(new Uint8Array([2]));
    expect(files.get("project.pumlproject")).toEqual(new Uint8Array([3]));
  });
});
