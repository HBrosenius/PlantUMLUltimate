import { describe, expect, it } from "vitest";
import {
  buildRequestPayload,
  buildUserMessage,
  checkRequestSize,
  markSelection,
  selectionFromOffsets,
  systemPromptFor,
  MAX_AI_SOURCE_BYTES,
} from "./prompt";

const SOURCE = ["@startuml", "A -> B : one", "B -> C : two", "C --> A : three", "@enduml"].join("\n");

describe("selection markers", () => {
  it("wraps whole lines and clamps out-of-range selections", () => {
    expect(markSelection(SOURCE, { startLine: 2, endLine: 3 }).split("\n")).toEqual([
      "@startuml",
      "[[[SELECTION_START]]]",
      "A -> B : one",
      "B -> C : two",
      "[[[SELECTION_END]]]",
      "C --> A : three",
      "@enduml",
    ]);
    expect(markSelection(SOURCE, { startLine: 4, endLine: 99 })).toContain("three\n@enduml\n[[[SELECTION_END]]]");
    expect(markSelection(SOURCE, undefined)).toBe(SOURCE);
  });

  it("derives whole-line selections from character offsets", () => {
    const from = SOURCE.indexOf("one");
    const to = SOURCE.indexOf("two");
    expect(selectionFromOffsets(SOURCE, from, to)).toEqual({ startLine: 2, endLine: 3 });
    const lineStart = SOURCE.indexOf("B -> C");
    expect(selectionFromOffsets(SOURCE, SOURCE.indexOf("A -> B"), lineStart)).toEqual({ startLine: 2, endLine: 2 });
    expect(selectionFromOffsets(SOURCE, 5, 5)).toEqual({ startLine: 1, endLine: 1 });
  });
});

describe("request building", () => {
  it("puts the diagram, selection, instruction and previous problems in the user message only", () => {
    const message = buildUserMessage({
      kind: "sequence",
      source: SOURCE,
      selection: { startLine: 2, endLine: 2 },
      instruction: "  Add a timeout  ",
      previousProblems: ["Missing end"],
    });
    expect(message).toContain("Diagram type: sequence");
    expect(message).toContain("[[[SELECTION_START]]]\nA -> B : one\n[[[SELECTION_END]]]");
    expect(message).toContain("Instruction:\nAdd a timeout");
    expect(message).toContain("- Missing end");
    expect(systemPromptFor("sequence")).not.toContain("Add a timeout");
  });

  it("builds the payload with a cached system prompt and the output schema", () => {
    const payload = buildRequestPayload({ kind: "sequence", source: SOURCE, instruction: "x" });
    expect(payload.model).toBe("claude-opus-5-5");
    expect(payload.system).toHaveLength(1);
    expect(payload.system[0]!.cache_control.type).toBe("ephemeral");
    expect(payload.output_config.format.schema).toMatchObject({
      required: ["revisedSource", "summary", "questions"],
    });
    expect(payload.max_tokens).toBeGreaterThanOrEqual(4096);
    expect(systemPromptFor("sequence")).toContain("Sequence diagram rules");
    expect(systemPromptFor("class")).not.toContain("Sequence diagram rules");
  });

  it("enforces the size cap and the instruction rules", () => {
    expect(checkRequestSize({ kind: "sequence", source: SOURCE, instruction: "Do it" })).toEqual({ ok: true });
    const big = checkRequestSize({
      kind: "sequence",
      source: "é".repeat(MAX_AI_SOURCE_BYTES / 2 + 1),
      instruction: "Do it",
    });
    expect(big.ok).toBe(false);
    expect(checkRequestSize({ kind: "sequence", source: SOURCE, instruction: " " }).ok).toBe(false);
    expect(checkRequestSize({ kind: "sequence", source: SOURCE, instruction: "x".repeat(6001) }).ok).toBe(false);
  });
});

describe("C4 rules", () => {
  it("adds the C4 rules to the system prompt, including the library's quote limit and include levels", () => {
    const prompt = systemPromptFor("c4");
    expect(prompt).toContain("C4 diagram rules");
    expect(prompt).toContain("never contains a dot");
    expect(prompt).toContain("Never put a double quote inside a label");
    expect(prompt).toContain("<C4/C4_Component>");
    expect(systemPromptFor("sequence")).not.toContain("C4 diagram rules");
  });
});
