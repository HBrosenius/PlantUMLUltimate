// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { parseClassDiagram } from "@plantuml-studio/diagram-class";
import type { DiagramKind } from "../../model";
import { useClassController } from "./use-class-controller";

const document = parseClassDiagram(
  "@startuml\nclass Customer {\n  +name: String\n}\nclass Order\nCustomer --> Order\n@enduml",
);

describe("useClassController", () => {
  it("coordinates object, member, settings, and source selections", () => {
    const reveal = vi.fn();
    const { result } = renderHook(() => useClassController("class", document, reveal));
    const customer = document.entities[0]!;
    const member = customer.members[0]!;

    act(() => result.current.selectObject(customer.id));
    expect(result.current.selectedEntity?.label).toBe("Customer");
    expect(reveal).toHaveBeenCalledWith(customer.sourceRange);

    act(() => result.current.selectMember(customer.id, member.id));
    expect(result.current.sourceHighlightedMemberId).toBe(member.id);
    expect(reveal).toHaveBeenLastCalledWith(member.sourceRange);

    act(() => result.current.openSettingsFromToolbar());
    expect(result.current.selectedEntity).toBeUndefined();
    expect(result.current.settingsOpen).toBe(true);

    act(() => result.current.selectFromSource(document.entities[1]!.id, undefined));
    expect(result.current.settingsOpen).toBe(false);
    expect(result.current.sourceHighlightedEntityId).toBe(document.entities[1]!.id);
  });

  it("clears inspectors when leaving Class while preserving source highlights", () => {
    const { result, rerender } = renderHook(
      ({ kind }: { kind: DiagramKind }) => useClassController(kind, document, vi.fn()),
      { initialProps: { kind: "class" as DiagramKind } },
    );
    act(() => {
      result.current.setSelectedObjectId(document.entities[0]!.id);
      result.current.setSourceHighlightedEntityId(document.entities[1]!.id);
    });

    rerender({ kind: "gantt" });

    expect(result.current.selectedEntity).toBeUndefined();
    expect(result.current.settingsOpen).toBe(false);
    expect(result.current.sourceHighlightedEntityId).toBe(document.entities[1]!.id);
  });
});
