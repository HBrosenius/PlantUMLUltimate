import { describe, expect, it } from "vitest";
import {
  ProjectRecoveryConflictError,
  ProjectSaveCoordinator,
  type ProjectSaveStore,
} from "./project-save-coordinator";

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

  describe("recovering an interrupted save", () => {
    const bytes = (text: string) => new TextEncoder().encode(text);
    const folder = (initial: Record<string, string>) => {
      const files = new Map<string, Uint8Array>(Object.entries(initial).map(([path, text]) => [path, bytes(text)]));
      let failNextMember = false;
      const store: ProjectSaveStore = {
        read: async (path) => files.get(path),
        write: async (path, value) => {
          if (failNextMember && path === "b.puml") {
            failNextMember = false;
            throw new Error("interrupted");
          }
          files.set(path, value);
        },
        remove: async (path) => void files.delete(path),
      };
      return { files, store, interruptAtB: () => (failNextMember = true) };
    };
    const text = (files: Map<string, Uint8Array>, path: string) => new TextDecoder().decode(files.get(path));
    const interruptedSave = async () => {
      const project = folder({ "a.puml": "a1", "b.puml": "b1", "project.pumlproject": "m1" });
      project.interruptAtB();
      await expect(
        new ProjectSaveCoordinator().save(
          project.store,
          [
            { path: "a.puml", bytes: bytes("a2") },
            { path: "b.puml", bytes: bytes("b2") },
          ],
          { path: "project.pumlproject", bytes: bytes("m2") },
        ),
      ).rejects.toThrow("interrupted");
      return project;
    };

    it("completes the save when the files are as the interrupted save left them", async () => {
      const { files, store } = await interruptedSave();
      await expect(new ProjectSaveCoordinator().recover(store)).resolves.toBe(true);
      expect([text(files, "a.puml"), text(files, "b.puml"), text(files, "project.pumlproject")]).toEqual([
        "a2",
        "b2",
        "m2",
      ]);
      expect(files.has(".plantuml-project-save-journal")).toBe(false);
    });

    it("leaves files edited elsewhere untouched and keeps the journal", async () => {
      const { files, store } = await interruptedSave();
      files.set("b.puml", bytes("edited in another editor"));
      await expect(new ProjectSaveCoordinator().recover(store)).rejects.toBeInstanceOf(ProjectRecoveryConflictError);
      expect(text(files, "b.puml")).toBe("edited in another editor");
      expect(text(files, "project.pumlproject")).toBe("m1");
      expect(files.has(".plantuml-project-save-journal")).toBe(true);
    });
  });
});
