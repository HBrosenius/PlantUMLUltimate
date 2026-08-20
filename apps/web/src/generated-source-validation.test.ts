import { describe, expect, it } from "vitest";
import { validateGeneratedSource } from "./generated-source-validation";

describe("generated source validation", () => {
  it("rejects a new parser error", () => {
    const before = "@startgantt\n[A] lasts 2 days\n@endgantt";
    const after = "@startgantt\n[A] [A] lasts 2 days\n@endgantt";
    expect(validateGeneratedSource(before, after)).toMatchObject({
      valid: false,
      introduced: [{ code: "duplicate-task-prefix" }],
    });
  });

  it("allows an operation when the user's existing unrelated error remains", () => {
    const before = "@startgantt\n[Broken] lasts nope\n[A] starts 2026-09-01\n@endgantt";
    const after = "@startgantt\n[Broken] lasts nope\n[A] starts 2026-09-02\n@endgantt";
    expect(validateGeneratedSource(before, after).valid).toBe(true);
  });

  it("allows an operation that fixes an existing error and rejects missing markers", () => {
    expect(
      validateGeneratedSource("@startgantt\n[A] lasts nope\n@endgantt", "@startgantt\n[A] lasts 1 day\n@endgantt")
        .valid,
    ).toBe(true);
    expect(validateGeneratedSource("@startgantt\n[A] lasts 1 day\n@endgantt", "[A] lasts 1 day").valid).toBe(false);
  });

  it("rejects generated edits that change unsupported syntax", () => {
    const before = "@startgantt\nskinparam handwritten true\n[A] lasts 1 day\n@endgantt";
    const after = "@startgantt\n[A] lasts 1 day\n@endgantt";
    expect(validateGeneratedSource(before, after).message).toContain("not visually editable");
  });
});
