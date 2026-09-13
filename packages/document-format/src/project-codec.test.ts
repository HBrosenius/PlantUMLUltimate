import { describe, expect, it } from "vitest";
import {
  decodeProject,
  encodeProject,
  projectFromPlantUml,
  type PortableProject,
  type PortableProjectDiagram,
} from "./index";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

async function project(): Promise<PortableProject> {
  const inputs = [
    ["@startgantt\n[Release] lasts 2 days\n@endgantt\n", "gantt", "Release plan"],
    ["@startuml\nclass Order\n@enduml\n", "class", "Domain"],
    ["@startuml\nparticipant Checkout\n@enduml\n", "sequence", "Checkout flow"],
  ] as const;
  const diagrams: PortableProjectDiagram[] = [];
  for (const [source, kind, name] of inputs) {
    const created = await projectFromPlantUml(source, kind, name, "2026-09-13T10:00:00.000Z");
    diagrams.push({ ...created.diagrams[0]!, id: id(diagrams.length + 3), name });
  }
  const locator = (symbolKey: string, sourceHash: string) => ({
    symbolKey,
    keyType: "semantic-key" as const,
    declarationHash: "a".repeat(64),
    sourceHash,
    from: 0,
    to: 10,
  });
  return {
    schemaVersion: 2,
    projectId: id(1),
    revisionId: id(2),
    name: "Release workspace",
    savedAt: "2026-09-13T10:00:00.000Z",
    diagrams,
    elements: [
      {
        id: id(6),
        documentId: diagrams[0]!.id,
        kind: "gantt-task",
        locator: locator("Release", diagrams[0]!.document.current.sourceHash),
      },
      {
        id: id(7),
        documentId: diagrams[1]!.id,
        kind: "class-entity",
        locator: locator("Order", diagrams[1]!.document.current.sourceHash),
      },
      {
        id: id(8),
        documentId: diagrams[2]!.id,
        kind: "sequence-participant",
        locator: locator("Checkout", diagrams[2]!.document.current.sourceHash),
      },
    ],
    links: [
      { id: id(9), kind: "represents", from: id(8), to: id(7) },
      { id: id(10), kind: "implements", from: id(6), to: id(8) },
    ],
  };
}

describe("project codec lifecycle", () => {
  it("round-trips a linked three-diagram project", async () => {
    const input = await project();
    const encoded = await encodeProject(input, { compression: "none" });
    const decoded = await decodeProject(encoded.bytes);

    expect(decoded.project).toEqual(input);
    expect(decoded.project.diagrams.map((diagram) => diagram.name)).toEqual([
      "Release plan",
      "Domain",
      "Checkout flow",
    ]);
    expect(decoded.project.links).toHaveLength(2);
  });

  it("keeps an encrypted project opaque without its password", async () => {
    const input = await project();
    const encoded = await encodeProject(input, { compression: "none", password: "correct horse battery staple" });
    const raw = new TextDecoder().decode(encoded.bytes);

    expect(raw).not.toContain(input.name);
    expect(raw).not.toContain("Release plan");
    await expect(decodeProject(encoded.bytes)).rejects.toMatchObject({ code: "password-required" });
    await expect(decodeProject(encoded.bytes, { password: "incorrect password" })).rejects.toMatchObject({
      code: "unlock-failed",
    });
    await expect(decodeProject(encoded.bytes, { password: "correct horse battery staple" })).resolves.toMatchObject({
      project: input,
    });
  });

  it("rejects a project whose current diagram source does not match its hash", async () => {
    const input = await project();
    input.diagrams[0]!.document.current.source += "' changed without updating hash\n";

    await expect(encodeProject(input)).rejects.toThrow("current source hash does not match");
  });
});
