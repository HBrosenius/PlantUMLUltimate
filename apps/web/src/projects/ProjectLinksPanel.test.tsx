// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { hashSource } from "@plantuml-studio/document-format";
import type { VirtualProject } from "./project-index";
import { ProjectLinksPanel } from "./ProjectLinksPanel";

afterEach(cleanup);

function fixture(): VirtualProject {
  const declarations = ["A", "B"].map((symbolKey, index) => ({
    kind: "gantt-task" as const,
    symbolKey,
    declarationHash: String(index).repeat(64),
    from: index,
    to: index + 1,
  }));
  return {
    manifest: {
      format: "plantuml-ultimate-project",
      schemaVersion: 1,
      projectId: "project",
      revisionId: "revision",
      name: "Portfolio",
      documents: [],
      links: [],
      elements: [
        {
          id: "existing",
          documentId: "one",
          kind: "gantt-task",
          locator: {
            ...declarations[0]!,
            keyType: "semantic-key",
            sourceHash: "original",
          },
        },
      ],
    },
    members: ["one", "two"].map((id) => ({
      documentId: id,
      path: id,
      state: "available",
      diagramKind: "gantt",
      source: `source ${id}`,
      declarations,
      linkCount: 0,
    })),
    resolutions: new Map(),
  };
}

it("preserves existing identities and registers matching declarations separately for each diagram", async () => {
  const project = fixture();
  const registered = vi.fn();
  render(
    <ProjectLinksPanel
      project={project}
      onChange={vi.fn()}
      onElementsChange={vi.fn()}
      onElementsRegistered={registered}
    />,
  );
  await waitFor(() => expect(registered).toHaveBeenCalledTimes(1));
  const elements = registered.mock.calls[0]![0] as VirtualProject["manifest"]["elements"];
  expect(elements).toHaveLength(4);
  expect(elements[0]).toBe(project.manifest.elements[0]);
  for (const member of project.members) {
    const added = elements.slice(1).filter((element) => element.documentId === member.documentId);
    expect(added.map((element) => element.locator.symbolKey)).toEqual(member.documentId === "one" ? ["B"] : ["A", "B"]);
    for (const element of added) {
      expect(element.locator.sourceHash).toBe(await hashSource(member.source!));
      expect(element.locator.keyType).toBe("semantic-key");
    }
  }
});

it("refreshes option labels and resolution states when the indexed project changes", () => {
  const project = fixture();
  project.members = project.members.map((member) => ({ ...member, declarations: [] }));
  const props = { onChange: vi.fn(), onElementsChange: vi.fn() };
  const view = render(<ProjectLinksPanel project={project} {...props} />);
  expect(screen.getByRole("option", { name: "one: A (pending)" })).toBeTruthy();
  const next: VirtualProject = {
    ...project,
    members: project.members.map((member) => ({ ...member, path: `Renamed ${member.path}` })),
    resolutions: new Map([["existing", { state: "missing", elementId: "existing" }]]),
  };
  view.rerender(<ProjectLinksPanel project={next} {...props} />);
  expect(screen.getByRole("option", { name: "Renamed one: A (missing)" })).toBeTruthy();
  expect(screen.queryByRole("option", { name: "one: A (pending)" })).toBeNull();
});
