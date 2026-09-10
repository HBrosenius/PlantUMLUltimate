import { describe, expect, it } from "vitest";
import { PROJECT_FORMAT } from "@plantuml-studio/project-model";
import { readFolderProject, type ProjectDirectoryHandle, type ProjectFileHandle } from "./folder-project";

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
