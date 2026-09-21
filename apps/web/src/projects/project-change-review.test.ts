import { describe, expect, it } from "vitest";
import { projectFromPlantUml, type PortableProject } from "@plantuml-studio/document-format";
import { createProjectReviewReport, reviewProjectChanges } from "./project-change-review";

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
        sourceComparison: expect.objectContaining({
          mode: "semantic",
          addedLines: 1,
          removedLines: 0,
          summaries: expect.any(Array),
        }),
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

  it("uses semantic summaries for Component diagram changes", async () => {
    const before = await projectFromPlantUml(
      '@startuml\ncomponent "Order service" as Orders\ndatabase "Order records" as Db\nOrders --> Db\n@enduml',
      "component",
      "Architecture",
    );
    const diagram = before.diagrams[0]!;
    const after = {
      ...before,
      diagrams: [
        {
          ...diagram,
          document: {
            ...diagram.document,
            current: {
              ...diagram.document.current,
              source:
                '@startuml\ncomponent "Checkout service" as Orders\ndatabase "Order records" as Db\nOrders --> Db\n@enduml',
            },
          },
        },
      ],
    };

    expect(reviewProjectChanges(before, after).diagrams[0]?.sourceComparison).toMatchObject({
      mode: "semantic",
      summaries: [{ title: "Rename component Order service to Checkout service", confidence: "confirmed" }],
    });
  });

  it("creates a standalone escaped report with semantic, patch, relationship, and impact details", async () => {
    const before = await fixture();
    const first = before.diagrams[0]!;
    const after = {
      ...before,
      name: '<Delivery & "support">',
      diagrams: [
        {
          ...first,
          document: {
            ...first.document,
            current: { ...first.document.current, source: `${first.document.current.source}\n' <changed>` },
          },
        },
        before.diagrams[1]!,
      ],
      links: [...before.links, { ...before.links[0]!, id: crypto.randomUUID() }],
    };
    const review = reviewProjectChanges(before, after);
    const report = createProjectReviewReport(
      after.name,
      review,
      new Map(after.diagrams.map((diagram) => [diagram.id, diagram.name])),
      "2026-09-14T08:00:00.000Z",
    );

    expect(report).toContain("<!doctype html>");
    expect(report).toContain("&lt;Delivery &amp; &quot;support&quot;&gt;");
    expect(report).toContain("Linked diagrams that may need review");
    expect(report).toContain("Architecture");
    expect(report).toContain("Source patch");
    expect(report).toContain("&lt;changed&gt;");
    expect(report).toContain("added implements relationship");
    expect(report).not.toContain("<changed>");
  });
});
