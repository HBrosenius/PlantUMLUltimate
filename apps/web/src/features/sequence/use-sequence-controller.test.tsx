// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { deleteSequenceMessage, parseSequence, updateSequenceMessage } from "@plantuml-studio/diagram-sequence";
import { useSequenceController } from "./use-sequence-controller";

const document = parseSequence("@startuml\nparticipant Alice\nparticipant Bob\nAlice -> Bob: Hello\n@enduml");

describe("useSequenceController", () => {
  it("keeps participant, message, and structure selections exclusive", () => {
    const reveal = vi.fn();
    const { result } = renderHook(() => useSequenceController("sequence", document, [], reveal));
    act(() => result.current.selectParticipant(document.participants[0]!.id));
    expect(result.current.selectedParticipant?.label).toBe("Alice");
    expect(reveal).toHaveBeenCalledOnce();
    act(() => result.current.selectMessage(document.messages[0]!.id, false));
    expect(result.current.selectedParticipant).toBeUndefined();
    expect(result.current.selectedMessage?.label).toBe("Hello");
  });

  it("clears inspectors when leaving Sequence while preserving the source highlight", () => {
    const { result, rerender } = renderHook(({ kind }) => useSequenceController(kind, document, [], vi.fn()), {
      initialProps: { kind: "sequence" as const } as { kind: "sequence" | "gantt" },
    });
    act(() => {
      result.current.selectParticipant(document.participants[0]!.id, false);
      result.current.setSourceHighlightedParticipantId("alice");
    });
    rerender({ kind: "gantt" });
    expect(result.current.selectedParticipant).toBeUndefined();
    expect(result.current.settingsOpen).toBe(false);
    expect(result.current.sourceHighlightedParticipantId).toBe("alice");
  });
  it.each([
    ["insert", "Alice -> Bob: Inserted\nAlice -> Bob: First\nBob -> Alice: Selected"],
    ["delete", "Bob -> Alice: Selected"],
    ["rename preceding", "Alice -> Bob: Renamed\nBob -> Alice: Selected"],
  ])("keeps the selected message after %s above it", (_operation, messages) => {
    const original = "@startuml\nAlice -> Bob: First\nBob -> Alice: Selected\n@enduml";
    const reveal = vi.fn();
    const { result, rerender } = renderHook(
      ({ source }) => useSequenceController("sequence", parseSequence(source), [], reveal),
      { initialProps: { source: original } },
    );
    act(() => result.current.selectMessage("message-1", false));
    const changed = `@startuml\n${messages}\n@enduml`;
    rerender({ source: changed });
    expect(result.current.selectedMessage?.label).toBe("Selected");
    expect(
      updateSequenceMessage(changed, result.current.selectedMessage!, {
        from: "Bob",
        to: "Alice",
        arrow: "->",
        label: "Edited selection",
      }),
    ).toContain("Bob -> Alice: Edited selection");
    expect(deleteSequenceMessage(changed, result.current.selectedMessage!)).not.toContain(": Selected");
    rerender({ source: original });
    expect(result.current.selectedMessage?.label).toBe("Selected");
    expect(result.current.selectedMessageId).toBe("message-1");
    rerender({ source: changed });
    expect(result.current.selectedMessage?.label).toBe("Selected");
  });

  it.each([
    ["deleted selection", "Alice -> Bob: First"],
    ["edited selection", "Alice -> Bob: First\nBob -> Alice: Renamed"],
    ["ambiguous duplicate", "Alice -> Bob: First\nBob -> Alice: Selected\nBob -> Alice: Selected"],
  ])("clears a %s without reviving it on undo", (_operation, messages) => {
    const original = "@startuml\nAlice -> Bob: First\nBob -> Alice: Selected\n@enduml";
    const { result, rerender } = renderHook(
      ({ source }) => useSequenceController("sequence", parseSequence(source), [], vi.fn()),
      { initialProps: { source: original } },
    );
    act(() => result.current.selectMessage("message-1", false));
    rerender({ source: `@startuml\n${messages}\n@enduml` });
    expect(result.current.selectedMessage).toBeUndefined();
    expect(result.current.selectedMessageId).toBeUndefined();
    rerender({ source: original });
    expect(result.current.selectedMessage).toBeUndefined();
  });
  it("does not guess which originally identical message survived a deletion", () => {
    const original = "@startuml\nAlice -> Bob: Same\nAlice -> Bob: Same\n@enduml";
    const { result, rerender } = renderHook(
      ({ source }) => useSequenceController("sequence", parseSequence(source), [], vi.fn()),
      { initialProps: { source: original } },
    );
    act(() => result.current.selectMessage("message-0", false));
    expect(result.current.selectedMessage).toBeDefined();
    rerender({ source: "@startuml\nAlice -> Bob: Same\n@enduml" });
    expect(result.current.selectedMessage).toBeUndefined();
    expect(result.current.selectedMessageId).toBeUndefined();
  });
  it("retains explicit inspector reselection against the known updated revision", () => {
    const reveal = vi.fn();
    const { result, rerender } = renderHook(
      ({ source }) => useSequenceController("sequence", parseSequence(source), [], reveal),
      { initialProps: { source: "@startuml\nAlice -> Bob: Hello\n@enduml" } },
    );
    act(() => result.current.selectMessage("message-0", false));
    const source = "@startuml\nAlice -> Bob: Updated\n@enduml";
    act(() => {
      result.current.setSelectedMessageId("message-0", parseSequence(source));
      rerender({ source });
    });
    expect(result.current.selectedMessage?.label).toBe("Updated");
  });
});
