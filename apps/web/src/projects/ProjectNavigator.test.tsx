// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

  it("distinguishes unresolved links and explains a direct repair", () => {
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
    render(
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
    return waitFor(() =>
      expect(
        onElementsChange.mock.calls.some(([elements]) =>
          elements.some(
            (element: typeof second) => element.id === second.id && element.locator.symbolKey === "New task",
          ),
        ),
      ).toBe(true),
    );
  });
});
