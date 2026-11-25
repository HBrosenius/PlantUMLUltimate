// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentSnapshot } from "../workspace-storage";
import { includeContextFor } from "../render/include-environment";
import { expandIncludes, prepareIncludes, refreshIncludes } from "../render/includes";
import { setIncludeActions, includeActions } from "../render/include-state";
import { useIncludeEnvironment, useIncludeTabs, type IncludeEnvironmentInputs } from "./use-include-environment";

const getFile = vi.fn();
vi.mock("../features/git/git-hosts", () => ({
  providerForTarget: vi.fn(async () => ({ getFile })),
  targetOfOrigin: vi.fn(() => ({ provider: "github" })),
}));

const tab = (patch: Partial<DocumentSnapshot>): DocumentSnapshot =>
  ({
    id: "tab",
    historyId: "history",
    diagramKind: "sequence",
    source: "",
    fileName: "x.puml",
    dirty: false,
    zoom: 1,
    cursor: { line: 1, column: 1 },
    ...patch,
  }) as DocumentSnapshot;

function mount(tabs: DocumentSnapshot[], inputs: Partial<IncludeEnvironmentInputs> = {}) {
  return renderHook(() => {
    useIncludeTabs(tabs);
    useIncludeEnvironment({
      portable: undefined,
      project: undefined,
      isProjectMemberTab: () => false,
      activeTab: tabs[0]!,
      addProjectDiagram: vi.fn(async () => true),
      openMember: vi.fn(),
      notify: vi.fn(),
      ...inputs,
    });
  });
}

beforeEach(() => {
  refreshIncludes();
  getFile.mockReset();
  setIncludeActions(undefined);
});

describe("include environment", () => {
  it("reads a Git include from the tab's own repository and ref with the provider client, only", async () => {
    getFile.mockImplementation(async (_owner: string, _repo: string, _ref: string, path: string) => ({
      content: path === "common/style.puml" ? "participant Carol" : "",
    }));
    const origin = {
      owner: "octo",
      repo: "diagrams",
      ref: "feature/x",
      path: "docs/flow.puml",
      sha: "abc",
      htmlUrl: "https://github.com/octo/diagrams/blob/feature/x/docs/flow.puml",
    };
    mount([tab({ githubOrigin: origin })]);
    const context = includeContextFor("tab");
    expect(context?.files).toMatchObject({ kind: "repository", path: "docs/flow.puml" });
    const source = "@startuml\n!include ../common/style.puml\n!include ../../etc/passwd\n@enduml";
    await prepareIncludes(source, context);
    expect(getFile).toHaveBeenCalledTimes(1);
    expect(getFile).toHaveBeenCalledWith("octo", "diagrams", "feature/x", "common/style.puml");
    const result = expandIncludes(source, context);
    expect(result.text).toContain("participant Carol");
    expect(result.diagnostics.map((item) => item.kind)).toEqual(["outside"]);
  });

  it("turns a provider failure into a safe message for the include", async () => {
    getFile.mockRejectedValue(new Error("secret internals github_pat_should_never_show"));
    mount([
      tab({
        githubOrigin: {
          owner: "o",
          repo: "r",
          ref: "main",
          path: "a.puml",
          sha: "1",
          htmlUrl: "https://github.com/o/r",
        },
      }),
    ]);
    const context = includeContextFor("tab");
    await prepareIncludes("@startuml\n!include b.puml\n@enduml", context);
    const result = expandIncludes("@startuml\n!include b.puml\n@enduml", context);
    expect(result.diagnostics[0]?.message).toBe("b.puml could not be read from the repository.");
  });

  it("reads folder includes through the folder handle, preferring another member's open tab", async () => {
    const files: Record<string, string> = { "shared/style.puml": "participant Frank" };
    const directory = (prefix: string): unknown => ({
      name: prefix,
      getDirectoryHandle: async (name: string) => directory(`${prefix}${name}/`),
      getFileHandle: async (name: string) => {
        const text = files[`${prefix}${name}`];
        if (text === undefined) throw new DOMException("missing", "NotFoundError");
        return { name, getFile: async () => new File([text], name) };
      },
    });
    const tabs = [
      tab({ id: "tab", fileName: "diagrams/a.puml", source: "@startuml\n!include ../shared/style.puml\n@enduml" }),
      tab({ id: "other", fileName: "diagrams/b.puml", source: "participant Edited" }),
    ];
    mount(tabs, {
      project: {
        manifest: { name: "Docs", documents: [{ path: "diagrams/a.puml" }, { path: "diagrams/b.puml" }] },
        root: directory("") as never,
      },
      isProjectMemberTab: () => true,
    });
    const context = includeContextFor("tab");
    expect(context?.files).toMatchObject({ kind: "folder", path: "diagrams/a.puml" });
    const source =
      "@startuml\n!include ../shared/style.puml\n!include b.puml\n!include ../../x.puml\n!include gone.puml\n@enduml";
    await prepareIncludes(source, context);
    const result = expandIncludes(source, context);
    expect(result.text).toContain("participant Frank");
    expect(result.text).toContain("participant Edited");
    expect(result.diagnostics.map((item) => [item.kind, item.message])).toEqual([
      ["outside", expect.stringContaining("outside the folder")],
      ["failed", "diagrams/gone.puml wasn't found in the folder."],
    ]);
  });

  it("includes the other diagrams of a document by name and exposes the add and open actions", () => {
    const portable = {
      projectId: "p",
      diagrams: [
        { id: "m1", name: "Main", document: { current: { source: "main" } } },
        { id: "m2", name: "Style", document: { current: { source: "saved style" } } },
      ],
    };
    const addProjectDiagram = vi.fn(async () => true);
    const openMember = vi.fn();
    const tabs = [
      tab({ id: "tab", historyId: "project-history-p-m1", source: "@startuml\n!include Style\n@enduml" }),
      tab({ id: "style-tab", historyId: "project-history-p-m2", source: "live style" }),
    ];
    mount(tabs, { portable: portable as never, addProjectDiagram, openMember });
    const context = includeContextFor("tab");
    expect(context?.name).toBe("Main");
    // The open tab's text wins over the saved text.
    expect(context?.documents).toEqual([
      { name: "Main", source: "@startuml\n!include Style\n@enduml" },
      { name: "Style", source: "live style" },
    ]);
    // A snapshot renders a diagram by its member id, with the same document around it.
    expect(includeContextFor("m2")?.name).toBe("Style");
    expect(includeContextFor("m2")?.documents).toHaveLength(2);
    expect(includeActions()?.canAddDiagram).toBe(true);
    expect(includeActions()?.openDiagram("style.puml")).toBe(true);
    expect(openMember).toHaveBeenCalledWith("m2");
    expect(includeActions()?.openDiagram("nope")).toBe(false);
    includeActions()?.addDiagram("Palette");
    expect(addProjectDiagram).toHaveBeenCalledWith("sequence", "Palette", expect.stringContaining("@startuml"));
  });

  it("gives other previews, which are not open tabs, no context", () => {
    mount([tab({})]);
    expect(includeContextFor("unknown")).toBeUndefined();
    expect(includeContextFor("tab")).toBeUndefined();
  });
});
