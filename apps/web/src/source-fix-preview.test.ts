import { expect, it } from "vitest";
import { sourceFixPreview } from "./source-fix-preview";

it("shows only the changed section of a whole-document repair with context", () => {
  const source = Array.from({ length: 80 }, (_, i) => `line ${i + 1}`).join("\n");
  const replacement = source.replace("line 40", "changed 40");
  const preview = sourceFixPreview(source, { from: 0, to: source.length, replacement, message: "Repair" });
  expect(preview.line).toBe(40);
  expect(preview.expandable).toBe(true);
  expect(preview.compactAfter).toContain("line 39\nchanged 40\nline 41");
  expect(preview.compactAfter).not.toContain("line 20");
  expect(preview.after).toBe(replacement);
  expect(preview.before).toBe(source);
});

it("bounds extensive changes and long lines without truncating the full preview", () => {
  const source = "old\n".repeat(100);
  const replacement = "x".repeat(300) + "\n" + "new\n".repeat(100);
  const preview = sourceFixPreview(source, { from: 0, to: source.length, replacement, message: "Repair" });
  expect(preview.compactAfter.split("\n").length).toBeLessThanOrEqual(15);
  expect(preview.compactAfter).toContain("lines omitted");
  expect(preview.after).toBe(replacement);
  expect(preview.compactAfter).not.toContain("x".repeat(300));
});

it("preserves a short insertion preview and CRLF", () => {
  const source = "@startuml\r\nclass A\r\n@enduml";
  const at = source.indexOf("@enduml");
  const preview = sourceFixPreview(source, { from: at, to: at, replacement: "}\r\n", message: "Close" });
  expect(preview.compactAfter).toBe("}\r\n@enduml");
  expect(preview.expandable).toBe(false);
  expect(preview.line).toBe(3);
});

it("shows removals and leading blank lines accurately", () => {
  const source = "\nwrong\nkeep";
  const preview = sourceFixPreview(source, { from: 0, to: 6, replacement: "", message: "Remove" });
  expect(preview.before).toBe("\nwrong");
  expect(preview.after).toBe("");
});
