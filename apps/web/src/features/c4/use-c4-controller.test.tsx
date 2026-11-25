// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parseC4 } from "../../c4-source";
import type { DiagramKind } from "../../model";
import { useC4Controller } from "./use-c4-controller";

const SOURCE = '@startuml\nPerson(user, "User")\nSystem(shop, "Shop")\nRel(user, shop, "Uses")\n@enduml';
const document = parseC4(SOURCE);

describe("useC4Controller", () => {
  it("coordinates element, relationship and settings selections", () => {
    const { result } = renderHook(() => useC4Controller("c4", document));

    act(() => result.current.select({ kind: "element", alias: "user" }));
    expect(result.current.selectedElement?.label).toBe("User");
    expect(result.current.selectedKey).toBe("user");

    act(() => result.current.select({ kind: "relationship", index: 0 }));
    expect(result.current.selectedElement).toBeUndefined();
    expect(result.current.selectedRelationship?.label).toBe("Uses");
    expect(result.current.selectedKey).toBe("rel:0");

    act(() => result.current.openSettings());
    expect(result.current.settingsOpen).toBe(true);
    expect(result.current.selectedRelationship).toBeUndefined();

    act(() => result.current.select({ kind: "unmanaged", alias: "proc" }));
    expect(result.current.settingsOpen).toBe(false);
    expect(result.current.selectedUnmanaged?.alias).toBe("proc");
  });

  it("drops a selection whose element no longer exists", () => {
    const { result, rerender } = renderHook(({ doc }) => useC4Controller("c4", doc), {
      initialProps: { doc: document },
    });
    act(() => result.current.select({ kind: "element", alias: "shop" }));
    expect(result.current.selectedElement?.id).toBe("shop");
    rerender({ doc: parseC4('@startuml\nPerson(user, "User")\n@enduml') });
    expect(result.current.selection).toBeUndefined();
    expect(result.current.selectedKey).toBeUndefined();
  });

  it("follows the editor's cursor without opening a panel", () => {
    const { result } = renderHook(() => useC4Controller("c4", document));
    const rel = document.relationships[0]!;
    act(() => result.current.selectFromSource(rel.range.from + 2));
    expect(result.current.sourceHighlightedKey).toBe("rel:0");
    expect(result.current.selection).toBeUndefined();
    act(() => result.current.selectFromSource(1));
    expect(result.current.sourceHighlightedKey).toBeUndefined();
  });

  it("closes its panels when the document stops being a C4 diagram", () => {
    const { result, rerender } = renderHook(({ kind }: { kind: DiagramKind }) => useC4Controller(kind, document), {
      initialProps: { kind: "c4" as DiagramKind },
    });
    act(() => result.current.select({ kind: "element", alias: "user" }));
    act(() => result.current.selectFromSource(document.elements[0]!.range.from + 1));
    rerender({ kind: "gantt" });
    expect(result.current.selection).toBeUndefined();
    expect(result.current.settingsOpen).toBe(false);
    expect(result.current.sourceHighlightedKey).toBeUndefined();
  });
});
