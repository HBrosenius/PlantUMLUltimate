import { describe, expect, it, vi } from "vitest";
import { encodeDocument, portableDocumentFromPlantUml } from "@plantuml-studio/document-format";
import { PROJECT_FORMAT } from "@plantuml-studio/project-model";
import {
  folderProjectStore,
  memberInputFromBytes,
  readFolderProject,
  type ProjectDirectoryHandle,
  type ProjectFileHandle,
} from "./folder-project";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const textFile = (name: string, text: string): ProjectFileHandle => ({
  name,
  getFile: async () => new File([text], name),
});
const directory = (files: Record<string, ProjectFileHandle | ProjectDirectoryHandle>): ProjectDirectoryHandle => ({
  name: "project",
  getFileHandle: async (name) => {
    const value = files[name];
    if (!value || "getDirectoryHandle" in value) throw new DOMException("Missing", "NotFoundError");
    return value;
  },
  getDirectoryHandle: async (name) => {
    const value = files[name];
    if (!value || !("getDirectoryHandle" in value)) throw new DOMException("Missing", "NotFoundError");
    return value;
  },
});

describe("folder project reader", () => {
  it("reads only manifest members and keeps missing members degraded", async () => {
    const manifest = JSON.stringify({
      format: PROJECT_FORMAT,
      schemaVersion: 1,
      projectId: id(1),
      revisionId: id(2),
      name: "Demo",
      documents: [{ id: id(3), path: "diagrams/checkout.puml", format: "plantuml" }],
      elements: [],
      links: [],
    });
    const root = directory({
      "project.pumlproject": textFile("project.pumlproject", manifest),
      diagrams: directory({ "checkout.puml": textFile("checkout.puml", "@startuml\nparticipant Checkout\n@enduml") }),
    });
    const project = await readFolderProject(root);
    expect(project.members[0]).toMatchObject({
      path: "diagrams/checkout.puml",
      state: "available",
      diagramKind: "sequence",
    });
  });
});

const plantUml = { id: id(3), path: "a.puml", format: "plantuml" as const };
const native = { id: id(4), path: "a.pumlu", format: "pumlu" as const };

async function nativeBytes(password?: string) {
  const document = await portableDocumentFromPlantUml(
    "@startuml\nA -> B\n@enduml\n",
    "sequence",
    "2026-01-01T00:00:00Z",
  );
  return { document, ...(await encodeDocument(document, { compression: "none", ...(password ? { password } : {}) })) };
}

describe("project member input", () => {
  it("rejects oversize or non-UTF-8 source files", async () => {
    await expect(memberInputFromBytes(plantUml, new Uint8Array(6 * 1024 * 1024))).resolves.toMatchObject({
      state: "unsupported",
      reason: "Source file exceeds the 5 MiB document limit",
    });
    await expect(memberInputFromBytes(plantUml, new Uint8Array([0xff, 0xfe]))).resolves.toMatchObject({
      reason: "Source file is not valid UTF-8",
    });
  });

  it("requires a native document for a .pumlu member", async () => {
    await expect(memberInputFromBytes(native, new TextEncoder().encode("@startuml"))).resolves.toMatchObject({
      reason: "Expected a native .pumlu document",
    });
  });

  it("reads a native document's source and checks its expected identity", async () => {
    const { bytes, document } = await nativeBytes();
    await expect(memberInputFromBytes(native, bytes)).resolves.toMatchObject({ state: "available" });
    await expect(
      memberInputFromBytes({ ...native, expectedNativeDocumentId: document.documentId }, bytes),
    ).resolves.toMatchObject({ state: "available" });
    await expect(memberInputFromBytes({ ...native, expectedNativeDocumentId: id(99) }, bytes)).resolves.toMatchObject({
      reason: "Native document identity needs explicit rebind",
    });
  });

  it("reports an encrypted document as locked until the right password is given", async () => {
    const { bytes } = await nativeBytes("secret");
    await expect(memberInputFromBytes(native, bytes)).resolves.toEqual({ state: "locked" });
    await expect(memberInputFromBytes(native, bytes, { password: "secret" })).resolves.toMatchObject({
      state: "available",
    });
    await expect(memberInputFromBytes(native, bytes, { password: "wrong" })).resolves.toMatchObject({
      state: "unsupported",
    });
  });
});

describe("folder project members", () => {
  const manifestFor = (documents: object[]) =>
    JSON.stringify({
      format: PROJECT_FORMAT,
      schemaVersion: 1,
      projectId: id(1),
      revisionId: id(2),
      name: "Demo",
      documents,
      elements: [],
      links: [],
    });

  it("asks for the password of an encrypted native member and leaves it locked when none is given", async () => {
    const { bytes } = await nativeBytes("secret");
    const root = directory({
      "project.pumlproject": textFile("project.pumlproject", manifestFor([native])),
      "a.pumlu": { name: "a.pumlu", getFile: async () => new File([Uint8Array.from(bytes)], "a.pumlu") },
    });
    const locked = await readFolderProject(root);
    expect(locked.members[0]).toMatchObject({ state: "locked" });
    const prompt = vi.fn(async () => "secret");
    await readFolderProject(root, prompt);
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ path: "a.pumlu" }));
    const skipped = await readFolderProject(root, async () => undefined);
    expect(skipped.members[0]).toMatchObject({ state: "locked" });
  });

  it("marks a member whose folder permission was denied as unsupported", async () => {
    const root = directory({
      "project.pumlproject": textFile("project.pumlproject", manifestFor([plantUml])),
      "a.puml": {
        name: "a.puml",
        getFile: async () => {
          throw new DOMException("Denied", "NotAllowedError");
        },
      },
    });
    const project = await readFolderProject(root);
    expect(project.members[0]).toMatchObject({ state: "unsupported" });
  });
});

describe("folder project store", () => {
  const writableFolder = () => {
    const written = new Map<string, string>();
    const removed: string[] = [];
    const folder = (prefix: string): ProjectDirectoryHandle => ({
      name: prefix || "root",
      getFileHandle: async (name, options) => {
        const path = prefix + name;
        if (!written.has(path) && !options?.create) throw new DOMException("Missing", "NotFoundError");
        return {
          name,
          getFile: async () => new File([written.get(path) ?? ""], name),
          createWritable: async () => ({
            write: async (data) => {
              written.set(path, typeof data === "string" ? data : new TextDecoder().decode(data));
            },
            close: async () => undefined,
          }),
        };
      },
      getDirectoryHandle: async (name) => folder(`${prefix}${name}/`),
      removeEntry: async (name) => {
        removed.push(name);
      },
    });
    return { root: folder(""), written, removed };
  };

  it("writes nested files, reads them back and tolerates missing files", async () => {
    const { root, written } = writableFolder();
    const store = folderProjectStore(root);
    await store.write("diagrams/a.puml", new TextEncoder().encode("hello"));
    expect(written.get("diagrams/a.puml")).toBe("hello");
    expect(new TextDecoder().decode(await store.read!("diagrams/a.puml"))).toBe("hello");
    expect(await store.read!("diagrams/missing.puml")).toBeUndefined();
  });

  it("removes entries when the folder supports it and refuses to write without permission", async () => {
    const { root, removed } = writableFolder();
    await folderProjectStore(root).remove("old.puml");
    expect(removed).toEqual(["old.puml"]);
    const withoutRemove: ProjectDirectoryHandle = {
      name: root.name,
      getFileHandle: root.getFileHandle,
      getDirectoryHandle: root.getDirectoryHandle,
    };
    await folderProjectStore(withoutRemove).remove("old.puml");
    expect(removed).toEqual(["old.puml"]);

    const readOnly: ProjectDirectoryHandle = {
      ...root,
      getFileHandle: async (name) => ({ name, getFile: async () => new File([""], name) }),
    };
    await expect(folderProjectStore(readOnly).write("a.puml", new Uint8Array())).rejects.toThrow(
      "Document folder write permission was denied",
    );
  });
});
