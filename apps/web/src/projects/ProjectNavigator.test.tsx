// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectNavigator } from "./ProjectNavigator";
import type { VirtualProject } from "./project-index";

const project: VirtualProject = {
  manifest: {
    format: "plantuml-ultimate-project",
    schemaVersion: 1,
    projectId: "11111111-1111-4111-8111-111111111111",
    revisionId: "22222222-2222-4222-8222-222222222222",
    name: "Test project",
    documents: [],
    elements: [],
    links: [],
  },
  members: [],
  resolutions: new Map(),
};

afterEach(cleanup);

describe("ProjectNavigator", () => {
  it("offers every supported diagram type and submits a clean display name", async () => {
    const onAdd = vi.fn();
    render(
      <ProjectNavigator
        project={project}
        onOpen={vi.fn()}
        onAdd={onAdd}
        onClose={vi.fn()}
        onLinksChange={vi.fn()}
        onElementsChange={vi.fn()}
        dirty
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add diagram" }));
    expect(screen.getByRole("status").textContent).toBe("Unsaved changes");
    const type = screen.getByRole("combobox", { name: "Diagram type" });
    expect([...type.querySelectorAll("option")].map((option) => option.value)).toEqual([
      "gantt",
      "class",
      "component",
      "sequence",
      "usecase",
      "activity",
      "wbs",
    ]);

    fireEvent.change(type, { target: { value: "activity" } });
    expect((screen.getByRole("textbox", { name: "Diagram name" }) as HTMLInputElement).value).toBe("Activity diagram");
    fireEvent.click(screen.getByRole("button", { name: "Add to project" }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith("activity", "Activity diagram"));
  });

  it("shows whether the live link index is updating or failed", () => {
    const { rerender } = render(
      <ProjectNavigator
        project={project}
        onOpen={vi.fn()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
        onLinksChange={vi.fn()}
        onElementsChange={vi.fn()}
        indexStatus={{ state: "indexing" }}
      />,
    );
    expect(screen.getByText("Updating links…")).toBeTruthy();

    rerender(
      <ProjectNavigator
        project={project}
        onOpen={vi.fn()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
        onLinksChange={vi.fn()}
        onElementsChange={vi.fn()}
        indexStatus={{ state: "error", message: "Could not parse the project" }}
      />,
    );
    expect(screen.getByText("Link index failed")).toBeTruthy();
    expect(screen.getByText("Could not parse the project")).toBeTruthy();
  });

  it("offers cancellation while a project save is running", () => {
    const onCancelSave = vi.fn();
    render(
      <ProjectNavigator
        project={project}
        onOpen={vi.fn()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
        onLinksChange={vi.fn()}
        onElementsChange={vi.fn()}
        saving
        onCancelSave={onCancelSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel save" }));
    expect(onCancelSave).toHaveBeenCalledOnce();
  });

  it("explains when project review has no successful-save baseline", () => {
    render(
      <ProjectNavigator
        project={project}
        onOpen={vi.fn()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
        onLinksChange={vi.fn()}
        onElementsChange={vi.fn()}
        onReviewChanges={vi.fn()}
        hasReviewBaseline={false}
      />,
    );

    expect((screen.getByRole("button", { name: "Review" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Save this project once to create a review baseline.")).toBeTruthy();
  });

  it("lists categorized project changes and opens an affected diagram", async () => {
    const onOpen = vi.fn();
    const onExportReview = vi.fn();
    const onReviewChanges = vi.fn().mockResolvedValue({
      diagrams: [
        {
          documentId: "document-1",
          name: "Delivery plan",
          previousName: "Delivery",
          kinds: ["renamed", "source"],
          linkedDocumentIds: ["document-2"],
        },
      ],
      links: [
        {
          linkId: "link-1",
          kind: "added",
          link: { id: "link-1", kind: "implements", from: "element-1", to: "element-2" },
          documentIds: ["document-1", "document-2"],
        },
      ],
      hasChanges: true,
    });
    render(
      <ProjectNavigator
        project={project}
        onOpen={onOpen}
        onAdd={vi.fn()}
        onClose={vi.fn()}
        onLinksChange={vi.fn()}
        onElementsChange={vi.fn()}
        onReviewChanges={onReviewChanges}
        onExportReview={onExportReview}
        hasReviewBaseline
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(await screen.findByText("renamed · source")).toBeTruthy();
    expect(screen.getByText("Previously Delivery")).toBeTruthy();
    expect(screen.getByText("Linked diagrams that may need review")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "document-2" }));
    expect(onOpen).toHaveBeenCalledWith("document-2");
    expect(screen.getByText("added relationship")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Export review report" }));
    expect(onExportReview).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Delivery plan" }));
    expect(onOpen).toHaveBeenCalledWith("document-1");
  });

  it("routes indexed declarations through the registration callback instead of an element edit", async () => {
    const declaration = {
      kind: "gantt-task" as const,
      symbolKey: "Backend",
      declarationHash: "e".repeat(64),
      from: 12,
      to: 36,
    };
    const indexedProject: VirtualProject = {
      manifest: {
        ...project.manifest,
        documents: [{ id: "document-1", path: "Delivery", format: "plantuml" }],
      },
      members: [
        {
          documentId: "document-1",
          path: "Delivery",
          diagramKind: "gantt",
          state: "available",
          source: "@startgantt\n[Backend] lasts 8 days\n@endgantt",
          declarations: [declaration],
          linkCount: 0,
        },
      ],
      resolutions: new Map(),
    };
    const onElementsChange = vi.fn();
    const onElementsRegistered = vi.fn();
    render(
      <ProjectNavigator
        project={indexedProject}
        onOpen={vi.fn()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
        onLinksChange={vi.fn()}
        onElementsChange={onElementsChange}
        onElementsRegistered={onElementsRegistered}
      />,
    );

    await waitFor(() => expect(onElementsRegistered).toHaveBeenCalledOnce());
    const [registered] = onElementsRegistered.mock.calls[0]!;
    expect(registered).toHaveLength(1);
    expect(registered[0]).toMatchObject({
      documentId: "document-1",
      kind: "gantt-task",
      locator: { symbolKey: "Backend", declarationHash: declaration.declarationHash, from: 12, to: 36 },
    });
    expect(onElementsChange).not.toHaveBeenCalled();
  });

  it("distinguishes unresolved links and explains a direct repair", async () => {
    const first = {
      id: "element-1",
      documentId: "document-1",
      kind: "gantt-task" as const,
      locator: {
        symbolKey: "Caller",
        keyType: "semantic-key" as const,
        declarationHash: "a".repeat(64),
        sourceHash: "b".repeat(64),
        from: 0,
        to: 8,
      },
    };
    const second = {
      ...first,
      id: "element-2",
      documentId: "document-2",
      locator: { ...first.locator, symbolKey: "Old task", from: 10, to: 20 },
    };
    const candidate = {
      kind: "gantt-task" as const,
      symbolKey: "New task",
      declarationHash: "c".repeat(64),
      from: 30,
      to: 40,
    };
    const linkedProject: VirtualProject = {
      manifest: {
        ...project.manifest,
        documents: [
          { id: "document-1", path: "Caller", format: "plantuml" },
          { id: "document-2", path: "Target", format: "plantuml" },
        ],
        elements: [first, second],
        links: [{ id: "link-1", kind: "implements", from: first.id, to: second.id }],
      },
      members: [
        {
          documentId: "document-1",
          path: "Caller",
          diagramKind: "gantt",
          state: "available",
          source: "@startgantt\n[Caller] lasts 1 day\n@endgantt",
          declarations: [],
          linkCount: 1,
        },
        {
          documentId: "document-2",
          path: "Target",
          diagramKind: "gantt",
          state: "available",
          source: "@startgantt\n[New task] lasts 1 day\n@endgantt",
          declarations: [candidate],
          linkCount: 1,
        },
      ],
      resolutions: new Map([
        [first.id, { state: "resolved", elementId: first.id, declaration: candidate, locator: first.locator }],
        [second.id, { state: "needs-review", elementId: second.id, candidates: [candidate] }],
      ]),
    };

    const onElementsChange = vi.fn();
    const { rerender } = render(
      <ProjectNavigator
        project={linkedProject}
        onOpen={vi.fn()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
        onLinksChange={vi.fn()}
        onElementsChange={onElementsChange}
      />,
    );

    expect(screen.getByText("Unresolved path")).toBeTruthy();
    expect(screen.getByText(/Affects 1 linked path/).textContent).toContain("Caller: Caller → Target: Old task");
    fireEvent.click(screen.getByRole("button", { name: "Repair: Old task → New task" }));
    await waitFor(() =>
      expect(
        onElementsChange.mock.calls.some(([elements]) =>
          elements.some(
            (element: typeof second) => element.id === second.id && element.locator.symbolKey === "New task",
          ),
        ),
      ).toBe(true),
    );

    const parseErrorProject: VirtualProject = {
      ...linkedProject,
      members: linkedProject.members.map((member) =>
        member.documentId === second.documentId
          ? { ...member, state: "parse-error", reason: "Task declaration is incomplete", declarations: [] }
          : member,
      ),
      resolutions: new Map([[first.id, linkedProject.resolutions.get(first.id)!]]),
    };
    rerender(
      <ProjectNavigator
        project={parseErrorProject}
        onOpen={vi.fn()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
        onLinksChange={vi.fn()}
        onElementsChange={vi.fn()}
      />,
    );
    expect(screen.getAllByText("Task declaration is incomplete")).toHaveLength(2);
  });
});
