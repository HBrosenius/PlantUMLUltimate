import { describe, expect, it } from "vitest";
import { projectFromPlantUml, type PortableProject } from "@plantuml-studio/document-format";
import { reviewProjectChanges } from "./project-change-review";

async function fixture(): Promise<PortableProject> {
  const project = await projectFromPlantUml("@startgantt\n[API] lasts 2 days\n@endgantt", "gantt", "Delivery");
  const first = project.diagrams[0]!;
  const second = { ...first, id: crypto.randomUUID(), name: "Architecture" };
  const elements = [
    {
      id: crypto.randomUUID(),
      documentId: first.id,
      kind: "gantt-task" as const,
      locator: {
        symbolKey: "API",
        keyType: "semantic-key" as const,
        declarationHash: "a".repeat(64),
        sourceHash: "b".repeat(64),
        from: 12,
        to: 17,
      },
    },
    {
      id: crypto.randomUUID(),
      documentId: second.id,
      kind: "class-entity" as const,
      locator: {
        symbolKey: "API",
        keyType: "semantic-key" as const,
        declarationHash: "c".repeat(64),
        sourceHash: "d".repeat(64),
        from: 0,
        to: 3,
      },
    },
  ];
  return {
    ...project,
    diagrams: [first, second],
    elements,
    links: [{ id: crypto.randomUUID(), kind: "implements", from: elements[0]!.id, to: elements[1]!.id }],
  };
}

describe("project change review", () => {
  it("separates source, history, settings, and rename changes", async () => {
    const before = await fixture();
    const original = before.diagrams[0]!;
    const after = {
      ...before,
      diagrams: [
        {
          ...original,
          name: "Delivery plan",
          document: {
            ...original.document,
            current: { ...original.document.current, source: `${original.document.current.source}\n' changed` },
            settings: { resourceCapacities: { Developer: 2 } },
            versions: [...original.document.versions, { ...original.document.versions[0]!, id: crypto.randomUUID() }],
          },
        },
        before.diagrams[1]!,
      ],
    };

    const review = reviewProjectChanges(before, after);

    expect(review.diagrams).toEqual([
      expect.objectContaining({
        documentId: original.id,
        previousName: "Delivery",
        name: "Delivery plan",
        kinds: ["renamed", "source", "history", "settings"],
        linkedDocumentIds: [before.diagrams[1]!.id],
      }),
    ]);
  });

  it("reports added and deleted diagrams and relationship changes", async () => {
    const before = await fixture();
    const added = { ...before.diagrams[0]!, id: crypto.randomUUID(), name: "New work" };
    const replacement = { ...before.links[0]!, kind: "represents" as const };
    const after = { ...before, diagrams: [before.diagrams[0]!, added], links: [replacement] };

    const review = reviewProjectChanges(before, after);

    expect(review.diagrams.map(({ name, kinds }) => ({ name, kinds }))).toEqual([
      { name: "New work", kinds: ["added"] },
      { name: "Architecture", kinds: ["deleted"] },
    ]);
    expect(review.links).toEqual([
      expect.objectContaining({ linkId: replacement.id, kind: "changed", previous: before.links[0] }),
    ]);
    expect(review.hasChanges).toBe(true);
  });

  it("returns an empty review for the saved snapshot itself", async () => {
    const project = await fixture();
    expect(reviewProjectChanges(project, structuredClone(project))).toEqual({
      diagrams: [],
      links: [],
      hasChanges: false,
    });
  });
});
