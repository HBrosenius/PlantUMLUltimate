// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parseWbs } from "@plantuml-studio/diagram-wbs";
import type { DiagramKind } from "../../model";
import { useWbsController } from "./use-wbs-controller";

const document = parseWbs("@startwbs\n*(root) Root\n**(child) Child\nroot --> child\n@endwbs");

describe("useWbsController", () => {
  it("coordinates node, relationship, settings, and source selections", () => {
    const { result } = renderHook(() => useWbsController("wbs", document));

    act(() => result.current.selectNode("wbs-0"));
    expect(result.current.selectedNode?.label).toBe("Root");
    act(() => result.current.selectRelationship("wbs-relationship-0"));
    expect(result.current.selectedNode).toBeUndefined();
    expect(result.current.selectedRelationship?.from).toBe("root");

    act(() => result.current.openSettingsFromToolbar());
    expect(result.current.settingsOpen).toBe(true);
    act(() => result.current.selectFromSource("wbs-1"));
    expect(result.current.settingsOpen).toBe(false);
    expect(result.current.sourceHighlightedNodeId).toBe("wbs-1");
  });

  it("clears WBS inspectors when leaving WBS while preserving the source highlight", () => {
    const { result, rerender } = renderHook(({ kind }: { kind: DiagramKind }) => useWbsController(kind, document), {
      initialProps: { kind: "wbs" as DiagramKind },
    });
    act(() => {
      result.current.selectNode("wbs-0");
      result.current.openSettings();
      result.current.setSourceHighlightedNodeId("wbs-1");
    });

    rerender({ kind: "gantt" });

    expect(result.current.selectedNode).toBeUndefined();
    expect(result.current.selectedRelationship).toBeUndefined();
    expect(result.current.settingsOpen).toBe(false);
    expect(result.current.sourceHighlightedNodeId).toBe("wbs-1");
  });
});
