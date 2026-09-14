import { describe, expect, it } from "vitest";
import type { PortableProject } from "@plantuml-studio/document-format";
import type { DocumentSnapshot } from "../workspace-storage";
import {
  embeddedMemberHistoryId,
  embeddedMemberTabs,
  embeddedDiagramDisplayName,
  openEmbeddedMember,
  projectWithOpenTabSources,
  snapshotEmbeddedProject,
} from "./embedded-project";

const project = (): PortableProject => ({
  schemaVersion: 2,
  projectId: "11111111-1111-4111-8111-111111111111",
  revisionId: "22222222-2222-4222-8222-222222222222",
  name: "Test project",
  savedAt: "2026-09-11T10:00:00.000Z",
  diagrams: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Plan",
      document: {
        schemaVersion: 1,
        documentId: "44444444-4444-4444-8444-444444444444",
        savedAt: "2026-09-11T10:00:00.000Z",
        current: {
          source: "@startgantt\n@endgantt\n",
          sourceHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          diagramKind: "gantt",
        },
        settings: { resourceCapacities: {} },
        historyPolicy: { maxVersions: 10, maxLogicalBytes: 1024 * 1024 },
        versions: [],
        contents: [],
      },
    },
  ],
  elements: [],
  links: [],
});

describe("embedded project tabs", () => {
  it.each(["Plan.puml", "Plan.plantuml", "Plan.pumlu"])("shows %s as a clean diagram name", (name) => {
    expect(embeddedDiagramDisplayName(name)).toBe("Plan");
  });
  it("opens a member once and reuses its project-member tab", () => {
    const created: Array<Record<string, unknown>> = [];
    const activated: string[] = [];
    const documents: Array<{ id: string; historyId: string }> = [];
    const tabs = {
      documents,
      addDocument(input: Record<string, unknown>) {
        created.push(input);
        documents.push({ id: "tab-1", historyId: input.historyId as string });
        return "tab-1";
      },
      activateDocument(id: string) {
        activated.push(id);
      },
    };
    const known = new Map<string, string>();
    const memberId = project().diagrams[0]!.id;
    expect(openEmbeddedMember(project(), memberId, tabs as never, known)).toBe("tab-1");
    expect(openEmbeddedMember(project(), memberId, tabs as never, known)).toBe("tab-1");
    expect(created).toHaveLength(1);
    expect(activated).toEqual(["tab-1"]);
    expect(created[0]).toMatchObject({
      historyMaxVersions: 10,
      historyMaxLogicalBytes: 1024 * 1024,
      resourceCapacities: {},
    });
  });

  it("finds retained member tabs by stable project-member history ID", () => {
    const value = project();
    const memberId = value.diagrams[0]!.id;
    expect(
      embeddedMemberTabs(value, [
        { id: "tab-1", historyId: embeddedMemberHistoryId(value.projectId, memberId) } as never,
      ]),
    ).toEqual(new Map([[memberId, "tab-1"]]));
  });

  it("creates a fresh tab when the cached member tab has been closed", () => {
    const created: Array<Record<string, unknown>> = [];
    const activated: string[] = [];
    const tabs = {
      documents: [],
      addDocument(input: Record<string, unknown>) {
        created.push(input);
        return "tab-new";
      },
      activateDocument(id: string) {
        activated.push(id);
      },
    };
    const value = project();
    const memberId = value.diagrams[0]!.id;
    const known = new Map([[memberId, "tab-closed"]]);

    expect(openEmbeddedMember(value, memberId, tabs, known)).toBe("tab-new");
    expect(created).toHaveLength(1);
    expect(activated).toEqual([]);
    expect(known.get(memberId)).toBe("tab-new");
  });

  it("projects live member source without mutating the saved project", () => {
    const value = project();
    const memberId = value.diagrams[0]!.id;
    const original = value.diagrams[0]!.document.current.source;
    const effective = projectWithOpenTabSources(value, new Map([[memberId, "tab-1"]]), [
      { id: "tab-1", source: "@startgantt\n[Live edit] lasts 1 day\n@endgantt\n" } as DocumentSnapshot,
    ]);

    expect(effective.diagrams[0]!.document.current.source).toContain("Live edit");
    expect(value.diagrams[0]!.document.current.source).toBe(original);
  });

  it("snapshots source, history, baseline, policy, and resource settings from an open tab", async () => {
    const value = project();
    const memberId = value.diagrams[0]!.id;
    const source = "@startgantt\n[Current] lasts 2 days\n@endgantt\n";
    const snapshot = await snapshotEmbeddedProject(
      value,
      new Map([[memberId, "tab-1"]]),
      [
        {
          id: "tab-1",
          historyId: "history-1",
          source,
          diagramKind: "gantt",
          fileName: "Plan",
          dirty: true,
          zoom: 1,
          cursor: { line: 1, column: 1 },
          baselineVersionId: "local-version",
          historyMaxVersions: 25,
          historyMaxLogicalBytes: 2 * 1024 * 1024,
          resourceCapacities: { Alice: 80 },
        },
      ],
      "2026-09-13T09:00:00.000Z",
      async () => [
        {
          id: "local-version",
          portableId: "55555555-5555-4555-8555-555555555555",
          historyId: "history-1",
          source,
          sourceHash: value.diagrams[0]!.document.current.sourceHash,
          fileName: "Plan",
          diagramKind: "gantt",
          createdAt: "2026-09-13T08:30:00.000Z",
          reason: "manual",
          pinned: true,
        },
      ],
    );
    const document = snapshot.diagrams[0]!.document;

    expect(document.current.source).toBe(source);
    expect(document.current.baselineVersionId).toBe("55555555-5555-4555-8555-555555555555");
    expect(document.settings.resourceCapacities).toEqual({ Alice: 80 });
    expect(document.historyPolicy).toEqual({ maxVersions: 25, maxLogicalBytes: 2 * 1024 * 1024 });
    expect(document.versions).toHaveLength(1);
    expect(document.versions[0]).toMatchObject({ reason: "manual", pinned: true });
  });
});
