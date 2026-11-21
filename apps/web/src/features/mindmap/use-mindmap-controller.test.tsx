// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parseMindmap } from "@plantuml-studio/diagram-mindmap";
import type { DiagramKind } from "../../model";
import { useMindmapSelection } from "./use-mindmap-editor";
import { useMindmapController } from "./use-mindmap-controller";

const document = parseMindmap("@startmindmap\n* Root\n** Child\n@endmindmap");

describe("useMindmapController", () => {
  it("selects a node and closes the settings, and the other way round", () => {
    const { result } = renderHook(() => useMindmapController("mindmap", document));
    act(() => result.current.selectNode("mindmap-1"));
    expect(result.current.selectedNode?.label).toBe("Child");
    act(() => result.current.openSettingsFromToolbar());
    expect(result.current.settingsOpen).toBe(true);
    expect(result.current.selectedNode).toBeUndefined();
    act(() => result.current.selectNode("mindmap-0"));
    expect(result.current.settingsOpen).toBe(false);
    expect(result.current.selectedNode?.label).toBe("Root");
  });

  it("follows the source cursor: into a node selects it, out of every node clears the selection", () => {
    const { result } = renderHook(() => useMindmapController("mindmap", document));
    act(() => result.current.selectFromSource("mindmap-1"));
    expect(result.current.selectedNodeId).toBe("mindmap-1");
    act(() => result.current.selectFromSource(undefined));
    expect(result.current.selectedNodeId).toBeUndefined();
  });

  it("drops a selection whose node no longer exists", () => {
    const { result, rerender } = renderHook(({ source }) => useMindmapSelection("mindmap", source), {
      initialProps: { source: "@startmindmap\n* Root\n** Child\n@endmindmap" },
    });
    act(() => result.current.selectNode("mindmap-1"));
    expect(result.current.selectedNode?.label).toBe("Child");
    rerender({ source: "@startmindmap\n* Root\n@endmindmap" });
    expect(result.current.selectedNode).toBeUndefined();
  });

  it("dismisses both inspectors at once", () => {
    const { result } = renderHook(() => useMindmapController("mindmap", document));
    act(() => result.current.selectNode("mindmap-1"));
    act(() => result.current.dismissInspectors());
    expect(result.current.selectedNodeId).toBeUndefined();
    act(() => result.current.openSettings());
    act(() => result.current.dismissInspectors());
    expect(result.current.settingsOpen).toBe(false);
  });

  it("clears its state when the document stops being a mindmap", () => {
    const { result, rerender } = renderHook(({ kind }: { kind: DiagramKind }) => useMindmapController(kind, document), {
      initialProps: { kind: "mindmap" as DiagramKind },
    });
    act(() => {
      result.current.selectNode("mindmap-1");
      result.current.openSettings();
    });
    rerender({ kind: "wbs" });
    expect(result.current.selectedNode).toBeUndefined();
    expect(result.current.settingsOpen).toBe(false);
  });

  it("does not parse a non-mindmap source", () => {
    const { result } = renderHook(() => useMindmapSelection("wbs", "@startwbs\n* A\n@endwbs"));
    expect(result.current.document.nodes).toEqual([]);
  });
});
