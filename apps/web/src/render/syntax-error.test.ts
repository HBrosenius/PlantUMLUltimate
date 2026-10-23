// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { describeSyntaxError } from "./syntax-error";

const svg = (...texts: string[]) =>
  `<svg xmlns="http://www.w3.org/2000/svg">${texts.map((t, i) => `<text y="${i * 14}">${t}</text>`).join("")}</svg>`;
const parser = new DOMParser();

describe("describeSyntaxError", () => {
  it("names the failing line and quotes it", () => {
    const result = describeSyntaxError(
      svg(
        "[From textarea (line 3) ]",
        "@startgantt",
        "[A] starts garbage",
        "Syntax Error? (Assumed diagram type: gantt)",
      ),
      parser,
    );
    expect(result).toBe("Syntax Error? (Assumed diagram type: gantt) — line 3: [A] starts garbage");
  });

  it("falls back to the engine message without a line number", () => {
    expect(describeSyntaxError(svg("Syntax Error?"), parser)).toBe("Syntax Error?");
  });

  it("returns undefined when there is no syntax error", () => {
    expect(describeSyntaxError(svg("Hello"), parser)).toBeUndefined();
  });
});
