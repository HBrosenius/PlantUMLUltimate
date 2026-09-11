import { describe, expect, it } from "vitest";
import type { DocumentSnapshot } from "../workspace-storage";
import type { ProjectManifest } from "@plantuml-studio/project-model";
import { decodeDocument, hashSource, type PortableDocument } from "@plantuml-studio/document-format";
import { ensureProjectMembersUnchanged, planFolderProjectSave } from "./project-save-plan";

const id = (digit: number) =>
  `${digit.toString().repeat(8)}-${digit.toString().repeat(4)}-4000-8000-${digit.toString().repeat(12)}`;
const manifest: ProjectManifest = {
  format: "plantuml-ultimate-project",
  schemaVersion: 1,
  projectId: id(1),
  revisionId: id(2),
  name: "Test",
  documents: [
    { id: id(3), path: "diagrams/a.puml", format: "plantuml" },
    { id: id(4), path: "diagrams/b.puml", format: "plantuml" },
  ],
  elements: [],
  links: [],
};
const tab = (id: string, source: string, dirty: boolean): DocumentSnapshot => ({
  id,
  historyId: id,
  diagramKind: "gantt",
  source,
  fileName: "a.puml",
  dirty,
  zoom: 1,
  cursor: { line: 1, column: 1 },
});

describe("planFolderProjectSave", () => {
  it("writes only dirty tabs explicitly associated with a project member", async () => {
    const plan = await planFolderProjectSave(manifest, new Map([[`${manifest.projectId}:${id(3)}`, "member-tab"]]), [
      tab("member-tab", "@startgantt", true),
      tab("unrelated", "wrong", true),
    ]);
    expect(plan.members.map((member) => member.path)).toEqual(["diagrams/a.puml"]);
    expect(new TextDecoder().decode(plan.members[0]!.bytes)).toBe("@startgantt");
    expect(plan.manifest.documents[0]!.observedSourceHash).toBeTruthy();
    expect(plan.manifest.documents[1]).toEqual(manifest.documents[1]);
    expect(plan.manifest.revisionId).not.toBe(manifest.revisionId);
  });

  it("refuses to flatten a changed native document into source text", async () => {
    const native = { ...manifest, documents: [{ id: id(3), path: "diagrams/a.pumlu", format: "pumlu" as const }] };
    await expect(
      planFolderProjectSave(native, new Map([[`${native.projectId}:${id(3)}`, "member-tab"]]), [
        tab("member-tab", "@startgantt", true),
      ]),
    ).rejects.toThrow("native project member");
  });

  it("re-encodes an unlocked native member without discarding its portable document", async () => {
    const source = "@startgantt\n[Old] lasts 1 day\n@endgantt";
    const native: PortableDocument = {
      schemaVersion: 1,
      documentId: id(8),
      savedAt: "2026-09-10T00:00:00.000Z",
      current: { source, sourceHash: await hashSource(source), diagramKind: "gantt" },
      settings: { resourceCapacities: {} },
      historyPolicy: { maxVersions: 10, maxLogicalBytes: 1024 * 1024 },
      versions: [],
      contents: [],
    };
    const nativeManifest = {
      ...manifest,
      documents: [{ id: id(3), path: "diagrams/a.pumlu", format: "pumlu" as const }],
    };
    const plan = await planFolderProjectSave(
      nativeManifest,
      new Map([[`${nativeManifest.projectId}:${id(3)}`, "member-tab"]]),
      [tab("member-tab", "@startgantt\n[New] lasts 1 day\n@endgantt", true)],
      new Map([[id(3), { document: native, compression: "none" }]]),
    );
    expect((await decodeDocument(plan.members[0]!.bytes)).document).toMatchObject({
      documentId: id(8),
      current: { source: "@startgantt\n[New] lasts 1 day\n@endgantt" },
    });
  });

  it("refuses to overwrite a member changed outside the project snapshot", async () => {
    const plan = await planFolderProjectSave(manifest, new Map([[`${manifest.projectId}:${id(3)}`, "member-tab"]]), [
      tab("member-tab", "@startgantt", true),
    ]);
    const guarded = {
      ...plan.manifest,
      documents: plan.manifest.documents.map((document) =>
        document.id === id(3) ? { ...document, observedFileHash: "different" } : document,
      ),
    };
    await expect(
      ensureProjectMembersUnchanged({ read: async () => new TextEncoder().encode("external") }, guarded, plan.members),
    ).rejects.toThrow("changed outside");
  });
});
