import { expect, it } from "vitest";
import { sourceFixDiagnosticPreview } from "./source-fix-diagnostic-preview";

it("highlights the proposed line after a multiline insertion", () => {
  const lines = sourceFixDiagnosticPreview(
    "one\r\nbad",
    { from: 5, to: 5, replacement: "new\r\nlines\r\n", message: "Insert" },
    4,
  );
  expect(lines.find((line) => line.highlighted)).toEqual({ number: 4, text: "bad", highlighted: true });
});

it("shows context for an error outside the edited range", () => {
  const source = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n");
  const lines = sourceFixDiagnosticPreview(source, { from: 0, to: 6, replacement: "edited", message: "Edit" }, 15);
  expect(lines.map((line) => line.number)).toEqual([13, 14, 15, 16, 17]);
  expect(lines.find((line) => line.highlighted)?.text).toBe("line 15");
});

it("can highlight an empty final line for an EOF diagnostic", () => {
  const lines = sourceFixDiagnosticPreview("one", { from: 3, to: 3, replacement: "\n", message: "Insert" }, 2);
  expect(lines.find((line) => line.highlighted)).toEqual({ number: 2, text: "", highlighted: true });
});
