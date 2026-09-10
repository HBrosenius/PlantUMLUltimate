import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { PROJECT_FORMAT } from "@plantuml-studio/project-model";
import { createZipProjectSnapshot, readZipProject } from "./zip-project";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
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

describe("ZIP projects", () => {
  it("stages a valid archive and exports a validated snapshot", async () => {
    const project = await readZipProject(
      zipSync({
        "project.pumlproject": strToU8(manifest),
        "diagrams/checkout.puml": strToU8("@startuml\nparticipant Checkout\n@enduml"),
      }),
    );
    expect(project.members[0]).toMatchObject({ state: "available", diagramKind: "sequence" });
    await expect(readZipProject(await createZipProjectSnapshot(project))).resolves.toMatchObject({
      manifest: { name: "Demo" },
    });
  });

  it("rejects unsafe and unexpected archive entries", async () => {
    await expect(
      readZipProject(zipSync({ "project.pumlproject": strToU8(manifest), "../bad.puml": strToU8("x") })),
    ).rejects.toThrow("unsafe entry path");
    await expect(
      readZipProject(zipSync({ "project.pumlproject": strToU8(manifest), "extra.txt": strToU8("x") })),
    ).rejects.toThrow("unexpected file");
  });
});
