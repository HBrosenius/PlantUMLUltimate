import { bench, describe } from "vitest";
import {
  decodeProject,
  encodeContentHistory,
  encodeProject,
  hashSource,
  projectFromPlantUml,
  type PortableProject,
  type PortableProjectDiagram,
} from "@plantuml-studio/document-format";
import { PROJECT_FORMAT, serializeProjectManifest, type ProjectManifest } from "@plantuml-studio/project-model";
import { indexVirtualProject, type ProjectMemberInput } from "../apps/web/src/projects/project-index";
import { openEmbeddedMember } from "../apps/web/src/projects/embedded-project";
import type { DocumentSnapshot } from "../apps/web/src/workspace-storage";

const kinds = ["gantt", "class", "sequence", "usecase", "activity", "wbs"] as const;
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

function sourceFor(index: number, kind: (typeof kinds)[number]): string {
  if (kind === "gantt") return `@startgantt\n[Task ${index}] lasts ${(index % 5) + 1} days\n@endgantt\n`;
  if (kind === "class") return `@startuml\nclass Entity${index}\n@enduml\n`;
  if (kind === "sequence") return `@startuml\nparticipant Participant${index}\n@enduml\n`;
  if (kind === "usecase") return `@startuml\nusecase "Case ${index}" as Case_${index}\n@enduml\n`;
  if (kind === "activity") return `@startuml\nstart\n:Step ${index};\nstop\n@enduml\n`;
  return `@startwbs\n* Project ${index}\n** Work ${index}\n@endwbs\n`;
}

async function mixedProject(count: number): Promise<{
  portable: PortableProject;
  manifestJson: string;
  inputs: ReadonlyMap<string, ProjectMemberInput>;
}> {
  const diagrams: PortableProjectDiagram[] = [];
  const inputs = new Map<string, ProjectMemberInput>();
  for (let index = 0; index < count; index += 1) {
    const kind = kinds[index % kinds.length]!;
    const name = `${kind}-${index}`;
    const base = sourceFor(index, kind);
    const sources = Array.from({ length: 5 }, (_, revision) => `${base}' revision ${revision}\n`);
    const source = sources.at(-1)!;
    const created = await projectFromPlantUml(source, kind, name, "2026-09-13T12:00:00.000Z");
    const history = await encodeContentHistory(sources);
    const diagram = created.diagrams[0]!;
    diagrams.push({
      ...diagram,
      id: id(index + 3),
      name,
      document: {
        ...diagram.document,
        versions: history.contentIds.map((contentId, revision) => ({
          id: id(20_000 + index * 10 + revision),
          contentId,
          createdAt: `2026-09-13T12:00:0${revision}.000Z`,
          sequence: revision,
          reason: "saved" as const,
          pinned: false,
          diagramKind: kind,
        })),
        contents: history.contents,
      },
    });
    inputs.set(name, { state: "available", source });
  }
  const manifestBase: ProjectManifest = {
    format: PROJECT_FORMAT,
    schemaVersion: 1,
    projectId: id(1),
    revisionId: id(2),
    name: `${count}-diagram mixed project`,
    documents: diagrams.map((diagram) => ({ id: diagram.id, path: diagram.name, format: "pumlu" })),
    elements: [],
    links: [],
  };
  const discovered = await indexVirtualProject(serializeProjectManifest(manifestBase), inputs);
  const elements = await Promise.all(
    discovered.members.flatMap((member) =>
      member.declarations.slice(0, 1).map(async (declaration, elementIndex) => ({
        id: id(1_000 + Number(member.documentId.slice(-12)) * 2 + elementIndex),
        documentId: member.documentId,
        kind: declaration.kind,
        locator: {
          symbolKey: declaration.symbolKey,
          keyType: "semantic-key" as const,
          declarationHash: declaration.declarationHash,
          sourceHash: await hashSource(member.source!),
          from: declaration.from,
          to: declaration.to,
        },
      })),
    ),
  );
  const elementByDocument = new Map(elements.map((element) => [element.documentId, element]));
  const links = [];
  for (let offset = 0; offset + 2 < diagrams.length; offset += kinds.length) {
    const gantt = elementByDocument.get(diagrams[offset]!.id);
    const classEntity = elementByDocument.get(diagrams[offset + 1]!.id);
    const participant = elementByDocument.get(diagrams[offset + 2]!.id);
    if (!gantt || !classEntity || !participant) continue;
    links.push(
      { id: id(10_000 + links.length), kind: "represents" as const, from: participant.id, to: classEntity.id },
      { id: id(10_000 + links.length + 1), kind: "implements" as const, from: gantt.id, to: participant.id },
    );
  }
  const manifest: ProjectManifest = { ...manifestBase, elements, links };
  const portable: PortableProject = {
    schemaVersion: 2,
    projectId: manifest.projectId,
    revisionId: manifest.revisionId,
    name: manifest.name,
    savedAt: "2026-09-13T12:00:00.000Z",
    diagrams,
    elements,
    links,
  };
  return { portable, manifestJson: serializeProjectManifest(manifest), inputs };
}

for (const count of [10, 50, 200]) {
  const fixture = await mixedProject(count);
  const encoded = await encodeProject(fixture.portable);
  const logicalKiB = new TextEncoder().encode(JSON.stringify(fixture.portable)).byteLength / 1024;
  const encodedKiB = encoded.bytes.byteLength / 1024;
  describe(`${count}-diagram mixed project (${logicalKiB.toFixed(0)} KiB memory proxy / ${encodedKiB.toFixed(0)} KiB saved)`, () => {
    bench("build live index", async () => {
      await indexVirtualProject(fixture.manifestJson, fixture.inputs);
    });
    bench("save with gzip", async () => {
      await encodeProject(fixture.portable);
    });
    bench("reopen", async () => {
      await decodeProject(encoded.bytes);
    });
    bench("clone in-memory snapshot", () => {
      structuredClone(fixture.portable);
    });
    if (count === 200) {
      const activeDocuments: DocumentSnapshot[] = [];
      const tabs = {
        documents: activeDocuments,
        addDocument(input: Partial<Omit<DocumentSnapshot, "id">> = {}) {
          activeDocuments.push({ id: "opened-tab", ...input } as DocumentSnapshot);
          return "opened-tab";
        },
        activateDocument() {},
        closeDocument() {},
      };
      openEmbeddedMember(fixture.portable, fixture.portable.diagrams[0]!.id, tabs, new Map());
      bench("switch to an open diagram", () => {
        openEmbeddedMember(fixture.portable, fixture.portable.diagrams[0]!.id, tabs, new Map());
      });
      bench("open a previously unopened diagram", () => {
        const documents: DocumentSnapshot[] = [];
        openEmbeddedMember(
          fixture.portable,
          fixture.portable.diagrams.at(-1)!.id,
          { ...tabs, documents, addDocument: () => "new-tab" },
          new Map(),
        );
      });
    }
  });
}

const encrypted = await mixedProject(50);
describe("50-diagram encrypted project", () => {
  bench("save with password", async () => {
    await encodeProject(encrypted.portable, { password: "benchmark-only-password" });
  });
});
