// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parseUseCase } from "@plantuml-studio/diagram-usecase";
import type { DiagramKind } from "../../model";
import { useUseCaseController } from "./use-usecase-controller";

const document = parseUseCase(
  '@startuml\nactor "Customer" as customer\nusecase "Checkout" as checkout\ncustomer --> checkout\n@enduml',
);

describe("useUseCaseController", () => {
  it("coordinates object, settings, and source selections", () => {
    const { result } = renderHook(() => useUseCaseController("usecase", document));

    act(() => result.current.selectObject("customer"));
    expect(result.current.selectedElement?.label).toBe("Customer");

    act(() => result.current.openSettingsFromToolbar());
    expect(result.current.selectedElement).toBeUndefined();
    expect(result.current.settingsOpen).toBe(true);

    act(() => result.current.selectFromSource("checkout"));
    expect(result.current.settingsOpen).toBe(false);
    expect(result.current.sourceHighlightedId).toBe("checkout");
  });

  it("clears Use Case inspectors when leaving the diagram while preserving the source highlight", () => {
    const { result, rerender } = renderHook(({ kind }: { kind: DiagramKind }) => useUseCaseController(kind, document), {
      initialProps: { kind: "usecase" as DiagramKind },
    });
    act(() => {
      result.current.selectObject("customer");
      result.current.setSourceHighlightedId("checkout");
    });

    rerender({ kind: "gantt" });

    expect(result.current.selectedElement).toBeUndefined();
    expect(result.current.settingsOpen).toBe(false);
    expect(result.current.sourceHighlightedId).toBe("checkout");
  });
});
