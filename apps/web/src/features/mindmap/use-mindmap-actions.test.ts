// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { parseMindmap } from "@plantuml-studio/diagram-mindmap";
import {
  applyMindmapSettings,
  findInsertedMindmapNode,
  MINDMAP_ONLY_ROOT_MESSAGE,
  mindmapDeleteBlocker,
  mindmapSettingsOf,
  remapMindmapNodeId,
  useMindmapActions,
} from "./use-mindmap-actions";

function setup(source: string, selectedId?: string, confirm = true) {
  const document = parseMindmap(source);
  const selectedNode = document.nodes.find((node) => node.id === selectedId);
  const calls = {
    commit: vi.fn((_source: string, _description: string) => true),
    confirm: vi.fn((_message: string) => confirm),
    closeAdd: vi.fn(),
    select: vi.fn(),
    clear: vi.fn(),
    report: vi.fn(),
  };
  const { result } = renderHook(() =>
    useMindmapActions({
      source,
      document,
      selectedNode,
      addTarget: selectedNode ?? (document.roots.length === 1 ? document.roots[0] : undefined),
      commitSource: calls.commit,
      confirmDelete: calls.confirm,
      closeAddNode: calls.closeAdd,
      selectNode: calls.select,
      clearSelectedNode: calls.clear,
      reportMessage: calls.report,
    }),
  );
  return { actions: result.current, calls };
}

const SOURCE = "@startmindmap\n* Root\n** A\n*** A1\n** B\n@endmindmap";

describe("useMindmapActions", () => {
  it("adds a child under the selected node and selects the new node", () => {
    const { actions, calls } = setup(SOURCE, "mindmap-1");
    act(() => actions.addNode({ label: "New" }, "child"));
    expect(calls.commit).toHaveBeenCalledWith(
      "@startmindmap\n* Root\n** A\n*** A1\n*** New\n** B\n@endmindmap",
      "Add mindmap node New",
    );
    expect(calls.closeAdd).toHaveBeenCalled();
    expect(calls.select).toHaveBeenCalledWith("mindmap-3");
  });

  it("adds a sibling after the selected node", () => {
    const { actions, calls } = setup(SOURCE, "mindmap-1");
    act(() => actions.addNode({ label: "After A" }, "sibling"));
    expect(calls.commit.mock.calls[0]![0]).toBe("@startmindmap\n* Root\n** A\n*** A1\n** After A\n** B\n@endmindmap");
  });

  it("adds under the only root when nothing is selected", () => {
    const { actions, calls } = setup(SOURCE);
    act(() => actions.addNode({ label: "Top" }, "child"));
    expect(calls.commit.mock.calls[0]![0]).toContain("** B\n** Top\n@endmindmap");
  });

  it("adds a depth-2 node on the side that was asked for", () => {
    const { actions, calls } = setup(SOURCE, "mindmap-0");
    act(() => actions.addNode({ label: "Left one", side: "left" }, "child"));
    expect(calls.commit.mock.calls[0]![0]).toContain("-- Left one");
  });

  it("renames and recolours the selected node and keeps its place", () => {
    const { actions, calls } = setup(SOURCE, "mindmap-1");
    act(() => {
      actions.applyNode({ label: "Renamed", color: "#ADD8E6" });
    });
    expect(calls.commit.mock.calls[0]![0]).toBe(
      "@startmindmap\n* Root\n**[#ADD8E6] Renamed\n*** A1\n** B\n@endmindmap",
    );
    expect(calls.commit.mock.calls[0]![1]).toBe("Update mindmap node A");
  });

  it("toggles the box and the side of a node", () => {
    const boxless = setup(SOURCE, "mindmap-1");
    act(() => boxless.actions.toggleBoxless(true));
    expect(boxless.calls.commit.mock.calls[0]![0]).toContain("**_ A");
    const side = setup(SOURCE, "mindmap-3");
    act(() => side.actions.setNodeSide("left"));
    expect(side.calls.commit.mock.calls[0]![0]).toContain("-- B");
  });

  it("deletes a subtree after confirming, and clears the selection", () => {
    const { actions, calls } = setup(SOURCE, "mindmap-1");
    act(() => actions.removeNode());
    expect(calls.confirm).toHaveBeenCalledWith("Delete “A” and its 1 descendant?");
    expect(calls.commit.mock.calls[0]![0]).toBe("@startmindmap\n* Root\n** B\n@endmindmap");
    expect(calls.clear).toHaveBeenCalled();
  });

  it("does not delete when the confirmation is declined", () => {
    const { actions, calls } = setup(SOURCE, "mindmap-1", false);
    act(() => actions.removeNode());
    expect(calls.commit).not.toHaveBeenCalled();
  });

  it("refuses to delete the only root and says why", () => {
    const { actions, calls } = setup(SOURCE, "mindmap-0");
    act(() => actions.removeNode());
    expect(calls.confirm).not.toHaveBeenCalled();
    expect(calls.commit).not.toHaveBeenCalled();
    expect(calls.report).toHaveBeenCalledWith(MINDMAP_ONLY_ROOT_MESSAGE);
  });

  it("deletes one root when there are several", () => {
    const { actions, calls } = setup("@startmindmap\n* One\n** a\n* Two\n@endmindmap", "mindmap-2");
    act(() => actions.removeNode());
    expect(calls.commit.mock.calls[0]![0]).toBe("@startmindmap\n* One\n** a\n@endmindmap");
  });

  it("moves a subtree under another parent", () => {
    const { actions, calls } = setup(SOURCE);
    act(() => actions.moveNode("mindmap-3", "mindmap-1"));
    expect(calls.commit.mock.calls[0]![0]).toBe("@startmindmap\n* Root\n** A\n*** A1\n*** B\n@endmindmap");
  });

  it("keeps the marker families of a branch together when it moves in a right to left mindmap", () => {
    const { actions, calls } = setup("@startmindmap\nright to left direction\n* Root\n** A\n*** A1\n++ B\n@endmindmap");
    act(() => actions.moveNode("mindmap-1", "mindmap-3"));
    // A moves under B (a + node); A1 comes along and takes the + family too, which the engine needs here.
    expect(calls.commit.mock.calls[0]![0]).toBe(
      "@startmindmap\nright to left direction\n* Root\n++ B\n+++ A\n++++ A1\n@endmindmap",
    );
  });

  it("keeps the selection on its node when a move shifts the ids", () => {
    // Moving B (id 3) before A (id 1) shifts A and A1 down by one.
    const moved = setup(SOURCE, "mindmap-3");
    act(() => moved.actions.moveNode("mindmap-3", "mindmap-0", "mindmap-1"));
    expect(moved.calls.select).toHaveBeenCalledWith("mindmap-1");
    // A is selected while B moves in front of it: A is now at id 2, with its child.
    const passed = setup(SOURCE, "mindmap-1");
    act(() => passed.actions.moveNode("mindmap-3", "mindmap-0", "mindmap-1"));
    expect(passed.calls.select).toHaveBeenCalledWith("mindmap-2");
    // Nothing selected: nothing is selected afterwards either.
    const none = setup(SOURCE);
    act(() => none.actions.moveNode("mindmap-3", "mindmap-0", "mindmap-1"));
    expect(none.calls.select).not.toHaveBeenCalled();
  });

  it("reports why a Markdown-form mindmap cannot be edited and changes nothing", () => {
    const { actions, calls } = setup("@startmindmap\n# Root\n## Child\n@endmindmap", "mindmap-1");
    act(() => {
      actions.applyNode({ label: "X" });
    });
    expect(calls.commit).not.toHaveBeenCalled();
    expect(calls.report).toHaveBeenCalledWith("Convert to * markers to edit visually");
  });

  it("converts a Markdown-form mindmap to * markers", () => {
    const { actions, calls } = setup("@startmindmap\n# Root\n## Child\n@endmindmap");
    act(() => actions.convertToOrgMode());
    expect(calls.commit.mock.calls[0]![0]).toBe("@startmindmap\n* Root\n** Child\n@endmindmap");
  });

  it("applies several settings as one edit", () => {
    const { actions, calls } = setup(SOURCE);
    act(() =>
      actions.applySettings({
        direction: "top-to-bottom",
        title: "My map",
        caption: "Figure 1",
        header: "",
        footer: "Page foot",
        legend: "",
      }),
    );
    expect(calls.commit).toHaveBeenCalledTimes(1);
    const next = parseMindmap(calls.commit.mock.calls[0]![0]);
    expect(mindmapSettingsOf(next)).toMatchObject({
      direction: "top-to-bottom",
      title: "My map",
      caption: "Figure 1",
      footer: "Page foot",
    });
    expect(next.nodes).toHaveLength(4);
  });
});

describe("mindmap settings", () => {
  it("round-trips every setting and removes one when it is emptied", () => {
    const full = applyMindmapSettings(SOURCE, {
      direction: "right-to-left",
      title: "T",
      caption: "C",
      header: "H",
      footer: "F",
      legend: "L",
    });
    expect(full.split("\n").slice(0, 9)).toEqual([
      "@startmindmap",
      "right to left direction",
      "title T",
      "caption C",
      "header H",
      "footer F",
      "legend",
      "L",
      "endlegend",
    ]);
    expect(mindmapSettingsOf(parseMindmap(full))).toEqual({
      direction: "right-to-left",
      title: "T",
      caption: "C",
      header: "H",
      footer: "F",
      legend: "L",
    });
    const cleared = applyMindmapSettings(full, {
      direction: undefined,
      title: "",
      caption: "",
      header: "",
      footer: "",
      legend: "",
    });
    expect(cleared).toBe(SOURCE);
  });

  it("edits only the lines that changed and keeps CRLF", () => {
    const source = "@startmindmap\r\ntitle Old\r\n* Root\r\n** A\r\n@endmindmap";
    const next = applyMindmapSettings(source, { ...mindmapSettingsOf(parseMindmap(source)), title: "New" });
    expect(next).toBe("@startmindmap\r\ntitle New\r\n* Root\r\n** A\r\n@endmindmap");
    expect(applyMindmapSettings(next, mindmapSettingsOf(parseMindmap(next)))).toBe(next);
  });

  it("blocks deleting only the last root", () => {
    const one = parseMindmap(SOURCE);
    expect(mindmapDeleteBlocker(one, one.nodes[0]!)).toBe(MINDMAP_ONLY_ROOT_MESSAGE);
    expect(mindmapDeleteBlocker(one, one.nodes[1]!)).toBeUndefined();
    const two = parseMindmap("@startmindmap\n* One\n* Two\n@endmindmap");
    expect(mindmapDeleteBlocker(two, two.nodes[0]!)).toBeUndefined();
  });

  it("finds a moved node again by its label and what is below it, taking turns among twins", () => {
    const before = parseMindmap("@startmindmap\n* Root\n** Pros\n** Cons\n** Pros\n*** x\n@endmindmap");
    const after = parseMindmap("@startmindmap\n* Root\n** Pros\n*** x\n** Pros\n** Cons\n@endmindmap");
    // The Pros that has a child is told apart from the plain Pros by what is below it.
    expect(remapMindmapNodeId(before, after, "mindmap-3")).toBe("mindmap-1");
    expect(remapMindmapNodeId(before, after, "mindmap-4")).toBe("mindmap-2");
    expect(remapMindmapNodeId(before, after, "mindmap-1")).toBe("mindmap-3");
    expect(remapMindmapNodeId(before, after, "mindmap-2")).toBe("mindmap-4");
    expect(remapMindmapNodeId(before, after, "nope")).toBeUndefined();
    // Identical twins keep their order: the second A stays the second A.
    const twins = parseMindmap("@startmindmap\n* R\n** A\n** A\n** B\n@endmindmap");
    const moved = parseMindmap("@startmindmap\n* R\n** B\n** A\n** A\n@endmindmap");
    expect(remapMindmapNodeId(twins, moved, "mindmap-2")).toBe("mindmap-3");
    expect(remapMindmapNodeId(twins, moved, "mindmap-1")).toBe("mindmap-2");
  });

  it("finds the node an insertion added", () => {
    const before = parseMindmap(SOURCE);
    const after = parseMindmap("@startmindmap\n* Root\n** A\n*** A1\n*** New\n** B\n@endmindmap");
    expect(findInsertedMindmapNode(before, after, "New")?.id).toBe("mindmap-3");
    expect(findInsertedMindmapNode(before, before, "New")).toBeUndefined();
  });
});
