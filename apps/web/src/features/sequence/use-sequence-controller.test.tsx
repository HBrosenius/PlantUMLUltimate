// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { parseSequence } from "@plantuml-studio/diagram-sequence";
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
});
