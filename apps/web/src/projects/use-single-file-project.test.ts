import { describe, expect, it, vi } from "vitest";
import {
  decodeProject,
  encodeProject,
  hashSource,
  projectFromPlantUml,
  type PortableProject,
} from "@plantuml-studio/document-format";
import { PROJECT_FORMAT } from "@plantuml-studio/project-model";
import { indexVirtualProject } from "./project-index";
import {
  applyPortableProjectRenameMappings,
  decodePortableProjectFile,
  projectDiagramName,
} from "./use-single-file-project";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

describe("single-file project diagram names", () => {
  it.each([
    ["Roadmap.puml", "Roadmap"],
    ["Domain.plantuml", "Domain"],
    ["Checkout.pumlu", "Checkout"],
    ["Architecture", "Architecture"],
    ["  Plan.puml  ", "Plan"],
  ])("uses %s as the display name %s", (input, expected) => {
    expect(projectDiagramName(input)).toBe(expected);
  });

  it("uses a useful fallback for an extension-only name", () => {
    expect(projectDiagramName(".puml", "Activity diagram")).toBe("Activity diagram");
  });
});

describe("portable project file opening", () => {
  it("does not request a password for an unencrypted project", async () => {
    const input = await projectFromPlantUml("@startgantt\n@endgantt\n", "gantt", "Plan");
    const encoded = await encodeProject(input, { compression: "none" });
    const requestPassword = vi.fn();

    expect((await decodePortableProjectFile(encoded.bytes, "plan.pumlu", requestPassword))?.project).toEqual(input);
    expect(requestPassword).not.toHaveBeenCalled();
  });

  it("requests a password only after detecting encryption and supports cancellation", async () => {
    const input = await projectFromPlantUml("@startgantt\n@endgantt\n", "gantt", "Plan");
    const encoded = await encodeProject(input, { compression: "none", password: "correct password" });
    const cancelled = vi.fn(async () => undefined);
    expect(await decodePortableProjectFile(encoded.bytes, "plan.pumlu", cancelled)).toBeUndefined();
    expect(cancelled).toHaveBeenCalledWith("plan.pumlu");

    const decoded = await decodePortableProjectFile(encoded.bytes, "plan.pumlu", async () => "correct password");
    expect(decoded).toMatchObject({ project: input, encrypted: true });
  });
});

describe("single-file linked endpoint renames", () => {
  it("preserves Gantt, Class, and Sequence identities through rename, undo, redo, and save/reopen", async () => {
    const cases = [
      {
        kind: "gantt" as const,
        elementKind: "gantt-task" as const,
        before: "@startgantt\n[Release] lasts 2 days\n@endgantt\n",
        after: "@startgantt\n[Launch] lasts 2 days\n@endgantt\n",
        oldKey: "Release",
        newKey: "Launch",
      },
      {
        kind: "class" as const,
        elementKind: "class-entity" as const,
        before: "@startuml\nclass Order\n@enduml\n",
        after: "@startuml\nclass Purchase\n@enduml\n",
        oldKey: "Order",
        newKey: "Purchase",
      },
      {
        kind: "sequence" as const,
        elementKind: "sequence-participant" as const,
        before: "@startuml\nparticipant Checkout\n@enduml\n",
        after: "@startuml\nparticipant Payment\n@enduml\n",
        oldKey: "Checkout",
        newKey: "Payment",
      },
    ];
    const diagrams = await Promise.all(
      cases.map(async (item, index) => {
        const created = await projectFromPlantUml(item.before, item.kind, item.oldKey, "2026-09-13T12:00:00.000Z");
        return { ...created.diagrams[0]!, id: id(index + 3), name: item.oldKey };
      }),
    );
    const declaration = async (source: string, kind: (typeof cases)[number]["elementKind"], symbolKey: string) => {
      const from = source.indexOf(kind === "gantt-task" ? "[" : kind === "class-entity" ? "class" : "participant");
      const to = source.indexOf("\n", from);
      return {
        kind,
        symbolKey: kind === "class-entity" ? symbolKey.toLowerCase() : symbolKey,
        declarationHash: await hashSource(source.slice(from, to)),
        from,
        to,
      };
    };
    let value: PortableProject = {
      schemaVersion: 2,
      projectId: id(1),
      revisionId: id(2),
      name: "Rename lifecycle",
      savedAt: "2026-09-13T12:00:00.000Z",
      diagrams,
      elements: await Promise.all(
        cases.map(async (item, index) => {
          const original = await declaration(item.before, item.elementKind, item.oldKey);
          return {
            id: id(index + 6),
            documentId: diagrams[index]!.id,
            kind: item.elementKind,
            locator: {
              symbolKey: original.symbolKey,
              keyType: "semantic-key" as const,
              declarationHash: original.declarationHash,
              sourceHash: await hashSource(item.before),
              from: original.from,
              to: original.to,
            },
          };
        }),
      ),
      links: [
        { id: id(9), kind: "represents", from: id(8), to: id(7) },
        { id: id(10), kind: "implements", from: id(6), to: id(8) },
      ],
    };

    const rename = async (forward: boolean) => {
      for (const [index, item] of cases.entries()) {
        const source = forward ? item.after : item.before;
        const key = forward ? item.newKey : item.oldKey;
        value = applyPortableProjectRenameMappings(
          value,
          diagrams[index]!.id,
          [{ elementId: id(index + 6), declaration: await declaration(source, item.elementKind, key) }],
          await hashSource(source),
        );
      }
    };

    await rename(true);
    expect(value.elements.map((element) => element.locator.symbolKey)).toEqual(["Launch", "purchase", "Payment"]);
    await rename(false);
    expect(value.elements.map((element) => element.locator.symbolKey)).toEqual(["Release", "order", "Checkout"]);
    await rename(true);
    expect(value.links).toEqual([
      { id: id(9), kind: "represents", from: id(8), to: id(7) },
      { id: id(10), kind: "implements", from: id(6), to: id(8) },
    ]);

    value = {
      ...value,
      diagrams: await Promise.all(
        value.diagrams.map(async (diagram, index) => ({
          ...diagram,
          document: {
            ...diagram.document,
            current: {
              ...diagram.document.current,
              source: cases[index]!.after,
              sourceHash: await hashSource(cases[index]!.after),
            },
          },
        })),
      ),
    };
    const reopened = await decodeProject((await encodeProject(value, { compression: "none" })).bytes);
    expect(reopened.project.elements.map((element) => element.locator.symbolKey)).toEqual([
      "Launch",
      "purchase",
      "Payment",
    ]);
    expect(reopened.project.links).toEqual(value.links);

    const manifest = JSON.stringify({
      format: PROJECT_FORMAT,
      schemaVersion: 1,
      projectId: reopened.project.projectId,
      revisionId: reopened.project.revisionId,
      name: reopened.project.name,
      documents: reopened.project.diagrams.map((diagram) => ({
        id: diagram.id,
        path: diagram.name,
        format: "pumlu",
      })),
      elements: reopened.project.elements,
      links: reopened.project.links,
    });
    const inputs = new Map(
      reopened.project.diagrams.map((diagram) => [
        diagram.name,
        { state: "available" as const, source: diagram.document.current.source },
      ]),
    );
    const indexed = await indexVirtualProject(manifest, inputs);
    expect([...indexed.resolutions.values()].map((resolution) => resolution.state)).toEqual([
      "resolved",
      "resolved",
      "resolved",
    ]);

    inputs.set("Checkout", { state: "available", source: "@startuml\nparticipant Other\n@enduml\n" });
    const afterDelete = await indexVirtualProject(manifest, inputs);
    expect(afterDelete.resolutions.get(id(8))?.state).toBe("missing");
    expect(afterDelete.resolutions.get(id(6))?.state).toBe("resolved");
    expect(afterDelete.resolutions.get(id(7))?.state).toBe("resolved");
  });
});
