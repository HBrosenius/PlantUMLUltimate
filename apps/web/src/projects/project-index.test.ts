import { describe, expect, it } from "vitest";
import { PROJECT_FORMAT } from "@plantuml-studio/project-model";
import { indexVirtualProject, type ProjectIndexCache } from "./project-index";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const hash = "a".repeat(64);
const manifest = JSON.stringify({
  format: PROJECT_FORMAT,
  schemaVersion: 1,
  projectId: id(1),
  revisionId: id(2),
  name: "Order system",
  documents: [
    { id: id(3), path: "sequence.puml", format: "plantuml", observedSourceHash: hash },
    { id: id(4), path: "domain.puml", format: "plantuml", observedSourceHash: hash },
  ],
  elements: [
    {
      id: id(5),
      documentId: id(3),
      kind: "sequence-participant",
      locator: { symbolKey: "Checkout", keyType: "alias", declarationHash: hash, sourceHash: hash, from: 0, to: 10 },
    },
    {
      id: id(6),
      documentId: id(4),
      kind: "class-entity",
      locator: { symbolKey: "Order", keyType: "alias", declarationHash: hash, sourceHash: hash, from: 0, to: 10 },
    },
  ],
  links: [{ id: id(7), kind: "represents", from: id(5), to: id(6) }],
});

describe("virtual project index", () => {
  it("reuses unchanged declarations, replaces edited members and evicts locked members", async () => {
    const cache: ProjectIndexCache = new Map();
    const inputs = new Map([
      ["sequence.puml", { state: "available" as const, source: "@startuml\nparticipant Checkout\n@enduml" }],
    ]);
    const first = await indexVirtualProject(manifest, inputs, undefined, cache);
    const second = await indexVirtualProject(manifest, inputs, undefined, cache);
    expect(second.members[0]!.declarations).toBe(first.members[0]!.declarations);
    expect(second.resolutions.get(id(5))).toBe(first.resolutions.get(id(5)));
    const changedLocator = JSON.parse(manifest);
    changedLocator.elements[0].locator.symbolKey = "Missing";
    const relocated = await indexVirtualProject(JSON.stringify(changedLocator), inputs, undefined, cache);
    expect(relocated.resolutions.get(id(5))).not.toBe(first.resolutions.get(id(5)));
    inputs.set("sequence.puml", { state: "available", source: "@startuml\nparticipant Revised\n@enduml" });
    const edited = await indexVirtualProject(manifest, inputs, undefined, cache);
    expect(edited.members[0]!.declarations).not.toBe(first.members[0]!.declarations);
    await indexVirtualProject(manifest, new Map([["sequence.puml", { state: "locked" }]]), undefined, cache);
    expect(cache.size).toBe(0);
  });
  it("counts all connections per diagram even when multiple endpoints belong to one member", async () => {
    const expanded = JSON.parse(manifest);
    expanded.elements.push({ ...expanded.elements[0], id: id(8) });
    expanded.links.push({ id: id(9), kind: "represents", from: id(8), to: id(6) });
    expanded.documents.push({ id: id(10), path: "unused.puml", format: "plantuml" });
    const project = await indexVirtualProject(
      JSON.stringify(expanded),
      new Map([["sequence.puml", { state: "available" as const, source: "@startuml\nparticipant Checkout\n@enduml" }]]),
    );
    expect(project.members.map((member) => [member.path, member.linkCount])).toEqual([
      ["sequence.puml", 2],
      ["domain.puml", 2],
      ["unused.puml", 0],
    ]);
  });

  it("indexes available sources without rendering and leaves absent members degraded", async () => {
    const project = await indexVirtualProject(
      manifest,
      new Map([["sequence.puml", { state: "available" as const, source: "@startuml\nparticipant Checkout\n@enduml" }]]),
    );
    expect(project.members).toMatchObject([
      { path: "sequence.puml", state: "available", diagramKind: "sequence", linkCount: 1 },
      { path: "domain.puml", state: "missing" },
    ]);
    expect(project.resolutions.get(id(5))?.state).not.toBe("missing");
    expect(project.resolutions.has(id(6))).toBe(false);
  });

  it("does not replace a staged project with structurally invalid input", async () => {
    await expect(indexVirtualProject("{", new Map())).rejects.toThrow("Manifest is not valid JSON");
  });

  it("detects and indexes Component diagram declarations", async () => {
    const componentManifest = JSON.stringify({
      ...JSON.parse(manifest),
      documents: [{ id: id(4), path: "architecture.puml", format: "plantuml", observedSourceHash: hash }],
      elements: [],
      links: [],
    });
    const project = await indexVirtualProject(
      componentManifest,
      new Map([
        [
          "architecture.puml",
          {
            state: "available" as const,
            source:
              '@startuml\ncomponent "Order service" as Orders\ndatabase "Order records" as Db\nOrders --> Db\n@enduml',
          },
        ],
      ]),
    );

    expect(project.members[0]).toMatchObject({
      state: "available",
      diagramKind: "component",
      declarations: [
        { kind: "class-entity", symbolKey: "Orders" },
        { kind: "class-entity", symbolKey: "Db" },
      ],
    });
  });

  it("indexes WBS nodes for links across WBS diagrams", async () => {
    const wbsManifest = JSON.stringify({
      ...JSON.parse(manifest),
      documents: [{ id: id(3), path: "planning.puml", format: "plantuml", observedSourceHash: hash }],
      elements: [],
      links: [],
    });
    const project = await indexVirtualProject(
      wbsManifest,
      new Map([
        ["planning.puml", { state: "available" as const, source: "@startwbs\n*(plan) Plan\n** Review\n@endwbs" }],
      ]),
    );
    expect(project.members[0]?.declarations).toMatchObject([
      { kind: "wbs-node", symbolKey: "plan" },
      { kind: "wbs-node", symbolKey: "Review" },
    ]);
  });

  it("cancels obsolete indexing before publishing a result", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(indexVirtualProject(manifest, new Map(), controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
