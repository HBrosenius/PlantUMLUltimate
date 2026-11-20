import { describe, expect, it } from "vitest";
import { portableDocumentFromPlantUml } from "@plantuml-studio/document-format";
import { convertLegacyProject } from "./legacy-project-conversion";
import type { VirtualProject } from "./project-index";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const source = "@startuml\nA -> B\n@enduml\n";

function legacy(
  documents: Array<{ id: string; path: string; format: "plantuml" | "pumlu" }>,
  members: Array<Record<string, unknown>>,
): VirtualProject {
  return {
    manifest: { projectId: id(1), revisionId: id(2), name: "Legacy", documents, elements: [], links: [] },
    members,
  } as unknown as VirtualProject;
}

describe("legacy project conversion", () => {
  it("converts source files and native documents into diagrams named after their files", async () => {
    const nativeDocument = await portableDocumentFromPlantUml(source, "sequence", "2026-01-01T00:00:00Z");
    const project = legacy(
      [
        { id: id(3), path: "diagrams/checkout.puml", format: "plantuml" },
        { id: id(4), path: "history/billing.pumlu", format: "pumlu" },
      ],
      [
        { documentId: id(3), source, state: "available", diagramKind: "sequence" },
        { documentId: id(4), source, state: "available", diagramKind: "sequence" },
      ],
    );
    const converted = await convertLegacyProject(project, new Map([[id(4), { document: nativeDocument }]]));
    expect(converted.name).toBe("Legacy");
    expect(converted.diagrams.map((diagram) => diagram.name)).toEqual(["checkout", "billing"]);
    expect(converted.diagrams[1]!.document).toEqual(nativeDocument);
  });

  it("names a diagram Diagram when its path has no usable file name", async () => {
    const project = legacy(
      [{ id: id(3), path: "folder/.puml", format: "plantuml" }],
      [{ documentId: id(3), source, state: "available", diagramKind: "sequence" }],
    );
    const converted = await convertLegacyProject(project, new Map());
    expect(converted.diagrams[0]!.name).toBe("Diagram");
  });

  it("refuses to convert unavailable members or native documents without history", async () => {
    await expect(
      convertLegacyProject(
        legacy([{ id: id(3), path: "a.puml", format: "plantuml" }], [{ documentId: id(3), state: "missing" }]),
        new Map(),
      ),
    ).rejects.toThrow("Cannot convert a.puml: the diagram is missing");
    await expect(
      convertLegacyProject(legacy([{ id: id(3), path: "a.puml", format: "plantuml" }], []), new Map()),
    ).rejects.toThrow("Cannot convert a.puml: the diagram is missing");
    await expect(
      convertLegacyProject(
        legacy(
          [{ id: id(4), path: "a.pumlu", format: "pumlu" }],
          [{ documentId: id(4), source, state: "available", diagramKind: "sequence" }],
        ),
        new Map(),
      ),
    ).rejects.toThrow("Cannot convert a.pumlu: its native history is unavailable");
  });
});
