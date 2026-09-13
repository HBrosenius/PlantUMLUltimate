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
});
